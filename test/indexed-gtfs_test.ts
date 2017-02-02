// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
import * as chai from 'chai';
import * as fs from 'fs';
import * as _ from 'lodash';

import GTFS from '../src/gtfs';
import IndexedGTFS from '../src/indexed-gtfs';
import { loadLocationsCSV } from '../src/location';
import Options, { defaultLoadingOptions } from '../src/options';

const { expect } = chai;

describe('Indexed GTFS', () => {
  it('should index feeds', () => GTFS.feed('data/sample').then(rawFeed => {
    const feed = new IndexedGTFS(rawFeed, defaultLoadingOptions as any);
    expect(feed.stopIdToStop['STAGECOACH'].stopName).to.equal('Stagecoach Hotel & Casino (Demo)');
    expect(feed.stopIdToStopTimes['STAGECOACH']).to.have.length(3);
    expect(feed.tripIdToStopTime['CITY1']).to.have.length(5);
  }));

  describe('GTFS merge', () => {
    function addPath(filename: string): string {
      return 'test/gtfs_merge_sample/' + filename;
    }

    let merged: GTFS;
    before(() => Promise.all([
      GTFS.feed('test/gtfs_merge_sample/gtfs_a'),
      GTFS.feed('test/gtfs_merge_sample/gtfs_b'),
    ]).then(feeds => {
      merged = GTFS.merge(feeds);
    }));

    it('should merge stops', () => {
      const expectedStops =
          JSON.parse(fs.readFileSync(addPath('merged/stops.json'), 'utf8'));
      expect(merged.stops).to.deep.equal(expectedStops);
    });

    it('should merge stopTimes', () => {
      const expectedStopTimes =
          JSON.parse(fs.readFileSync(addPath('merged/stop_times.json'), 'utf8'));
      const feed = new IndexedGTFS(merged, defaultLoadingOptions as any);
      expect(feed.stopTimes).to.deep.equal(expectedStopTimes);
    });
  });

  it('should augment feeds', () => GTFS.feed('data/sample').then(rawFeed => {
    const options = JSON.parse(fs.readFileSync('test/config-sample.json', 'utf8')) as Options;
    const feed = new IndexedGTFS(rawFeed, options);
    const oldSerial = JSON.stringify(feed);

    return loadLocationsCSV('test/locations-sample.txt').then(locations => {
      const origin = locations[4];
      const destinations = locations.slice(0, 4);
      origin.id = 'origin';

      const newFeed = feed.augmentWithLocations(origin, destinations, options);

      // Check that the old feed is unmodified.
      expect(JSON.stringify(feed)).to.equal(oldSerial);

      // Check that the new stops are present.
      expect(newFeed.stopIdToStop).to.contain.keys(['origin', '1', '2', '3', '4']);
      expect(newFeed.stops.length).to.equal(feed.stops.length + 5);

      // There should be walks from the origin to stops and destinations.
      expect(_.size(newFeed.walkingTransfers)).to.equal(_.size(feed.walkingTransfers) + 1);
      expect(_.map(newFeed.walkingTransfers['origin'], 'stopId')).to.deep.equal(['AMV', '4']);
      // and from stops to destinations.
      expect(_.map(newFeed.walkingTransfers['FUR_CREEK_RES'], 'stopId')).to.deep.equal(['1', '2']);
    });
  }));
});
