// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Geospatial index.
 */

import * as rbush from 'rbush';

import { Location } from './location';

export interface Link {
  id: string;
  km: number;
}

function sqr(x: number) { return x * x; }

/**
 * A spatial index for geographic (lat/lng) coordinates.
 *
 * This uses a local flat earth approximation for all queries. The distances
 * returned may not be accurate if the points are spread out over more than ~10km.
 */
export default class SpatialIndex {
  tree: rbush.RBush<Location>;

  constructor() {
    // The `9` parameter controls the branching factor of the R tree (it's the default value).
    // The array is [minX, minY, maxX, maxY] accessors.
    // Since we're indexing points (not rectangles), min and max are the same fields.
    this.tree = rbush<any>(9, ['.longitude', '.latitude', '.longitude', '.latitude']);
  }

  add(locations: Location[]) {
    this.tree.load(locations);
  }

  static from(locations: Location[]) {
    const index = new SpatialIndex();
    index.add(locations);
    return index;
  }

  clone(): SpatialIndex {
    const newIndex = new SpatialIndex();
    newIndex.tree.fromJSON(JSON.parse(JSON.stringify(this.tree.toJSON())));
    return newIndex;
  }

  size() {
    return this.tree.all().length;
  }

  all(): Location[] {
    return this.tree.all();
  }

  /** Find all the locations within radiusKm of point. */
  search(point: Location, radiusKm: number): Link[] {
    const radiusKm2 = sqr(radiusKm);
    // The distance from equator to pole (90 degrees) was originally defined as 10,000 km.
    // This assumes a spherical earth. See http://gis.stackexchange.com/a/2964/8540.
    const kmPerDegLat = 10000 / 90;
    const kmPerDegLng = 10000 / 90 * Math.cos(point.latitude * Math.PI / 180);
    const dLat = radiusKm / kmPerDegLat;
    const dLng = radiusKm / kmPerDegLng;
    const box = {
      minX: point.longitude - dLng,
      maxX: point.longitude + dLng,
      minY: point.latitude - dLat,
      maxY: point.latitude + dLat,
    };

    return this.tree.search(box).map(loc => {
      const d2 = sqr((loc.longitude - point.longitude) * kmPerDegLng) +
                 sqr((loc.latitude - point.latitude) * kmPerDegLat);
      if (d2 > radiusKm2) return null;  // points in the corners of the box are too far away.
      return {
        id: loc.id,
        km: Math.sqrt(d2),
      };
    }).filter(x => x);
  }

  /** Find all pairs within radiusKm of one another between two indices. */
  intersect(other: SpatialIndex, radiusKm: number): {[id: string]: Link[]} {
    // TODO: run other.intersect(this) depending on the relative sizes.

    const links = {} as {[id: string]: Link[]};
    for (const location of this.tree.all()) {
      links[location.id] = other.search(location, radiusKm);
    }
    return links;
  }
}
