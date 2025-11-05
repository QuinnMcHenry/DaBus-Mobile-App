import json
from collections import defaultdict
import boto3
from io import BytesIO

BUCKET = "gtfs-bus-bucket"
PREFIX = "gtfs_latest/json"  # S3 folder path
s3 = boto3.client("s3")

def read_s3_json(key):
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    return json.load(obj['Body'])

def upload_s3_json(data, key):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(data, indent=2).encode('utf-8'))
    print(f"*     {key} uploaded to S3")

def build_trip_lookup():
    print("Building trip lookup...")
    trips = read_s3_json(f"{PREFIX}/trips.json")
    stop_times = read_s3_json(f"{PREFIX}/stop_times.json")

    stops_by_trip = defaultdict(list)
    for st in stop_times:
        stop_id = st["stop_id"]
        if not stop_id.isdigit():
            continue
        stops_by_trip[st["trip_id"]].append(int(stop_id))

    trip_lookup = {}
    for trip in trips:
        tid = trip["trip_id"]
        trip_lookup[tid] = {
            "route_id": trip["route_id"],
            "headsign": trip.get("trip_headsign", ""),
            "shape_id": trip["shape_id"],
            "stops": sorted(stops_by_trip[tid])
        }

    upload_s3_json(trip_lookup, f"{PREFIX}/trip_lookup.json")

def build_stop_lookup():
    print("Building stop lookup...")
    trip_lookup = read_s3_json(f"{PREFIX}/trip_lookup.json")

    stop_lookup = defaultdict(list)
    for trip_id, data in trip_lookup.items():
        for stop_id in data["stops"]:
            stop_lookup[str(stop_id)].append({
                "trip_id": trip_id,
                "route_id": data["route_id"],
                "headsign": data["headsign"],
                "shape_id": data["shape_id"]
            })

    upload_s3_json(stop_lookup, f"{PREFIX}/stop_lookup.json")

if __name__ == "__main__":
    build_trip_lookup()
    build_stop_lookup()

