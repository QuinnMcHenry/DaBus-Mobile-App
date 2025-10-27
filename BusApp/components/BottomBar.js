import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';

const BottomBar = ({onLocationFound}) => {
  
    const handleFindStops = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log('Location permission was denied.')
        return;
      }
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest
      });
      const coords = [location.coords.latitude, location.coords.longitude];
      console.log("onLocationFound:", onLocationFound, typeof onLocationFound);
      onLocationFound(coords);
      console.log(coords);
    }
    return (
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={handleFindStops} style={styles.button}>
          <Text style={styles.buttonText}>Find Stops Near Me</Text>
        </TouchableOpacity>
      </View>
    )
  }

export default BottomBar;

const styles=StyleSheet.create({
    bottomBar: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
      },
      button: {
        backgroundColor: "#007AFF",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
      },
      buttonText: {
        color: '#fff',
        fontWeight: 'bold',
      }
});