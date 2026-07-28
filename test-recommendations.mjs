/**
 * test-recommendations.mjs
 * -----------------------------------------------------------------------------
 * Verifies the 3 Sprint 2 recommendation algorithms in plain Node, no Realm.
 *
 * The algorithm logic is RE-IMPLEMENTED inline (mirrors src/recommendation/
 * algorithms/*.js) so this script can run with bare `node test-recommendations.mjs`
 * without touching the React Native bundler. Keep both copies in sync if you
 * tweak the production algorithms.
 *
 * Run with:  node test-recommendations.mjs
 * -----------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Inlined utils  (mirror of src/utils/geo.js + src/utils/text.js)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasValidCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeText(s) {
  if (s == null) return '';
  return String(s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

// ---------------------------------------------------------------------------
// Inlined algorithms  (mirror of src/recommendation/algorithms/*.js)
// ---------------------------------------------------------------------------

const RandomAlgorithm = {
  id: 'random',
  score(user, pois, ctx = {}) {
    if (!Array.isArray(pois) || pois.length === 0) return [];
    const max = ctx.maxItems ?? 10;
    return pois.map(p => ({ poiId: p.id, score: Math.random() }))
      .sort((a, b) => b.score - a.score).slice(0, max);
  },
};

const ClosenessAlgorithm = {
  id: 'closeness',
  score(user, pois, ctx = {}) {
    if (!Array.isArray(pois) || pois.length === 0) return [];
    if (!user || !hasValidCoords(user.lat, user.lon)) return [];
    const maxDist = ctx.maxDistance ?? 2000;
    const max = ctx.maxItems ?? 10;
    const scored = [];
    for (const p of pois) {
      if (!hasValidCoords(p.latitude, p.longitude)) continue;
      const d = haversineMeters(user.lat, user.lon, p.latitude, p.longitude);
      if (d > maxDist) continue;
      scored.push({ poiId: p.id, score: 1 - d / maxDist, _dist: d });
    }
    if (scored.length === 0) return RandomAlgorithm.score(user, pois, ctx);
    return scored.sort((a, b) => b.score - a.score).slice(0, max);
  },
};

const KeywordAlgorithm = {
  id: 'keyword',
  score(user, pois, ctx = {}) {
    if (!Array.isArray(pois) || pois.length === 0) return [];
    const tokens = tokenize(ctx.keyword);
    if (tokens.length === 0) return [];
    const max = ctx.maxItems ?? 10;
    const scored = [];
    for (const p of pois) {
      const hay = normalizeText(`${p.name ?? ''} ${p.type ?? ''} ${p.description ?? ''}`);
      if (!hay) continue;
      let hits = 0;
      for (const t of tokens) if (hay.includes(t)) hits++;
      if (hits === 0) continue;
      scored.push({ poiId: p.id, score: hits / tokens.length });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, max);
  },
};

// ---------------------------------------------------------------------------
// Mocked POI dataset — realistic Zaragoza coordinates and types
// ---------------------------------------------------------------------------

// Plaza del Pilar reference: 41.6562, -0.8772
const POIS = [
  // Center (close to Plaza del Pilar — within 500m)
  { id: 1,  name: 'Basílica del Pilar',          latitude: 41.6562, longitude: -0.8782, type: 'Monumento', description: 'Catedral barroca de Zaragoza' },
  { id: 2,  name: 'La Seo',                      latitude: 41.6566, longitude: -0.8765, type: 'Monumento', description: 'Catedral de San Salvador' },
  { id: 3,  name: 'Museo del Foro de Caesaraugusta', latitude: 41.6572, longitude: -0.8754, type: 'Museo',  description: 'Restos romanos del foro' },
  { id: 4,  name: 'Restaurante La Bastilla',     latitude: 41.6555, longitude: -0.8789, type: 'restaurante', description: 'Cocina aragonesa' },
  // Mid-distance (500–1500m)
  { id: 5,  name: 'Aljafería',                   latitude: 41.6563, longitude: -0.8985, type: 'Monumento', description: 'Palacio musulmán del siglo XI' },
  { id: 6,  name: 'Museo Pablo Gargallo',        latitude: 41.6532, longitude: -0.8825, type: 'Museo',  description: 'Escultor aragonés' },
  { id: 7,  name: 'Museo Goya',                  latitude: 41.6533, longitude: -0.8762, type: 'Museo',  description: 'Colección de Francisco de Goya' },
  { id: 8,  name: 'Hotel NH Gran Vía',           latitude: 41.6480, longitude: -0.8870, type: 'alojamiento', description: 'Hotel de cuatro estrellas' },
  { id: 9,  name: 'Mercado Central',             latitude: 41.6553, longitude: -0.8810, type: 'Monumento', description: 'Mercado modernista' },
  // Far (1500–2500m)
  { id: 10, name: 'Parque Grande José Antonio Labordeta', latitude: 41.6378, longitude: -0.9000, type: 'TouristicAttraction', description: 'Parque urbano' },
  { id: 11, name: 'Restaurante El Cachirulo',    latitude: 41.7372, longitude: -0.8470, type: 'restaurante', description: 'Restaurante histórico' },
  // Outside 2km bbox
  { id: 12, name: 'Restaurante Lejano',          latitude: 41.7500, longitude: -1.0500, type: 'restaurante', description: 'Muy lejos del centro' },
  // Quirky / accent test cases
  { id: 13, name: 'Café Central',                latitude: 41.6560, longitude: -0.8775, type: 'cafetería',  description: 'Café histórico' },
  { id: 14, name: 'MUSEO PROVINCIAL',            latitude: 41.6540, longitude: -0.8820, type: 'Museo',  description: 'Bellas artes y arqueología' },
  { id: 15, name: 'Bar sin descripción',         latitude: 41.6580, longitude: -0.8800, type: 'restaurante', description: null },
  // 5 generic restaurants spread around the city
  { id: 16, name: 'Restaurante 1', latitude: 41.6600, longitude: -0.8750, type: 'restaurante', description: '' },
  { id: 17, name: 'Restaurante 2', latitude: 41.6650, longitude: -0.8800, type: 'restaurante', description: '' },
  { id: 18, name: 'Restaurante 3', latitude: 41.6500, longitude: -0.8700, type: 'restaurante', description: '' },
  { id: 19, name: 'Restaurante 4', latitude: 41.6450, longitude: -0.8900, type: 'restaurante', description: '' },
  { id: 20, name: 'Restaurante 5', latitude: 41.6700, longitude: -0.8850, type: 'restaurante', description: '' },
];

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? '  → ' + detail : ''}`);
    failed++;
  }
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const userAtPilar = { id: 'tester', lat: 41.6562, lon: -0.8772 };
const userFarAway = { id: 'tester', lat: 40.4168, lon: -3.7038 }; // Madrid
const userNoCoords = { id: 'tester' };

// --- RandomAlgorithm ---
section('RandomAlgorithm');
{
  const out = RandomAlgorithm.score(userAtPilar, POIS, {});
  check('returns 10 items by default', out.length === 10, `got ${out.length}`);
  check('all scores in [0, 1]', out.every(r => r.score >= 0 && r.score <= 1));
  check('sorted DESC by score', out.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
  const ids = new Set(out.map(r => r.poiId));
  check('no duplicate poiIds', ids.size === out.length);
  check('every poiId is from the dataset', out.every(r => POIS.some(p => p.id === r.poiId)));

  const empty = RandomAlgorithm.score(userAtPilar, [], {});
  check('returns [] for empty pois', empty.length === 0);

  const limited = RandomAlgorithm.score(userAtPilar, POIS, { maxItems: 3 });
  check('respects maxItems=3', limited.length === 3);
}

// --- ClosenessAlgorithm ---
section('ClosenessAlgorithm');
{
  const out = ClosenessAlgorithm.score(userAtPilar, POIS, {});
  check('returns ≤ 10 items', out.length <= 10);
  check('returns > 0 items (POIs near Pilar exist)', out.length > 0);
  // Verify all returned POIs are within 2000m of Pilar.
  const allWithin = out.every(r => {
    const p = POIS.find(x => x.id === r.poiId);
    return haversineMeters(userAtPilar.lat, userAtPilar.lon, p.latitude, p.longitude) <= 2000;
  });
  check('all returned POIs within 2000m', allWithin);
  check('first POI is the closest', out[0].poiId === 1 || out[0].poiId === 13, `got id=${out[0].poiId}`);
  check('scores in [0, 1]', out.every(r => r.score >= 0 && r.score <= 1));
  check('sorted DESC by score', out.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
  // POI #12 is well outside 2km — must be excluded.
  check('far-away POI #12 excluded', !out.some(r => r.poiId === 12));

  // No GPS coords → empty
  const noGps = ClosenessAlgorithm.score(userNoCoords, POIS, {});
  check('user without coords → []', noGps.length === 0);

  // User in Madrid → no POIs in range → fallback to random (length 10)
  const fallback = ClosenessAlgorithm.score(userFarAway, POIS, {});
  check('user far away triggers Random fallback (10 items)', fallback.length === 10);

  // maxDistance=300m → only the very nearest POIs to Pilar
  const tight = ClosenessAlgorithm.score(userAtPilar, POIS, { maxDistance: 300 });
  check('maxDistance=300m yields only ultra-close POIs',
    tight.length > 0 && tight.length < out.length, `got ${tight.length}`);

  // Custom maxItems
  const top3 = ClosenessAlgorithm.score(userAtPilar, POIS, { maxItems: 3 });
  check('respects maxItems=3', top3.length === 3);
}

// --- KeywordAlgorithm ---
section('KeywordAlgorithm');
{
  const museo = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: 'museo' });
  check('"museo" matches some POIs', museo.length > 0);
  // Should match POI #3 "Museo del Foro", #6 "Museo Pablo Gargallo", #7 "Museo Goya",
  // #14 "MUSEO PROVINCIAL" (uppercase), and others whose type='Museo'.
  const ids = new Set(museo.map(r => r.poiId));
  check('"museo" matches POI #3 (Museo del Foro)', ids.has(3));
  check('"museo" matches POI #14 (MUSEO PROVINCIAL, uppercase)', ids.has(14));
  check('"museo" excludes POI #4 (restaurante)', !ids.has(4));
  check('all keyword scores in (0, 1]', museo.every(r => r.score > 0 && r.score <= 1));

  // Multi-token: "museo goya" → POI #7 has both → score 1.0; others with just "museo" → 0.5
  const multi = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: 'museo goya' });
  const goya = multi.find(r => r.poiId === 7);
  check('"museo goya" finds POI #7 (Goya) with perfect score', goya && goya.score === 1);
  const partials = multi.filter(r => r.poiId !== 7);
  check('other POIs with only "museo" get partial score 0.5',
    partials.length > 0 && partials.every(r => r.score === 0.5));

  // Accent insensitivity: "museó" should match "museo".
  const accented = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: 'museó' });
  check('"museó" (accented) matches the same POIs as "museo"', accented.length === museo.length);

  // Empty keyword → []
  const empty = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: '' });
  check('empty keyword → []', empty.length === 0);
  const whitespace = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: '   ' });
  check('whitespace keyword → []', whitespace.length === 0);

  // Nonsense keyword → []
  const nonsense = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: 'xyzqwertynope' });
  check('nonsense keyword → []', nonsense.length === 0);

  // Keyword that hits description: "barroca" only appears in POI #1's description
  const desc = KeywordAlgorithm.score(userAtPilar, POIS, { keyword: 'barroca' });
  check('description-only match works (POI #1 "barroca")',
    desc.length === 1 && desc[0].poiId === 1);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=========================================`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`=========================================`);
process.exit(failed === 0 ? 0 : 1);
