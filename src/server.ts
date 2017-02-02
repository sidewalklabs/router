#!/usr/bin/env ts-node
// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0

/**
 * This brings up an HTTP server which exposes an interface to the router.
 *
 * Start via:
 *
 *   ./server.ts path/to/config.json
 *
 * Endpoints are /route and /one-to-many. See below for request parameters.
 */

import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as fs from 'fs';

import OnlineRouter, { Route } from './online-router';
import { QueryOptions } from './options';
import * as utils from './utils';

interface LatLng {
  lat: number;
  lng: number;
}

interface IdLatLng extends LatLng {
  id: string;
}

// Parameters for the /route request.
interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  departureTime: string;  // HH:MM:SS
  options?: QueryOptions;  // routing parameters
}

// Parameters for the /one-to-many request.
interface OneToManyRequest {
  origin: LatLng;
  destinations: IdLatLng[];
  departureTime: string;  // HH:MM:SS
  options?: QueryOptions;  // routing parameters
}

// Parameters for the /one-to-preset request.
interface OneToPresetRequest {
  origin: LatLng;
  destination: string;
  departureTime: string;  // HH:MM:SS
  options?: QueryOptions;  // routing parameters
}

interface RouteWithGeoJson extends Route {
  geojson?: any;
}

const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
console.log('Running routing server with options:\n', options);

const startMs = Date.now();
OnlineRouter.fromOptions(options).then(router => {
  const loadSecs = (Date.now() - startMs) / 1000;
  console.log(`Loaded GTFS data in ${loadSecs} s.`);

  const app = express();
  app.use(bodyParser.json({limit: '5mb'}));
  app.use(require('morgan')('dev'));

  app.get('/healthy', ((request, response) => {
    response.send('OK');
  }) as express.RequestHandler);

  app.post('/route', ((request, response) => {
    const params = (request as any).body as RouteRequest;
    const route = router.oneToOne({
      id: 'origin',
      latitude: params.origin.lat,
      longitude: params.origin.lng,
    },
    utils.parseTime(params.departureTime),
    {
      id: 'destination',
      latitude: params.destination.lat,
      longitude: params.destination.lng,
    },
    params.options || {}) as RouteWithGeoJson;
    if (route) {
      route.geojson = router.routeToGeojson(route);
    }
    response.json(route);
  }) as express.RequestHandler);

  app.post('/one-to-many', ((request, response) => {
    const params = (request as any).body as OneToManyRequest;
    response.json(
      router.oneToMany({
        id: 'origin',
        latitude: params.origin.lat,
        longitude: params.origin.lng,
      },
      utils.parseTime(params.departureTime),
      params.destinations.map(d => ({
        id: d.id,
        latitude: d.lat,
        longitude: d.lng,
      })),
      params.options || {}));
  }) as express.RequestHandler);

  app.post('/one-to-preset', ((request, response) => {
    const params = (request as any).body as OneToPresetRequest;
    response.json(
      router.oneToManyPreset({
        id: 'origin',
        latitude: params.origin.lat,
        longitude: params.origin.lng,
      },
      utils.parseTime(params.departureTime),
      params.destination,
      params.options || {}));
  }) as express.RequestHandler);

  app.listen(4567);
  console.log('Listening on port 4567');
}).catch(e => {
  console.error(e.stack || e);
});
