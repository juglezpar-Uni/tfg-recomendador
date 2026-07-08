/**
 * syntheticRules.js
 * -----------------------------------------------------------------------------
 * Deterministic synthetic rule generator for the Siddhi-vs-JS benchmark.
 *
 * Determinism is guaranteed by construction:
 *   - No RNG anywhere. All choices are pure functions of the input index
 *     (round-robin over rule types, deterministic arity formula, etc.).
 *   - Synthetic rule IDs live in a private numeric range (>= SYNTHETIC_ID_BASE)
 *     so they never collide with user-authored rules and can be safely wiped
 *     between benchmark levels without touching real data.
 *   - All Context Rules are built to *always match* any Context event produced
 *     by syntheticContexts.js. This gives us the worst-case cost (every TR
 *     fires on every event → no branch pruning) which is what we want to
 *     measure and what makes latency comparable across engines.
 *
 * Two clear helpers:
 *   - clearSyntheticRules() removes ONLY rows with id >= SYNTHETIC_ID_BASE.
 *   - clearAllRules() removes every ContextRule and TriggeringRule.
 * -----------------------------------------------------------------------------
 */

import {realm} from '../../realmSchemas/RealmInstance';

/** All synthetic rule IDs start here (well above realistic user IDs). */
export const SYNTHETIC_ID_BASE = 1_000_000;

const TYPES = ['Time-Based', 'Calendar-Based', 'Weather', 'Location', 'Server-Based'];

const ALL_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const WEATHER_STATUSES = ['Clear', 'Clouds', 'Rain', 'Drizzle', 'Thunderstorm', 'Snow', 'Atmosphere'];

const SERVER_MEASUREMENTS = ['co2', 'temperature', 'humidity'];

// ---------------------------------------------------------------------------
// Builders — pure functions, no Realm access.
// ---------------------------------------------------------------------------

/**
 * Build a single Context Rule of the given type. The rule is designed to
 * ALWAYS match any Context event produced by syntheticContexts.js.
 *
 * @param {number} i     0-based index within the run
 * @param {string} type  one of TYPES
 * @returns {Object}     plain object shaped like the Realm ContextRule schema
 */
function buildContextRule(i, type) {
  const id = SYNTHETIC_ID_BASE + i;
  const name = `${type.replace(/-/g, '')}Synth_${i}`;

  switch (type) {
    case 'Time-Based':
      return {
        id, type, name,
        startTime: '00:00',
        endTime: '23:59',
        gpsLatitude: null, gpsLongitude: null, locationError: null,
        startDate: null, endDate: null,
        daysOfWeek: [], weatherStatus: [],
        minTemp: null, maxTemp: null,
        server: null, measurement: null, comparator: null, value: null,
      };

    case 'Calendar-Based':
      return {
        id, type, name,
        startTime: null, endTime: null,
        gpsLatitude: null, gpsLongitude: null, locationError: null,
        startDate: '__/__/__', endDate: '__/__/__',
        daysOfWeek: ALL_WEEKDAYS.map(k => ({key: k, checked: true})),
        weatherStatus: [],
        minTemp: null, maxTemp: null,
        server: null, measurement: null, comparator: null, value: null,
      };

    case 'Weather':
      return {
        id, type, name,
        startTime: null, endTime: null,
        gpsLatitude: null, gpsLongitude: null, locationError: null,
        startDate: null, endDate: null,
        daysOfWeek: [],
        weatherStatus: WEATHER_STATUSES.map(k => ({key: k, checked: true})),
        minTemp: 0, maxTemp: 50,
        server: null, measurement: null, comparator: null, value: null,
      };

    case 'Location':
      return {
        id, type, name,
        startTime: null, endTime: null,
        gpsLatitude: 41.65, gpsLongitude: -0.89,
        locationError: 999999,
        startDate: null, endDate: null,
        daysOfWeek: [], weatherStatus: [],
        minTemp: null, maxTemp: null,
        server: null, measurement: null, comparator: null, value: null,
      };

    case 'Server-Based':
      return {
        id, type, name,
        startTime: null, endTime: null,
        gpsLatitude: null, gpsLongitude: null, locationError: null,
        startDate: null, endDate: null,
        daysOfWeek: [], weatherStatus: [],
        minTemp: null, maxTemp: null,
        server: 'sensorizar',
        measurement: SERVER_MEASUREMENTS[i % SERVER_MEASUREMENTS.length],
        comparator: '>',
        value: 0,
      };

    default:
      throw new Error(`[syntheticRules] unknown type: ${type}`);
  }
}

