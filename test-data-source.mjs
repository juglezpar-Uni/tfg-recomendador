/**
 * test-data-source.mjs
 * -----------------------------------------------------------------------------
 * Verifies the pure helpers of src/dataSource/ZaragozaDataSource.js.
 *
 * The internal helpers (buildPOIsQuery, escapeSPARQLLiteral,
 * parseCoordsFromGeom, uriToIntId, mergeBindingsByURI) are RE-IMPLEMENTED
 * inline (mirroring the production source) so this script can run with
 *     node test-data-source.mjs
 * without React Native or Realm being loadable. Keep both copies in sync if
 * the production source is tweaked.
 *
 * NOT covered here (integration surface):
 *   - executeSPARQL     — real HTTP GET against datos.zaragoza.es
 *   - syncPOIs          — Realm write side-effect
 * Both are validated by the on-device verification described in the memoria.
 * -----------------------------------------------------------------------------
 */

// ===========================================================================
// Inlined constants and helpers (mirror of src/dataSource/ZaragozaDataSource.js)
// ===========================================================================

const TURISMO_URI_PREFIX = 'http://www.zaragoza.es/api/recurso/turismo/';
const WGS84_GEOM_PREFIX  = 'http://www.zaragoza.es/api/recurso/geometry/WGS84/';

function escapeSPARQLLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildPOIsQuery(limit, keyword) {
  const keywordFilter = keyword
    ? `FILTER(CONTAINS(LCASE(STR(?name)), LCASE("${escapeSPARQLLiteral(keyword)}")))`
    : '';
  return `
    PREFIX geo:  <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT DISTINCT ?uri ?type ?name ?geom ?description WHERE {
      ?uri a ?type ;
           geo:geometry ?geom ;
           rdfs:label ?name .
      FILTER(STRSTARTS(STR(?uri), "${TURISMO_URI_PREFIX}"))
      FILTER(STRSTARTS(STR(?geom), "${WGS84_GEOM_PREFIX}"))
      OPTIONAL { ?uri rdfs:comment ?description . }
      ${keywordFilter}
    }
    LIMIT ${limit}
  `;
}

function parseCoordsFromGeom(geomUri) {
  if (typeof geomUri !== 'string') return null;
  const m = /WGS84\/(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)/.exec(geomUri);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return [lat, lon];
}

