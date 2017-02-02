// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';
import * as fs from 'fs';
import * as _ from 'lodash';

import GTFS from '../src/gtfs';
import * as gtfs from '../src/gtfs-types';
import IndexedGTFS, { WalkingTransfer } from '../src/indexed-gtfs';
import { ReachInfo, ReachMap, TransportMode } from '../src/matrix';
import Options, { defaults as defaultOptions } from '../src/options';
import { copyTimes, findBestK, makeTransfers, takeVehicles } from '../src/router';

const { expect } = chai;

const SECS_TO_KM = defaultOptions.walking_speed_kph / 3600;

describe('router', () => {

  it('should make transfers', () => {
    const destinations: {[destinationStopId: string]: ReachInfo} = {};
    destinations['stop1'] = {
      timeOfDaySec: 0,
      cost: 100,
      previousStopId: 'a',
      mode: TransportMode.Transit,
      tripId: 'trip',
      isUnexplored: true,
    };
    const transferMap: {[originId: string]: WalkingTransfer[]} = {};
    transferMap['stop1'] = [{ stopId: 'stop2', km: 10 * SECS_TO_KM }];

    const expected: {[destinationStopId: string]: ReachInfo} = {
      stop1: _.clone(destinations['stop1']),
      stop2: {
        timeOfDaySec: 10,
        cost: 110, // 100 cost + 10 second walk
        previousStopId: 'stop1',
        mode: TransportMode.Walk,
        tripId: null,
        isUnexplored: true,
        prevK: 0,
      },
    };

    const out = copyTimes(destinations);
    const tau = [destinations, out] as ReachMap[];

    makeTransfers(tau, 1, transferMap, defaultOptions);
    expect(out).to.deep.equal(expected);
  });

  const sampleConfig: Options = JSON.parse(fs.readFileSync('./test/config-sample.json', 'utf8'));

  it('should take vehicles from a single stop', () => {
    return IndexedGTFS.fromOptions(sampleConfig).then(feed => {
      const origins: {[stopId: string]: ReachInfo} = {
        STAGECOACH: {
          timeOfDaySec: 6 * 3600,  // 6 AM
          cost: 0,
          mode: TransportMode.Origin,
          isUnexplored: true,
        },
      };

      const destinations = copyTimes(origins);
      const tau = [origins, destinations];

      takeVehicles(tau, 1, feed, sampleConfig);
      expect(destinations).to.have.keys(
          ['STAGECOACH', 'NANAA', 'NADAV', 'DADAN', 'EMSI', 'BEATTY_AIRPORT']);

      expect(destinations['DADAN']).to.deep.equal({
        timeOfDaySec: 6 * 3600 + 21 * 60,  // 6:21 AM; true arrival is 6:19 AM.
        cost: 21 * 60,
        previousStopId: 'STAGECOACH',
        mode: TransportMode.Transit,
        tripId: 'CITY1',
        isUnexplored: true,
        prevK: 0,
      });

      expect(destinations['BEATTY_AIRPORT']).to.deep.equal({
        timeOfDaySec: 6 * 3600 + 20 * 60,  // 6:20 AM
        cost: 20 * 60,
        previousStopId: 'STAGECOACH',
        mode: TransportMode.Transit,
        tripId: 'STBA',
        isUnexplored: true,
        prevK: 0,
      });
    });
  });

  it('should wait and take vehicles', () => {
    return IndexedGTFS.fromOptions(sampleConfig).then(feed => {
      const origins: {[stopId: string]: ReachInfo} = {
        DADAN: {
          timeOfDaySec: 22421,  // 6:13:41 AM
          cost: 821,
          previousStopId: null,
          mode: TransportMode.Origin,
          tripId: null,
          isUnexplored: true,
        },
      };

      const destinations = {} as ReachMap;
      const tau = [origins, destinations];
      takeVehicles(tau, 1, feed, sampleConfig);
      expect(destinations).to.have.keys([
        'EMSI',  // CITY1
        'NADAV', 'NANAA', 'STAGECOACH',  // CITY2
      ]);

      expect(destinations['EMSI']).to.deep.equal({
        timeOfDaySec: 23280,  // 6:21 AM; true arrival is 6:19 AM.
        cost: 1680,
        previousStopId: 'DADAN',
        mode: TransportMode.Transit,
        tripId: 'CITY1',
        isUnexplored: true,
        prevK: 0,
      });
    });
  });

  it('should ignore excluded lines', () => {
    return IndexedGTFS.fromOptions(sampleConfig).then(feed => {
      const origins: {[stopId: string]: ReachInfo} = {
        STAGECOACH: {
          timeOfDaySec: 6 * 3600,  // 6 AM
          cost: 0,
          mode: TransportMode.Origin,
          isUnexplored: true,
        },
      };
      const noCity2Config = _.extend({}, sampleConfig, { exclude_routes: ['CITY'] });

      const destinations = {};
      const tau = [origins, destinations];

      takeVehicles(tau, 1, feed, noCity2Config as any);

      // Compare to the list in 'should take vehicles from a single stop'.
      expect(destinations).to.have.keys(['BEATTY_AIRPORT']);
      expect(destinations['BEATTY_AIRPORT'].tripId).to.equal('STBA');
    });
  });

  it('should find the best k value', () => {
    const transit = TransportMode.Transit;
    const tau = [
      {    o: { cost: 0,   timeOfDaySec: 0, mode: TransportMode.Origin } },
      { stop: { cost: 100, timeOfDaySec: 0, mode: transit, previousStopId: 'o', prevK: 0 } },
      { stop: { cost: 80,  timeOfDaySec: 0, mode: transit, previousStopId: 'stop', prevK: 1 } },
      { stop: { cost: 70,  timeOfDaySec: 0, mode: transit, previousStopId: 'stop', prevK: 2 } },
    ] as ReachMap[];

    expect(findBestK(tau, 'stop', 0)).to.equal(3);  // costs are [100, 80, 70]
    expect(findBestK(tau, 'stop', 10)).to.equal(2);  // costs are [100, 100, 90]
    expect(findBestK(tau, 'stop', 50)).to.equal(1);  // costs are [100, 130, 170]
  });

  it('should adjust costs according to bus/rail multipliers', () => {
    // In this setup there are two ways from A to B: a subway and a bus.
    // They take the same amount of time.
    const feed = new GTFS('test');
    feed.stops = [
      { stopId: 'A', stopName: 'Stop A', stopLat: 0, stopLng: 0, stopDesc: '' },
      { stopId: 'B', stopName: 'Stop B', stopLat: 1, stopLng: 1, stopDesc: '' },
    ];

    const noName = {route_short_name: '', route_long_name: ''};
    feed.routes = [
      { route_id: 'bus', route_type: gtfs.RouteType.Bus, ...noName },
      { route_id: 'rail', route_type: gtfs.RouteType.Subway, ...noName },
    ];

    feed.trips = [
      { trip_id: 'busT', route_id: 'bus' },
      { trip_id: 'railT', route_id: 'rail' },
    ] as gtfs.Trip[];

    feed.stopTimes = [
      { stopId: 'A', tripId: 'busT', stopSequence: 0, timeOfDaySec: 1000 },
      { stopId: 'B', tripId: 'busT', stopSequence: 1, timeOfDaySec: 1600 },  // 10 mins
      { stopId: 'A', tripId: 'railT', stopSequence: 0, timeOfDaySec: 1060 },
      { stopId: 'B', tripId: 'railT', stopSequence: 1, timeOfDaySec: 1660 },  // also 10 mins
    ] as gtfs.StopTime[];

    const indexedFeed = new IndexedGTFS(feed, {} as any);

    // Helper to run takeVehicles() with specific cost multipliers.
    const take = (railMultiplier: number, busMultiplier: number) => {
      let tau = [
        { A: { cost: 0, timeOfDaySec: 1000, mode: TransportMode.Origin, isUnexplored: true }},
        {},
      ];
      takeVehicles(tau, 1, indexedFeed, {
        ...defaultOptions,
        rail_multiplier: railMultiplier,
        bus_multiplier: busMultiplier,
      });
      return tau[1]['B'];
    };

    // costs are the same (bus wins since it leaves first)
    expect(take(1, 1)).to.deep.equal({
      cost: 600,
      timeOfDaySec: 1600,
      previousStopId: 'A',
      mode: TransportMode.Transit,
      tripId: 'busT',
      isUnexplored: true,
      prevK: 0,
    });

    // prefer rail
    expect(take(1, 1.5)).to.deep.include({
      cost: 660,  // 10 minutes travel + 1 minute wait
      timeOfDaySec: 1660,
      tripId: 'railT',
    });

    // prefer bus
    expect(take(1.5, 1)).to.deep.include({
      cost: 600,  // 10 minutes travel
      timeOfDaySec: 1600,
      tripId: 'busT',
    });

    // exclude rail
    expect(take(-1, 1)).to.deep.include({
      cost: 600,  // 10 minutes travel
      timeOfDaySec: 1600,
      tripId: 'busT',
    });

    // exclude bus
    expect(take(1, -1)).to.deep.include({
      cost: 660,  // 10 minutes travel + 1 minute wait
      timeOfDaySec: 1660,
      tripId: 'railT',
    });

    // prefer rail but not enough to overcome the wait time.
    expect(take(1, 1.1)).to.deep.include({
      cost: 660,  // 10 minutes travel * 1.1 multiplier
      timeOfDaySec: 1600,
      tripId: 'busT',
    });
  });
});
