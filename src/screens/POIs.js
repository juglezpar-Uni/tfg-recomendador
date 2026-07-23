import React, {useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import POIDetails from '../components/POIDetails';
import {
  getAllZaragozaPOIs,
  retrieveCurrentLocation,
} from '../realmSchemas/RealmServices';
import {haversineMeters, hasValidCoords} from '../utils/geo';
import {formatPoiType} from '../utils/poiType';

function formatDistance(meters) {
  if (meters == null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const POIsScreen = () => {
  const [pois, setPois] = useState([]);
  const [query, setQuery] = useState('');
  const [userPos, setUserPos] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setPois(getAllZaragozaPOIs());
    const pos = retrieveCurrentLocation();
    if (pos && hasValidCoords(pos.lat, pos.lon)) {
      setUserPos({lat: pos.lat, lon: pos.lon});
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withDistance = pois.map(p => {
      let distance = null;
      if (userPos && hasValidCoords(p.latitude, p.longitude)) {
        distance = haversineMeters(
          userPos.lat,
          userPos.lon,
          p.latitude,
          p.longitude,
        );
      }
      return {...p, distance};
    });

    const matches = q
      ? withDistance.filter(p => (p.name ?? '').toLowerCase().includes(q))
      : withDistance;

    if (userPos) {
      return matches.slice().sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });
    }
    return matches;
  }, [pois, query, userPos]);

  const renderItem = ({item}) => {
    const isOpen = expandedId === item.id;
    return (
      <View>
        <Pressable
          onPress={() => setExpandedId(isOpen ? null : item.id)}
          style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
          <View style={styles.rowMain}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.type}>{formatPoiType(item.type)}</Text>
          </View>
          <Text style={styles.distance}>{formatDistance(item.distance)}</Text>
          <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>
            {isOpen ? '▼' : '▶'}
          </Text>
        </Pressable>
        {isOpen && <POIDetails poi={item} distanceMeters={item.distance} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre..."
          placeholderTextColor="#999"
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={styles.count}>
          {filtered.length}
          {query ? ` / ${pois.length}` : ''} POIs
          {!userPos ? '  (sin GPS)' : ''}
        </Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        extraData={expandedId}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {pois.length === 0
              ? 'No hay POIs en Realm. ¿Se completó la sincronización inicial?'
              : 'Ningún POI coincide con la búsqueda.'}
          </Text>
        }
      />
    </SafeAreaView>
  );
};

export default POIsScreen;

const styles = StyleSheet.create({
  chevron: {
    color: '#999',
    fontSize: 12,
    marginLeft: 10,
    textAlign: 'center',
    width: 12,
  },
  chevronOpen: {
    color: '#1e90ff',
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
  },
  count: {
    color: '#555',
    fontSize: 13,
    marginTop: 6,
  },
  distance: {
    color: '#333',
    fontSize: 13,
    marginLeft: 8,
  },
  empty: {
    color: '#666',
    padding: 24,
    textAlign: 'center',
  },
  header: {
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  name: {
    color: '#111',
    fontSize: 15,
    fontWeight: '600',
  },

  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingLeft: 20,
    paddingRight: 16,
    paddingVertical: 10,
  },
  rowMain: {
    flex: 1,
  },
  rowPressed: {
    backgroundColor: '#f4f4f4',
  },
  search: {
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    color: '#111',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  separator: {
    backgroundColor: '#eee',
    height: 1,
    marginLeft: 20,
  },
  type: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
});
