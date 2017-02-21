// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * This module contains code for indexing GTFS feeds in various ways. These include
 * indexing by stop ID and trip ID as well as geospatial indexing to find walkable stops.
 *
 * These indices are exposed through the IndexedGTFS class.
 */

import * as fs from 'fs';
import * as _ from 'lodash';

import { closestPointOnLineString, Feature } from './geometry';
import GTFS from './gtfs';
import * as gtfs from './gtfs-types';
import * as location from './location';
import { defaultLoadingOptions, LoadingOptions, QueryOptions } from './options';
import SpatialIndex from './spatial-index';
import * as utils from './utils';
import getFilterer, { WaterFilter } from './water-filter';

// Two stops within walking distance of one another.
export interface WalkingTransfer {
  stopId: string;  // destination (origin stopId is implicit)
  // One of (km, secs) will be set.
  km?: number;  // time to walk there
  secs?: number;  // if this is a min_time transfer from transfers.txt.
}

function indexByStop(stopTimes: gtfs.StopTime[]): {[stopId: string]: gtfs.StopTime[]} {
  return utils.groupAndSort(stopTimes, 'stopId', 'timeOfDaySec');
}

function indexByTrip(stopTimes: gtfs.StopTime[]): {[tripId: string]: gtfs.StopTime[]} {
  return utils.groupAndSort(stopTimes, 'tripId', 'stopSequence');
}

function indexShapes(shapes: gtfs.Shape[]) {
  return utils.groupAndSort(shapes, 'shape_id', 'shape_pt_sequence');
}

// (exported for testing)
export function indexParents(stops: gtfs.Stop[]): {[stopId: string]: string[]} {
  return _(stops)
      .filter(stop => stop.parentStation)
      .groupBy(stop => stop.parentStation)
      .mapValues((ss: gtfs.Stop[]) => ss.map(stop => stop.stopId))
      .value();
}

// Produce a map from stopId --> ordered list of routes serving that stop.
function indexRoutesByStop(
  stopTimes: gtfs.StopTime[],
  tripIdToTrip: {[tripId: string]: gtfs.Trip}
): {[stopId: string]: string[]} {
  const stopRoutes = stopTimes.map(
      ({stopId, tripId}) => ({stopId, routeId: tripIdToTrip[tripId].route_id }));
  const stopToRoutes = utils.groupAndSort(stopRoutes, 'stopId', 'routeId');
  return _.mapValues(stopToRoutes, routes => _.uniq(routes.map(route => route.routeId)));
}

// For El Paso there are 181,544 walkable stop pairs, or 181544 / 2854^2 = 2.2% of all stop pairs.
export type TransferMap = {[originId: string]: WalkingTransfer[]};

export function distanceKm(a: gtfs.Stop, b: gtfs.Stop): number {
  return location.haversine(a.stopLat, a.stopLng, b.stopLat, b.stopLng);
}

export function getExplicitTransfers(stops: gtfs.Stop[], transfers: gtfs.Transfer[]) {
  // We allow two types of transfers:
  // - those enumerated in the transfers array.
  // - between stops with the same parent station.
  // This computes the transitive closure of those transfers.
 
  const pairs: {[originId: string]: WalkingTransfer[]} = {};
  for (const stop of stops) {
    pairs[stop.stopId] = [];
  }
 
  const parentPairs = _(stops)
      .filter(stop => stop.parentStation)
      .groupBy('parentStation')
      .mapValues((ss: gtfs.Stop[]) => ss.map(s => s.stopId))
      .value();
 
  // Add the explicitly enumerated transfers between stops, as well as their child stops.
  for (const transfer of transfers) {
    if (transfer.type !== gtfs.TransferType.MIN_TIME) continue;
 
    const from = transfer.fromStopId;
    const to = transfer.toStopId;
    const secs = transfer.minTransferTime;
 
    for (const childFrom of [from].concat(parentPairs[from] || [])) {
      for (const childTo of [to].concat(parentPairs[to] || [])) {
        if (childFrom === childTo) continue;  // not totally clear what to do in this case.
        pairs[childFrom].push({ stopId: childTo, secs });
      }
    }
  }
 
  // Transfers between stops with the same parent station are free.
  _.forEach(parentPairs, (childIds, parentId) => {
    childIds.forEach((from, i) => {
      pairs[parentId].push({ stopId: from, secs: 0 });
      pairs[from].push({ stopId: parentId, secs: 0 });
      childIds.slice(i + 1).forEach(to => {
        pairs[from].push({ stopId: to, secs: 0 });
        pairs[to].push({ stopId: from, secs: 0 });
      });
    });
  });

  for (const origin in pairs) {
    pairs[origin] = _.uniqBy(pairs[origin], transfer => transfer.stopId);
    pairs[origin] = _.sortBy(pairs[origin], ['secs', 'stopId']);  // stable order for testing.
  }
 
  return pairs;
}

