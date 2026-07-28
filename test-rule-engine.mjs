/**
 * test-rule-engine.mjs
 * -----------------------------------------------------------------------------
 * Verifies the Sprint 3 JS rule engine in plain Node, no Realm.
 *
 * The evaluators, dispatcher, triggering logic, results aggregator and bridge
 * are RE-IMPLEMENTED inline (mirroring src/ruleEngine/**) so this script can
 * run with `node test-rule-engine.mjs`. Keep both copies in sync if you tweak
 * the production sources.
 *
 * Run with:  node test-rule-engine.mjs
 * -----------------------------------------------------------------------------
 */

// ===========================================================================
// Inlined evaluators
// ===========================================================================

function toSecondsOfDay(hms) {
  if (!hms || typeof hms !== 'string') return NaN;
  const parts = hms.split(':').map(p => parseInt(p, 10));
  if (parts.some(n => Number.isNaN(n))) return NaN;
  const [h = 0, m = 0, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

function evalTime(rule, uc) {
  const now = toSecondsOfDay(uc?.time);
  const start = toSecondsOfDay(rule?.startTime);
  const end = toSecondsOfDay(rule?.endTime);
  if ([now, start, end].some(Number.isNaN)) return false;
  return now >= start && now < end;
}

const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function parseDDMMYYYY(s) {
  if (!s || typeof s !== 'string') return null;
  const [d, m, y] = s.split('/').map(p => parseInt(p, 10));
  if ([d, m, y].some(Number.isNaN)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}
function evalCalendar(rule, uc) {
  const date = parseDDMMYYYY(uc?.date);
  if (!date) return false;
  const days = (rule?.daysOfWeek ?? []).filter(d => d?.checked).map(d => d.key);
  if (days.length === 0) return false;
  if (!days.includes(WEEKDAYS[date.getUTCDay()])) return false;
  const valid = rule?.startDate && rule?.endDate &&
    rule.startDate !== '__/__/__' && rule.endDate !== '__/__/__';
  if (valid) {
    const s = parseDDMMYYYY(rule.startDate);
    const e = parseDDMMYYYY(rule.endDate);
    if (!s || !e) return false;
    if (date < s || date > e) return false;
  }
  return true;
}

function evalWeather(rule, _uc, obs = []) {
  const ks = (rule?.weatherStatus ?? []).filter(w => w?.checked).map(w => w.key);
  if (ks.length === 0) return false;
  const min = +rule?.minTemp, max = +rule?.maxTemp;
  if (Number.isNaN(min) || Number.isNaN(max)) return false;
  for (const o of obs) {
    if (o?.observedProperty !== 'Weather') continue;
    if (!ks.includes(o.observationValue)) continue;
    const t = parseFloat(o.optionalField);
    if (Number.isNaN(t)) continue;
    if (t >= min && t <= max) return true;
  }
  return false;
}

function evalLocation(rule, _uc, obs = []) {
  const limit = parseInt(rule?.locationError, 10);
  if (Number.isNaN(limit) || !rule?.name) return false;
  for (const o of obs) {
    if (o?.observedProperty !== 'Location') continue;
    if (o.optionalField !== rule.name) continue;
    const d = parseInt(o.observationValue, 10);
    if (Number.isNaN(d)) continue;
    if (d <= limit) return true;
  }
  return false;
}

const M2P = { temperature: 'Temperature', co2: 'CO2', humidity: 'Humidity' };
function cmp(l, op, r) {
  switch (op) {
    case '>': return l > r;
    case '<': return l < r;
    case '=': case '==': return l === r;
    case '>=': return l >= r;
    case '<=': return l <= r;
    case '!=': return l !== r;
    default: return false;
  }
}
function evalServer(rule, _uc, obs = []) {
  const prop = M2P[rule?.measurement];
  if (!prop) return false;
  const th = parseFloat(rule.value);
  if (Number.isNaN(th)) return false;
  for (const o of obs) {
    if (o?.observedProperty !== prop) continue;
    if (o.observationValue !== rule.server) continue;
    const m = parseFloat(o.optionalField);
    if (Number.isNaN(m)) continue;
    if (cmp(m, rule.comparator, th)) return true;
  }
  return false;
}

const EVAL = {
  'Time-Based': evalTime, 'Calendar-Based': evalCalendar,
  'Weather': evalWeather, 'Location': evalLocation, 'Server-Based': evalServer,
};
function evalCR(rule, uc, obs) { return EVAL[rule.type]?.(rule, uc, obs) ?? false; }

function evalTR(tr, crEvals) {
  if (!tr.switchState) return false;
  const crs = Object.values(tr.contextRules ?? {});
  const deny = tr.denyContextRule ?? [];
  if (crs.length === 0) return false;
  for (let i = 0; i < crs.length; i++) {
    const matched = crEvals[crs[i].name] === true;
    const negated = deny[i] === true;
    if (negated ? matched : !matched) return false;
  }
  return true;
}

// ===========================================================================
// Inlined ResultsAggregator
// ===========================================================================

class Aggregator {
  constructor(windowMs = 7000) {
    this.windowMs = windowMs;
    this.buckets = new Map();
    this.timer = null;
    this.queue = [];
  }
  push(cid, rt) {
    if (!cid || !rt) return;
    let s = this.buckets.get(cid);
    if (!s) { s = new Set(); this.buckets.set(cid, s); }
    s.add(rt);
    if (this.timer == null) this.timer = setTimeout(() => this._flush(), this.windowMs);
  }
  _flush() {
    this.timer = null;
    for (const [cid, set] of this.buckets) {
      this.queue.push([cid, ...set].join(','));
    }
    this.buckets.clear();
  }
  flushNow() {
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    this._flush();
  }
  getNext() { return this.queue.shift() ?? ''; }
}

// ===========================================================================
// Inlined RuleEngine (just the bits we test)
// ===========================================================================

function makeEngine(crs, trs, agg) {
  let stopped = false;
  return {
    sendEvent(json) {
      if (stopped) return;
      const ev = typeof json === 'string' ? JSON.parse(json) : json;
      const uc = ev.UserContext, obs = ev.Observations ?? [];
      const evals = {};
      for (const c of crs) evals[c.name] = evalCR(c, uc, obs);
      for (const t of trs) {
        if (evalTR(t, evals)) {
          agg.push(uc.contextId, t.recommendationType);
        }
      }
    },
    stop() { stopped = true; },
  };
}

// ===========================================================================
// Tiny harness
// ===========================================================================
let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}${detail ? '  → ' + detail : ''}`); fail++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// ===========================================================================
// Tests — Time-Based
// ===========================================================================
section('Time-Based evaluator');
{
  const rule = { type: 'Time-Based', name: 'Lunch', startTime: '12:00', endTime: '15:00' };
  check('inside [12:00, 15:00) → match',  evalCR(rule, { time: '13:30:00' }, []));
  check('exactly start (12:00) → match',  evalCR(rule, { time: '12:00:00' }, []));
  check('exactly end (15:00) → no match', !evalCR(rule, { time: '15:00:00' }, []));
  check('before start → no match',        !evalCR(rule, { time: '11:59:59' }, []));
  check('after end → no match',           !evalCR(rule, { time: '15:00:01' }, []));
  check('garbage time → no match',        !evalCR(rule, { time: 'not-a-time' }, []));
}

// ===========================================================================
// Tests — Calendar-Based
// ===========================================================================
section('Calendar-Based evaluator');
{
  // 06/05/2026 is a Wednesday.
  const days = [
    { key: 'Monday', checked: true },
    { key: 'Wednesday', checked: true },
    { key: 'Friday', checked: false },
  ];
  const rule = {
    type: 'Calendar-Based', name: 'WorkDays', daysOfWeek: days,
    startDate: '__/__/__', endDate: '__/__/__',
  };
  check('Wednesday matches', evalCalendar(rule, { date: '06/05/2026' }));
  check('Tuesday does not',  !evalCalendar(rule, { date: '05/05/2026' }));
  check('Friday (unchecked) does not', !evalCalendar(rule, { date: '08/05/2026' }));

  const ranged = { ...rule, startDate: '01/05/2026', endDate: '31/05/2026' };
  check('Wednesday inside date range', evalCalendar(ranged, { date: '06/05/2026' }));
  const outside = { ...rule, startDate: '01/06/2026', endDate: '30/06/2026' };
  check('Wednesday but outside date range → no match',
    !evalCalendar(outside, { date: '06/05/2026' }));

  const noDays = { ...rule, daysOfWeek: [{ key: 'Monday', checked: false }] };
  check('no checked days → no match', !evalCalendar(noDays, { date: '06/05/2026' }));
  check('garbage date → no match', !evalCalendar(rule, { date: '99/99/9999' }));
}

// ===========================================================================
// Tests — Weather
// ===========================================================================
section('Weather evaluator');
{
  const rule = {
    type: 'Weather', name: 'NicePlace',
    weatherStatus: [{ key: 'Clear', checked: true }, { key: 'Clouds', checked: true }, { key: 'Rain', checked: false }],
    minTemp: 15, maxTemp: 30,
  };
  const obs = [{ observedProperty: 'Weather', observationValue: 'Clear', optionalField: '22' }];
  check('Clear, 22°C → match', evalWeather(rule, null, obs));
  check('Clouds, 16°C → match', evalWeather(rule, null, [{ observedProperty: 'Weather', observationValue: 'Clouds', optionalField: '16' }]));
  check('Rain (unchecked) → no match', !evalWeather(rule, null, [{ observedProperty: 'Weather', observationValue: 'Rain', optionalField: '20' }]));
  check('Clear, 5°C (below min) → no match', !evalWeather(rule, null, [{ observedProperty: 'Weather', observationValue: 'Clear', optionalField: '5' }]));
  check('Clear, 35°C (above max) → no match', !evalWeather(rule, null, [{ observedProperty: 'Weather', observationValue: 'Clear', optionalField: '35' }]));
  check('no Weather observation in tick → no match', !evalWeather(rule, null, [{ observedProperty: 'Location', optionalField: 'X', observationValue: '0' }]));
}

// ===========================================================================
// Tests — Location
// ===========================================================================
section('Location evaluator');
{
  const rule = { type: 'Location', name: 'Home', locationError: 100 };
  check('distance 50m to Home → match',
    evalLocation(rule, null, [{ observedProperty: 'Location', optionalField: 'Home', observationValue: '50' }]));
  check('distance 100m (boundary) → match',
    evalLocation(rule, null, [{ observedProperty: 'Location', optionalField: 'Home', observationValue: '100' }]));
  check('distance 101m → no match',
    !evalLocation(rule, null, [{ observedProperty: 'Location', optionalField: 'Home', observationValue: '101' }]));
  check('different name (Office) → no match',
    !evalLocation(rule, null, [{ observedProperty: 'Location', optionalField: 'Office', observationValue: '0' }]));
  check('several Location obs, one matches → match',
    evalLocation(rule, null, [
      { observedProperty: 'Location', optionalField: 'Office', observationValue: '0' },
      { observedProperty: 'Location', optionalField: 'Home', observationValue: '20' },
    ]));
}

// ===========================================================================
// Tests — Server-Based
// ===========================================================================
section('Server-Based evaluator');
{
  const ruleCO2 = { type: 'Server-Based', name: 'StuffyRoom', measurement: 'co2', server: 'sensorizar', comparator: '>', value: 1000 };
  check('CO2 > 1000 (1500) → match',
    evalServer(ruleCO2, null, [{ observedProperty: 'CO2', observationValue: 'sensorizar', optionalField: '1500' }]));
  check('CO2 > 1000 (800)  → no match',
    !evalServer(ruleCO2, null, [{ observedProperty: 'CO2', observationValue: 'sensorizar', optionalField: '800' }]));
  check('different server → no match',
    !evalServer(ruleCO2, null, [{ observedProperty: 'CO2', observationValue: 'other-server', optionalField: '1500' }]));

  const ruleTemp = { type: 'Server-Based', name: 'Cold', measurement: 'temperature', server: 'sensorizar', comparator: '<', value: 18 };
  check('Temp < 18 (15) → match',
    evalServer(ruleTemp, null, [{ observedProperty: 'Temperature', observationValue: 'sensorizar', optionalField: '15' }]));

  const ruleHum = { type: 'Server-Based', name: 'Humid', measurement: 'humidity', server: 'sensorizar', comparator: '=', value: 60 };
  check('Humidity = 60 (60) → match',
    evalServer(ruleHum, null, [{ observedProperty: 'Humidity', observationValue: 'sensorizar', optionalField: '60' }]));
}

// ===========================================================================
// Tests — Triggering Rule (AND with NOT)
// ===========================================================================
section('TriggeringRule AND with NOT');
{
  const lunch = { name: 'Lunch', type: 'Time-Based' };
  const home  = { name: 'Home',  type: 'Location' };

  // Scenario 1: TR with two normal CRs, both match.
  const tr1 = {
    name: 'Restaurants', recommendationType: 'Restaurants',
    switchState: true, contextRules: [lunch, home], denyContextRule: [false, false],
  };
  check('TR fires when both CRs match', evalTR(tr1, { Lunch: true, Home: true }));
  check('TR does NOT fire if one CR fails', !evalTR(tr1, { Lunch: true, Home: false }));

  // Scenario 2: TR with a negated CR.
  const tr2 = {
    name: 'NotAtHomeReco', recommendationType: 'TouristAttractions',
    switchState: true, contextRules: [lunch, home], denyContextRule: [false, true],
  };
  check('TR with NOT(home) fires when not at home', evalTR(tr2, { Lunch: true, Home: false }));
  check('TR with NOT(home) does NOT fire when at home', !evalTR(tr2, { Lunch: true, Home: true }));

  // Scenario 3: switchState off.
  const tr3 = { ...tr1, switchState: false };
  check('TR with switchState=false never fires', !evalTR(tr3, { Lunch: true, Home: true }));

  // Scenario 4: empty contextRules.
  const tr4 = { name: 'Empty', recommendationType: 'X', switchState: true, contextRules: [], denyContextRule: [] };
  check('TR with no CRs never fires', !evalTR(tr4, {}));
}

// ===========================================================================
// Tests — End-to-end engine + aggregator
// ===========================================================================
section('Engine + ResultsAggregator (7s window)');
{
  // CRs.
  const lunch = { type: 'Time-Based', name: 'Lunch', startTime: '12:00', endTime: '15:00' };
  const home  = { type: 'Location', name: 'Home', locationError: 100 };
  const sunny = { type: 'Weather', name: 'Sunny',
    weatherStatus: [{ key: 'Clear', checked: true }], minTemp: 10, maxTemp: 35 };

  // TRs.
  const restaurants = {
    name: 'TR_Restaurants', recommendationType: 'Restaurants', switchState: true,
    contextRules: [lunch, home], denyContextRule: [false, false],
  };
  const outdoor = {
    name: 'TR_Outdoor', recommendationType: 'OutdoorActivities', switchState: true,
    contextRules: [lunch, sunny], denyContextRule: [false, false],
  };
  const inactive = {
    name: 'TR_Off', recommendationType: 'NEVER', switchState: false,
    contextRules: [lunch], denyContextRule: [false],
  };

  const agg = new Aggregator(7000);
  const engine = makeEngine([lunch, home, sunny], [restaurants, outdoor, inactive], agg);

  // Tick #1 — lunchtime, at home, sunny → both restaurants AND outdoor fire.
  engine.sendEvent(JSON.stringify({
    UserContext: { contextId: 'ctx-1', date: '06/05/2026', time: '13:00:00' },
    Observations: [
      { observedProperty: 'Location', optionalField: 'Home', observationValue: '20' },
      { observedProperty: 'Weather', observationValue: 'Clear', optionalField: '22' },
    ],
  }));

  // Tick #2 — same contextId, repeat (dedup test).
  engine.sendEvent(JSON.stringify({
    UserContext: { contextId: 'ctx-1', date: '06/05/2026', time: '13:00:30' },
    Observations: [
      { observedProperty: 'Location', optionalField: 'Home', observationValue: '20' },
      { observedProperty: 'Weather', observationValue: 'Clear', optionalField: '22' },
    ],
  }));

  // Tick #3 — different contextId, different time (after lunch) → nothing fires.
  engine.sendEvent(JSON.stringify({
    UserContext: { contextId: 'ctx-2', date: '06/05/2026', time: '17:00:00' },
    Observations: [{ observedProperty: 'Location', optionalField: 'Home', observationValue: '20' }],
  }));

  agg.flushNow();
  const r1 = agg.getNext();
  const r2 = agg.getNext();
  const r3 = agg.getNext();

  check('first emit is for ctx-1', r1.startsWith('ctx-1,'), `got "${r1}"`);
  check('ctx-1 batch contains Restaurants', r1.includes('Restaurants'));
  check('ctx-1 batch contains OutdoorActivities', r1.includes('OutdoorActivities'));
  check('ctx-1 dedups despite two ticks',
    r1.split(',').filter(t => t === 'Restaurants').length === 1);
  check('inactive TR never appears', !r1.includes('NEVER') && !r2.includes('NEVER'));
  check('ctx-2 produced no recommendations (time outside lunch)', r2 === '');
  check('queue is now empty', r3 === '');
}

// ===========================================================================
// Tests — RecommendationBridge wiring
// ===========================================================================
section('RecommendationBridge (notify + map)');
{
  // Inline mini-bridge (mirrors src/ruleEngine/RecommendationBridge.js).
  const subs = new Set();
  let typeMap = {};
  const onTrig = cb => subs.add(cb);
  const notify = p => { for (const cb of subs) try { cb(p); } catch {} };
  const setMap = m => { typeMap = { ...m }; };
  const lookupAlgo = t => typeMap[t] ?? null;

  const seen = [];
  onTrig(p => seen.push(p));

  notify({ contextId: 'a', recommendationType: 'Restaurants' });
  notify({ contextId: 'b', recommendationType: 'Museums' });

  check('subscriber receives every notify', seen.length === 2);
  check('payload preserved', seen[0].contextId === 'a' && seen[1].recommendationType === 'Museums');

  setMap({ Restaurants: 'closeness', Museums: 'keyword' });
  check('algorithm lookup works (Restaurants → closeness)', lookupAlgo('Restaurants') === 'closeness');
  check('algorithm lookup returns null when unmapped', lookupAlgo('Unknown') === null);
}

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=========================================`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`=========================================`);
process.exit(fail === 0 ? 0 : 1);
