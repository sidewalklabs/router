// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * This module implements something like Microsoft's RAPTOR algorithm for efficiently computing
 * one to many travel times in a transit system.
 *
 * It consumes:
 * - an origin stop
 * - a set of trips between stops
 * - footpaths between stops
 *
 * It produces a matrix (tau) where each row is a stop and each column is a number of "rounds"
 * of travel. A round involves either taking the transit trips or following the footpaths.
 *
 * All Pareto-optimal routes in terms of (travel time, number of transfers) can be read by
 * scanning a row of the resulting matrix.
 */

import * as _ from 'lodash';

import * as gtfs from './gtfs-types';
import IndexedGTFS, { TransferMap } from './indexed-gtfs';
import { ReachInfo, ReachMap, TransportMode } from './matrix';
import { QueryOptions } from './options';
import * as utils from './utils';

// Note on the implementation: this roughly follows Algorithm 1 from
// https://www.microsoft.com/en-us/research/publication/round-based-public-transit-routing/
// The core function is raptor(), which alternates calls to takeVehicles() and makeTransfers()
// to generate the reachability matrix, tau. All the other functions are helpers.

/**
 * Add a new connection between an origin stop/time and a destination stop,
 * but only if it's the "cheapest" way we've seen to get between those two.
 * Returns true if this was, in fact the cheapest way.
 */
export function addConnection(
  destinations: ReachMap,
  destinationStopId: string,
  timeOfDaySec: number,
  cost: number,
  previousStopId: string,
  mode: TransportMode,
  tripId: string,
  prevK: number
) {
  const reachInfo = destinations[destinationStopId];
  if (!reachInfo || reachInfo.cost > cost) {
    destinations[destinationStopId] = {
      timeOfDaySec,
      cost,
      previousStopId,
      mode,
      tripId,
      isUnexplored: true,  // this connection is new and should be further explored.
      prevK,
    };
  }
}

// Wrapper around addConnection() for transit links.
function addTransitConnection(
  tau: ReachMap[],
  k: number,
  time: number,
  from: gtfs.StopTime,
  to: gtfs.StopTime,
  costMultiplier: number
) {
  const waitTime = from.timeOfDaySec - time;
  const travelTime = to.timeOfDaySec - from.timeOfDaySec;
  const thisCost = waitTime + costMultiplier * travelTime;
  const totalCost = tau[k - 1][from.stopId].cost + thisCost;
  addConnection(
      tau[k], to.stopId, to.timeOfDaySec, totalCost,
      from.stopId, TransportMode.Transit, to.tripId, k - 1);
}

/** Find all marked stops in a column of the reachability matrix. */
function getUnexploredStops(reach: ReachMap): string[] {
  const stopIds = Object.keys(reach).filter(stopId => reach[stopId].isUnexplored);
  return _.sortBy(stopIds, stopId => reach[stopId].cost);
}

function isTripExcluded(trip: gtfs.Trip, options: QueryOptions): boolean {
  return (options.exclude_routes && options.exclude_routes.indexOf(trip.route_id) !== -1);
}

function isStopExcluded(stopId: string, options: QueryOptions): boolean {
  return (options.exclude_stops &&
          options.exclude_stops.length &&
          options.exclude_stops.indexOf(stopId) >= 0);
}

// What cost multiplier should be applied to this trip? Zero means "don't take this route."
function getCostMultiplier(trip: gtfs.Trip, feed: IndexedGTFS, options: QueryOptions): number {
  const route = feed.routeIdToRoute[trip.route_id];
  const isBus = route.route_type === gtfs.RouteType.Bus;
  // For now we assume anything that's not a bus is rail (this includes ferries, for example).
  return isBus ? options.bus_multiplier : options.rail_multiplier;
}

/** Copy marked stops from tau[k] into tau[k + 1] */
export function copyTimes(reachMap: ReachMap): ReachMap {
  const o = {} as ReachMap;
  _.forEach(reachMap, (reach, stopId) => {
    if (reach.isUnexplored) {
      o[stopId] = reach;
    }
  });
  return o;
}

