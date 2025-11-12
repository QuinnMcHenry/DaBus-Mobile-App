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
PREFIX = "gtfs_latest/json"  
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
    """Builds trip JSON files grouped by first 3 digits of trip_id, including arrival/departure times"""
    print("Building grouped trip lookup with times...")

    # Preprocess stop_times by streaming and collecting stops per trip
    stops_by_trip = defaultdict(list)
    for st in read_s3_json_stream(BUCKET, f"{PREFIX}/stop_times.json"):
        stop_id = st["stop_id"]
        if not stop_id.isdigit():
            continue
        stops_by_trip[st["trip_id"]].append({
            "stop_id": int(stop_id),
            "arrival_time": st["arrival_time"],
            "departure_time": st["departure_time"]
        })

    # groups by prefix
    trips_by_prefix = defaultdict(dict)

    # stream trips and add to  prefix group
    for trip in read_s3_json_stream(BUCKET, f"{PREFIX}/trips.json"):
        tid = trip["trip_id"]
        prefix = tid[:3]
        trips_by_prefix[prefix][tid] = {
            "route_id": trip["route_id"],
            "headsign": trip.get("trip_headsign", ""),
            "shape_id": trip["shape_id"],
            "stops": stops_by_trip.get(tid, [])
        }

    # save each prefix group as a single JSON
    for prefix, trips_dict in trips_by_prefix.items():
        key = f"{PREFIX}/trip_lookup/{prefix}.json"
        upload_s3_json(trips_dict, key)


if __name__ == "__main__":
    build_trip_lookup_chunked()
