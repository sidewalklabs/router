// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';
import * as _ from 'lodash';

import { haversine, loadLocationsCSV } from '../src/location';
import SpatialIndex, { Link } from '../src/spatial-index';

chai.use(require('chai-roughly'));

const { expect } = chai;

describe('SpatialIndex', () => {
  it('should match a slower implementation', async () => {
    // The NYC block groups are a convenient, large set of points.
    const blockLocations = await loadLocationsCSV('test/perf/nyc-bgs.locations.txt');
    const homeLocations = await loadLocationsCSV('test/perf/nyc-locations.txt');
    const blockIndex = SpatialIndex.from(blockLocations);

    const home = homeLocations[0];
    const fastLinks = _.sortBy(blockIndex.search(home, 1.0), 'km');

    // Find the closest points the slow way.
    let slowLinks = [] as Link[];
    for (const block of blockLocations) {
      const km = haversine(home.latitude, home.longitude, block.latitude, block.longitude);
      if (km <= 1) {
        slowLinks.push({ id: block.id, km });
      }
    }
    slowLinks = _.sortBy(slowLinks, 'km');

    expect(fastLinks).to.not.be.empty;
    expect(fastLinks).to.roughly(0.001).deep.equal(slowLinks);
  });

  it('should clone a spatial index', () => {
    const a = SpatialIndex.from([{id: 'a', latitude: 37, longitude: -113}]);
    const b = a.clone();
    b.add([{id: 'b', latitude: 38, longitude: -114}]);

    expect(a.size()).to.equal(1);
    expect(b.size()).to.equal(2);
  });
});
