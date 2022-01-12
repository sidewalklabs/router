# NYC Transit Explorer

Quickstart:

    yarn
    unzip nyc-gtfs.zip
    ts-node client/server/server.ts --router-url http://localhost:4567
    node --max_old_space_size=$((1024 * 7)) -r ts-node/register src/server.ts config-server.json

Then visit <http://localhost:1337>.

See [blog post][] and video:

[![Screen recording of the NYC Transit Explorer](https://img.youtube.com/vi/RNtsqTXHn4E/0.jpg)](https://www.youtube.com/watch?v=RNtsqTXHn4E)

## Command line tools

### Generate a route

Use the one-to-one tool to see details of a particular route:

    ./cli.ts test/config-sample.json one-to-one 36.90220 -116.77762 6:00:00 36.90845 -116.7614937

```
Added 18 walking pairs
Loaded and indexed GTFS files in 0.013 s
{
  "steps": [
    {
      "description": "Walk to Doing Ave / D Ave N (Demo) DADAN",
      "departTime": " 6:00:00",
      "arriveTime": " 6:13:40"
    },
    {
      "description": "Take CITY from Doing Ave / D Ave N (Demo) DADAN to E Main St / S Irving St (Demo) EMSI (CITY1).",
      "departTime": " 6:21:00",
      "arriveTime": " 6:28:00"
    },
    {
      "description": "Walk to destination",
      "departTime": " 6:28:00",
      "arriveTime": " 6:31:40"
    }
  ],
  "departureTime": " 6:00:00",
  "arriveTime": " 6:31:40"
}
```

### Calculate commute times between all locations.

Use the `all-pairs` mode of the CLI:

    ./cli.ts config.json all-pairs locations.txt 8:00:00

You can pass something like `--max_old_space_size=$((1024 * 7))` to the ts-node commands
if they run out of memory. This will allow 7GB of memory usage instead of the default of 1GB.

The `locations.txt` input file looks like:

```
id,latitude,longitude
481410013024025,+31.8193843,-106.5794056
481410011153000,+31.8125010,-106.5271615
```

The output is a CSV file with `origin id, destination id, travel seconds` tuples:

```
481410013024025,481410013024025,1774
481410013024025,481410011153000,3905
```

[sample]: https://developers.google.com/transit/gtfs/examples/gtfs-feed
[blog post]: https://www.sidewalklabs.com/insights/new-map-demo-how-the-l-train-shutdown-will-impact-your-commute
