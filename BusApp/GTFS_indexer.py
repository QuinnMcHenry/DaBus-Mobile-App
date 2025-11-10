"""
build_stop_lookup() may be either;
1. Checking duplicate bus stops.
2. More likely - stop_lookups are specific to trips, and becasue of our filename-ing we are overwriting json files 
3. aactually, it may be all good. ask chat about this once broguht up to speed.

Fix this. Bring chat up to speed yet again and sort that out, and then update .js:
1. Read from AWS 
2. debug

build_trip_lookup() is all good.
"""



import boto3
import json
from collections import defaultdict
from pathlib import Path
import ijson

# S3 configuration
BUCKET = "gtfs-bus-bucket"
PREFIX = "gtfs_latest/json"  # folder containing the JSON files
s3 = boto3.client("s3")


def read_s3_json_stream(bucket, key):
    """
    Stream parse a large top-level JSON array from S3 using ijson.
    Yields each item (dict) individually.
    """
    obj = s3.get_object(Bucket=bucket, Key=key)
    for item in ijson.items(obj['Body'], 'item'):
        yield item


def upload_s3_json(data, key):
    """Upload a Python dict/list to S3 as JSON"""
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=json.dumps(data, indent=2).encode('utf-8')
    )
    print(f"*     {key} uploaded to S3")


def build_trip_lookup_chunked():
    """Builds trip JSON files grouped by first 3 digits of trip_id"""
    print("Building grouped trip lookup...")

    # Preprocess stop_times by streaming and collecting stops per trip
    stops_by_trip = defaultdict(list)
    for st in read_s3_json_stream(BUCKET, f"{PREFIX}/stop_times.json"):
        stop_id = st["stop_id"]
        if not stop_id.isdigit():
            continue
        stops_by_trip[st["trip_id"]].append(int(stop_id))

    # Dictionary to hold groups by prefix
    trips_by_prefix = defaultdict(dict)

    # Stream trips and add to appropriate prefix group
    for trip in read_s3_json_stream(BUCKET, f"{PREFIX}/trips.json"):
        tid = trip["trip_id"]
        prefix = tid[:3]
        trips_by_prefix[prefix][tid] = {
            "route_id": trip["route_id"],
            "headsign": trip.get("trip_headsign", ""),
            "shape_id": trip["shape_id"],
            "stops": sorted(stops_by_trip[tid])
        }

    # Upload each prefix group as a single JSON
    for prefix, trips_dict in trips_by_prefix.items():
        key = f"{PREFIX}/trip_lookup/{prefix}.json"
        upload_s3_json(trips_dict, key)




def build_stop_lookup_chunked():
    print("Building stop lookup (one file per stop)...")

    # Get all trip lookup JSON keys from S3
    trip_prefix_keys = s3.list_objects_v2(
        Bucket=BUCKET, Prefix=f"{PREFIX}/trip_lookup/"
    ).get("Contents", [])

    # { stop_id -> [trip_dicts] }
    stops_dict = defaultdict(list)

    # Loop over all trip lookup files
    for obj in trip_prefix_keys:
        print(f"Reading {obj['Key']}")
        trip_prefix_obj = s3.get_object(Bucket=BUCKET, Key=obj['Key'])
        trips_dict = json.load(trip_prefix_obj['Body'])

        for trip_id, trip_data in trips_dict.items():
            for stop_id in trip_data["stops"]:
                stop_id_str = str(stop_id)
                stops_dict[stop_id_str].append({
                    "trip_id": trip_id,
                    "route_id": trip_data["route_id"],
                    "headsign": trip_data["headsign"],
                    "shape_id": trip_data["shape_id"]
                })

    # Upload one JSON per stop
    for i, (stop_id, trip_list) in enumerate(stops_dict.items()):
        key = f"{PREFIX}/stop_lookup/{stop_id}.json"
        upload_s3_json({stop_id: trip_list}, key)

        # Optional progress logging
        if i % 500 == 0:
            print(f"Uploaded {i} stops so far...")

    print(f"Finished uploading {len(stops_dict)} stop files.")



if __name__ == "__main__":
    build_trip_lookup_chunked()
    build_stop_lookup_chunked()