function uriToIntId(uri) {
  const tailMatch = /(\d+)\/?$/.exec(uri);
  if (tailMatch) {
    const parsed = parseInt(tailMatch[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  let hash = 5381;
  for (let i = 0; i < uri.length; i++) {
    hash = ((hash << 5) + hash + uri.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

function mergeBindingsByURI(bindings) {
  const byUri = new Map();
  for (const binding of bindings) {
    const uri = binding.uri?.value;
    const name = binding.name?.value;
    const geom = binding.geom?.value;
    if (!uri || !name || !geom) continue;

    const coords = parseCoordsFromGeom(geom);
    if (!coords) continue;

    const type = binding.type?.value ?? '';
    const description = binding.description?.value ?? null;
    const photoUrl = binding.photo?.value ?? null;

    const existing = byUri.get(uri);
    if (!existing) {
      byUri.set(uri, {
        id: uriToIntId(uri),
        name,
        latitude: coords[0],
        longitude: coords[1],
        type,
        description,
        photoUrl,
        source: 'zaragoza',
        lastUpdated: new Date(),
      });
      continue;
    }

    const types = new Set(existing.type ? existing.type.split(';') : []);
    if (type) types.add(type);
    existing.type = Array.from(types).join(';');

    if (!existing.description && description) existing.description = description;
    if (!existing.photoUrl && photoUrl) existing.photoUrl = photoUrl;
  }
  return Array.from(byUri.values());
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
// Tests — escapeSPARQLLiteral  (3)
// ===========================================================================
section('escapeSPARQLLiteral');
{
  check('escapes backslashes',           escapeSPARQLLiteral('a\\b') === 'a\\\\b');
  check('escapes double quotes',         escapeSPARQLLiteral('a"b')  === 'a\\"b');
  check('leaves normal text unchanged',  escapeSPARQLLiteral('museo') === 'museo');
}

// ===========================================================================
// Tests — buildPOIsQuery  (5)
// ===========================================================================
section('buildPOIsQuery');
{
  const q1 = buildPOIsQuery(500);
  check('includes LIMIT clause',                q1.includes('LIMIT 500'));
  check('filters by turismo URI prefix',        q1.includes(TURISMO_URI_PREFIX));
  check('filters by WGS84 geometry prefix',     q1.includes(WGS84_GEOM_PREFIX));
  check('without keyword: no CONTAINS filter',  !q1.includes('CONTAINS'));

  const q2 = buildPOIsQuery(100, 'museo');
  check('with keyword: adds CONTAINS filter',
    q2.includes('CONTAINS(LCASE(STR(?name)), LCASE("museo"))'));
}

// ===========================================================================
// Tests — parseCoordsFromGeom  (7)
// ===========================================================================
section('parseCoordsFromGeom');
{
  const std = parseCoordsFromGeom('http://foo/WGS84/41.649273_-0.899797');
  check('parses standard WGS84 URI',
    std !== null && std[0] === 41.649273 && std[1] === -0.899797);

  const negLat = parseCoordsFromGeom('http://foo/WGS84/-41.5_10.0');
  check('parses negative latitude',
    negLat !== null && negLat[0] === -41.5 && negLat[1] === 10.0);

  const posLon = parseCoordsFromGeom('http://foo/WGS84/40.0_10.5');
  check('parses positive longitude with decimals',
    posLon !== null && posLon[0] === 40.0 && posLon[1] === 10.5);

  const bothNeg = parseCoordsFromGeom('http://foo/WGS84/-40.5_-10.5');
  check('parses both negative',
    bothNeg !== null && bothNeg[0] === -40.5 && bothNeg[1] === -10.5);

  check('returns null for URI without WGS84 pattern',
    parseCoordsFromGeom('http://foo/bar/baz') === null);

  check('returns null for WGS84 URI with only text',
    parseCoordsFromGeom('http://foo/WGS84/nolat_nolon') === null);

  check('returns null for WGS84 URI with only one number',
    parseCoordsFromGeom('http://foo/WGS84/41.649273') === null);
}

// ===========================================================================
// Tests — uriToIntId  (5)
// ===========================================================================
section('uriToIntId');
{
  check('extracts trailing numeric ID',
    uriToIntId('http://www.zaragoza.es/api/recurso/turismo/restaurante/1060') === 1060);

  check('extracts trailing numeric ID even with trailing slash',
    uriToIntId('http://www.zaragoza.es/api/recurso/turismo/monumento/42/') === 42);

  const noNum = uriToIntId('http://foo/bar/no-numbers-here');
  check('falls back to positive integer hash when no trailing digits',
    typeof noNum === 'number' && Number.isInteger(noNum) && noNum > 0);

  check('hash is deterministic (same URI → same id)',
    uriToIntId('http://foo/bar') === uriToIntId('http://foo/bar'));

  check('hash differs for different URIs',
    uriToIntId('http://foo/bar') !== uriToIntId('http://baz/qux'));
}

// ===========================================================================
// Tests — mergeBindingsByURI  (10)
// ===========================================================================
section('mergeBindingsByURI');
{
  check('empty bindings → empty array',
    mergeBindingsByURI([]).length === 0);

  const single = mergeBindingsByURI([{
    uri:  { value: 'http://www.zaragoza.es/api/recurso/turismo/monumento/1' },
    name: { value: 'Basilica del Pilar' },
    geom: { value: 'http://foo/WGS84/41.6497_-0.8785' },
    type: { value: 'http://type/monumento' },
  }]);
  check('single valid binding → single POI',
    single.length === 1 && single[0].name === 'Basilica del Pilar');
  check('single binding: coords + id parsed correctly',
    single[0].latitude === 41.6497 && single[0].longitude === -0.8785 && single[0].id === 1);

  check('skips binding without URI',
    mergeBindingsByURI([{
      name: { value: 'X' },
      geom: { value: 'http://foo/WGS84/1_1' },
    }]).length === 0);

  check('skips binding without name',
    mergeBindingsByURI([{
      uri:  { value: 'http://x/2' },
      geom: { value: 'http://foo/WGS84/1_1' },
    }]).length === 0);

  check('skips binding without geom',
    mergeBindingsByURI([{
      uri:  { value: 'http://x/3' },
      name: { value: 'B' },
    }]).length === 0);

  check('skips binding with invalid geometry pattern',
    mergeBindingsByURI([{
      uri:  { value: 'http://x/4' },
      name: { value: 'C' },
      geom: { value: 'http://foo/no-wgs84-here' },
    }]).length === 0);

  const merged = mergeBindingsByURI([
    { uri: { value: 'http://x/5' }, name: { value: 'D' }, geom: { value: 'http://foo/WGS84/1_1' }, type: { value: 'http://t/monumento' } },
    { uri: { value: 'http://x/5' }, name: { value: 'D' }, geom: { value: 'http://foo/WGS84/1_1' }, type: { value: 'http://t/iglesia' } },
  ]);
  check('merges bindings with same URI into one POI',
    merged.length === 1);
  check('merges types into ";"-separated string',
    merged[0].type === 'http://t/monumento;http://t/iglesia');

  const desc = mergeBindingsByURI([
    { uri: { value: 'http://x/6' }, name: { value: 'E' }, geom: { value: 'http://foo/WGS84/1_1' }, type: { value: 't1' }, description: { value: 'first desc' } },
    { uri: { value: 'http://x/6' }, name: { value: 'E' }, geom: { value: 'http://foo/WGS84/1_1' }, type: { value: 't2' }, description: { value: 'second desc' } },
  ]);
  check('keeps FIRST non-empty description',
    desc[0].description === 'first desc');
}

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=========================================`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`=========================================`);
process.exit(fail === 0 ? 0 : 1);
