/**
 * Central registry of recommendation algorithms.
 * Filters by EM availability so the app works in both local and server modes.
 */

import RandomAlgorithm from './algorithms/RandomAlgorithm';
import ClosenessAlgorithm from './algorithms/ClosenessAlgorithm';
import KeywordAlgorithm from './algorithms/KeywordAlgorithm';
import CustomAlgorithm from './algorithms/CustomAlgorithm';

const ALL = [RandomAlgorithm, ClosenessAlgorithm, KeywordAlgorithm, CustomAlgorithm];
const BY_ID = new Map(ALL.map(a => [a.constructor.id, a]));

/** Get algorithm instance by id. */
export function getAlgorithm(id) {
  return BY_ID.get(id);
}

/** List algorithms usable right now (hides EM-only if no server). */
export function listAvailable({emAvailable = false} = {}) {
  return ALL.filter(a => emAvailable || !a.constructor.requiresEM);
}

/** All known algorithm ids (for debug/logs). */
export function listAllIds() {
  return ALL.map(a => a.constructor.id);
}
