/**
 * Orchestrates the recommendation pipeline:
 * resolves user and POIs from Realm, runs the selected algorithm,
 * caches results, and returns hydrated POIs to the UI.
 *
 * This is the only recommendation module that touches Realm.
 * Algorithms are pure functions that receive data and return scores.
 */

import {getAlgorithm} from './AlgorithmRegistry';
import {
  retrieveUser,
  retrieveCurrentLocation,
  getAllZaragozaPOIs,
  clearRecommendationCache,
  getValorations,
} from '../realmSchemas/RealmServices';
import {realm} from '../realmSchemas/RealmInstance';

/**
 * Get recommendations for a user using the specified algorithm.
 *
 * @param {string} algorithmId - 'random' | 'closeness' | 'keyword' | ...
 * @param {string} [userId] - defaults to current logged-in user
 * @param {Object} [context] - { maxItems, maxDistance, keyword, ... }
 * @param {boolean} [persist=true] - save results to RecommendationCache
 * @returns {Promise<Array<{poiId, score, poi}>>} sorted DESC by score
 */
export async function recommend({
  algorithmId,
  userId,
  context = {},
  persist = true,
}) {
  // 1. Find the algorithm
  const algorithm = getAlgorithm(algorithmId);
  if (!algorithm) {
    throw new Error(
      `[RecommendationEngine] unknown algorithm: "${algorithmId}"`,
    );
  }

  // 2. Resolve user + last known GPS position
  const resolvedUserId = userId ?? retrieveUser()?.name;
  if (!resolvedUserId) {
    console.warn('[RecommendationEngine] no user found');
    return [];
  }

  const lastPos = retrieveCurrentLocation();
  const user = {
    id: resolvedUserId,
    lat: lastPos?.lat,
    lon: lastPos?.lon,
  };

  // 3. Load all POIs from Realm as plain objects
  const pois = getAllZaragozaPOIs();
  if (pois.length === 0) {
    console.warn('[RecommendationEngine] no POIs in Realm');
    return [];
  }

  // 4. Load extra data if the algorithm needs it (e.g. valorations for CustomAlgorithm)
  let enrichedContext = context;
  if (algorithm.constructor.requiresValorations === true) {
    enrichedContext = {
      ...context,
      valorations: getValorations(resolvedUserId),
    };
  }

  // 5. Run algorithm (pure function, no Realm access)
  const scored = algorithm.score(user, pois, enrichedContext) ?? [];

  // 6. Cache results (replace previous batch for this user+algorithm)
  if (persist && scored.length > 0) {
    persistBatch(resolvedUserId, algorithmId, scored);
  }

  // 7. Attach full POI data for the UI
  const poisById = new Map(pois.map(p => [p.id, p]));
  return scored.map(s => ({...s, poi: poisById.get(s.poiId) ?? null}));
}

/** Replace cached recommendations for a user+algorithm pair. */
function persistBatch(userId, algorithmId, scored) {
  clearRecommendationCache(userId, algorithmId);
  const now = new Date();
  realm.write(() => {
    for (const {poiId, score} of scored) {
      realm.create(
        'RecommendationCache',
        {
          id: `${userId}_${algorithmId}_${poiId}`,
          userId,
          poiId,
          score,
          algorithm: algorithmId,
          timestamp: now,
        },
        'modified',
      );
    }
  });
}
