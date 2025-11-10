import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Modal, TextInput, Button, Text } from 'react-native';
import MapView, { UrlTile, PROVIDER_DEFAULT, Marker, Polyline } from 'react-native-maps';
import BottomBar from './BottomBar';
import stops from '../assets/stops.json';
import shapes from '../assets/shapes.json';
import { API_KEY } from '@env';

// ---------------------- TRIP CACHE ----------------------
const tripFileCache = {};
async function getTrip(tripId) {
  const chunk = tripId.slice(0, 3);
  if (!tripFileCache[chunk]) {
    console.log(`Fetching trip lookup file: ${chunk}.json`);
    const res = await fetch(
      `https://gtfs-bus-bucket.s3.amazonaws.com/gtfs_latest/json/trip_lookup/${chunk}.json`
    );
    tripFileCache[chunk] = await res.json();
  }
  return tripFileCache[chunk][tripId];
}

// ---------------------- UTILITY FUNCTIONS ----------------------
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ---------------------- STOP LOOKUP CACHE ----------------------
const stopFileCache = {};
async function getStopTrips(stopId) {
  const fileName = `${stopId}.json`;
  if (!stopFileCache[fileName]) {
    const url = `https://gtfs-bus-bucket.s3.amazonaws.com/gtfs_latest/json/stop_lookup/${fileName}`;
    console.log(`Fetching stop lookup: ${url}`);
    try {
      const res = await fetch(url);
      stopFileCache[fileName] = await res.json();
    } catch (err) {
      console.error(`Failed to fetch stop lookup for ${stopId}`, err);
      stopFileCache[fileName] = {};
    }
  }
  return stopFileCache[fileName][stopId] || stopFileCache[fileName] || [];
}

// ---------------------- MULTI-LEG FINDER ----------------------
async function findFullTrip(startStops, destinationCoords, maxTransfers = 2) {
  if (!startStops?.length || !destinationCoords) {
    console.log("Skipping findFullTrip – missing inputs");
    return null;
  }

  console.log(`Starting findFullTrip for stops: ${startStops.map(s => s.id).join(', ')}`);
  const queue = [];
  const visitedStops = new Set();
  const visitedTrips = new Set();

  for (const stop of startStops) queue.push({ stopId: stop.id, path: [] });

  while (queue.length > 0) {
    const { stopId, path } = queue.shift();
    if (visitedStops.has(stopId)) continue;
    visitedStops.add(stopId);

    const stopTrips = await getStopTrips(stopId);
    for (const tripInfo of stopTrips) {
      const tripId = tripInfo.trip_id;
      if (!tripId || visitedTrips.has(tripId)) continue;
      visitedTrips.add(tripId);

      const trip = await getTrip(tripId);
      if (!trip?.stops?.length) continue;

      const stopSequence = trip.stops;
      const startIndex = stopSequence.indexOf(stopId);
      if (startIndex === -1) continue;

      for (let i = startIndex + 1; i < stopSequence.length; i++) {
        const nextStopId = stopSequence[i];
        const nextStop = stops.find(s => s.id === nextStopId);
        if (!nextStop) continue;

        const distToDest = haversine(
          nextStop.lat,
          nextStop.lon,
          destinationCoords[0],
          destinationCoords[1]
        );

        // ✅ Destination within 500m
        if (distToDest < 500) {
          console.log(`Destination reachable via ${tripId} → stop ${nextStopId}`);
          return {
            legs: [...path, { tripId, fromStop: stopId, toStop: nextStopId }],
            finalStop: nextStop,
          };
        }

        // 🚏 Enqueue transfers if within limit
        if (path.length < maxTransfers) {
          queue.push({
            stopId: nextStopId,
            path: [...path, { tripId, fromStop: stopId, toStop: nextStopId }],
          });
        }
      }
    }
  }

  console.log("No route found within transfer limit.");
  return null;
}

