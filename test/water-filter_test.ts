// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import getFilterer from '../src/water-filter';

import { expect } from 'chai';
import * as fs from 'fs';

describe('water filter', () => {
  const filter = getFilterer(JSON.parse(fs.readFileSync('./test/water-nyc.geojson', 'utf8')));

  it('should flag walks across the east river', () => {
    expect(filter(40.719423, -73.964001, 40.736772, -73.989202)).to.be.true;
  });

  it('should ignore walks within Manhattan', () => {
    expect(filter(40.7124491, -74.0082925, 40.736772, -73.989202)).to.be.false;
  });

  it('should flag walks to Governors Island', () => {
    expect(filter(40.700880, -74.013110, 40.692008, -74.015259)).to.be.true;
  });
});
