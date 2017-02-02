#!/usr/bin/env ts-node
// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0

import * as fs from 'fs';
import * as _ from 'lodash';

import Flags from './flags';
import { loadLocationsCSV } from './location';
import OnlineRouter, { Route } from './online-router';
import Options from './options';
import * as utils from './utils';

const USAGE = `
This command line tool offers quick access to several routing algorithms:

  cli.ts [flags] config.json subcommand [...subcommand options]

subcommands are:

  one-to-one lat1 lng1 departureTime lat2 lng2
  one-to-many originLat originLng departureTime path/to/destination/locations.csv
  stop-to-stop originStopId departureTime destinationStopId
  all-pairs path/to/locations.csv departureTime
  one-to-one-location path/to/locations.csv originId departureTime destinationId
`.trim();

const SUBCOMMANDS = [
  'one-to-one',
  'one-to-many',
  'stop-to-stop',
  'all-pairs',
  'one-to-one-location',
];

function abort(error: string) {
  console.error(error);
  process.exit(1);
}

const FLAGS = new Flags()
  .description(USAGE)
  .version('1.0.0')
  .addFlag('geojson', 'Output GeoJSON rather than a route');

// Replace machine-readable times with human-readable versions
// and simplify the route by removing zero-second steps.
function formatRoute(route: Route): any {
  const fix = (o: any) => {
    if ('departTimeSecs' in o) {
      o['departTime'] = utils.formatTime(o.departTimeSecs);
      delete o['departTimeSecs'];
    }
    if ('departureSecs' in o) {
      o['departureTime'] = utils.formatTime(o.departureSecs);
      delete o['departureSecs'];
    }
    if ('arriveTimeSecs' in o) {
      o['arriveTime'] = utils.formatTime(o.arriveTimeSecs);
      delete o['arriveTimeSecs'];
    }
    if ('travelTimeSecs' in o) {
      o['travelTimeSecs'] = Math.round(o['travelTimeSecs']);
    }
    if ('distanceKm' in o) {
      o['distanceKm'] = Math.round(o['distanceKm'] * 100) / 100;
    }
    if ('walkingDistanceKm' in o) {
      o['walkingDistanceKm'] = Math.round(o['walkingDistanceKm'] * 100) / 100;
    }
  };

  const out = _.clone(route);
  if (out) {
    fix(out);
    if (out.steps) {
      out.steps = out.steps.filter(step => step.travelTimeSecs > 0);
      for (const step of out.steps) {
        fix(step);
      }
    }
  }
  return out;
}

// Print a formatted Route object to stdout.
function outputRoute(route: Route, origin: any, destination: any, router: OnlineRouter) {
  const outputGeojson = FLAGS.get('geojson');

  if (route && route.arriveTimeSecs < Infinity) {
    if (outputGeojson) {
      console.log(JSON.stringify(router.routeToGeojson(formatRoute(route)), null, '  '));
    } else {
      console.log(JSON.stringify(formatRoute(route), null, '  '));
    }
  } else if (outputGeojson) {
    // Not exactly clear what we should output in this case, but at least {} is valid GeoJSON.
    console.log('{}');
  } else {
    console.log(JSON.stringify({
      origin,
      destination,
      error: 'No route found.',
    }, null, '  '));
  }
}

function handleOneToOne(router: OnlineRouter, args: string[]) {
  if (args.length !== 5) {
    abort('Usage: one-to-one lat1 lng1 departureTime lat2 lng2');
  }

  const originLat = utils.parseNumber(args[0]);
  const originLng = utils.parseNumber(args[1]);
  const departureSecs = utils.parseTime(args[2]);
  const destinationLat = utils.parseNumber(args[3]);
  const destinationLng = utils.parseNumber(args[4]);

  const origin = { id: 'origin', latitude: originLat, longitude: originLng };
  const destination = { id: 'destination', latitude: destinationLat, longitude: destinationLng };

  const route = router.oneToOne(origin, departureSecs, destination);
  outputRoute(route, origin, destination, router);
}

