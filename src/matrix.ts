// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Defines the 'routing matrix' for transit routing and related data structures.
 */

export enum TransportMode {
  Origin = 0,
  Transit,
  Walk
}

export interface ReachInfo {
  timeOfDaySec: number;  // arrival time at the destination (seconds since midnight).
  cost: number;  // total cost of traveling to the corresponding destination.
  previousStopId?: string;  // the stop before destination (could be origin or a via stop).
  mode: TransportMode;  // mode of transport taken to go from previous stop to destination stop.
  tripId?: string;  // the trip to which this link belongs.
  isUnexplored?: boolean;  // has this stop been fully explored? (Used in route finding.)
  prevK?: number;  // for a reach matrix, which column was the previous stop in?
}

// How to get to a set of stops from an origin.
// This is a column in the reach matrix (tau).
export type ReachMap = {[destinationStopId: string]: ReachInfo};
