import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {hasValidCoords} from '../utils/geo';
import {stripHtml} from '../utils/html';

function formatDistance(meters) {
  if (meters == null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatCoords(lat, lon) {
  if (!hasValidCoords(lat, lon)) return '—';
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/**
 * Read-only detail block for an expanded POI row.
 * `distanceMeters === undefined` hides the distance field entirely;
 * `null` renders as "—" (GPS expected but unavailable).
 */
const POIDetails = ({poi, distanceMeters}) => {
  if (!poi) return null;

  const cleanDescription =
    typeof poi.description === 'string' ? stripHtml(poi.description) : '';
  const showDescription = cleanDescription.length > 0;
  const showDistance = distanceMeters !== undefined;

  return (
    <View style={styles.container}>
      {showDescription && (
        <View style={styles.field}>
          <Text style={styles.label}>Descripción</Text>
          <Text style={styles.value}>{cleanDescription}</Text>
        </View>
      )}
      <View style={styles.field}>
        <Text style={styles.label}>Coordenadas</Text>
        <Text style={styles.value}>
          {formatCoords(poi.latitude, poi.longitude)}
        </Text>
      </View>
      {showDistance && (
        <View style={styles.field}>
          <Text style={styles.label}>Distancia</Text>
          <Text style={styles.value}>{formatDistance(distanceMeters)}</Text>
        </View>
      )}
    </View>
  );
};

export default POIDetails;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fafafa',
    borderLeftColor: '#1e90ff',
    borderLeftWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  field: {
    marginBottom: 6,
  },
  label: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  value: {
    color: '#111',
    fontSize: 13,
    marginTop: 2,
  },
});
