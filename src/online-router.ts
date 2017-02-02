// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * This module provides a cleaner interface to the core RAPTOR algorithm.
 *
 * It generates routes between origin and destination location(s) which may or may not be stops
 * in a transit system. It generates routing information which is suitable for consumption by
 * client applications.
 */

import * as _ from 'lodash';

import * as gtfs from './gtfs-types';
import IndexedGTFS from './indexed-gtfs';
import { loadLocationsCSV, Location } from './location';
import { ReachMap, TransportMode } from './matrix';
import Options, { defaults as defaultOptions, QueryOptions } from './options';
import { findBestRoutes } from './router';
import { distanceBetweenStops } from './walking-transfers';

interface LocationWithProps extends Location {
  properties?: any;
}

/** A single step in a route. */
export interface Step {
  from: gtfs.Stop;  // either a stop or one of the user-specified locations
  to: gtfs.Stop;  // either a stop or one of the user-specified locations
  mode: TransportMode;
  departTimeSecs: number;
  arriveTimeSecs: number;
  travelTimeSecs: number;
  numStops?: number;  // for transit
  tripId?: string;  // for transit
  routeId?: string;  // for transit
  distanceKm?: number;  // e.g. for walking
  description: string;
}

/** A complete route from one location to another. */
export interface Route {
  origin: Location;
  destination: Location;
  departureSecs: number;
  arriveTimeSecs: number;
  travelTimeSecs: number;
  walkingDistanceKm: number;

  steps: Step[];
}

// Minimal information to reconstruct a route from one point to another.
interface RouteSpec {
  cost: number;
  travelTimeSecs: number;
  tau: ReachMap[];
  k: number;  // tau[k] corresponds to the best route.
}

/** Convert a stop to something that looks like a Location. */
function stopToLocation(stop: gtfs.Stop): LocationWithProps {
  return {
    id: stop.stopId,
    latitude: stop.stopLat,
    longitude: stop.stopLng,
    properties: _.omit(stop, 'stopId', 'stopLat', 'stopLng'),
  };
}

/** Get the StopTime structure for the arrival of tripId at stopId. */
function getStopTime(tripId: string, stopId: string, feed: IndexedGTFS) {
  const stopTimes = feed.tripIdToStopTime[tripId];
  if (!stopTimes) return null;
  const stopTime = _.find(stopTimes, { stopId });
  if (!stopTime) return null;
  return stopTime;
};

/**
 * Given a ReachInfo matrix, back out the steps to get to stopId after k rounds.
 */
function traceRoute(tau: ReachMap[], stopId: string, k: number, feed: IndexedGTFS): Step[] {
  const reachInfo = tau[k][stopId];
  if (reachInfo.mode === TransportMode.Origin) {
    return [];
  }

  const { mode, prevK, previousStopId, timeOfDaySec: arriveTimeSecs } = reachInfo;
  const from = feed.stopIdToStop[previousStopId];
  const to = feed.stopIdToStop[stopId];

  let step: Step = null;
  if (mode === TransportMode.Transit) {
    const { tripId } = reachInfo;
    const trip = feed.tripIdToTrip[tripId];
    const fromST = getStopTime(tripId, previousStopId, feed);
    const toST = getStopTime(tripId, stopId, feed);
    const numStops = toST.stopSequence - fromST.stopSequence;
    const s = numStops > 1 ? 's' : '';

    step = {
      from,
      to,
      mode,
      departTimeSecs: fromST.timeOfDaySec,
      arriveTimeSecs,
      travelTimeSecs: arriveTimeSecs - fromST.timeOfDaySec,
      numStops,
      tripId,
      routeId: trip.route_id,
      description:
          `Take ${trip.route_id} ${numStops} stop${s} from ${from.stopName} to ${to.stopName}.`,
    };
  } else if (mode === TransportMode.Walk) {
    const fromReach = tau[prevK][previousStopId];
    const departTimeSecs = fromReach.timeOfDaySec;
    const travelTimeSecs = arriveTimeSecs - departTimeSecs;
    const distanceKm =  distanceBetweenStops(from, to);

    step = {
      from,
      to,
      mode,
      departTimeSecs,
      arriveTimeSecs,
      travelTimeSecs,
      distanceKm,
      description: `Walk ${distanceKm.toFixed(1)} km from ${from.stopName} to ${to.stopName}.`,
    };
  }
  return traceRoute(tau, previousStopId, prevK, feed).concat(step);
}

