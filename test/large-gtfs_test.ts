// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import { expect } from 'chai';
import * as _ from 'lodash';

import { TransportMode } from '../src/matrix';
import OnlineRouter, { Route } from '../src/online-router';
import {defaults as defaultOptions, LoadingOptions} from '../src/options';
import { raptor } from '../src/router';
import { parseTime } from '../src/utils';

describe('Large GTFS tests', () => {
  const loadingOptions: LoadingOptions = {
    departure_date: '20161201',
    gtfs_data_dirs: ['test/nyc-gtfs'],
  };
  let router: OnlineRouter;

  const options = _.extend({}, defaultOptions, loadingOptions);

  before(function(this: Mocha.IHookCallbackContext) {
    this.timeout(10000);
    return OnlineRouter.fromOptions(options).then(theRouter => {
      router = theRouter;
    });
  });

  it('should fix issue #260', () => {
    const departTimeSecs = parseTime('8:00:00');
    const tau = raptor('230S', departTimeSecs, router.feed, options);

    // Sanity check: costs should all be >= to travel time. There are no wormholes in NYC!
    for (const reachMap of tau) {
      _.forEach(reachMap, (reach, stopId) => {
        expect(reach.cost).to.be.at.least(reach.timeOfDaySec - departTimeSecs - 1e-5);
      });
    }
  });

  it('should allow 4 --> L transfers', () => {
    const unionSquare456Transfers = router.feed.walkingTransfers['635N'];
    expect(unionSquare456Transfers).to.deep.include({ stopId: 'L03N', secs: 180 });
    expect(unionSquare456Transfers).to.deep.include({ stopId: 'L03S', secs: 180 });
  });

  const summarizeRoute = (route: Route) => {
    return route.steps
        .filter(step => step.mode === TransportMode.Transit)
        .map(step => step.description);
  };

  it('should exclude Manhattan L stops', () => {
    const wburg = {id: 'wburg', latitude: 40.713340340046244, longitude: -73.96091109521484};
    const hudsonYards = {id: 'hy', latitude: 40.75336903249924, longitude: -74.00184631347656};
    const departTimeSecs = parseTime('8:00:00');

    const routeWithL = router.oneToOne(wburg, departTimeSecs, hudsonYards, {
      max_walking_distance_km: 1.2,
      walking_speed_kph: 4.8,
    });
    expect(summarizeRoute(routeWithL)).to.deep.equal([
      'Take L 5 stops from Bedford Av to 8 Av.',
      'Take A 1 stop from 14 St to 34 St - Penn Station.',
    ]);

    const routeWithoutL = router.oneToOne(wburg, departTimeSecs, hudsonYards, {
      max_walking_distance_km: 1.2,
      walking_speed_kph: 4.8,
      exclude_stops: ['L06', 'L05', 'L03', 'L02', 'L01'],
    });
    expect(summarizeRoute(routeWithoutL)).to.deep.equal([
      'Take G 4 stops from Metropolitan Av to Court Sq.',
      'Take 7 6 stops from Court Sq to 34 St - 11 Av.',
    ]);
  });
});
