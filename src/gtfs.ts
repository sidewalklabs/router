// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as _ from 'lodash';

import { loadCSV, ColumnType } from './csv-loader';
import * as gtfs from './gtfs-types';
import { LoadingOptions } from './options';
import * as utils from './utils';

/** Load stop_times.txt. If provided, okTrips is used as a filter. */
export function loadStopTimes(
  filename: string,
  okTrips: gtfs.Trip[] = null
): Promise<gtfs.StopTime[]> {
  const okTripIds = okTrips ? _.keyBy(okTrips, 'trip_id') : null;
  return loadCSV<gtfs.StopTime>(filename, {
    columns: [
      { name: 'trip_id', type: ColumnType.STRING, destination: 'tripId' },
      { name: 'arrival_time', type: ColumnType.STRING, destination: 'arrivalTime' },
      { name: 'departure_time', type: ColumnType.STRING, destination: 'departureTime' },
      { name: 'stop_id', type: ColumnType.STRING, destination: 'stopId' },
      { name: 'stop_sequence', type: ColumnType.NUMERIC, destination: 'stopSequence' },
    ],
  }).then(rows => {
    if (okTrips) {
      rows = rows.filter(row => row.tripId in okTripIds);
    }
    // Parse the times.
    rows.forEach(stopTime => {
      if (!stopTime.departureTime) {
        throw new Error(`Expected StopTime ${stopTime} to have departure_time.`);
      }
      stopTime.timeOfDaySec = utils.parseTime(stopTime.departureTime);
    });
    return rows;
  });
}

export function loadStops(filename: string): Promise<gtfs.Stop[]> {
  return loadCSV(filename, {
    columns: [
      { name: 'stop_id', type: ColumnType.STRING, destination: 'stopId' },
      { name: 'stop_name', type: ColumnType.STRING, destination: 'stopName' },
      { name: 'stop_desc', type: ColumnType.STRING, optional: true, destination: 'stopDesc' },
      { name: 'stop_lat', type: ColumnType.NUMERIC, destination: 'stopLat' },
      { name: 'stop_lon', type: ColumnType.NUMERIC, destination: 'stopLng' },
      {
        name: 'parent_station',
        type: ColumnType.STRING,
        destination: 'parentStation',
        optional: true,
      },
    ],
  });
}

export function loadTrips(filename: string): Promise<gtfs.Trip[]> {
  return loadCSV(filename, {
    columns: [
      { name: 'route_id', type: ColumnType.STRING },
      { name: 'service_id', type: ColumnType.STRING },
      { name: 'trip_id', type: ColumnType.STRING },
      { name: 'trip_headsign', type: ColumnType.STRING, optional: true },
      { name: 'trip_short_name', type: ColumnType.STRING, optional: true },
      { name: 'direction_id', type: ColumnType.NUMERIC, optional: true },
      { name: 'block_id', type: ColumnType.STRING, optional: true },
      { name: 'shape_id', type: ColumnType.STRING, optional: true },
      { name: 'wheelchair_accessible', type: ColumnType.NUMERIC, optional: true },
      { name: 'bikes_allowed', type: ColumnType.NUMERIC, optional: true },
    ],
  });
}

export function loadCalendars(filename: string): Promise<gtfs.Calendar[]> {
  return loadCSV(filename, {
    isOptional: true,
    columns: [
      { name: 'service_id', type: ColumnType.STRING },
      { name: 'monday', type: ColumnType.BOOLEAN },
      { name: 'tuesday', type: ColumnType.BOOLEAN },
      { name: 'wednesday', type: ColumnType.BOOLEAN },
      { name: 'thursday', type: ColumnType.BOOLEAN },
      { name: 'friday', type: ColumnType.BOOLEAN },
      { name: 'saturday', type: ColumnType.BOOLEAN },
      { name: 'sunday', type: ColumnType.BOOLEAN },
      { name: 'start_date', type: ColumnType.STRING },
      { name: 'end_date', type: ColumnType.STRING },
    ],
  });
}

export function loadCalendarDates(filename: string): Promise<gtfs.CalendarDate[]> {
  return loadCSV(filename, {
    isOptional: true,
    columns: [
      { name: 'service_id', type: ColumnType.STRING },
      { name: 'date', type: ColumnType.STRING },
      { name: 'exception_type', type: ColumnType.NUMERIC },
    ],
  });
}

export function loadRoutes(filename: string): Promise<gtfs.Route[]> {
  return loadCSV(filename, {
    columns: [
      { name: 'route_id', type: ColumnType.STRING },
      { name: 'agency_id', type: ColumnType.STRING, optional: true },
      { name: 'route_short_name', type: ColumnType.STRING },
      { name: 'route_long_name', type: ColumnType.STRING },
      { name: 'route_desc', type: ColumnType.STRING, optional: true },
      { name: 'route_type', type: ColumnType.NUMERIC },
      { name: 'route_url', type: ColumnType.STRING, optional: true },
      { name: 'route_color', type: ColumnType.STRING, optional: true },
      { name: 'route_text_color', type: ColumnType.STRING, optional: true },
    ],
  });
}

