// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import { closestPointOnLineString, doLineSegmentsIntersect } from '../src/geometry';

import * as chai from 'chai';
const { expect } = chai;

chai.use(require('chai-roughly'));

describe('geometry', () => {
  it('should detect line intersections', () => {
    expect(doLineSegmentsIntersect([-1, 0], [1, 0], [0, -1], [0, 1])).to.be.true;
    expect(doLineSegmentsIntersect([-1, 0], [1, 0], [-1, 1], [1, 1])).to.be.false;
    expect(doLineSegmentsIntersect([-1, 0], [1, 2], [0, 0], [0, 2])).to.be.true;
  });

  it('should find the closest point to a line segment', () => {
    const cp = closestPointOnLineString;
    expect(cp([0, 6], [[0, 0], [10, 10]])).to.roughly.deep.equal(
      { point: [3, 3], distance: 3 * Math.sqrt(2), beforeIndex: 0, afterIndex: 1});
    expect(cp([-3, -4], [[0, 0], [10, 10]])).to.deep.equal(
      { point: [0, 0], distance: 5, beforeIndex: 0, afterIndex: 1 });

    expect(cp([5, 1], [[0, 5], [2, 0], [7, 0], [10, 5]])).to.deep.equal(
      { point: [5, 0], distance: 1, beforeIndex: 1, afterIndex: 2 });
  });
});
