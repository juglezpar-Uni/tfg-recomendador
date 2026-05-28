/**
 * Central registry of recommendation algorithms.
 * Filters by EM availability so the app works in both local and server modes.
 */

import RandomAlgorithm from './algorithms/RandomAlgorithm';
import ClosenessAlgorithm from './algorithms/ClosenessAlgorithm';
import KeywordAlgorithm from './algorithms/KeywordAlgorithm';
import CustomAlgorithm from './algorithms/CustomAlgorithm';
import {isEMAvailable} from '../em/emStatus';

const ALL = [RandomAlgorithm, ClosenessAlgorithm, KeywordAlgorithm, CustomAlgorithm];
const BY_ID = new Map(ALL.map(a => [a.constructor.id, a]));

/** Get algorithm instance by id. */
export function getAlgorithm(id) {
  return BY_ID.get(id);
}

/**
 * List algorithms usable right now. EM-bound algorithms are hidden unless an
 * Entity Manager is reachable. The current EM availability is read from
 * `emStatus` (populated by `checkEMAvailability()` at app startup); callers
 * may override it for tests or for an ad-hoc query.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.emAvailable] override the cached EM status
 * @returns {Array<Object>} algorithm instances
 */
export function listAvailable({emAvailable} = {}) {
  const emOn = typeof emAvailable === 'boolean' ? emAvailable : isEMAvailable();
  return ALL.filter(a => emOn || !a.constructor.requiresEM);
}

/** All known algorithm ids (for debug/logs). */
export function listAllIds() {
  return ALL.map(a => a.constructor.id);
}