// Determine the index of a StopTime in a sequence.
function findStopTimeInSequence(stopTimes: gtfs.StopTime[], stopSequence: number) {
  // The stops are usually in sequential order, so indexing should typically work.
  if (stopSequence >= 1 && stopSequence <= stopTimes.length) {
    let guess = stopTimes[stopSequence - 1];
    if (guess.stopSequence === stopSequence) {
      return stopSequence - 1;
    }
  }

  // Otherwise fall back to a binary search.
  return _.sortedIndexBy(stopTimes, {stopSequence}, 'stopSequence');
}

/** Take vehicles from marked stops in tau[k - 1], populating tau[k]. */
export function takeVehicles(
  tau: ReachMap[],
  k: number,
  feed: IndexedGTFS,
  options: QueryOptions,
  lastValidTimeSecs: number = Infinity)
{
  const stopIds = getUnexploredStops(tau[k - 1]);

  for (const stopId of stopIds) {
    const reach = tau[k - 1][stopId];
    const time = reach.timeOfDaySec;
    const latest = time + options.max_waiting_time_secs;
    const stopTimes = (feed.stopIdToStopTimes[stopId] || [])
        .filter(({timeOfDaySec}) => timeOfDaySec >= time && timeOfDaySec <= latest);

    for (const stopTime of stopTimes) {
      if (stopTime.timeOfDaySec > lastValidTimeSecs) continue;
      const trip = feed.tripIdToTrip[stopTime.tripId];
      if (isTripExcluded(trip, options)) continue;

      const multiplier = getCostMultiplier(trip, feed, options);
      if (multiplier < 0) continue;  // this type of trip is explicitly excluded.

      const allStopTimes = feed.tripIdToStopTime[stopTime.tripId];
      const idx = findStopTimeInSequence(allStopTimes, stopTime.stopSequence);

      for (let i = idx + 1; i < allStopTimes.length; i++) {
        const thisStopTime = allStopTimes[i];
        if (thisStopTime.timeOfDaySec > lastValidTimeSecs) break;
        if (isStopExcluded(thisStopTime.stopId, options)) break;
        addTransitConnection(tau, k, time, stopTime, allStopTimes[i], multiplier);
      }
    }
    reach.isUnexplored = false;  // done exploring this stop.
  }
}

/** Walk from marked stops in tau[k - 1], filling in tau[k]. */
export function makeTransfers(
  tau: ReachMap[],
  k: number,
  transfers: TransferMap,
  options: QueryOptions,
  lastValidTimeSecs: number = Infinity
) {
  const stopIds = getUnexploredStops(tau[k - 1]);
  const secsPerKm = 3600 / options.walking_speed_kph;

  for (const stopId of stopIds) {
    const reach = tau[k - 1][stopId];
    if (reach.mode === TransportMode.Walk) continue;  // don't add walks to walks.

    const time = reach.timeOfDaySec;
    _.forEach(transfers[stopId], transfer => {
      if (transfer.km && transfer.km > options.max_walking_distance_km) return;
      if (isStopExcluded(transfer.stopId, options)) return;

      const secs = transfer.secs !== undefined ? transfer.secs : transfer.km * secsPerKm;
      const arrivalTime = time + secs;
      if (arrivalTime > lastValidTimeSecs) return;
      const destStopId = transfer.stopId;
      const cost = reach.cost + secs;
      addConnection(
          tau[k], destStopId, arrivalTime, cost,
          stopId, TransportMode.Walk, null, k - 1);
    });

    // note: we don't unmark `reach` here (as we do in takeVehicles()) because it's still
    // possible for the next call to takeVehicles() to find new paths from it. This would
    // happen with a transfer inside a station, with no intervening footpath in the TransferMap.
  }
}