function getTotalWalkingDistanceKm(steps: Step[]): number {
  if (!steps) return 0;
  return _.sum(steps.map(step => step.distanceKm || 0));
}

// Helper to piece together full routes within a transit feed (stop -> ... -> stop).
function oneToManyStopHelper(
  feed: IndexedGTFS,
  originId: string,
  departureSecs: number,
  destinationIds: string[],
  options: QueryOptions
): {[destinationId: string]: RouteSpec} {
  const { tau, bestKs } =
      findBestRoutes(originId, departureSecs, destinationIds, feed, options);

  return _.mapValues(bestKs, (k, destinationId) => {
    if (k === null) return null;  // unreachable.

    const reachInfo = tau[k][destinationId];
    return {
      cost: reachInfo.cost,
      travelTimeSecs: reachInfo.timeOfDaySec - departureSecs,
      tau,
      k,
    } as RouteSpec;
  });
}

// Helper to piece together full routes (O -> walk -> transit system -> walk -> D).
function oneToManyHelper(
  transitFeed: IndexedGTFS,
  origin: Location,
  departureSecs: number,
  destinations: Location[],
  options: QueryOptions
) {
  const feed = transitFeed.augmentWithLocations(origin, destinations, options);
  const destinationIds = _.map(destinations, 'id') as string[];
  const routes = oneToManyStopHelper(feed, origin.id, departureSecs, destinationIds, options);
  return { feed, routes };
}

interface PresetMap {
  [presetName: string]: {
    locations: Location[];
    feed: IndexedGTFS;
  };
}

/**
 * This class exposes several routing algorithms (one-to-one, one-to-many) on an indexed GTFS feed.
 */
export default class OnlineRouter {
  constructor(public feed: IndexedGTFS, public options: Options, public presets: PresetMap) {}

  static async fromOptions(options: Options): Promise<OnlineRouter> {
    const feed = await IndexedGTFS.fromOptions(options);
    const presets = {} as PresetMap;
    for (const preset of options.preset_destinations || []) {
      if (!preset.max_allowable_destination_walk_km) {
        throw new Error(`Must specify max_allowable_destination_walk_km in preset.`);
      }
      const locations = await loadLocationsCSV(preset.locations_file);
      const presetOptions = _.extend({}, options, {
        max_walking_distance_km: preset.max_allowable_destination_walk_km,
      });
      presets[preset.name] = {
        locations,
        feed: feed.augmentWithLocations(null, locations, presetOptions),
      };
    }
    return new OnlineRouter(feed, options, presets);
  }

  private complete(options: Partial<QueryOptions>): QueryOptions {
    // Enforce that max_number_of_transfers and max_walking_distance_km stay within the prescribed
    // limits. This will work even if a nefarious user passes max_allowable_number_of_transfers as
    // a query-time option.
    const overrides: Partial<QueryOptions> = {};
    if (options.max_number_of_transfers) {
      overrides.max_number_of_transfers = Math.min(
          options.max_number_of_transfers, this.options.max_allowable_number_of_transfers);
    }
    if (options.max_walking_distance_km) {
      overrides.max_walking_distance_km = Math.min(
        options.max_walking_distance_km, this.options.max_allowable_walking_distance_km);
    }

    return _.extend({}, defaultOptions, this.options, options, overrides) as any;
  }

  /** Compute travel time from an origin to many destinations. */
  oneToMany(
    origin: Location,
    departureSecs: number,
    destinations: Location[],
    options: Partial<QueryOptions> = {}
  ): {[destinationId: string]: number} {
    const { routes } = oneToManyHelper(
        this.feed, origin, departureSecs, destinations, this.complete(options));
    return _.mapValues(routes, routeSpec => routeSpec ? routeSpec.travelTimeSecs : Infinity);
  }

