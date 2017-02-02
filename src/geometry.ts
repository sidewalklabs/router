// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Fast implementations of geometric primitives.
 */

export type Feature = GeoJSON.Feature<GeoJSON.GeometryObject>;
export type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.GeometryObject>;

type Coord = number[];

const EPSILON = 1e-16;

// turn() and doLineSegmentsIntersect() provide a fast way to determine whether two line segments
// intersect one another. See http://stackoverflow.com/a/16725715/388951 for details.
function turn(p1: Coord, p2: Coord, p3: Coord) {
  const [a, b] = p1;
  const [c, d] = p2;
  const [e, f] = p3;
  const A = (f - b) * (c - a);
  const B = (d - b) * (e - a);
  return (A > B + EPSILON) ? 1 : (A + EPSILON < B) ? -1 : 0;
}

/** Does the line segment [p1, p2] intersect the line segment [p3, p4]? */
export function doLineSegmentsIntersect(p1: Coord, p2: Coord, p3: Coord, p4: Coord) {
  return (turn(p1, p3, p4) !== turn(p2, p3, p4)) &&
         (turn(p1, p2, p3) !== turn(p1, p2, p4));
}

// Helper functions for determining the closest point on a line segment.
// See http://stackoverflow.com/a/1501725/388951
function sqr(x: number) { return x * x; }
function dist2(v: Coord, w: Coord) { return sqr(v[0] - w[0]) + sqr(v[1] - w[1]); }

function distToSegmentSquared(p: Coord, v: Coord, w: Coord): {p: Coord, d2: number} {
  const l2 = dist2(v, w);
  if (l2 === 0) return { p, d2: dist2(p, v) };

  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));

  const closestP = [
    v[0] + t * (w[0] - v[0]),
    v[1] + t * (w[1] - v[1]),
  ];

  return {
    p: closestP,
    d2: dist2(p, closestP),
  };
}

/**
 * Find the closest point in a LineString.
 *
 * Returns the point, the distance to the line segment and the indices in the LineString
 * between which it falls.
 */
export function closestPointOnLineString(coord: Coord, lineString: Coord[]) {
  // This function assumes that the coordinates are in a plane.
  // It won't give correct results if they're lat/lngs, but it won't be too far off, either.
  let bestD2 = Infinity;
  let p = lineString[0];
  let bestI = 0;
  for (let i = 0; i < lineString.length - 1; i++) {
    const p1 = lineString[i];
    const p2 = lineString[i + 1];
    const d2 = distToSegmentSquared(coord, p1, p2);
    if (d2.d2 < bestD2) {
      bestD2 = d2.d2;
      p = d2.p;
      bestI = i;
    }
  }

  return {
    point: p,
    distance: Math.sqrt(bestD2),
    beforeIndex: bestI,
    afterIndex: bestI + 1,
  };
}