/**
 * Deterministic arity + negation pattern for a Triggering Rule.
 * Mirrors the "1 CR, 2 CRs, 3 CRs con negación" progression the paper uses.
 */
function buildTRShape(i) {
  switch (i % 5) {
    case 0: return {arity: 1, negatedIndex: -1};
    case 1: return {arity: 2, negatedIndex: -1};
    case 2: return {arity: 2, negatedIndex: -1};
    case 3: return {arity: 3, negatedIndex: 2};   // last CR negated
    case 4: return {arity: 3, negatedIndex: 1};   // middle CR negated
    default: return {arity: 1, negatedIndex: -1}; // unreachable
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate and persist a batch of synthetic rules.
 *
 * All writes happen inside a single Realm transaction. TRs directly reference
 * CR objects via primary-key lookup — no scans, no `sorted('id', true)`.
 *
 * @param {{nCR: number, nTR: number}} args
 * @returns {{contextRules: Array<Object>, triggeringRules: Array<Object>}}
 *   Plain-object descriptions of what was inserted. Useful for
 *   siddhiAppNoWindow.js which needs the same shape to build SiddhiQL.
 */
export function generateSyntheticRules({nCR, nTR}) {
  // ---- Build CR descriptors --------------------------------------------------
  const contextRules = [];
  for (let i = 0; i < nCR; i++) {
    contextRules.push(buildContextRule(i, TYPES[i % TYPES.length]));
  }
  // Fast lookup for the TR builder below.
  const crById = new Map(contextRules.map(cr => [cr.id, cr]));

  // ---- Build TR descriptors --------------------------------------------------
  // IMPORTANT: the returned TR objects must be consumable by BOTH engines
  // downstream. The Siddhi generators (src/siddhi/rules/triggering/generator.js)
  // access `triggeringRule.contextRules` (iterable of CRs, each with .type and
  // .name) and `triggeringRule.denyContextRule` (parallel boolean array). So we
  // populate those fields directly on the plain descriptor. The JS engine
  // ignores these — it reads TRs straight from Realm.
  const triggeringRules = [];
  for (let i = 0; i < nTR; i++) {
    const {arity, negatedIndex} = buildTRShape(i);
    const crRefs = [];
    const denyFlags = [];
    for (let k = 0; k < arity; k++) {
      const crIdx = (i + k) % nCR;
      crRefs.push(crById.get(SYNTHETIC_ID_BASE + crIdx));
      denyFlags.push(k === negatedIndex);
    }
    triggeringRules.push({
      id: SYNTHETIC_ID_BASE + i,
      name: `SynthTR_${i}`,
      recommendationType: `SynthReco_${i}`,
      switchState: true,
      contextRules: crRefs,
      denyContextRule: denyFlags,
    });
  }

  // ---- Persist in a single transaction --------------------------------------
  // For Realm we need actual ContextRule proxies (not the plain descriptors),
  // resolved via primary key.
  realm.write(() => {
    for (const cr of contextRules) {
      realm.create('ContextRule', cr);
    }
    for (const tr of triggeringRules) {
      const crObjs = tr.contextRules
        .map(cr => realm.objectForPrimaryKey('ContextRule', cr.id))
        .filter(Boolean);
      realm.create('TriggeringRule', {
        id: tr.id,
        name: tr.name,
        recommendationType: tr.recommendationType,
        switchState: tr.switchState,
        contextRules: crObjs,
        denyContextRule: tr.denyContextRule,
      });
    }
  });

  console.log(
    `[syntheticRules] generated ${contextRules.length} CRs and ${triggeringRules.length} TRs`,
  );
  return {contextRules, triggeringRules};
}

/**
 * Delete only the rules created by `generateSyntheticRules` (id >= base).
 * Safe to run alongside real user rules.
 */
export function clearSyntheticRules() {
  realm.write(() => {
    realm.delete(
      realm.objects('TriggeringRule').filtered('id >= $0', SYNTHETIC_ID_BASE),
    );
    realm.delete(
      realm.objects('ContextRule').filtered('id >= $0', SYNTHETIC_ID_BASE),
    );
  });
}

/**
 * DANGER: wipes EVERY TriggeringRule and ContextRule in Realm, synthetic or
 * not. Only call this if the user opted in explicitly (harness `wipeAll: true`).
 */
export function clearAllRules() {
  console.warn('[syntheticRules] clearAllRules(): wiping ALL rules from Realm');
  realm.write(() => {
    // TRs first because they reference CRs.
    realm.delete(realm.objects('TriggeringRule'));
    realm.delete(realm.objects('ContextRule'));
  });
}
