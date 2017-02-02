// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';

import GTFS, { filterServicesByDate, loadTrips, updateIds } from '../src/gtfs';
import * as gtfsTypes from '../src/gtfs-types';

const { assert, expect } = chai;

describe('GTFS loader', () => {
  it('should load sample data', () => GTFS.feed('data/sample').then(gtfs => {
    expect(gtfs.stops.length).to.equal(9);
    expect(gtfs.stopTimes.length).to.equal(28);
    expect(gtfs.calendars.length).to.equal(2);
    expect(gtfs.calendarDates.length).to.equal(1);

    expect(gtfs.stops[0]).to.deep.equal({
      feed: 'sample',
      stopId: 'FUR_CREEK_RES',
      stopName: 'Furnace Creek Resort (Demo)',
      stopDesc: '',
      stopLat: 36.425288,
      stopLng: -117.133162,
    });

    expect(gtfs.stopTimes[0]).to.deep.equal({
      tripId: 'STBA',
      arrivalTime: '6:00:00',
      departureTime: '6:00:00',
      stopId: 'STAGECOACH',
      stopSequence: 1,
      timeOfDaySec: 21600,
    });

    expect(gtfs.trips[0]).to.deep.equal({
      route_id: 'AB',
      service_id: 'FULLW',
      trip_id: 'AB1',
      trip_headsign: 'to Bullfrog',
      direction_id: gtfsTypes.TripDirection.OutBound,
      block_id: '1',
      shape_id: '',
    });

    expect(gtfs.calendars[0]).to.deep.equal({
      service_id: 'FULLW',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      start_date: '20070101',
      end_date: '20101231',
    });

    expect(gtfs.calendarDates[0]).to.deep.equal({
      service_id: 'FULLW',
      date: '20070604',
      exception_type: gtfsTypes.ServiceExceptionType.ServiceRemoved,
    });
  }));

  it('should load data with short trip names', () =>
    loadTrips('test/short_name.trips.txt').then(trips => {
      expect(trips).to.have.length(9);
      expect(trips[0]).to.deep.equal({
        route_id: '8474',
        service_id: '1',
        trip_id: '974933',
        trip_headsign: '3 Ysleta Express Outbound    ',
        trip_short_name: '',
        direction_id: gtfsTypes.TripDirection.OutBound,
        block_id: '271040',
        shape_id: '28010',
      });
    })
  );

  it('should load gtfs_a',
    () => GTFS.feed('test/gtfs_merge_sample/gtfs_a').then(gtfs => {
      expect(gtfs.stops).to.have.length(3);
      expect(gtfs.stopTimes).to.have.length(3);
      expect(gtfs.trips).to.have.length(1);
    })
  );

  it('should update IDs', () => {
    expect(updateIds(
      [{k: 'a', b: 1}, {k: 'b', b: 2}, {k: 'c'}],
      ['k'],
      {a: 'b', b: 'a'}
    )).to.deep.equal([
      {k: 'b', b: 1},
      {k: 'a', b: 2},
      {k: 'c'},
    ]);
  });
});

const aWeekdayInTheRange = '20160822';
const aWeekdayOutOfRange = '20000101';
const aWeekendInTheRange = '20160820';
const dateRange = ['20160101', '20170101'];

function makeCalendarEntry(serviceId: string, dowStr: string): gtfsTypes.Calendar {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] =
    dowStr.split('').map(x => x === '1');

  return {
    service_id: serviceId,
    monday,
    tuesday,
    wednesday,
    thursday,
    friday,
    saturday,
    sunday,
    start_date: dateRange[0],
    end_date: dateRange[1],
  };
}

describe('getAvailableServiceIdsByDate', () => {
  let weekendEntry: gtfsTypes.Calendar;
  let weekdayEntry1: gtfsTypes.Calendar;
  let weekdayEntry2: gtfsTypes.Calendar;
  let calendarEntries: gtfsTypes.Calendar[];
  let services: Set<string>;

  beforeEach(() => {
    weekendEntry = makeCalendarEntry('only weekend', '0000011'); // '0000011' -> Sat and Sun
    weekdayEntry1 = makeCalendarEntry('weekday1', '1111100'); // '0000011' -> Sat and Sun
    weekdayEntry2 = makeCalendarEntry('weekday2', '1111100'); // '0000011' -> Sat and Sun
    calendarEntries = [weekendEntry, weekdayEntry1, weekdayEntry2];

    services = new Set<string>([
      weekendEntry.service_id,
      weekdayEntry1.service_id,
      weekdayEntry2.service_id]);
  });

  it('should return services for weekend.', () => {
    const actual = filterServicesByDate(services, calendarEntries, [], aWeekendInTheRange);
    assert.isTrue(actual.has(weekendEntry.service_id), 'Expected service to exist.');
    assert.isFalse(actual.has(weekdayEntry1.service_id), 'Expected service to be removed.');
    assert.isFalse(actual.has(weekdayEntry2.service_id), 'Expected service to be removed.');
  });

  it('should return services for weekday.', () => {
    const actual = filterServicesByDate(services, calendarEntries, [], aWeekdayInTheRange);
    assert.isTrue(actual.has(weekdayEntry1.service_id), 'Expected service to exist.');
    assert.isTrue(actual.has(weekdayEntry2.service_id), 'Expected service to exist.');
    assert.isFalse(actual.has(weekendEntry.service_id), 'Expected service to be removed.');
  });

  it('should skip unavailable services by date range.', () => {
    const actual = filterServicesByDate(services, calendarEntries, [], aWeekdayOutOfRange);
    assert.equal(actual.size, 0);
  });

  it('should return added services.', () => {
    const calendarDate = {
      service_id: 'added service',
      date: aWeekdayOutOfRange,
      exception_type: gtfsTypes.ServiceExceptionType.ServiceAdded,
    };
    services.add(calendarDate.service_id);
    const actual = filterServicesByDate(
      services, calendarEntries, [calendarDate], aWeekdayOutOfRange);
    assert.equal(actual.size, 1);
    assert.isTrue(actual.has(calendarDate.service_id), 'Expected service to exist.');

  });

  it('should not return removed services.', () => {
    const calendarDate = {
      service_id: 'removed service',
      date: aWeekdayOutOfRange,
      exception_type: gtfsTypes.ServiceExceptionType.ServiceRemoved,
    };
    services.add(calendarDate.service_id);
    const actual = filterServicesByDate(
      services, calendarEntries, [calendarDate], aWeekdayOutOfRange);
    assert.equal(actual.size, 0);
  });
});
