import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';

import POIDetails from '../components/POIDetails';
import {listAvailable} from '../recommendation/AlgorithmRegistry';
import {recommend} from '../recommendation/RecommendationEngine';
import {
  getLatestCachedBatch,
  retrieveCurrentLocation,
  retrieveUser,
} from '../realmSchemas/RealmServices';
import {haversineMeters, hasValidCoords} from '../utils/geo';
import {formatPoiType} from '../utils/poiType';

const DEFAULT_KEYWORD = 'museo';
const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_DISTANCE = 2000;

const NEEDS_KEYWORD = new Set(['keyword', 'custom']);

// -----------------------------------------------------------------------------
// Small helper: human-readable relative time for the "auto batch" banner.
// -----------------------------------------------------------------------------
function formatTimeAgo(date) {
  if (!date) return 'sin fecha';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'hace un instante';
  const s = Math.round(diffMs / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

const RecommendationsScreen = () => {
  const algorithms = useMemo(
    () => listAvailable().map(a => a.constructor.id),
    [],
  );
  const [algorithmId, setAlgorithmId] = useState(
    algorithms.includes('closeness') ? 'closeness' : algorithms[0],
  );
  const [keyword, setKeyword] = useState(DEFAULT_KEYWORD);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ranAlgorithm, setRanAlgorithm] = useState(null);

  // Two independent accordions: one for the auto-generated section (top) and
  // one for the manual results list (bottom). Keeps expansion state isolated
  // even if the same poiId appears in both sections.
  const [expandedManualId, setExpandedManualId] = useState(null);
  const [expandedAutoId, setExpandedAutoId] = useState(null);

  const [userPos, setUserPos] = useState(null);

  // Last batch persisted to RecommendationCache — the vehicle by which the
  // rule-engine bridge surfaces automatic recommendations to this screen.
  const [autoBatch, setAutoBatch] = useState(null);

  useEffect(() => {
    const pos = retrieveCurrentLocation();
    if (pos && hasValidCoords(pos.lat, pos.lon)) {
      setUserPos({lat: pos.lat, lon: pos.lon});
    }
  }, []);

  // Reload the auto batch every time the screen gains focus, so navigating
  // away and back to this screen picks up any recommendation the bridge may
  // have fired in the meantime.
  useFocusEffect(
    useCallback(() => {
      const user = retrieveUser();
      const userId = user?.name;
      if (!userId) {
        setAutoBatch(null);
        return;
      }
      try {
        setAutoBatch(getLatestCachedBatch(userId));
      } catch (err) {
        console.warn('[Recommendations] could not load auto batch:', err);
        setAutoBatch(null);
      }
    }, []),
  );

  const distanceFor = poi => {
    if (!poi || !userPos) return null;
    if (!hasValidCoords(poi.latitude, poi.longitude)) return null;
    return haversineMeters(
      userPos.lat,
      userPos.lon,
      poi.latitude,
      poi.longitude,
    );
  };

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const context = {
        maxItems: DEFAULT_MAX_ITEMS,
        maxDistance: DEFAULT_MAX_DISTANCE,
      };
      if (algorithmId === 'keyword') {
        context.keyword = keyword;
      } else if (algorithmId === 'custom') {
        // CustomAlgorithm reads matchKeywords (array).
        // Split on whitespace so "museo goya" → ["museo", "goya"].
        context.matchKeywords = keyword
          .split(/\s+/)
          .map(s => s.trim())
          .filter(Boolean);
      }
      const out = await recommend({algorithmId, context});
      setResults(out);
      setRanAlgorithm(algorithmId);
      setExpandedManualId(null);
      // The manual run also updates the cache, so refresh the auto banner
      // with the freshly persisted batch.
      const user = retrieveUser();
      if (user?.name) {
        setAutoBatch(getLatestCachedBatch(user.name));
      }
    } catch (err) {
      console.error('[Recommendations] failed:', err);
      setError(err.message ?? String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Row renderers — one factory shared between the auto section and the
  // manual list, but each with its own expansion state.
  // ---------------------------------------------------------------------------
  const makeRowRenderer = (expandedId, setExpandedId) =>
    ({item, index}) => {
      const isOpen = expandedId === item.poiId;
      return (
        <View>
          <Pressable
            onPress={() => setExpandedId(isOpen ? null : item.poiId)}
            style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.name} numberOfLines={1}>
                {item.poi?.name ?? `POI #${item.poiId}`}
              </Text>
              <Text style={styles.type} numberOfLines={1}>
                {formatPoiType(item.poi?.type)}
              </Text>
            </View>
            <Text style={styles.score}>{item.score.toFixed(3)}</Text>
            <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>
              {isOpen ? '▼' : '▶'}
            </Text>
          </Pressable>
          {isOpen && (
            <POIDetails
              poi={item.poi}
              distanceMeters={distanceFor(item.poi)}
            />
          )}
        </View>
      );
    };

  const renderManualRow = makeRowRenderer(
    expandedManualId,
    setExpandedManualId,
  );
  const renderAutoRow = makeRowRenderer(expandedAutoId, setExpandedAutoId);

  // ---------------------------------------------------------------------------
  // Auto section — banner + list of the last automatically-persisted batch.
  // Rendered as the FlatList's ListHeaderComponent so it scrolls together
  // with the manual results below.
  // ---------------------------------------------------------------------------
  const AutoSection = () => {
    if (!autoBatch || autoBatch.items.length === 0) {
      return (
        <View style={styles.autoEmptyBanner}>
          <Text style={styles.autoEmptyText}>
            Todavía no hay ninguna recomendación en caché. En cuanto una regla
            de activación se dispare (o generes una manualmente aquí abajo)
            aparecerá arriba de forma automática.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.autoContainer}>
        <View style={styles.autoBanner}>
          <Text style={styles.autoTitle}>Recomendación automática</Text>
          <Text style={styles.autoMeta}>
            Algoritmo «{autoBatch.algorithm}» ·{' '}
            {formatTimeAgo(autoBatch.timestamp)} · {autoBatch.items.length} POIs
          </Text>
        </View>
        {autoBatch.items.map((item, index) => (
          <View key={`auto-${item.poiId}`}>
            {renderAutoRow({item, index})}
            {index < autoBatch.items.length - 1 && (
              <View style={styles.separator} />
            )}
          </View>
        ))}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionDividerText}>Generación manual</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.controls}>
        <Text style={styles.label}>Algoritmo</Text>
        <View style={styles.chipRow}>
          {algorithms.map(id => {
            const selected = id === algorithmId;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setAlgorithmId(id)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}>
                  {id}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {NEEDS_KEYWORD.has(algorithmId) && (
          <>
            <Text style={styles.label}>
              {algorithmId === 'keyword'
                ? 'Palabras clave'
                : 'Contexto (tipo/temática)'}
            </Text>
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="p. ej. museo goya"
              placeholderTextColor="#999"
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </>
        )}

        <TouchableOpacity
          onPress={onGenerate}
          disabled={loading}
          style={[styles.button, loading && styles.buttonDisabled]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Generar recomendaciones</Text>
          )}
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>Error: {error}</Text>}

        {ranAlgorithm && !loading && !error && (
          <Text style={styles.summary}>
            {results.length} resultados con «{ranAlgorithm}»
          </Text>
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={item => `manual-${item.poiId}`}
        renderItem={renderManualRow}
        extraData={{expandedManualId, expandedAutoId, autoBatch}}
        ListHeaderComponent={AutoSection}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !loading && ranAlgorithm ? (
            <Text style={styles.empty}>
              Sin resultados. Prueba con otro algoritmo o cambia la keyword.
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

export default RecommendationsScreen;

const styles = StyleSheet.create({
  autoBanner: {
    borderLeftColor: '#1e90ff',
    borderLeftWidth: 3,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  autoContainer: {
    backgroundColor: '#f8fbff',
    borderBottomColor: '#dce6f5',
    borderBottomWidth: 1,
  },
  autoEmptyBanner: {
    backgroundColor: '#f8fbff',
    borderBottomColor: '#dce6f5',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  autoEmptyText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
  autoMeta: {
    color: '#4b6b93',
    fontSize: 12,
    marginTop: 2,
  },
  autoTitle: {
    color: '#1e90ff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#1e90ff',
    borderRadius: 8,
    marginTop: 12,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
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
  chip: {
    backgroundColor: '#f4f4f4',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chipSelected: {
    backgroundColor: '#1e90ff',
  },
  chipText: {
    color: '#333',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
  },
  controls: {
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    padding: 12,
  },
  empty: {
    color: '#666',
    padding: 24,
    textAlign: 'center',
  },
  errorText: {
    color: '#c00',
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    color: '#111',
    fontSize: 15,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    color: '#333',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  name: {
    color: '#111',
    fontSize: 15,
    fontWeight: '600',
  },
  rank: {
    color: '#999',
    fontSize: 13,
    marginRight: 12,
    width: 24,
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
  score: {
    color: '#1e90ff',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionDivider: {
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    borderTopColor: '#eee',
    borderTopWidth: 1,
    paddingVertical: 6,
  },
  sectionDividerText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  separator: {
    backgroundColor: '#eee',
    height: 1,
    marginLeft: 48,
  },
  summary: {
    color: '#555',
    fontSize: 13,
    marginTop: 8,
  },
  type: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
});
