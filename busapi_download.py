import json
import requests
import sys

def get_bus_coords():
    API_KEY = "F02CFCAC-3067-45DB-835E-A102C773D6F2"
    stop_ID = 47

    url = f"http://api.thebus.org/arrivalsJSON/?key={API_KEY}&stop={stop_ID}"

    try:
        response = requests.get(url)
        data = response.json()

        # Filter out invalid coordinates
        data["arrivals"] = [
            arrival for arrival in data["arrivals"]
            if float(arrival["latitude"]) != 0 and float(arrival["longitude"]) != 0
        ]
      

        # Optionally write to a file (for debug or caching)
        with open("stop46.json", "w") as f:
            json.dump(data, f, indent=4)

        # Print JSON to stdout (so Node can read it)
        print(json.dumps(data))

    except requests.exceptions.RequestException as e:
        # Print error JSON to stdout (not return)
        print(json.dumps({'error': f'An error occurred: {str(e)}'}))
        sys.exit(1)  # Let Node detect the error

# Ensure script runs only when called directly
if __name__ == '__main__':
    get_bus_coords()
