#!/bin/bash
# Generate routes for the GTFS sample data.
# This acts as an end-to-end test for the pipeline.
set -o errexit

# Generate all-pairs times.
ts-node src/cli.ts test/config-sample.json all-pairs test/locations-sample.txt 6:00:00 > test/sample.pairs.csv

# Run src/cli.ts to generate detailed routes for some sample origin-destination locations.
(
    echo '{"test":['
    ts-node src/cli.ts test/config-sample.json one-to-one 36.915682 -116.751677 6:00:00 36.914893 -116.76821
    echo ','
    ts-node src/cli.ts test/config-sample.json one-to-one 36.913200 -116.770428 6:00:00 36.909541 -116.758238
    echo ','
    # No service (stop/time) around the origin given the departure time.
    ts-node src/cli.ts test/config-sample.json one-to-one 36.641029 -116.400345 6:00:00 36.914335 -116.753450
    echo ','
    # This destination is close to STAGECOACH but there's no good times. So the last step is a long walk.
    ts-node src/cli.ts test/config-sample.json one-to-one 36.909438 -116.770491 6:00:00 36.914335 -116.753450
    echo ','
    # Leaving a bit later (6:30 AM instead of 6 AM) the times work out for a direct trip to STAGECOACH.
    ts-node src/cli.ts test/config-sample.json one-to-one 36.909438 -116.770491 6:30:00 36.914335 -116.753450
    echo ','
    ## test "No stop in the vicinity of the origin stop"
    ts-node src/cli.ts test/config-sample.json one-to-one 36.985712 -116.817025 6:00:00 36.914893 -116.76821
    echo ','
    ## test "No stop in the vicinity of the destination stop"
    ts-node src/cli.ts test/config-sample.json one-to-one 36.914893 -116.76821 6:00:00 36.985712 -116.817025
    echo ']}'
) > test/find-route-test-output.json

# Print any differences (for easier debugging on CircleCI)
git status
git --no-pager  diff test

# Set the exit code to non-zero if there's a diff (e.g. for testing).
git diff-index --quiet HEAD test