/**
 * Run the RAPTOR algorithm from a particular origin stop/time.
 * This requires the GTFS feed to be indexed in a variety of ways.
 *
 * This returns a map from destination stops to information about how to get there.
 *
 * As an optimization, you may pass in a previously-populated destinations map.
 * Only routes which improve on this will be explored.
 */
export function raptor(
  stopId: string,
  timeOfDaySec: number,
  feed: IndexedGTFS,
  options: QueryOptions
): ReachMap[] {
  // The entry for tau[k][stopId] represents the lowest-cost way to get to
  // stopId using k alternating rounds of transfers & transit.
  const tau = [{
    [stopId]: {
      timeOfDaySec,
      cost: 0,
      mode: TransportMode.Origin,
      isUnexplored: true,
    },
  }] as ReachMap[];
  let k = 1;

  const maxTransfers =
      _.isUndefined(options.max_number_of_transfers) ? 1 : options.max_number_of_transfers;
  const lastValidTimeSecs = timeOfDaySec + options.max_commute_time_secs;

  // If we're not starting at a stop in the transit system, then walk to initial stops.
  if (!feed.stopIdToStopTimes[stopId] || feed.stopIdToStopTimes[stopId].length === 0) {
    tau[k] = {};
    makeTransfers(tau, k, feed.walkingTransfers, options, lastValidTimeSecs);
    k++;
  }

  // maxTransfers means that you can take (1 + maxTransfers) vehicles.
  for (let i = 1; i <= 1 + maxTransfers; i++) {
    // Note: it's important that we don't copy the previous times here.
    // tau[k][stopId] represents the best way to get to stopId after _exactly_ k
    // alternating rounds of transit and transfers, rather than <= k rounds. This allows
    // optimal routes to be discovered which are not optimal at every step. For example,
    // we can discover O --> A ==> B --> D (A ==> B is transit) even if O --> B is a feasible walk.
    tau[k] = {};
    takeVehicles(tau, k, feed, options, lastValidTimeSecs);
    tau[k + 1] = copyTimes(tau[k]);
    makeTransfers(tau, k + 1, feed.walkingTransfers, options, lastValidTimeSecs);
    k += 2;
  }

  // Clear the "marks" for tau[k]; others should already be cleared.
  _.forEach(tau[k - 1], reachInfo => {
    reachInfo.isUnexplored = false;
  });

  return tau;
}

/** Helper to calculate the number of transfers used along a route. */
function numTransfers(tau: ReachMap[], k: number, id: string): number {
  let numVehicles = 0;
  let reach: ReachInfo;
  while (reach = tau[k][id], reach.mode !== TransportMode.Origin) {
    if (reach.mode === TransportMode.Transit) {
      numVehicles++;
    }
    k = reach.prevK;
    id = reach.previousStopId;
  }

  return Math.max(0, numVehicles - 1);
}

// Helper function to find the best column in tau for arriving at destinationId.
export function findBestK(tau: ReachMap[], id: string, transferPenalty: number): number {
  const costs = tau.map(reach => reach[id]).map((reachInfo, k) => ({
    k,
    cost: reachInfo ? reachInfo.cost + numTransfers(tau, k, id) * transferPenalty : Infinity,
  }));
  const {k, cost} = _.minBy(costs, 'cost');
  return cost < Infinity ? k : null;
}

/**
 * Find the best routes from originId to {destinationIds} according to the feed.
 *
 * This returns a reachability matrix (tau) and a map from each destination ID to the
 * column representing the optimal way of getting there in the matrix.
 */
export function findBestRoutes(
  originId: string,
  timeOfDaySec: number,
  destinationIds: string[],
  feed: IndexedGTFS,
  options: QueryOptions
) {
  // do the full one-to-many search.
  const tau = raptor(originId, timeOfDaySec, feed, options);
  const bestKs = destinationIds.map(id => findBestK(tau, id, options.transfer_penalty_secs));

  return {
    tau,
    bestKs: _.fromPairs(utils.zip(destinationIds, bestKs)),
  };
}
