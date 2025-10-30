import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Modal, TextInput, Button, Text } from 'react-native';
import MapView, { UrlTile, PROVIDER_DEFAULT, Marker } from 'react-native-maps';
import BottomBar from './BottomBar';
import stops from '../assets/stops.json'

console.log("Marker type: ", typeof Marker);


function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = x => (x * Math.PI) / 180;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dphi = toRad(lat2 - lat1);
    const dlambda = toRad(lon2 - lon1);

    const a = 
        Math.sin(dphi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c
}


const OahuMap = () => {
    const [userLocation, setUserLocation] = useState(null);
    const [topStops, setTopStops] = useState([]);
    const [destination, setDestination] = useState('');
    const [destCoords, setDestCoords] = useState(null);
    const [showDestPopup, setShowDestPopup] = useState(false);
    const mapRef = useRef(null);

    useEffect(() => {
        if (!userLocation) return;
        const [lat, lon] = userLocation;

        
        mapRef.current.animateToRegion({
            latitudeDelta: 0.009,
            longitudeDelta: 0.009,
            latitude: lat,
            longitude: lon,
        }, 500);

    const closest = stops
        .map(stop => ({
            ...stop,
            distance: haversine(userLocation[0], userLocation[1], stop.lat, stop.lon)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

    setTopStops(closest);
    setShowDestPopup(true);
    }, [userLocation]);


    const handleDestinationSubmit = async () => {
        if (!destination) return;

        const encoded = encodeURIComponent(destination);
        const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'OahuBusApp/1.0'
            }
        });
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            setDestCoords([parseFloat(lat), parseFloat(lon)]);
            setShowDestPopup(false);
        } else {
            alert("Could not find that location.");
        }
    } catch (error) {
        console.error("error fetching destination coordinates.");
        alert("There was an error finding your destination.");
    }
    };

    const oahuBoundary = {
      northEast: {latitude: 22.09183846946574, longitude:  -157.63530947229376},
      southWest: {latitude: 20.79775211599588, longitude: -158.2575068774979}
    };
  
  
  const handleRegionChangeComplete = (region) => {

    const centerLat = (oahuBoundary.northEast.latitude + oahuBoundary.southWest.latitude) / 2;
    const centerLng = (oahuBoundary.northEast.longitude + oahuBoundary.southWest.longitude) / 2;
  
    const isOutOfBounds =
      region.latitude < oahuBoundary.southWest.latitude ||
      region.latitude > oahuBoundary.northEast.latitude ||
      region.longitude < oahuBoundary.southWest.longitude ||
      region.longitude > oahuBoundary.northEast.longitude;
  
    const isZoomedOut =
      region.latitudeDelta > 0.7 || region.longitudeDelta > 0.7;
  
    if (isOutOfBounds || isZoomedOut) {
      mapRef.current?.animateToRegion({
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: 0.7,
        longitudeDelta: 0.7,
      }, 300);
    }
  };
  
    const [selectedCoord, setSelectedCoord] = useState(null)
  
    // Southwest: 20.79775211599588 -158.2575068774979
    // Northeast: 22.09183846946574 -157.63530947229376
    return (
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          initialRegion={{
            latitude: 21.47520763323175,
            longitude: -157.95776328775427,
            latitudeDelta: 0.7,
            longitudeDelta: 0.7,
          }}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          <UrlTile
            urlTemplate="https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
            tileSize={256}
            shouldReplaceMapContent={true}
          />

          {userLocation && topStops.map(stop => (
            <Marker
                key={stop.id}
                coordinate={{ latitude: stop.lat, longitude: stop.lon }}
                title={`Stop ${stop.id}`}
                />
          ))}

        </MapView>
        <BottomBar onLocationFound={setUserLocation} />

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
  }

export default OahuMap;

const styles = StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    map: {
      ...StyleSheet.absoluteFillObject,
    },
    popupContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    popupText: { fontSize: 18, color: '#fff', marginBottom: 10 },
    input: { backgroundColor: '#fff', width: 250, padding: 8, borderRadius: 5, marginBottom: 10 },
  });