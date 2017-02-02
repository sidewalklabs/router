// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import { expect } from 'chai';

import * as utils from '../src/utils';

describe('utils', () => {
  it('should find duplicates', () => {
    // expect(utils.findDuplicates(['A', 'B', 'a', 'b'])).to.deep.equal([]);
    expect(utils.findDuplicate([1, 2, 1])).to.equal(1);
    expect(utils.findDuplicate([new Date('2000/01/01'), new Date('2000/01/01')]))
        .to.equal(null);  // same dates, different instances
    const d = new Date('2000/01/01');
    expect(utils.findDuplicate([d, d, d, d])).to.equal(d);  // same instances
  });
});
