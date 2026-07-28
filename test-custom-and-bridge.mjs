/**
 * test-custom-and-bridge.mjs
 * -----------------------------------------------------------------------------
 * Verifies the Sprint 4 additions:
 *   - CustomAlgorithm (hybrid formula, edge cases, weight overrides)
 *   - RecommendationBridge (type→algorithm map, type→keywords map, listeners)
 *   - checkEMAvailability probe (mocking global fetch)
 *
 * The pure algorithm logic and the bridge state machine are RE-IMPLEMENTED
 * inline (mirroring the production sources) so this script can run with
 *     node test-custom-and-bridge.mjs
 * without React Native or Realm being loadable. Keep both copies in sync if
 * the production sources are tweaked.
 *
 * NOT covered here (integration surface):
 *   - dispatchToRecommendationEngine (dynamically imports Realm-backed engine)
 *   - actual Realm reads for POIs / valorations
 *   - the setEMAvailable/isEMAvailable module-level side effect
 * Those live in RecommendationEngine.js and emStatus.js and are exercised
 * by the on-device verification described in the memoria.
 * -----------------------------------------------------------------------------
 */

// ===========================================================================
// Inlined utils (mirror src/utils/geo.js and src/utils/text.js)
// ===========================================================================

const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function hasValidCoords(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

function normalizeText(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ===========================================================================
// Inlined CustomAlgorithm (mirror src/recommendation/algorithms/CustomAlgorithm.js)
// ===========================================================================

const DEFAULT_MAX_ITEMS    = 10;
const DEFAULT_MAX_DISTANCE = 2000;
const DEFAULT_WEIGHTS      = { closeness: 0.4, rating: 0.3, contextMatch: 0.3 };
const RATING_SCALE         = 5;
const NEUTRAL_RATING       = 0.5;

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function buildRatingIndex(valorations, pois) {
  if (valorations.length === 0) return new Map();
  const typeById = new Map(pois.map(p => [p.id, p.type]));
  const sums = new Map();
  for (const v of valorations) {
    const type = typeById.get(v.poiId);
    if (!type) continue;
    const r = typeof v.rating === 'number' ? v.rating : parseFloat(v.rating);
    if (!Number.isFinite(r)) continue;
    const cur = sums.get(type) ?? { sum: 0, count: 0 };
    cur.sum += r;
    cur.count += 1;
    sums.set(type, cur);
  }
  const out = new Map();
  for (const [type, { sum, count }] of sums) {
    out.set(type, clamp01(sum / count / RATING_SCALE));
  }
  return out;
}

function scoreCustom(user, pois, context = {}) {
  if (!Array.isArray(pois) || pois.length === 0) return [];

  const maxItems    = context.maxItems    ?? DEFAULT_MAX_ITEMS;
  const maxDistance = context.maxDistance ?? DEFAULT_MAX_DISTANCE;
  const weights     = { ...DEFAULT_WEIGHTS, ...(context.weights ?? {}) };
  const userHasGps  = !!user && hasValidCoords(user.lat, user.lon);

  const ratingByType = buildRatingIndex(context.valorations ?? [], pois);

  const matchKeywords = (
    context.matchKeywords && context.matchKeywords.length > 0
      ? context.matchKeywords
      : context.recommendationType
      ? [context.recommendationType]
      : []
  ).map(normalizeText).filter(Boolean);

  const scored = [];
  for (const poi of pois) {
    let closenessScore = 0;
    if (userHasGps && hasValidCoords(poi.latitude, poi.longitude)) {
      const dist = haversineMeters(user.lat, user.lon, poi.latitude, poi.longitude);
      if (dist <= maxDistance) closenessScore = 1 - dist / maxDistance;
    }

    let ratingScore = NEUTRAL_RATING;
    if (poi.type && ratingByType.has(poi.type)) {
      ratingScore = ratingByType.get(poi.type);
    }

    let contextScore = 0;
    if (matchKeywords.length > 0) {
      const haystack = normalizeText(`${poi.name ?? ''} ${poi.type ?? ''}`);
      for (const kw of matchKeywords) {
        if (haystack.includes(kw)) { contextScore = 1; break; }
      }
    }

    const raw =
      weights.closeness    * closenessScore +
      weights.rating       * ratingScore +
      weights.contextMatch * contextScore;
    const score = clamp01(raw);

    if (score > 0) scored.push({ poiId: poi.id, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, maxItems);
}

// ===========================================================================
// Inlined RecommendationBridge factory
// (mirrors src/ruleEngine/RecommendationBridge.js but with per-instance state
//  so tests are independent — the production version uses module-level state.)
// ===========================================================================

function createBridge() {
  const listeners = new Set();
  let typeToAlgorithm = {};
  let typeToKeywords = {};

  return {
    setRecommendationTypeMap(map)     { typeToAlgorithm = { ...(map ?? {}) }; },
    setRecommendationKeywordsMap(map) { typeToKeywords  = { ...(map ?? {}) }; },
    getAlgorithmForType(t) {
      return typeToAlgorithm[t] ?? typeToAlgorithm.default ?? null;
    },
    getKeywordsForType(t) {
      return typeToKeywords[t] ?? [];
    },
    onRecommendationTriggered(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    notify(payload) {
      for (const cb of listeners) {
        try { cb(payload); } catch { /* swallow, mirror production */ }
      }
    },
  };
}

// ===========================================================================
// Inlined EM probe (mirror of the probe body of checkEMAvailability)
// Parameterized on the ems list so tests can inject their own fixtures.
// ===========================================================================

async function probeEMs(ems, timeoutMs = 100) {
  if (!Array.isArray(ems) || ems.length === 0) return false;
  const probe = async em => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${em.address}/ping`, {
        method: 'GET',
        signal: controller.signal,
      });
      return resp.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  const results = await Promise.all(ems.map(probe));
  return results.some(Boolean);
}

// ===========================================================================
// Tiny harness
// ===========================================================================
let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else      { console.log(`  ✗ ${label}${detail ? '  → ' + detail : ''}`); fail++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// ===========================================================================
// Tests — CustomAlgorithm  (10)
// Reference user at Basilica del Pilar in Zaragoza.
// ===========================================================================
section('CustomAlgorithm — formula and edge cases');

const USER        = { id: 'u1', lat: 41.6497, lon: -0.87857 };
const NO_GPS_USER = { id: 'u1' };
const POI_HERE = { id: 1, name: 'Pilar',     latitude: 41.6497, longitude: -0.87857, type: 'monumento' };
const POI_NEAR = { id: 2, name: 'Museo Foo', latitude: 41.6491, longitude: -0.87740, type: 'museo' };
const POI_FAR  = { id: 3, name: 'Utebo',     latitude: 41.7500, longitude: -0.99000, type: 'monumento' }; // ~13km
const POIS = [POI_HERE, POI_NEAR, POI_FAR];

{
  check('empty pois → []',
    scoreCustom(USER, [], {}).length === 0);
}
{
  const r = scoreCustom(NO_GPS_USER, POIS, {});
  check('no GPS + no context → all POIs get baseline score 0.15',
    r.length === 3 && r.every(x => Math.abs(x.score - 0.15) < 1e-9));
}
{
  const r = scoreCustom(NO_GPS_USER, POIS, { maxItems: 2 });
  check('respects maxItems=2',
    r.length === 2);
}
{
  const r = scoreCustom(USER, POIS, {});
  check('POI at user position ranked first with score 0.55 (closeness=1 only)',
    r[0].poiId === 1 && Math.abs(r[0].score - 0.55) < 1e-9);
}
{
  const r = scoreCustom(USER, [POI_FAR], { maxDistance: 2000 });
  // POI_FAR ~13km > 2000m → closenessScore = 0 → score = baseline 0.15
  check('POI beyond maxDistance → closeness contribution is 0, score = 0.15',
    r.length === 1 && Math.abs(r[0].score - 0.15) < 1e-9);
}
{
  const valorations = [{ poiId: 2, rating: 5 }]; // POI_NEAR (type='museo') rated 5/5 → 1.0
  const r = scoreCustom(NO_GPS_USER, [POI_NEAR], { valorations });
  // 0.4*0 + 0.3*1.0 + 0.3*0 = 0.3
  check('valoration 5/5 for POI type → ratingScore=1.0 → score = 0.3',
    Math.abs(r[0].score - 0.3) < 1e-9);
}
{
  const valorations = [{ poiId: 99, rating: 5 }]; // poiId not in POIS → ignored
  const r = scoreCustom(NO_GPS_USER, [POI_NEAR], { valorations });
  check('valoration for unknown poiId → NEUTRAL_RATING kicks in → score = 0.15',
    Math.abs(r[0].score - 0.15) < 1e-9);
}
{
  const r = scoreCustom(NO_GPS_USER, [POI_NEAR], { matchKeywords: ['museo'] });
  // name "Museo Foo" + type "museo" → normalized haystack contains "museo" → contextScore = 1
  // 0.4*0 + 0.3*0.5 + 0.3*1 = 0.45
  check('matchKeywords hit → contextScore=1 → score = 0.45',
    Math.abs(r[0].score - 0.45) < 1e-9);
}
{
  const r = scoreCustom(NO_GPS_USER, [POI_HERE], { matchKeywords: ['restaurante'] });
  // name "Pilar" + type "monumento" — no "restaurante" match
  check('matchKeywords miss → contextScore=0 → score stays at baseline 0.15',
    Math.abs(r[0].score - 0.15) < 1e-9);
}
{
  const r = scoreCustom(USER, [POI_HERE], {
    weights: { closeness: 1, rating: 0, contextMatch: 0 },
  });
  // POI at user pos, closeness=1, weights collapse to closeness only → score = 1
  check('custom weights override defaults (all mass on closeness) → max score = 1',
    Math.abs(r[0].score - 1) < 1e-9);
}

// ===========================================================================
// Tests — RecommendationBridge  (8)
// ===========================================================================
section('RecommendationBridge — type/keyword maps and listeners');
{
  const b = createBridge();
  b.setRecommendationTypeMap({ Restaurants: 'closeness', Museums: 'keyword' });
  check('getAlgorithmForType returns the mapped id',
    b.getAlgorithmForType('Restaurants') === 'closeness');
}
{
  const b = createBridge();
  b.setRecommendationTypeMap({ default: 'random' });
  check('unmapped type falls back to the "default" entry',
    b.getAlgorithmForType('Anything') === 'random');
}
{
  const b = createBridge();
  b.setRecommendationTypeMap({ Restaurants: 'closeness' });
  check('unmapped type + no default → null',
    b.getAlgorithmForType('Museums') === null);
}
{
  const b = createBridge();
  b.setRecommendationKeywordsMap({ Restaurants: ['restaurante'] });
  const kws = b.getKeywordsForType('Restaurants');
  check('getKeywordsForType returns the mapped array',
    Array.isArray(kws) && kws.length === 1 && kws[0] === 'restaurante');
}
{
  const b = createBridge();
  b.setRecommendationKeywordsMap({ Restaurants: ['restaurante'] });
  check('getKeywordsForType returns [] for unknown type',
    b.getKeywordsForType('Museums').length === 0);
}
{
  const b = createBridge();
  let calls = 0;
  b.onRecommendationTriggered(() => calls++);
  b.onRecommendationTriggered(() => calls++);
  b.notify({ contextId: 'c1', recommendationType: 't' });
  check('notify() dispatches to every subscriber',
    calls === 2);
}
{
  const b = createBridge();
  let after = false;
  b.onRecommendationTriggered(() => { throw new Error('boom'); });
  b.onRecommendationTriggered(() => { after = true; });
  b.notify({});
  check('notify() swallows subscriber errors and keeps invoking the rest',
    after === true);
}
{
  const b = createBridge();
  let called = 0;
  const unsub = b.onRecommendationTriggered(() => called++);
  unsub();
  b.notify({});
  check('the unsubscribe returned by onRecommendationTriggered removes the listener',
    called === 0);
}

// ===========================================================================
// Tests — checkEMAvailability probe  (4, async — mock global.fetch)
// ===========================================================================
section('checkEMAvailability — availability probe (mocked fetch)');

const originalFetch = globalThis.fetch;

{
  const result = await probeEMs([]);
  check('empty EMs list → available = false, no fetch calls',
    result === false);
}
{
  globalThis.fetch = async () => ({ status: 200 });
  const result = await probeEMs([
    { address: 'http://em1' },
    { address: 'http://em2' },
  ]);
  check('all EMs respond 200 → available = true',
    result === true);
  globalThis.fetch = originalFetch;
}
{
  globalThis.fetch = async () => { throw new Error('network fail'); };
  const result = await probeEMs([
    { address: 'http://em1' },
    { address: 'http://em2' },
  ]);
  check('every fetch throws → available = false',
    result === false);
  globalThis.fetch = originalFetch;
}
{
  globalThis.fetch = async (url) => {
    if (url.includes('em1')) return { status: 200 };
    throw new Error('fail');
  };
  const result = await probeEMs([
    { address: 'http://em1' },
    { address: 'http://em2' },
  ]);
  check('one EM OK, others fail → available = true',
    result === true);
  globalThis.fetch = originalFetch;
}

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=========================================`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`=========================================`);
process.exit(fail === 0 ? 0 : 1);