export function loadShapes(filename: string): Promise<gtfs.Shape[]> {
  return loadCSV(filename, {
    isOptional: true,
    columns: [
      { name: 'shape_id', type: ColumnType.STRING },
      { name: 'shape_pt_lat', type: ColumnType.NUMERIC },
      { name: 'shape_pt_lon', type: ColumnType.NUMERIC },
      { name: 'shape_pt_sequence', type: ColumnType.NUMERIC },
    ],
  });
}

export interface FeedAttributes {
  hasTransfers: boolean;  // Did the feed have an explicit transfers.txt file?
}

export function loadTransfers(filename: string): Promise<gtfs.Transfer[]> {
  return loadCSV(filename, {
    isOptional: true,
    columns: [
      { name: 'from_stop_id', type: ColumnType.STRING, destination: 'fromStopId' },
      { name: 'to_stop_id', type: ColumnType.STRING, destination: 'toStopId' },
      { name: 'transfer_type', type: ColumnType.NUMERIC, destination: 'type' },
      {
        name: 'min_transfer_time',
        type: ColumnType.NUMERIC,
        optional: true,
        destination: 'minTransferTime',
      },
    ],
  });
}

function getLastDirectory(directory: string) {
  return directory.split('/').pop();
}

/**
 * Filters out unavailable service IDs for a given date.
 * A service is available if the given date is:
 *   - in the union of (gtfs.Calendar and gtfs.CalendarDates' added services)
 *   - and not in gtfs.CalendarDates' removed services.
 * @param date YYYYMMDD
 */
export function filterServicesByDate(
    services: Set<string>,
    calendars: gtfs.Calendar[],
    calendarDates: gtfs.CalendarDate[],
    date: string
): Set<string> {
  const departureDow = utils.dayOfWeek(date);
  for (const service of calendars) {
    // check service date range
    if (service.start_date <= date && date <= service.end_date) {
      // check service day of week
      const dow = [service.sunday, service.monday, service.tuesday, service.wednesday,
          service.thursday, service.friday, service.saturday];
      if (!dow[departureDow]) {
        services.delete(service.service_id);
      }
    } else {
      services.delete(service.service_id);
    }
  }

  // check service exceptions
  for (const exception of calendarDates) {
    if (exception.date === date) {
      if (exception.exception_type === gtfs.ServiceExceptionType.ServiceAdded) {
        services.add(exception.service_id);
      } else if (exception.exception_type === gtfs.ServiceExceptionType.ServiceRemoved) {
        services.delete(exception.service_id);
      } else {
        throw new Error(
            `Unexpected value of gtfs.CalendarDates.exception_type: ${exception.exception_type}`);
      }
    }
  }
  if (services.size === 0) {
    console.warn('No service available for ' + date);
  }
  return services;
}

// This updates one or more ID fields in a list of objects using a mapping, e.g.
// updateIds([{id: 'old'}], 'id', {'old': 'new'}) --> [{id: 'new'}]
export function updateIds<T>(
  values: T[],
  fields: Array<keyof T>,
  stopMapping: {[oldId: string]: string}
): T[] {
  return values.map(value => {
    const newIds = fields.map(field => stopMapping[value[field] as any]);
    if (!_.some(newIds)) return value;  // no mapped IDs.

    const newValue = _.clone(value) as T;
    fields.forEach((field, i) => {
      const newId = newIds[i];
      // Ideally TS would enforce that T[field] is a string.
      if (newId) newValue[field] = newId as any;
    });
    return newValue;
  });
}

// Returns true if any stops in the list have differing locations.
function anyLocationMismatches(stops: gtfs.Stop[]) {
  if (!stops.length) return false;
  const stop = stops[0];
  for (const other of stops.slice(1)) {
    if (stop.stopLat !== other.stopLat || stop.stopLng !== other.stopLng) {
      return true;
    }
  }
  return false;
}

/**
 * This class represents a full GTFS feed.
 */
export default class GTFS {
  name: string;
  attributes: {[name: string]: FeedAttributes};
  stops: gtfs.Stop[];
  stopTimes: gtfs.StopTime[];
  trips: gtfs.Trip[];
  calendars: gtfs.Calendar[];
  calendarDates: gtfs.CalendarDate[];
  routes: gtfs.Route[];
  shapes: gtfs.Shape[];
  transfers: gtfs.Transfer[];

  // TODO(danvk): make this constructor "private" when TS 2.0 is released.
  constructor(private directory: string) {
    this.name = getLastDirectory(directory);
  }

