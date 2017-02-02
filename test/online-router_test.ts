// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';
import * as fs from 'fs';
import * as _ from 'lodash';

import { loadLocationsCSV } from '../src/location';
import { TransportMode } from '../src/matrix';
import OnlineRouter, { Step } from '../src/online-router';
import Options from '../src/options';
import { formatTime, parseTime } from '../src/utils';

const { expect } = chai;

chai.use(require('chai-roughly'));

describe('online-router', () => {
  const noWalks = { max_walking_distance_km: 0 };
  let router: OnlineRouter;

  before(() => {
    const options = JSON.parse(fs.readFileSync('test/config-sample.json', 'utf8')) as Options;
    // to simplify routing, don't allow walking transfers.
    return OnlineRouter.fromOptions(options).then(theRouter => {
      router = theRouter;
    });
  });

  const simplifyStep = (step: Step) => ({
    from: step.from.stopId,
    to: step.to.stopId,
    mode: step.mode === TransportMode.Walk ? 'walk' : 'transit',
    departTime: formatTime(step.departTimeSecs),
    arriveTime: formatTime(step.arriveTimeSecs),
  });

  /* eslint-disable object-property-newline */

  it('should generate stop-to-stop routes', () => {
    const route = router.stopToStop('STAGECOACH', parseTime(' 6:00:00'), 'EMSI', noWalks);
    // TODO: this should be 6:26 (arrival time), not 6:28 (departure time).
    expect(route.arriveTimeSecs).to.equal(parseTime(' 6:28:00'));
    expect(route.travelTimeSecs).to.equal(28 * 60);  // 28 minutes.
    expect(route.steps.map(simplifyStep)).to.deep.equal([
      {
        from: 'STAGECOACH', to: 'EMSI',
        departTime: ' 6:00:00', arriveTime: ' 6:28:00',
        mode: 'transit',
      },
    ]);
  });

  it('should generate stop-to-stop routes with a wait', () => {
    const route = router.stopToStop('STAGECOACH', parseTime(' 5:50:00'), 'EMSI', noWalks);
    // TODO: this should be 6:26 (arrival time), not 6:28 (departure time).
    expect(route.arriveTimeSecs).to.equal(parseTime(' 6:28:00'));
    expect(route.travelTimeSecs).to.equal(38 * 60);  // 38 minutes: 10 waiting, 28 riding.
    expect(route.steps.map(simplifyStep)).to.deep.equal([
      {
        from: 'STAGECOACH', to: 'EMSI',
        departTime: ' 6:00:00', arriveTime: ' 6:28:00',
        mode: 'transit',
      },
    ]);
  });

  it('should generate stop-to-stop routes with a transfer', () => {
    const route =
        router.stopToStop('BEATTY_AIRPORT', parseTime(' 8:00:00'), 'FUR_CREEK_RES', noWalks);
    expect(route.arriveTimeSecs).to.equal(parseTime(' 9:20:00'));
    expect(route.travelTimeSecs).to.equal(1 * 3600 + 20 * 60);  // 1h20m.
    expect(route.steps.map(simplifyStep)).to.deep.equal([
      {
        from: 'BEATTY_AIRPORT', to: 'BULLFROG',
        departTime: ' 8:00:00', arriveTime: ' 8:15:00',
        mode: 'transit',
      },
      {
        from: 'BULLFROG', to: 'FUR_CREEK_RES',
        departTime: ' 8:20:00', arriveTime: ' 9:20:00',
        mode: 'transit',
      },
    ]);
  });

  // This route goes from near BEATTY_AIRPORT to near FUR_CREEK_RES.
  const origin = { id: 'origin', latitude: 36.8680, longitude: -116.7828 };
  const dest = { id: 'dest', latitude: 36.4260, longitude: -117.1326 };

  it('should generate one-to-one routes', () => {
    const route = router.oneToOne(origin, parseTime(' 7:50:00'), dest, {});
    expect(formatTime(route.arriveTimeSecs)).to.equal(' 9:21:06');
    expect(route.steps.map(simplifyStep)).to.deep.equal([
      {
        from: 'origin', to: 'BEATTY_AIRPORT',
        departTime: ' 7:50:00', arriveTime: ' 7:51:57',
        mode: 'walk',
      },
      {
        from: 'BEATTY_AIRPORT', to: 'BULLFROG',
        departTime: ' 8:00:00', arriveTime: ' 8:15:00',
        mode: 'transit',
      },
      {
        from: 'BULLFROG', to: 'FUR_CREEK_RES',
        departTime: ' 8:20:00', arriveTime: ' 9:20:00',
        mode: 'transit',
      },
      {
        from: 'FUR_CREEK_RES', to: 'dest',
        departTime: ' 9:20:00', arriveTime: ' 9:21:06',
        mode: 'walk',
      },
    ]);
  });

  it('should produce the same results for one-to-one as stop-to-stop', () => {
    const stagecoach = { id: 'origin', latitude: 36.915682, longitude: -116.751677 };
    const nadav = { id: 'dest', latitude: 36.914893, longitude: -116.76821 };
    expect(stagecoach.latitude).to.equal(router.feed.stopIdToStop['STAGECOACH'].stopLat);
    expect(stagecoach.longitude).to.equal(router.feed.stopIdToStop['STAGECOACH'].stopLng);
    expect(nadav.latitude).to.equal(router.feed.stopIdToStop['NADAV'].stopLat);
    expect(nadav.longitude).to.equal(router.feed.stopIdToStop['NADAV'].stopLng);

    const stopToStop = router.stopToStop('STAGECOACH', 21600, 'NADAV', {});
    expect(stopToStop.travelTimeSecs).to.equal(14 * 60); // 22m
    expect(stopToStop.steps.map(simplifyStep)).to.deep.equal([{
      from: 'STAGECOACH', to: 'NADAV',
      departTime: ' 6:00:00', arriveTime: ' 6:14:00',
      mode: 'transit',
    }]);

    const oneToOne = router.oneToOne(stagecoach, 21600, nadav, {});
    expect(oneToOne.travelTimeSecs).to.equal(14 * 60);  // 22m, same as above.
    expect(oneToOne.steps.map(simplifyStep)).to.deep.equal([
      {
        from: 'origin', to: 'STAGECOACH',
        departTime: ' 6:00:00', arriveTime: ' 6:00:00',
        mode: 'walk',
      },
      {
        from: 'STAGECOACH', to: 'NADAV',
        departTime: ' 6:00:00', arriveTime: ' 6:14:00',
        mode: 'transit',
      },
      {
        from: 'NADAV', to: 'dest',
        departTime: ' 6:14:00', arriveTime: ' 6:14:00',
        mode: 'walk',
      },
    ]);
  });

  it('should produce the same results for one-to-many as one-to-one', () => {
    const oneToOne = router.oneToOne(origin, parseTime(' 7:50:00'), dest, {});
    const oneToMany = router.oneToMany(origin, parseTime(' 7:50:00'), [dest], {});
    expect(oneToMany['dest']).to.equal(oneToOne.travelTimeSecs);
  });

  it('should produce the same results using preset destinations', async () => {
    const locations = await loadLocationsCSV('test/locations-sample.txt');
    const options = _.clone(router.options);
    options.preset_destinations = [{
      name: 'sample',
      locations_file: 'test/locations-sample.txt',
      max_allowable_destination_walk_km: 1.5,
    }];

    const presetRouter = await OnlineRouter.fromOptions(options);

    const oneToMany = (t: string) => presetRouter.oneToMany(origin, parseTime(t), locations, {});
    const oneToPresets =
        (t: string) => presetRouter.oneToManyPreset(origin, parseTime(t), 'sample', {});

    expect(oneToPresets(' 6:00:00')).to.roughly(0.01).deep.equal(oneToMany(' 6:00:00'));
    expect(oneToPresets(' 7:00:00')).to.roughly(0.01).deep.equal(oneToMany(' 7:00:00'));
    expect(oneToPresets(' 8:00:00')).to.roughly(0.01).deep.equal(oneToMany(' 8:00:00'));
  });

  it('should avoid origin -> stop -> destination trips', () => {
    const loc19 = {
      id: '19',
      longitude: -116.77762985229492,
      latitude: 36.90220502599186,
    };
    const loc22 = {
      id: '22',
      longitude: -116.75874710083006,
      latitude: 36.90357772367335,
    };

    const oneToOne = router.oneToOne(loc19, 21600, loc22, {});
    expect(Math.round(oneToOne.travelTimeSecs)).to.equal(1952);  // 32:32
    expect(oneToOne.steps.map(simplifyStep)).to.deep.equal([
      {
        from: '19', to: 'DADAN',
        departTime: ' 6:00:00', arriveTime: ' 6:13:40',
        mode: 'walk',
      },
      {
        from: 'DADAN', to: 'EMSI',
        departTime: ' 6:21:00', arriveTime: ' 6:28:00',
        mode: 'transit',
      },
      {
        from: 'EMSI', to: '22',
        departTime: ' 6:28:00', arriveTime: ' 6:32:31',
        mode: 'walk',
      },
    ]);
  });
});
