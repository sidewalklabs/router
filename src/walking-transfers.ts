// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Shared utility code for walking transfers.
 */
import * as gtfs from './gtfs-types';
import { haversine, Location } from './location';
import { QueryOptions } from './options';

/** A feasible walk from a location to a stop. */
export interface WalkableStop {
  locationId: string;
  stopId: string;
  secs: number;  // Number of seconds that the walk takes.
}

/** Compute walking time by walking distance */
export function getWalkingTime(distanceKm: number, options: QueryOptions) {
  return distanceKm / options.walking_speed_kph * 3600;
}

/** Compute walking distance to walking time */
export function getWalkingDistance(seconds: number, options: QueryOptions) {
  return seconds * options.walking_speed_kph / 3600;
}

/** Calculate the distance between a stop and a location (in km). */
export function distanceToStop(location: Location, stop: gtfs.Stop): number {
  return haversine(location.latitude, location.longitude, stop.stopLat, stop.stopLng);
}

export function distanceToLocation(a: Location, b: Location): number {
  return haversine(a.latitude, a.longitude, b.latitude, b.longitude);
}

export function distanceBetweenStops(a: gtfs.Stop, b: gtfs.Stop): number {
  return haversine(a.stopLat, a.stopLng, b.stopLat, b.stopLng);
}

/** Returns walking time between a location and a stop, or Infinity if it's infeasible. */
export function walkTimeToStop(location: Location, stop: gtfs.Stop, options: QueryOptions): number {
  const distanceKm = distanceToStop(location, stop);
  if (distanceKm <= options.max_walking_distance_km) {
    return getWalkingTime(distanceKm, options);
  }
  return Infinity;
}

/** Returns walking time between two locations, or Infinity if it's infeasible. */
export function walkTimeToLocation(
  origin: Location,
  destination: Location,
  options: QueryOptions
): number {
  const distanceKm = distanceToLocation(origin, destination);
  if (distanceKm <= options.max_walking_distance_km) {
    return getWalkingTime(distanceKm, options);
  }
  return Infinity;
}
