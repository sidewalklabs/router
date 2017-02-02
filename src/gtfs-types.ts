// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/* eslint-disable camelcase */
/**
 * Types for GTFS data.
 *
 * Properties in these interfaces match column names in GTFS CSV files.
 */

// TODO(danvk): change the rest of these to camelcase;
//     with csv-loader, the 1-1 correspondence with column names is no longer relevant.

/** Type for stop_times.txt */
export interface StopTime {
  tripId: string;
  arrivalTime: string;  // e.g. '11:00:00',
  departureTime: string;  // e.g. '11:00:00',
  stopId: string;  // e.g. 'BEATTY_AIRPORT',
  stopSequence: number;  // e.g. 2
  timeOfDaySec: number;  // parsed version of departureTime
}

/** Type for stops.txt */
export interface Stop {
  // TODO: rename fields to id, latitude, longitude so that this extends Location.
  stopId: string;
  stopName: string;
  stopDesc: string;
  stopLat: number;
  stopLng: number;
  parentStation?: string;
  feed?: string;  // for merged feeds, this tracks the original source.
}

export enum WheelchairAccessibility {
  Unknown = 0,
  Accessible,
  NotAccessible
}

export enum BikesAllowed {
  Unknown = 0,
  Yes,
  No
}

/** 0: Travel in one direction, 1: Travel in the opposite direction */
export enum TripDirection {
  OutBound = 0,
  InBound
}

/** Type for trips.txt */
export interface Trip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;   //  Optional, the text that identifies the destination to passengers
  trip_short_name?: string; //  Optional, short version of trip_headsign
  direction_id: TripDirection;
  block_id: string;        //  The block to which the trip belongs.
  shape_id: string;        //  Contains an ID that defines a shape for the trip.
  wheelchair_accessible?: WheelchairAccessibility;
  bikes_allowed?: BikesAllowed;
}

/** Type for calendar.txt */
export interface Calendar {
  service_id: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  start_date: string;  // YYYYMMDD format
  end_date: string;   // YYYYMMDD format
}

export enum ServiceExceptionType {
  ServiceAdded = 1,
  ServiceRemoved
}

/** Type for calendar_dates.txt */
export interface CalendarDate {
  service_id: string;
  date: string;  // YYYYMMDD format
  exception_type: ServiceExceptionType;
}

export enum RouteType {
  LightRail = 0,
  Subway,
  Rail,
  Bus,
  Ferry,
  CableCar,
  Gondola,
  Funicular
}

/** Type for routes.txt */
export interface Route {
  route_id: string;
  agency_id?: string;
  route_short_name: string;
  route_long_name: string;
  route_desc?: string;
  route_type: RouteType;
  route_url?: string;
  route_color?: string;
  route_text_color?: string;
}

/** Type for shapes.txt */
export interface Shape {
  shape_id: string;
  shape_pt_lat: number;
  shape_pt_lon: number;
  shape_pt_sequence: number;
}

export enum TransferType {
  RECOMMENDED = 0,
  TIMED,
  MIN_TIME,
  INFEASIBLE,
}

/** Type for transfers.txt */
export interface Transfer {
  fromStopId: string;
  toStopId: string;
  type: TransferType;
  minTransferTime?: number;
}
