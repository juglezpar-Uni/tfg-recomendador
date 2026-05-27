/**
 * Hybrid algorithm that combines proximity, user ratings and context match.
 * score = w1 * closenessScore + w2 * ratingScore + w3 * contextScore
 *
 * - closenessScore: how close the POI is (1.0 = at user's feet, 0.0 = out of range)
 * - ratingScore: average of user's ratings for POIs of the same type (0.5 if no ratings)
 * - contextScore: 1.0 if the POI type matches what the triggering rule asked for, 0.0 otherwise
 *
 * Default weights: closeness=0.4, rating=0.3, contextMatch=0.3 (configurable via context.weights)
 * POIs with score=0 are excluded from results.
 */

import BaseAlgorithm from './BaseAlgorithm';
import {haversineMeters, hasValidCoords} from '../../utils/geo';
import {normalizeText} from '../../utils/text';

const DEFAULT_MAX_ITEMS = 10;
const DEFAULT_MAX_DISTANCE_M = 2000;
const DEFAULT_WEIGHTS = {closeness: 0.4, rating: 0.3, contextMatch: 0.3};
const RATING_SCALE = 5; // assumed 0..5 star scale
const NEUTRAL_RATING = 0.5;

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

class CustomAlgorithm extends BaseAlgorithm {
  static id = 'custom';
  static requiresEM = false;
  // The engine reads this flag and pre-loads context.valorations.
  static requiresValorations = true;

  score(user, pois, context = {}) {
    if (!Array.isArray(pois) || pois.length === 0) return [];

    const maxItems = context.maxItems ?? DEFAULT_MAX_ITEMS;
    const maxDistance = context.maxDistance ?? DEFAULT_MAX_DISTANCE_M;
    const weights = {...DEFAULT_WEIGHTS, ...(context.weights ?? {})};

    const userHasGps = !!user && hasValidCoords(user.lat, user.lon);

    // -- Rating index by type ------------------------------------------------
    // Build a Map<poiType, meanRatingNormalized> over the user's valorations.
    // We resolve a valoration's type by looking the poiId up in `pois`.
    const ratingByType = buildRatingIndex(context.valorations ?? [], pois);

    // -- Context-match keywords ---------------------------------------------
    const matchKeywords = (
      context.matchKeywords && context.matchKeywords.length > 0
        ? context.matchKeywords
        : context.recommendationType
        ? [context.recommendationType]
        : []
    )
      .map(normalizeText)
      .filter(Boolean);

    const scored = [];
    for (const poi of pois) {
      // closenessScore
      let closenessScore = 0;
      if (userHasGps && hasValidCoords(poi.latitude, poi.longitude)) {
        const dist = haversineMeters(
          user.lat,
          user.lon,
          poi.latitude,
          poi.longitude,
        );
        if (dist <= maxDistance) {
          closenessScore = 1 - dist / maxDistance;
        }
      }

      // ratingScore
      let ratingScore = NEUTRAL_RATING;
      if (poi.type && ratingByType.has(poi.type)) {
        ratingScore = ratingByType.get(poi.type);
      }

      // contextScore
      let contextScore = 0;
      if (matchKeywords.length > 0) {
        const haystack = normalizeText(`${poi.name ?? ''} ${poi.type ?? ''}`);
        for (const kw of matchKeywords) {
          if (haystack.includes(kw)) {
            contextScore = 1;
            break;
          }
        }
      }

      const raw =
        weights.closeness * closenessScore +
        weights.rating * ratingScore +
        weights.contextMatch * contextScore;
      const score = clamp01(raw);

      if (score > 0) {
        scored.push({poiId: poi.id, score});
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, maxItems);
  }
}

/**
 * Build a Map<poiType, normalizedMeanRating> from the user's valorations.
 *
 * Each valoration carries a poiId; we resolve the type by looking up the POI
 * in the candidate list. Ratings whose poiId isn't in `pois` are ignored
 * (the catalog may have shifted, or the rating belongs to a deleted POI).
 *
 * The mean is normalized by RATING_SCALE so the returned value lives in [0,1].
 *
 * @param {Array<{poiId: number, rating: number}>} valorations
 * @param {Array<{id: number, type: string}>} pois
 * @returns {Map<string, number>}
 */
function buildRatingIndex(valorations, pois) {
  if (valorations.length === 0) return new Map();

  const typeById = new Map(pois.map(p => [p.id, p.type]));
  const sums = new Map(); // type -> { sum, count }

  for (const v of valorations) {
    const type = typeById.get(v.poiId);
    if (!type) continue;
    const r = typeof v.rating === 'number' ? v.rating : parseFloat(v.rating);
    if (!Number.isFinite(r)) continue;

    const cur = sums.get(type) ?? {sum: 0, count: 0};
    cur.sum += r;
    cur.count += 1;
    sums.set(type, cur);
  }

  const out = new Map();
  for (const [type, {sum, count}] of sums) {
    out.set(type, clamp01(sum / count / RATING_SCALE));
  }
  return out;
}

export default new CustomAlgorithm();
