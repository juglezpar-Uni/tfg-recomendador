/**
 * Connects rule engine triggers with recommendation algorithms.
 *
 * Two configurable maps:
 *   - typeToAlgorithm: which algorithm runs for each recommendation type
 *   - typeToKeywords: how to translate types to POI vocabulary (e.g. "Restaurants" → ["restaurante"])
 *
 * Call bootstrapRecommendationBridge() at startup to wire everything.
 */
const _listeners = new Set();
let _typeToAlgorithm = {};
let _typeToKeywords = {};

// Built-in defaults. Spanish keywords cover the Zaragoza Open Data vocabulary
// (POI types come back as `http://.../kos/turismo/restaurante`, etc.).
const DEFAULT_TYPE_TO_ALGORITHM = {
  Restaurants: 'closeness',
  Museums: 'keyword',
  default: 'random',
};
const DEFAULT_TYPE_TO_KEYWORDS = {
  Restaurants: ['restaurante'],
  Museums: ['museo'],
};

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
 * @param {Object<string, string>} map  e.g. { Restaurants: 'closeness', default: 'random' }
 */
export function setRecommendationTypeMap(map) {
  _typeToAlgorithm = {...(map ?? {})};
}

/**
 * Configure the recommendationType → keywords[] mapping used by CustomAlgorithm
 * (and any other algorithm interested in matching the rule-fired type against
 * POI metadata in the local vocabulary).
 *
 * @param {Object<string, Array<string>>} map  e.g. { Restaurants: ['restaurante'] }
 */
export function setRecommendationKeywordsMap(map) {
  _typeToKeywords = {...(map ?? {})};
}

/**
 * Look up the algorithm bound to a given recommendation type.
 * Falls back to the `default` entry in the map if no explicit binding exists.
 *
 * @param {string} recommendationType
 * @returns {string|null}
 */
export function getAlgorithmForType(recommendationType) {
  return (
    _typeToAlgorithm[recommendationType] ?? _typeToAlgorithm.default ?? null
  );
}

/**
 * Look up the keywords bound to a given recommendation type.
 *
 * @param {string} recommendationType
 * @returns {Array<string>} possibly empty
 */
export function getKeywordsForType(recommendationType) {
  return _typeToKeywords[recommendationType] ?? [];
}

/**
 * Convenience subscriber: forwards a triggered recommendation to the
 * RecommendationEngine and, once the batch is produced, fires a local push
 * notification so the user is aware that a new automatic recommendation is
 * available. Uses dynamic imports so this module remains loadable in
 * environments where Realm or the native notification module are not
 * available (e.g. unit tests).
 *
 * The recommendationType (and any keywords mapped to it) are propagated into
 * the algorithm's `context` so CustomAlgorithm (and future algorithms) can
 * factor them into the scoring.
 *
 * If no algorithm is mapped to the incoming type — and no `default` is set —
 * the call is a no-op.
 *
 * @param {{ contextId: string, recommendationType: string, ruleName?: string, userId?: string, context?: Object }} payload
 * @returns {Promise<Array|null>} The recommend() result, or null if skipped.
 */
export async function dispatchToRecommendationEngine(payload) {
  // v3: prefer the algorithm the user picked on the rule itself. If the rule
  // doesn't specify one (empty string or undefined), fall back to the bridge's
  // typeToAlgorithm map — the pre-existing default behaviour.
  const ruleAlgorithm =
    payload?.algorithm && payload.algorithm !== '' ? payload.algorithm : null;
  const algorithmId =
    ruleAlgorithm ?? getAlgorithmForType(payload?.recommendationType);
  if (!algorithmId) {
    console.log(
      `[RecommendationBridge] no algorithm mapped for type "${payload?.recommendationType}" (no default either), skipping`,
    );
    return null;
  }

  // v3: parse the algorithm-specific params from the rule (stored as JSON).
  // These override anything coming from getKeywordsForType or payload.context.
  let ruleParams = {};
  if (payload?.algorithmParams) {
    try {
      const parsed = JSON.parse(payload.algorithmParams);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        ruleParams = parsed;
      }
    } catch (err) {
      console.warn(
        '[RecommendationBridge] invalid algorithmParams JSON, ignoring:',
        err?.message ?? err,
      );
    }
  }

  const matchKeywords = getKeywordsForType(payload.recommendationType);
  const mergedContext = {
    ...(payload.context ?? {}),
    recommendationType: payload.recommendationType,
    // Only set matchKeywords if we actually have any; otherwise let the
    // algorithm fall back to its own default (usually the recommendationType
    // itself as a single keyword).
    ...(matchKeywords.length > 0 ? {matchKeywords} : {}),
    // Rule-specific params take precedence over the bridge's map defaults.
    ...ruleParams,
  };

  // Dynamic import to avoid loading Realm in test environments
  const {recommend} = await import('../recommendation/RecommendationEngine');
  const result = await recommend({
    algorithmId,
    userId: payload.userId,
    context: mergedContext,
  });

  // Fire-and-forget local notification. Wrapped in a try/catch so any
  // failure of the native notification module (permissions denied, channel
  // missing on iOS, tests running without notifee) never propagates back
  // to the rule engine.
  try {
    const {notifyRecommendation} = await import('../events/Notification');
    await notifyRecommendation({
      recommendationType: payload.recommendationType,
      algorithmId,
      count: Array.isArray(result) ? result.length : 0,
      ruleName: payload.ruleName,
    });
  } catch (err) {
    console.warn(
      '[RecommendationBridge] notification failed (non-fatal):',
      err?.message ?? err,
    );
  }

  return result;
}

/**
 * One-call helper to wire everything at app startup:
 *   1. Installs the type → algorithm map (with sensible defaults).
 *   2. Installs the type → keywords map (with sensible defaults).
 *   3. Subscribes `dispatchToRecommendationEngine` (or a caller-supplied
 *      subscriber) to rule-engine notifications.
 *
 *
 * @param {Object} [config]
 * @param {Object<string, string>}        [config.typeToAlgorithm]
 * @param {Object<string, Array<string>>} [config.typeToKeywords]
 * @param {Function}                      [config.subscriber]  defaults to dispatchToRecommendationEngine
 * @returns {() => boolean} unsubscribe function
 */
export function bootstrapRecommendationBridge(config = {}) {
  const typeToAlgorithm = config.typeToAlgorithm ?? DEFAULT_TYPE_TO_ALGORITHM;
  const typeToKeywords = config.typeToKeywords ?? DEFAULT_TYPE_TO_KEYWORDS;
  const subscriber = config.subscriber ?? dispatchToRecommendationEngine;

  setRecommendationTypeMap(typeToAlgorithm);
  setRecommendationKeywordsMap(typeToKeywords);
  const unsub = onRecommendationTriggered(subscriber);

  console.log(
    `[RecommendationBridge] bootstrap complete — types: ${Object.keys(
      typeToAlgorithm,
    ).join(', ')}`,
  );
  return unsub;
}

/**
 * Test-only helper: wipes subscribers, the type map and the keywords map.
 * Not exported via src/ruleEngine/index.js.
 */
export function _resetForTests() {
  _listeners.clear();
  _typeToAlgorithm = {};
  _typeToKeywords = {};
}
