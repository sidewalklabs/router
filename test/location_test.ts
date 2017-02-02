// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';

import { loadLocationsCSV } from '../src/location';

const assert = chai.assert;

describe('loadLocationsCSV', () => {
  it('should load a location CSV file', () =>
    loadLocationsCSV('test/locations-sample.txt')
    .then(locations => {
      assert.equal(locations.length, 36);
      assert.deepEqual(locations[0], {
        id: '1',
        longitude: -117.14584350585938,
        latitude: 36.421282443649496,
      });
      assert.deepEqual(locations[35], {
        id: '36',
        longitude: -116.75067901611328,
        latitude: 36.90968592889114,
      });
    }));
});
