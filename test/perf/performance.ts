// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Router performance test
 */

import * as location from '../../src/location';
import OnlineRouter from '../../src/online-router';
import Options from '../../src/options';

function measure<T>(msg: string, p: Promise<T>): Promise<T> {
  const startMs = new Date().getTime();
  return p.then(v => {
    const endMs = new Date().getTime();
    console.log(`${endMs - startMs} ms ${msg}`);
    return v;
  }, e => {
    const endMs = new Date().getTime();
    console.log(`${endMs - startMs} ms ${msg}`);
    return Promise.reject(e);
  });
}

const options = {
  max_walking_distance_km: 1.5,
  walking_speed_kph: 5.1,
  max_waiting_time_secs: 3600,
  transfer_penalty_secs: 0,
  departure_date: '20161201',
  gtfs_data_dirs: ['test/nyc-gtfs'],
  water_geojson_file: 'water-nyc.geojson',
  preset_destinations: [{
    name: 'nyc-block-groups',
    locations_file: 'test/perf/nyc-bgs.locations.txt',
    max_allowable_destination_walk_km: 1.5,
  }],
} as Options;

async function main() {
  const origins = await location.loadLocationsCSV('test/perf/nyc-locations.txt');
  const destinations = await location.loadLocationsCSV('test/perf/nyc-bgs.locations.txt');
  const feed = await measure('load feed', OnlineRouter.fromOptions(options));

  let totalMs = 0;
  origins.forEach((origin, i) => {
    const startMs = new Date().getTime();
    feed.oneToMany(origin, 8 * 3600, destinations);
    const endMs = new Date().getTime();
    console.log(i, endMs - startMs, 'ms');
    totalMs += (endMs - startMs);
  });

  console.log(`one-to-many: ${totalMs / origins.length} ms average`);

  totalMs = 0;
  origins.forEach((origin, i) => {
    const startMs = new Date().getTime();
    feed.oneToManyPreset(origin, 8 * 3600, 'nyc-block-groups');
    const endMs = new Date().getTime();
    console.log(i, endMs - startMs, 'ms');
    totalMs += (endMs - startMs);
  });

  console.log(`one-to-many preset: ${totalMs / origins.length} ms average`);

  totalMs = 0;
  origins.forEach((origin, i) => {
    const startMs = new Date().getTime();
    feed.oneToOne(origin, 8 * 3600, destinations[i]);
    const endMs = new Date().getTime();
    console.log(i, endMs - startMs, 'ms');
    totalMs += (endMs - startMs);
  });

  console.log(`one-to-one: ${totalMs / origins.length} ms average`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