// Sometimes trips are missing a corresponding shape_id.
// This builds an index from (route, direction) --> shape to help fill the gaps.
function extractShapeHints(trips: gtfs.Trip[], shapes: gtfs.Shape[], options: LoadingOptions) {
  const shapeLengths = _.countBy(shapes, 'shape_id');

  const hints = {} as {[key: string]: string};
  if (options.shape_hints) {
    for (const hint of options.shape_hints) {
      hints[hint.direction_id + hint.route_id] = hint.shape_id;
    }
  }

  for (const trip of trips) {
    if (!trip.shape_id) continue;
    const k = trip.direction_id + trip.route_id;
    if (hints[k] && shapeLengths[hints[k]] >= shapeLengths[trip.shape_id]) {
      continue;  // take the longest, first.
    }
    hints[k] = trip.shape_id;
  }
  return hints;
}

/**
 * A GTFS feed which has been indexed in various ways.
 */
export default class IndexedGTFS extends GTFS {
  stopIdToStop: {[stopId: string]: gtfs.Stop};
  parentStopIdToChildStopIds: {[stopId: string]: string[]};
  stopIdToStopTimes: {[stopId: string]: gtfs.StopTime[]};
  tripIdToStopTime: {[tripId: string]: gtfs.StopTime[]};
  tripIdToTrip: {[tripId: string]: gtfs.Trip};
  routeIdToRoute: {[routeId: string]: gtfs.Route};
  shapeIdToShapes: {[routeId: string]: gtfs.Shape[]};
  shapeHints: {[key: string]: string};
  stopTimes: gtfs.StopTime[];
  walkingTransfers: TransferMap;
  waterFilter: WaterFilter;
  stopIndex: SpatialIndex;

  // TODO(danvk): make this constructor "private" when TS 2.0 is released.
  constructor(feed: GTFS, options?: LoadingOptions) {
    super(feed.name);
    if (options === undefined) return;  // leave uninitialized, e.g. for cloning.

    this.attributes = feed.attributes;
    this.calendarDates = feed.calendarDates;
    this.stops = feed.stops;
    this.stopTimes = feed.stopTimes;
    this.trips = feed.trips;
    this.calendars = feed.calendars;
    this.calendarDates = feed.calendarDates;
    this.routes = feed.routes;
    this.shapes = feed.shapes;

    // Do the indexing.
    this.stopIdToStopTimes = indexByStop(this.stopTimes);
    this.tripIdToStopTime = indexByTrip(this.stopTimes);
    this.tripIdToTrip = _.keyBy(this.trips, 'trip_id');
    this.stopIdToStop = _.keyBy(this.stops, 'stopId');
    this.routeIdToRoute = _.keyBy(this.routes, 'route_id');
    this.shapeIdToShapes = indexShapes(this.shapes);
    this.parentStopIdToChildStopIds = indexParents(this.stops);

    // Find all the stops that you can walk between.
    this.stopIndex = SpatialIndex.from(this.stops.map(stop => ({
      id: stop.stopId,
      latitude: stop.stopLat,
      longitude: stop.stopLng,
    })));
    if (options.water_geojson_file) {
      this.waterFilter =
          getFilterer(JSON.parse(fs.readFileSync(options.water_geojson_file, 'utf8')));
    } else {
      this.waterFilter = () => false;
    }

    this.walkingTransfers = this.computeTransfers(feed, options);
  }

  /** Make a shallow clone of the indexed GTFS feed. */
  clone(): IndexedGTFS {
    const clone = new IndexedGTFS(this) as any;
    for (const k in this) {
      if (this.hasOwnProperty(k)) {
        clone[k] = this[k];
      }
    }
    return clone;
  }