// ---------------------- MAIN COMPONENT ----------------------
const OahuMap = () => {
  const [userLocation, setUserLocation] = useState(null);
  const [topStops, setTopStops] = useState([]);
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState(null);
  const [showDestPopup, setShowDestPopup] = useState(false);

  const [tripLegs, setTripLegs] = useState([]);
  const [transferStops, setTransferStops] = useState([]);
  const [finalStop, setFinalStop] = useState(null);
  const [polylines, setPolylines] = useState([]);

  const mapRef = useRef(null);

  // ---------------------- USER LOCATION EFFECT ----------------------
  useEffect(() => {
    if (!userLocation) return;
    const [lat, lon] = userLocation;
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lon, latitudeDelta: 0.009, longitudeDelta: 0.009 },
      500
    );

    const closestStops = stops
      .map(stop => ({ ...stop, distance: haversine(lat, lon, stop.lat, stop.lon) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    console.log("Top 5 closest stops:", closestStops.map(s => s.id));
    setTopStops(closestStops);
    setShowDestPopup(true);
  }, [userLocation]);

  // ---------------------- DESTINATION EFFECT ----------------------
  useEffect(() => {
    if (!destCoords || topStops.length === 0) return;

    (async () => {
      console.log("Running full trip search...");
      const result = await findFullTrip(topStops, destCoords, 2);

      if (!result) {
        console.log("No route found.");
        setPolylines([]);
        return;
      }

      console.log("Trip found:", result);
      setTripLegs(result.legs);
      setFinalStop(result.finalStop);

      const colors = ["#1E90FF", "#32CD32", "#FF8C00", "#8A2BE2"];
      const polylineSegments = [];
      const transfers = [];

      for (let i = 0; i < result.legs.length; i++) {
        const leg = result.legs[i];
        const trip = await getTrip(leg.tripId);
        if (trip?.shape_id && shapes[trip.shape_id]) {
          const coords = shapes[trip.shape_id].map(([lat, lon]) => ({
            latitude: lat,
            longitude: lon,
          }));
          polylineSegments.push({
            coords,
            color: colors[i % colors.length],
          });
        }

        // collect transfer stop
        if (i < result.legs.length - 1) {
          const transferStop = stops.find(s => s.id === leg.toStop);
          if (transferStop) transfers.push(transferStop);
        }
      }

      setPolylines(polylineSegments);
      setTransferStops(transfers);
    })();
  }, [destCoords, topStops]);

  // ---------------------- DESTINATION SUBMIT ----------------------
  const handleDestinationSubmit = async () => {
    if (!destination) return;
    console.log("Submitting destination:", destination);

    try {
      const encoded = encodeURIComponent(destination);
      const data = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
        { headers: { 'User-Agent': 'OahuBusApp/1.0' } }
      ).then(r => r.json());

      console.log("Nominatim response:", data);

      if (data?.length) {
        const { lat, lon } = data[0];
        setDestCoords([parseFloat(lat), parseFloat(lon)]);
        setShowDestPopup(false);
      } else {
        alert('Could not find that location.');
      }
    } catch (err) {
      console.error(err);
      alert('Error finding destination.');
    }
  };

  // ---------------------- MAP BOUNDARY ----------------------
  const oahuBoundary = {
    northEast: { latitude: 22.09183846946574, longitude: -157.63530947229376 },
    southWest: { latitude: 20.79775211599588, longitude: -158.2575068774979 },
  };

  const handleRegionChangeComplete = region => {
    const maxZoomLat = 0.002;
    const maxZoomLon = 0.001;
    const centerLat = (oahuBoundary.northEast.latitude + oahuBoundary.southWest.latitude) / 2;
    const centerLng = (oahuBoundary.northEast.longitude + oahuBoundary.southWest.longitude) / 2;
    const outOfBounds =
      region.latitude < oahuBoundary.southWest.latitude ||
      region.latitude > oahuBoundary.northEast.latitude ||
      region.longitude < oahuBoundary.southWest.longitude ||
      region.longitude > oahuBoundary.northEast.longitude;
    const zoomedOut = region.latitudeDelta > 0.7 || region.longitudeDelta > 0.7;
    const zoomedTooFar = region.latitudeDelta < maxZoomLat || region.longitudeDelta < maxZoomLon;

    if (zoomedTooFar) {
      mapRef.current?.animateToRegion(
        {
          latitude: region.latitude,
          longitude: region.longitude,
          latitudeDelta: Math.max(region.latitudeDelta, maxZoomLat),
          longitudeDelta: Math.max(region.longitudeDelta, maxZoomLon),
        },
        150
      );
    }
    if (outOfBounds || zoomedOut) {
      mapRef.current?.animateToRegion(
        { latitude: centerLat, longitude: centerLng, latitudeDelta: 0.7, longitudeDelta: 0.7 },
        300
      );
    }
  };

  // ---------------------- RENDER ----------------------
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: 21.4752,
          longitude: -157.9577,
          latitudeDelta: 0.7,
          longitudeDelta: 0.7,
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        <UrlTile
          urlTemplate="http://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maximumZ={19}
          flipY={false}
          tileSize={256}
          shouldReplaceMapContent={true}
        />

        {/* Starting area stops */}
        {userLocation &&
          topStops.map(stop => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: stop.lat, longitude: stop.lon }}
              title={`Stop ${stop.id}`}
            />
          ))}

        {/* Draw each bus leg with its color */}
        {polylines.map((segment, idx) => (
          <Polyline
            key={`leg-${idx}`}
            coordinates={segment.coords}
            strokeColor={segment.color}
            strokeWidth={5}
          />
        ))}

        {/* Transfer markers */}
        {transferStops.map(stop => (
          <Marker
            key={`transfer-${stop.id}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            pinColor="orange"
            title={`Transfer Stop ${stop.id}`}
          />
        ))}

        {/* Final stop marker */}
        {finalStop && (
          <Marker
            coordinate={{ latitude: finalStop.lat, longitude: finalStop.lon }}
            pinColor="red"
            title="Final Stop (Get off here)"
          />
        )}
      </MapView>

      <BottomBar onLocationFound={setUserLocation} />

      {/* Destination popup */}
      <Modal visible={showDestPopup} transparent animationType="fade">
        <View style={styles.popupContainer}>
          <Text style={styles.popupText}>What is your destination?</Text>
          <TextInput
            style={styles.input}
            value={destination}
            onChangeText={setDestination}
            placeholder="Enter an address or place"
          />
          <Button title="Go" onPress={handleDestinationSubmit} />
        </View>
      </Modal>
    </View>
  );
};

export default OahuMap;

// ---------------------- STYLES ----------------------
const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', alignItems: 'center' },
  map: { ...StyleSheet.absoluteFillObject },
  popupContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupText: { fontSize: 18, color: '#fff', marginBottom: 10 },
  input: { backgroundColor: '#fff', width: 250, padding: 8, borderRadius: 5, marginBottom: 10 },
});