  private async load(date?: string): Promise<GTFS> {
    const [calendars, calendarDates, trips] = await Promise.all([
      loadCalendars(this.directory + '/calendar.txt'),
      loadCalendarDates(this.directory + '/calendar_dates.txt'),
      loadTrips(this.directory + '/trips.txt'),
    ]);
    this.calendars = calendars;
    this.calendarDates = calendarDates;
    this.trips = trips;

    if (date) {
      this.filterByDate(date);
    }

    return Promise.all([
      loadStops(this.directory + '/stops.txt'),
      loadStopTimes(this.directory + '/stop_times.txt', this.trips),
      loadTransfers(this.directory + '/transfers.txt'),
      loadRoutes(this.directory + '/routes.txt'),
      loadShapes(this.directory + '/shapes.txt'),
      loadTransfers(this.directory + '/transfers.txt'),
    ]).then(([stops, stopTimes, transfers, routes, shapes]) => {
      this.stops = stops;
      for (const stop of this.stops) stop.feed = this.name;
      this.stopTimes = stopTimes;
      this.routes = routes;
      this.shapes = shapes;
      this.transfers = transfers;
      this.attributes = { [this.name]: { hasTransfers: this.transfers.length > 0 } };

      console.warn(`Loaded ${this.trips.length} trips from ${this.directory}`);  // warn=stderr
      return this;
    });
  }

  /**
   * Remove trips which are inactive on a particular day.
   * This operates in-place on the GTFS feed. departureDate is in YYYYMMDD format.
   */
  private filterByDate(departureDate: string) {
    const allServices = new Set(_.uniq(this.trips.map(trip => trip.service_id)));

    const availableServices =
        filterServicesByDate(allServices, this.calendars, this.calendarDates, departureDate);
    this.trips = this.trips.filter(trip => availableServices.has(trip.service_id));
  }

  /**
   * Remove stop-times outside the range specified in the options.
   */
  filterByTimeRange(options: LoadingOptions) {
    const timeFilter = options.stop_time_filter;
    if (!timeFilter) return;

    const earliestTime = timeFilter.earliest ? utils.parseTime(timeFilter.earliest) : 0;
    const latestTime = timeFilter.latest ? utils.parseTime(timeFilter.latest) : Infinity;

    if (earliestTime >= latestTime) {
      throw new Error(
        `stop_time_filter earliest_time >= latest_time: ${earliestTime} >= ${latestTime}`);
    }

    this.stopTimes = this.stopTimes.filter(
      ({ timeOfDaySec }) => (timeOfDaySec >= earliestTime && timeOfDaySec <= latestTime));
  }

  /**
   * Load the files in a GTFS feed.
   */
  static feed(directory: string, date?: string): Promise<GTFS> {
    const feed = new GTFS(directory);
    return feed.load(date);
  }

  /**
   * Load feeds from several directories and merge them.
   */
  static feeds(directories: string[], date?: string): Promise<GTFS> {
    return Promise.all(directories.map(dir => GTFS.feed(dir, date)))
        .then(feeds => GTFS.merge(feeds));
  }

  /**
   * Merge multiple GTFS feeds.
   *
   * This will rename duplicate stop IDs which correspond to different locations.
   */
  static merge(feeds: GTFS[]): GTFS {
    if (feeds.length === 1) return feeds[0];  // special case.

    const allStops = _.flatten(feeds.map(feed => feed.stops));
    const dupeStopIds = _(allStops)
      .groupBy((stop: gtfs.Stop) => stop.stopId)
      .pickBy((stops: gtfs.Stop[]) => (stops.length > 1))
      .pickBy(anyLocationMismatches)
      .mapValues(x => true)
      .value();
    console.log('Found ', _.size(dupeStopIds), ' duplicate stops during merge');

    const merged = new GTFS('merged');

    // The stops and stop times might need to be re-ID'd.
    merged.stops = [];
    merged.stopTimes = [];
    merged.transfers = [];
    for (const feed of feeds) {
      const stopMapping = _(feed.stops)
          .filter(stop => stop.stopId in dupeStopIds)
          .map(stop => [stop.stopId, feed.name + '_' + stop.stopId])
          .fromPairs()
          .value() as {[oldId: string]: string};

      merged.stops = merged.stops.concat(
          updateIds(feed.stops, ['stopId', 'parentStation'], stopMapping));
      merged.stopTimes = merged.stopTimes.concat(
          updateIds(feed.stopTimes, ['stopId'], stopMapping));
      merged.transfers = merged.transfers.concat(
          updateIds(feed.transfers, ['fromStopId', 'toStopId'], stopMapping));
    }

    // For stops which were duplicated across feeds, just take the first.
    merged.stops = _.uniqBy(merged.stops, 'stopId');

    // The other parts of the feed should be safe to merge.
    // TODO: verify this.
    merged.trips = _.flatten(feeds.map(feed => feed.trips));
    merged.calendars = _.flatten(feeds.map(feed => feed.calendars));
    merged.calendarDates = _.flatten(feeds.map(feed => feed.calendarDates));
    merged.attributes = _.extend({}, ...feeds.map(feed => feed.attributes)) as any;

    merged.routes = _.flatten(feeds.map(feed => feed.routes));
    merged.shapes = _.flatten(feeds.map(feed => feed.shapes));

    return merged;
  }
}