  /** Load and index a (collection of) GTFS feed(s) as specified by the options. */
  static fromOptions(inOptions: Partial<LoadingOptions>): Promise<IndexedGTFS> {
    const options = _.extend({}, defaultLoadingOptions, inOptions) as LoadingOptions;
    return Promise.resolve(null).then(() => {
      utils.validateDateFormat(options.departure_date);
      if (!options.gtfs_data_dirs || options.gtfs_data_dirs.length < 1) {
        throw new Error('Options must contain at least one directory in gtfs_data_dirs!');
      }

      return GTFS.feeds(options.gtfs_data_dirs, options.departure_date);
    }).then(feed => {
      // The route --> shape mapping needs to be extracted before trips are filtered.
      const shapeHints = extractShapeHints(feed.trips, feed.shapes, options);
      feed.filterByTimeRange(options);
      const indexedFeed = new IndexedGTFS(feed, options);
      indexedFeed.shapeHints = shapeHints;
      return indexedFeed;
    });
  }

  /** Find stops that are within walking distance of one another. */
  findNearbyStops(
    options: LoadingOptions
  ): TransferMap {
    // Compute all distances. For large systems we could do something cleverer than all-pairs.

    // It's only useful to walk to stops with service.
    // In NYC, for example, the parent stations are unserved because the stops are on
    // inbound/outbound child stations.
    const servedStops = this.stops.filter(stop => stop.stopId in this.stopIdToStopTimes);

    const pairs: {[originId: string]: WalkingTransfer[]} = {};
    for (const stop of servedStops) {
      pairs[stop.stopId] = [];
    }

    const maxDistanceKm = options.max_allowable_between_stop_walk_km;

    let count = 0;
    // Helper to add a single walking connection.
    const add = (a: gtfs.Stop, b: gtfs.Stop, km: number) => {
      pairs[a.stopId].push({
        stopId: b.stopId,
        km,
      });
      count++;
    };

    const stopIdToRoutes = indexRoutesByStop(this.stopTimes, this.tripIdToTrip);

    for (let i = 0; i < servedStops.length; i++) {
      const a = servedStops[i];
      const aRoutes = stopIdToRoutes[a.stopId];
      const aFeed = a.feed;
      const aHasTransfers =
          aFeed in this.attributes && this.attributes[aFeed].hasTransfers;

      for (let j = i + 1; j < servedStops.length; j++) {
        const b = servedStops[j];

        const bFeed = b.feed;
        if (aFeed === bFeed && aHasTransfers) continue;  // not allowed by transfers.txt.

        const km = distanceKm(a, b);
        if (km <= maxDistanceKm && !this.waterFilter(a.stopLat, a.stopLng, b.stopLat, b.stopLng)) {
          const bRoutes = stopIdToRoutes[b.stopId];
          // If two stops serve identical routes, then walking between them isn't helpful.
          if (_.isEqual(aRoutes, bRoutes)) continue;
          add(a, b, km);
          add(b, a, km);
        }
      }
    }

    for (const originStopId in pairs) {
      pairs[originStopId] = _.sortBy(pairs[originStopId], walk => walk.km);
    }

    console.warn('Added', count, 'walking pairs');
    return pairs;
  }

  private computeTransfers(feed: GTFS, options: LoadingOptions) {
    // The feed includes explicit transfer data (transfers.txt). We'll use that.
    const explicitTransfers = getExplicitTransfers(this.stops, feed.transfers);
    const implicitTransfers = this.findNearbyStops(options);

    const pairs = explicitTransfers;
    _.forEach(implicitTransfers, (transfers, originId) => {
      pairs[originId] = (pairs[originId] || []).concat(transfers);
    });

    return pairs;
  }