  /** Compute travel time from an origin to a preset list of destinations. */
  oneToManyPreset(
    origin: Location,
    departureSecs: number,
    destinationPreset: string,
    options: Partial<QueryOptions> = {}
  ): {[destinationId: string]: number} {
    const { locations, feed } = this.presets[destinationPreset];
    const completeOptions = this.complete(options);
    const t1 = new Date().getTime();
    const originFeed = feed.augmentWithLocations(origin, [], completeOptions);
    const t2 = new Date().getTime();
    const destinationIds = _.map(locations, 'id') as string[];
    const routes = oneToManyStopHelper(
        originFeed, origin.id, departureSecs, destinationIds, completeOptions);
    const t3 = new Date().getTime();
    console.log(`augment: ${t2 - t1} ms, route: ${t3 - t2} ms`);
    return _.mapValues(routes, routeSpec => routeSpec ? routeSpec.travelTimeSecs : Infinity);
  }

  /**
   * Compute travel time from many origins to many destinations.
   */
  manyToMany(
    origins: Location[],
    departureSecs: number,
    destinations: Location[],
    options: Partial<QueryOptions> = {}
  ): {[originId: string]: {[destinationId: string]: number}} {
    const out = {} as {[originId: string]: {[destinationId: string]: number}};
    for (const origin of origins) {
      out[origin.id] = this.oneToMany(origin, departureSecs, destinations, options);
    }
    return out;
  }

  /** Compute step-by-step directions from a single origin to a single destination. */
  oneToOne(
    origin: Location,
    departureSecs: number,
    destination: Location,
    options: Partial<QueryOptions> = {}
  ): Route {
    const { feed, routes } =
        oneToManyHelper(this.feed, origin, departureSecs, [destination], this.complete(options));
    const route = routes[destination.id];
    if (!route) return null;

    const { tau, k, travelTimeSecs } = route;

    const steps = traceRoute(tau, destination.id, k, feed);
    const arriveTimeSecs = departureSecs + travelTimeSecs;

    return {
      origin,
      destination,
      departureSecs,
      arriveTimeSecs,
      travelTimeSecs,
      walkingDistanceKm: getTotalWalkingDistanceKm(steps),
      steps,
    };
  }

  /** Compute a route from one stop in a transit system to another stop. */
  stopToStop(
    originStopId: string,
    departureSecs: number,
    destinationStopId: string,
    options: Partial<QueryOptions> = {}
  ): Route {
    const routes = oneToManyStopHelper(
        this.feed, originStopId, departureSecs, [destinationStopId], this.complete(options));

    const { tau, k, travelTimeSecs } = routes[destinationStopId];

    const steps = traceRoute(tau, destinationStopId, k, this.feed);

    const origin = this.feed.stopIdToStop[originStopId];
    const destination = this.feed.stopIdToStop[destinationStopId];
    return {
      origin: stopToLocation(origin),
      destination: stopToLocation(destination),
      departureSecs,
      arriveTimeSecs: departureSecs + travelTimeSecs,
      travelTimeSecs,
      walkingDistanceKm: getTotalWalkingDistanceKm(steps),
      steps,
    };
  }

  /** Generate a GeoJSON visualization of a route. Returns an object. */
  routeToGeojson(route: Route): any {
    if (!route || !route.steps) {
      return {};
    }

    // TODO: this is wasteful to re-augment the feed. Share this with oneToManyHelper().
    const feed = this.feed.augmentWithLocations(route.origin, [route.destination], this.options);

    // Helper to define a point geometry.
    const point = (location: LocationWithProps, extraProps?: any) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
      },
      properties: _.extend({}, location.properties, extraProps),
    });

    const stopPoint = (stop: gtfs.Stop) => point(stopToLocation(stop));

    // Collect stops which are not the origin.
    const stops = route.steps.map(step => step.to)
        .filter(stop => stop.stopId !== route.destination.id);

    return {
      type: 'FeatureCollection',
      features: _.flatten<any>([
        // All the legs on the journey.
        route.steps.map(
            step => feed.geojsonBetweenStops(step.tripId, step.from.stopId, step.to.stopId)),
        // Relevant locations: Origin, Destination and intermediate stops.
        point(route.origin, {
          name: 'Origin',
          'marker-symbol': 'rocket',
          'marker-color': '#007700',
        }),
        point(route.destination, {
          name: 'Destination',
          'marker-symbol': 'parking',
          'marker-color': '#770000',
        }),
        stops.map(stopPoint),
      ]),
    };
  }
}
