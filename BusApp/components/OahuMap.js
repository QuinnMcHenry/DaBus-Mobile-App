import React, { useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { UrlTile, PROVIDER_DEFAULT, Marker } from 'react-native-maps';
import BottomBar from './BottomBar';
import stops from '../assets/stops.json'


const OahuMap = () => {
    const mapRef = useRef(null);
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

          {stops.map(stop => (
            <Marker key={stop.id} coordinate={{latitude: stop.lat, longitude: stop.lon}} />
          ))}
        </MapView>
        <BottomBar />
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
  });