function handleStopToStop(router: OnlineRouter, args: string[]) {
  if (args.length !== 3) {
    abort('Usage: stop-to-stop originStopId departureTime destinationStopId');
  }

  const originStopId = args[0];
  const departureSecs = utils.parseTime(args[1]);
  const destinationStopId = args[2];
  const route = router.stopToStop(originStopId, departureSecs, destinationStopId);
  outputRoute(route, originStopId, destinationStopId, router);
}

function handleOneToMany(router: OnlineRouter, args: string[]) {
  if (args.length !== 4) {
    abort('Usage: one-to-many originLat originLng departureTime path/to/destination/locations.csv');
  }

  const originLat = utils.parseNumber(args[0]);
  const originLng = utils.parseNumber(args[1]);
  const departureSecs = utils.parseTime(args[2]);
  const destinationFile = args[3];

  return loadLocationsCSV(destinationFile).then(destinations => {
    const origin = { id: 'origin', latitude: originLat, longitude: originLng };
    const startTimeMs = new Date().getTime();
    const times = router.oneToMany(origin, departureSecs, destinations);
    const endTimeMs = new Date().getTime();
    console.warn(`Completed one-to-many query in ${endTimeMs - startTimeMs} ms.`);
    console.log(JSON.stringify(times, null, '  '));
  });
}

function handleAllPairs(router: OnlineRouter, args: string[]) {
  if (args.length !== 2) {
    abort('Usage: all-pairs path/to/locations.csv departureTime');
  }

  const locationsFile = args[0];
  const departureSecs = utils.parseTime(args[1]);

  return loadLocationsCSV(locationsFile).then(locations => {
    const times = router.manyToMany(locations, departureSecs, locations);

    // This outputs CSV to match the behavior of the old all-pairs script.
    console.log('origin,destination,seconds');  // header
    _.forEach(times, (originTimes, originId) => {
      _.forEach(originTimes, (time, destId) => {
        if (originId === destId) return;
        if (time === Infinity) return;
        console.log([originId, destId, Math.round(time)].join(','));
      });
    });
  });
}

function handleOneToOneLocation(router: OnlineRouter, args: string[]) {
  if (args.length !== 4) {
    abort('Usage: one-to-one-location locations.txt originId departureTime destinationId');
  }

  const locationsFile = args[0];
  const originId = args[1];
  const departureSecs = utils.parseTime(args[2]);
  const destId = args[3];

  return loadLocationsCSV(locationsFile).then(locations => {
    const origin = _.find(locations, { id: originId });
    const destination = _.find(locations, { id: destId });
    if (!origin) abort(`Unable to find origin ID ${originId}`);
    if (!destination) abort(`Unable to find destination ID ${destId}`);

    const route = router.oneToOne(origin, departureSecs, destination);
    outputRoute(route, origin, destination, router);
  });
}

function main() {
  FLAGS.parse(process.argv);
  const optionsJson = FLAGS.args[0];
  const subcommand = FLAGS.args[1];

  if (SUBCOMMANDS.indexOf(subcommand) === -1) {
    abort(`Invalid subcommand: ${subcommand}, expected one of ${SUBCOMMANDS}`);
  }
  const subArgs = FLAGS.args.slice(2);

  const options = JSON.parse(fs.readFileSync(optionsJson, 'utf8')) as Options;
  const startMs = new Date().getTime();
  OnlineRouter.fromOptions(options).then(router => {
    const loadMs = new Date().getTime();
    console.warn(`Loaded and indexed GTFS files in ${(loadMs - startMs) / 1000} s`);

    switch (subcommand) {
      case 'one-to-one':
        return handleOneToOne(router, subArgs);
      case 'one-to-one-location':
        return handleOneToOneLocation(router, subArgs);
      case 'one-to-many':
        return handleOneToMany(router, subArgs);
      case 'stop-to-stop':
        return handleStopToStop(router, subArgs);
      case 'all-pairs':
        return handleAllPairs(router, subArgs);
      default:
        throw new Error(`Invalid subcommand: ${subcommand}`);
    }
  }).catch(e => {
    console.error(e.stack);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}
