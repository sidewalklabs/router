// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import { expect } from 'chai';
import * as _ from 'lodash';

import OnlineRouter from '../src/online-router';
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
});