  /**
   * Produce a new feed augmented with an origin and a set of destinations.
   *
   * origin may be null if it's unknown and destinations may be empty.
   *
   * The result can be passed to raptor() to get routes between locations which aren't stops
   * in the transit system.
   */
  augmentWithLocations(
    origin: location.Location,
    destinations: location.Location[],
    options: QueryOptions
  ): IndexedGTFS {
    const locations = destinations.concat(origin || []);
    const locationIds = locations.map(loc => loc.id);
    const stopIds = Object.keys(this.stopIdToStop);
    const dupeIds = _.intersection(stopIds, locationIds);
    if (dupeIds.length) {
      throw new Error(`id collision between locations and stops: ${dupeIds}`);
    }

    const locationsIndex = SpatialIndex.from(locations);

    const newStops = locations.map(loc => ({
      stopId: loc.id,
      stopName: loc.id,
      stopLat: loc.latitude,
      stopLng: loc.longitude,
    } as gtfs.Stop));

    const feed = this.clone();

    // Add new stops and index them.
    feed.stops = feed.stops.concat(newStops);
    feed.stopIdToStop = _.clone(feed.stopIdToStop);
    for (const stop of newStops) {
      feed.stopIdToStop[stop.stopId] = stop;
    }

    // Add walks between locations and stops.
    const transfers = _.clone(feed.walkingTransfers);
    const addTransfer = (from: string, to: string, km: number) => {
      transfers[from] = (transfers[from] || []).concat([{ stopId: to, km }]);
    };

    // Add walks from the origin to stops and stops to destinations
    const links = locationsIndex.intersect(this.stopIndex, options.max_walking_distance_km);
    for (const originId in links) {
      const a = feed.stopIdToStop[originId];
      for (const link of links[originId]) {
        const b = feed.stopIdToStop[link.id];
        if (feed.waterFilter(a.stopLat, a.stopLng, b.stopLat, b.stopLng)) continue;
        if (origin && originId === origin.id) {
          addTransfer(originId, link.id, link.km);
        } else {
          addTransfer(link.id, originId, link.km);
        }
      }
    }

    // Add walks between origin and destinations.
    if (origin) {
      for (const link of locationsIndex.search(origin, options.max_walking_distance_km)) {
        if (link.id === origin.id) continue;
        const destination = feed.stopIdToStop[link.id];
        if (!feed.waterFilter(origin.latitude, origin.longitude,
                              destination.stopLat, destination.stopLng)) {
          addTransfer(origin.id, link.id, link.km);
        }
      }
    }

    feed.stopIndex = this.stopIndex.clone();
    feed.stopIndex.add(locations);
    feed.walkingTransfers = transfers;

    return feed;
  }

  // Sometimes a GTFS feed's trips.txt will omit the shape_id column.
  // If we can find another trip with the same route id and direction that does have
  // an associated shape, we'll return that instead.
  private pointsForTrip(trip: gtfs.Trip): gtfs.Shape[] {
    if (trip.shape_id) {
      return this.shapeIdToShapes[trip.shape_id];
    }

    const k = trip.direction_id + trip.route_id;
    const shapeId = this.shapeHints[k];
    if (shapeId) {
      return this.shapeIdToShapes[shapeId];
    }

    // If that fails, we might be able to reverse another route.
    const revK = (1 - trip.direction_id) + trip.route_id;
    const revShapeId = this.shapeHints[revK];
    if (revShapeId) {
      return _.reverse(this.shapeIdToShapes[revShapeId]);
    }

    return null;
  }

  /** Return a GeoJSON feature for the portion of the trip between the stops. */
  geojsonBetweenStops(tripId: string, stopId1: string, stopId2: string): Feature {
    const trip = this.tripIdToTrip[tripId];
    const stop1 = this.stopIdToStop[stopId1];
    const stop2 = this.stopIdToStop[stopId2];

    const points = trip && this.pointsForTrip(trip);
    const route = trip && this.routeIdToRoute[trip.route_id];

    if (!points || points.length === 0) {
      return {
        type: 'Feature',
        properties: {
          tripId,
          from: stopId1,
          to: stopId2,
        },
        geometry: {
          type: 'LineString',
          coordinates: [[stop1.stopLng, stop1.stopLat], [stop2.stopLng, stop2.stopLat]],
        },
      };
    }

    const routePoints = points.map(p => [p.shape_pt_lon, p.shape_pt_lat]);
    const closest1 = closestPointOnLineString([stop1.stopLng, stop1.stopLat], routePoints);
    const closest2 = closestPointOnLineString([stop2.stopLng, stop2.stopLat], routePoints);

    return {
      type: 'Feature',
      properties: {
        tripId,
        from: stopId1,
        to: stopId2,
        stroke: '#' + route.route_color,
        routeColor: '#' + route.route_color,
        textColor: '#' + route.route_text_color,
        shortName: route.route_short_name,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [stop1.stopLng, stop1.stopLat],
        ].concat(routePoints.slice(closest1.afterIndex, 1 + closest2.beforeIndex)).concat([
          [stop2.stopLng, stop2.stopLat],
        ]),
      },
    };
  }
}
