// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Filter out line segments which cross water. This is used to prevent walks across the East River.
 */

import * as _ from 'lodash';

import { doLineSegmentsIntersect, FeatureCollection } from './geometry';

export type WaterFilter = (lat1: number, lng1: number, lat2: number, lng2: number) => boolean;

/**
 * waterFeatures is a feature collection of LineStrings going through the center of a
 * river. If a walk crosses any one of these lines, then it must cross the river.
 */
function getFilterer(waterFeatures: FeatureCollection): WaterFilter {
  if (waterFeatures.type !== 'FeatureCollection') {
    throw new Error('Expected water GeoJSON to contain a FeatureCollection.');
  }

  // lines is an array of [[lng1, lat1], [lng2, lat2]]
  const lines = _.flatMap(waterFeatures.features, feature => {
    if (feature.geometry.type !== 'LineString') {
      throw new Error('Water GeoJSON must consist entirely of LineStrings.');
    }
    const coordinates = feature.geometry.coordinates as number[][];
    return coordinates.slice(0, -1).map((coord, i) => [coord, coordinates[i + 1]]);
  });

  return (lat1, lng1, lat2, lng2) => {
    const p1 = [lng1, lat1];
    const p2 = [lng2, lat2];
    return _.some(lines, line => doLineSegmentsIntersect(p1, p2, line[0], line[1]));
  };
}

export default getFilterer;
