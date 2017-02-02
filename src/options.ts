// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/* eslint-disable camelcase */

/** These options must be set in advance when the server loads, before any queries. */
export interface LoadingOptions {
  // The departure_date is used to exclude unavailable services on that date.
  departure_date: string;  // YYYYMMDD

  // Path to one or more directories containing GTFS data to be used for routing.
  gtfs_data_dirs: string[];

  stop_time_filter?: {
    // To reduce the search space, restrict routing to look at departures from stops between
    // these times (e.g. 8 and 9 AM). This doesn't mean that the trip needs to be completed
    // by the latest time, it just means that you need to be at the origin stop between those
    // times.
    earliest?: string,  // HH:MM:SS
    latest?: string,  // HH:MM:SS
  };

  // What's the largest value that will be allowed for max_walking_distance_km between
  // stops? This is used to build the transfer map between stops at load time.
  // Default is 1.5 km (one mile).
  max_allowable_between_stop_walk_km?: number;

  // The maximum allowed value of max_walking_distance_km. Overly large values will
  // slow down the router and could be used to cause denial of service attacks.
  // Queries with a larger value will use this instead. Default is Infinity.
  max_allowable_walking_distance_km?: number;

  // The maximum allowed value of max_number_of_transfers. Overly large values will
  // slow down the router and could be used to cause denial of service attacks.
  // Queries with a larger value will use this instead. Default is Infinity.
  max_allowable_number_of_transfers?: number;

  // Use this to introduce barriers (e.g. rivers) which can't be walked over.
  // This should be a GeoJSON FeatureCollection containing features with LineString geometries.
  water_geojson_file?: string;

  // GTFS feeds (e.g. the NYC Subway) are sometimes missing references from trips
  // to their shapes. You can specify additional mappings manually here.
  shape_hints?: ShapeHint[];

  // Preset lists of destinations. Walks between stops and these destinations
  // are precomputed, which results in much faster routing.
  preset_destinations?: PresetDestination[];
}

interface PresetDestination {
  name: string;
  locations_file: string;
  max_allowable_destination_walk_km: number;
}

interface ShapeHint {
  route_id: string;
  direction_id: number;
  shape_id: string;
}

export const defaultLoadingOptions: Partial<LoadingOptions> = {
  max_allowable_between_stop_walk_km: 1.5,
  max_allowable_walking_distance_km: Infinity,
  max_allowable_number_of_transfers: Infinity,
};

/**
 * Configuration options for transit routing.
 * These are loaded from a JSON file.
 */
export interface QueryOptions {
  // The farthest you're willing to walk to/from the first/last stop and between stops.
  max_walking_distance_km: number;

  walking_speed_kph: number;
  max_waiting_time_secs: number;

  // The cost (in seconds) added as a penalty for each transfer.
  // This doesn't affect your ability to catch a vehicle but it does affect how a fast route
  // with many transfers is valued relative to a slower one without transfers.
  transfer_penalty_secs: number;

  // Maximum number of transfers to allow. The default is 1.
  max_number_of_transfers: number;

  // Don't explore commutes which take longer than this much time in total.
  // This is most useful as an optimization for one-to-one routing if you already know the
  // amount of time that the trip takes from a call to one-to-many.
  // The default is Infinity, so not specifying this places no limit on total commute time.
  max_commute_time_secs: number;

  // Cost multiplier for time spent riding (not waiting) on each type of transit.
  // For now, anything that isn't a bus is considered rail.
  // Set either of these to a negative number to disallow travel via that mode.
  bus_multiplier: number;
  rail_multiplier: number;

  // Routes to exclude, e.g. the L train.
  exclude_routes: string[];
}

export const defaults: QueryOptions = {
  max_walking_distance_km: 1.5,
  walking_speed_kph: 5.1,
  max_waiting_time_secs: 1800,
  transfer_penalty_secs: 30,
  max_number_of_transfers: 1,
  max_commute_time_secs: Infinity,
  bus_multiplier: 1,
  rail_multiplier: 1,
  exclude_routes: [],
};

interface Options extends LoadingOptions, QueryOptions {}

export default Options;
