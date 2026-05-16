/**
 * Connects the rule engine (when to recommend) with the recommendation
 * engine (what to recommend). Uses a subscriber pattern.
 *
 *
 * To activate:
 *   setRecommendationTypeMap({ Restaurants: 'closeness' });
 *   onRecommendationTriggered(dispatchToRecommendationEngine);
 */

const _listeners = new Set();
let _typeToAlgorithm = {};

/**
 * Subscribe to recommendation triggers.
 *
 * @param {(payload: { contextId: string, recommendationType: string }) => any} cb
 * @returns {() => void} unsubscribe
 */
export function onRecommendationTriggered(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/**
 * Notify every subscriber that a triggering rule fired. Errors thrown by a
 * subscriber are caught and logged so one bad listener can't break others.
 *
 * @param {{ contextId: string, recommendationType: string }} payload
 */
export function notify(payload) {
  for (const cb of _listeners) {
    try {
      cb(payload);
    } catch (err) {
      console.error('[RecommendationBridge] subscriber threw:', err);
    }
  }
}

/**
 * Configure the recommendationType → algorithmId mapping.
 * Replaces the previous map entirely (caller wins).
 *
 * @param {Object<string, string>} map  e.g. { Restaurants: 'closeness' }
 */
export function setRecommendationTypeMap(map) {
  _typeToAlgorithm = {...(map ?? {})};
}

/**
 * Look up the algorithm bound to a given recommendation type.
 * @param {string} recommendationType
 * @returns {string|null}
 */
export function getAlgorithmForType(recommendationType) {
  return _typeToAlgorithm[recommendationType] ?? null;
}

/**
 * Convenience subscriber: forwards a triggered recommendation to the
 * RecommendationEngine. Uses dynamic import so this module remains loadable in
 * environments where Realm is not available (e.g. unit tests).
 *
 * If no algorithm is mapped to the incoming type, the call is a no-op.
 *
 * @param {{ contextId: string, recommendationType: string, userId?: string, context?: Object }} payload
 * @returns {Promise<Array|null>} The recommend() result, or null if skipped.
 */
export async function dispatchToRecommendationEngine(payload) {
  const algorithmId = getAlgorithmForType(payload?.recommendationType);
  if (!algorithmId) {
    console.log(
      `[RecommendationBridge] no algorithm mapped for type "${payload?.recommendationType}", skipping`,
    );
    return null;
  }

  // Dynamic import keeps Realm out of the dependency graph until we actually
  // need to dispatch. Tests can stub this module wholesale.
  const {recommend} = await import('../recommendation/RecommendationEngine');
  return recommend({
    algorithmId,
    userId: payload.userId,
    context: payload.context ?? {},
  });
}

/**
 * Test-only helper: wipes subscribers and the type map. Not exported via
 * src/ruleEngine/index.js.
 */
export function _resetForTests() {
  _listeners.clear();
  _typeToAlgorithm = {};
}
