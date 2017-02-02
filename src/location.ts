// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Code and types relating to geographic locations.
 */

import { loadCSV, ColumnType } from './csv-loader';

/** One location of interest (row in the CSV file). */
export interface Location {
  id: string;
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
}

const RADIUS_EARTH_KM = 6371;

/**
 * Compute the distance (in km) between two points on the earth's surface.
 * See https://en.wikipedia.org/wiki/Haversine_formula
 */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  lat1 *= Math.PI / 180;
  lng1 *= Math.PI / 180;
  lat2 *= Math.PI / 180;
  lng2 *= Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIUS_EARTH_KM * c;
}

export function loadLocationsCSV(filename: string): Promise<Location[]> {
  return loadCSV(filename, {
    columns: [
      { name: 'id', type: ColumnType.STRING },
      { name: 'latitude', type: ColumnType.NUMERIC },
      { name: 'longitude', type: ColumnType.NUMERIC },
    ],
  });
}
