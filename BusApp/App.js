import React from 'react';
import { View, StyleSheet } from 'react-native';
import OahuMap from './components/OahuMap';



export default function App() {
  return (
    <View style={styles.container}>
      <OahuMap />
    </View>
  );
  };

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});