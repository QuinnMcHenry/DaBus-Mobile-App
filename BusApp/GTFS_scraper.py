import os
import json
import requests
import zipfile
from pathlib import Path
import shutil
from collections import defaultdict
from s3_utils import upload_folder_to_s3
import shutil

# Configuration
GTFS_URL = "https://www.thebus.org/transitdata/production/google_transit.zip"
DOWNLOAD_DIR = Path("gtfs_latest")
ZIP_PATH = DOWNLOAD_DIR / "google_transit.zip"
META_PATH = DOWNLOAD_DIR / "meta.json"
JSON_DIR = DOWNLOAD_DIR / "json"

# Ensure directories exist
DOWNLOAD_DIR.mkdir(exist_ok=True)
JSON_DIR.mkdir(exist_ok=True)

def download_gtfs_if_updated():
    last_modified_local = None
    if META_PATH.exists():
        with META_PATH.open("r") as f:
            meta = json.load(f)
            last_modified_local = meta.get("last_modified")

    head = requests.head(GTFS_URL)
    last_modified_remote = head.headers.get("Last-Modified")

    if last_modified_remote == last_modified_local:
        print("GTFS feed is up-to-date. Skipping download.")
        return False

    print("Downloading updated GTFS feed...")
    r = requests.get(GTFS_URL)
    r.raise_for_status()
    ZIP_PATH.write_bytes(r.content)
    print("Download complete.")

    with META_PATH.open("w") as f:
        json.dump({"last_modified": last_modified_remote}, f, indent=2)

    return True

def clear_old_gtfs():
    for item in DOWNLOAD_DIR.iterdir():
        if item.is_dir() and item.name != "json":
            shutil.rmtree(item)
        elif item.is_file() and item not in [ZIP_PATH, META_PATH]:
            item.unlink()
    print("Old GTFS files cleared.")

def extract_zip():
    print("Extracting GTFS feed...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(DOWNLOAD_DIR)
    print("Extraction complete.")

def csv_to_json(csv_path, json_path):
    import csv
    with open(csv_path, newline='', encoding='utf-8-sig') as csvfile:
        reader = csv.DictReader(csvfile)
        rows = list(reader)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2)
    print(f"Converted {csv_path.name} -> {json_path.name}")

def convert_stops_to_old_format(csv_path, json_path):
    import csv
    with open(csv_path, newline='', encoding='utf-8-sig') as csvfile:
        reader = csv.DictReader(csvfile)
        rows = []
        for row in reader:
            stop_id = row["stop_id"]
            if not stop_id.isdigit():
                continue
            rows.append({
                "id": int(row["stop_id"]),
                "lat": float(row["stop_lat"]),
                "lon": float(row["stop_lon"])
            })
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2)
    print(f"Converted {csv_path.name} -> {json_path.name} (old format)")

def convert_shapes_to_old_format(csv_path, json_path):
    import csv
    shape_map = defaultdict(list)
    with open(csv_path, newline='', encoding='utf-8-sig') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            shape_id = row["shape_id"]
            lat = float(row["shape_pt_lat"])
            lon = float(row["shape_pt_lon"])
            seq = int(row["shape_pt_sequence"])
            shape_map[shape_id].append((seq, [lat, lon]))

    old_format = {}
    for sid, points in shape_map.items():
        points.sort(key=lambda x: x[0])
        old_format[sid] = [p[1] for p in points]

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(old_format, f, indent=2)
    print(f"Converted {csv_path.name} -> {json_path.name} (old format)")

def convert_gtfs_to_json():
    key_files = ["stops.txt", "shapes.txt", "trips.txt", "stop_times.txt", "routes.txt"]
    for filename in key_files:
        csv_path = DOWNLOAD_DIR / filename
        if not csv_path.exists():
            print(f"Warning: {filename} not found in GTFS feed.")
            continue

        json_path = JSON_DIR / f"{csv_path.stem}.json"

        if filename == "stops.txt":
            convert_stops_to_old_format(csv_path, json_path)
        elif filename == "shapes.txt":
            convert_shapes_to_old_format(csv_path, json_path)
        else:
            csv_to_json(csv_path, json_path)

def main():
    updated = download_gtfs_if_updated()
    if updated:
        clear_old_gtfs()
        extract_zip()
        convert_gtfs_to_json()
    else:
        print("No update necessary. JSON files remain unchanged.")

if __name__ == "__main__":
    main()
    print("Uploading all GTFS files to s3...")
    upload_folder_to_s3("gtfs_latest", "gtfs-bus-bucket", "gtfs_latest")
    print("s3 upload complete")
    shutil.rmtree("gtfs_latest")
    print("Local files removed.")