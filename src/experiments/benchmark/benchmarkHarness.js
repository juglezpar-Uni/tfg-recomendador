/**
 * benchmarkHarness.js
 * -----------------------------------------------------------------------------
 * Runs the Siddhi-vs-JS latency benchmark for the active engine (whichever
 * `RULE_ENGINE` Parameter is set to). Design decisions live in the README next
 * to this file; the short version:
 *
 *   - Levels: {10, 20, 30, 50, 80, 100, 120, 150, 200} triggering rules —
 *     matching Figure 10 of the R-Rules paper (ESWA 2024).
 *   - Global warmup: BEFORE the timed sweep starts, we send 30 events against
 *     a nTR=50 ruleset and discard the results. This warms the JIT / bridge
 *     / caches so the first measured level is not biased by cold-start
 *     effects.
 *   - Per-level warmup: 10 events per level (discarded).
 *   - Per-level samples: 50 events per level (used for the level mean).
 *   - Repetitions: the whole level sweep runs `reps` times (default 10),
 *     producing `reps` means per level. Cross-repetition aggregation gives us
 *     mean±CI95 via Student-t.
 *   - Match: uniform — every event fires every TR (worst case).
 *   - Determinism: no RNG anywhere; both engines see byte-identical rules and
 *     events on every rep.
 *   - Cleanup: only synthetic rules (id >= SYNTHETIC_ID_BASE) are wiped unless
 *     `wipeAll: true` is passed.
 * -----------------------------------------------------------------------------
 */

import {NativeModules} from 'react-native';
import {
  getEngine,
  getActiveEngineId,
} from '../../background/ruleEngineAdapter';
import JsEngine from '../../ruleEngine/RuleEngine';

import {
  generateSyntheticRules,
  clearSyntheticRules,
  clearAllRules,
} from './syntheticRules';
import {buildSyntheticContext} from './syntheticContexts';
import {buildBenchmarkSiddhiApp} from './siddhiAppNoWindow';
import {summarize, aggregateReps} from './stats';
import {logCSVHeader, logCSVRow, logRepRow} from './csv';

const DEFAULT_LEVELS = [10, 20, 30, 50, 80, 100, 120, 150, 200];
const DEFAULT_WARMUP = 10;
const DEFAULT_SAMPLES = 50;
const DEFAULT_REPS = 10;

// Global warmup applied ONCE before the timed sweep begins. Uses a mid-range
// ruleset so JIT / native bridge / caches are hot without spending 30+ s on
// the largest level.
const GLOBAL_WARMUP_NTR = 50;
const GLOBAL_WARMUP_NCR = 50;
const GLOBAL_WARMUP_EVENTS = 30;

// Per-sample safety timeout. The native `waitForResult` has a 20s ceiling,
// which would silently pass through as a "20000 ms latency" if we trusted
// it. If a single sample exceeds this JS-side limit we treat it as a
// diagnostic error, discard it, and keep going. See measureSiddhi().
const SIDDHI_SAMPLE_TIMEOUT_MS = 1000;

// If a level accumulates this many POST-WARMUP timeouts we bail out to
// protect against spending hours in a systemic hang. Timeouts inside the
// warmup window are the whole point of the warmup — Siddhi needs time to
// compile large rulesets after startApp — so those are only logged.
const MAX_TIMEOUTS_PER_LEVEL = 5;

// Adaptive settle time after startApp. Empirically, Siddhi's engine
// initialization scales with the number of triggering rules; nTR=200 needs
// ~5 s to become responsive.
function computeSettleMs(nTR) {
  return Math.max(500, nTR * 25);
}

// Sentinel returned by measureSiddhi() when the safety timeout wins.
const TIMED_OUT = Symbol('siddhi-sample-timeout');

// ---------------------------------------------------------------------------
// Time source. `performance.now()` is available on modern React Native and
// gives sub-millisecond precision. Fall back to Date.now() otherwise.
// ---------------------------------------------------------------------------

const now =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

// ---------------------------------------------------------------------------
// Siddhi getResult() as a Promise. The native module invokes the callback
// with the next FinalResults emit — since our SiddhiQL has no timeBatch, that
// resolves right after the CEP engine finishes evaluating the current tick.
// ---------------------------------------------------------------------------

function siddhiGetResultAsync() {
  return new Promise(resolve => {
    NativeModules.SiddhiClientModule.getResult(result => resolve(result));
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the benchmark for the currently selected engine.
 *
 * @param {Object} [opts]
 * @param {Array<number>} [opts.levels]   TR counts to sweep, default [10..200]
 * @param {number}        [opts.warmup]   events discarded per level (default 10)
 * @param {number}        [opts.samples]  measured events per level (default 50)
 * @param {number}        [opts.reps]     full-sweep repetitions (default 10)
 * @param {boolean}       [opts.wipeAll]  use clearAllRules() (dangerous) instead
 *                                        of clearSyntheticRules() (safe)
 * @returns {Promise<Array<Object>>} one aggregated summary per level (also logged as CSV)
 */
export async function runBenchmark({
  levels = DEFAULT_LEVELS,
  warmup = DEFAULT_WARMUP,
  samples = DEFAULT_SAMPLES,
  reps = DEFAULT_REPS,
  wipeAll = false,
} = {}) {
  const engineId = getActiveEngineId();
  const engine = getEngine();
  const clearFn = wipeAll ? clearAllRules : clearSyntheticRules;

  console.log(
    `[bench] === runBenchmark start ` +
      `(engine=${engineId}, reps=${reps}, warmup=${warmup}, samples=${samples}) ===`,
  );
  logCSVHeader();

  // -------------------------------------------------------------------------
  // GLOBAL WARMUP — run before any timed measurement so that JIT, native
  // bridge, caches, and Siddhi runtime are all fully warm. Eliminates the
  // cold-start bias that made nTR=10 appear slower than nTR=20 in earlier
  // runs (the first level of the sweep had to pay for engine initialization).
  // -------------------------------------------------------------------------

  await runGlobalWarmup(engineId, engine, clearFn);

  // -------------------------------------------------------------------------
  // MAIN LOOP — reps × levels. We collect the per-rep mean for each level,
  // plus a flat pool of every individual sample across all reps.
  // -------------------------------------------------------------------------

  // nTR -> array of means, one per rep
  const meansByLevel = new Map();
  // nTR -> flat array of every individual sample across all reps
  const samplesByLevel = new Map();

  for (const nTR of levels) {
    meansByLevel.set(nTR, []);
    samplesByLevel.set(nTR, []);
  }

  for (let rep = 1; rep <= reps; rep++) {
    console.log(`[bench] ========= REP ${rep}/${reps} =========`);

    for (const nTR of levels) {
      const result = await runOneLevel({
        rep,
        nTR,
        engineId,
        engine,
        warmup,
        samples,
        clearFn,
      });

      if (result == null) {
        // Level aborted or produced no samples this rep — skip it for this rep,
        // but keep going with other reps and levels.
        continue;
      }

      meansByLevel.get(nTR).push(result.mean);
      samplesByLevel.get(nTR).push(...result.latencies);

      logRepRow(engineId, nTR, rep, result.mean);
    }
  }

  // -------------------------------------------------------------------------
  // AGGREGATION — one row per level, combining cross-rep mean/std/CI95 with
  // pooled distribution stats (min/max/p50/p95 over every sample).
  // -------------------------------------------------------------------------

  const results = [];
  for (const nTR of levels) {
    const means = meansByLevel.get(nTR);
    const pool = samplesByLevel.get(nTR);
    if (means.length === 0) {
      console.warn(
        `[bench] level nTR=${nTR} skipped in aggregated CSV (no successful reps)`,
      );
      continue;
    }
    const agg = aggregateReps(means);
    const pooled = summarize(pool);
    logCSVRow(engineId, nTR, agg, pooled);
    results.push({engine: engineId, nTR, ...agg, ...pooled});

    console.log(
      `[bench] AGGR nTR=${nTR}  ` +
        `n=${agg.n_reps}  ` +
        `mean=${agg.mean.toFixed(3)}ms  ` +
        `std=${agg.std.toFixed(3)}ms  ` +
        `CI95=[${agg.ci95_low.toFixed(3)}, ${agg.ci95_high.toFixed(3)}]ms  ` +
        `p50=${pooled.p50.toFixed(3)}ms  ` +
        `p95=${pooled.p95.toFixed(3)}ms`,
    );
  }

  console.log('[bench] === runBenchmark finished ===');
  return results;
}

// ---------------------------------------------------------------------------
// Global warmup: prime the engine BEFORE any timed measurement.
// Uses a mid-range nTR (50) so we hit realistic code paths without paying
// the settle time of the largest level.
// ---------------------------------------------------------------------------

async function runGlobalWarmup(engineId, engine, clearFn) {
  console.log(
    `[bench] --- global warmup: ${GLOBAL_WARMUP_EVENTS} events at nTR=${GLOBAL_WARMUP_NTR} ---`,
  );

  clearFn();
  const {contextRules, triggeringRules} = generateSyntheticRules({
    nCR: GLOBAL_WARMUP_NCR,
    nTR: GLOBAL_WARMUP_NTR,
  });

  engine.stopApp();
  if (engineId === 'js') {
    engine.startApp();
  } else {
    engine.startApp(buildBenchmarkSiddhiApp(contextRules, triggeringRules));
  }

  if (engineId !== 'js') {
    const settleMs = computeSettleMs(GLOBAL_WARMUP_NTR);
    console.log(`[bench] global warmup settling ${settleMs}ms`);
    await new Promise(res => setTimeout(res, settleMs));
  }

  for (let i = 0; i < GLOBAL_WARMUP_EVENTS; i++) {
    const json = JSON.stringify(buildSyntheticContext(i, contextRules));
    if (engineId === 'js') {
      measureJs(json); // return value discarded
    } else {
      // Discard result; ignore timeouts here since this is warmup.
      await measureSiddhi(json).catch(() => {});
    }
  }

  console.log('[bench] global warmup done');
}

// ---------------------------------------------------------------------------
// runOneLevel — one (rep, nTR) iteration. Loads rules, starts the engine,
// measures `warmup + samples` events, returns { mean, latencies } or null
// if the level aborted.
// ---------------------------------------------------------------------------

async function runOneLevel({rep, nTR, engineId, engine, warmup, samples, clearFn}) {
  console.log(`[bench] rep=${rep} nTR=${nTR}: loading rules`);

  clearFn();
  const nCR = Math.max(20, nTR);
  const {contextRules, triggeringRules} = generateSyntheticRules({nCR, nTR});

  engine.stopApp();
  if (engineId === 'js') {
    engine.startApp();
  } else {
    engine.startApp(buildBenchmarkSiddhiApp(contextRules, triggeringRules));
  }

  if (engineId !== 'js') {
    const settleMs = computeSettleMs(nTR);
    await new Promise(res => setTimeout(res, settleMs));
  }

  // Pre-build all events so per-event allocation is not part of the measured
  // section.
  const events = [];
  for (let i = 0; i < warmup + samples; i++) {
    events.push(JSON.stringify(buildSyntheticContext(i, contextRules)));
  }

  const latencies = [];
  let warmupTimeouts = 0;
  let measuredTimeouts = 0;
  let aborted = false;

  for (let i = 0; i < events.length; i++) {
    const lat =
      engineId === 'js'
        ? measureJs(events[i])
        : await measureSiddhi(events[i]);

    if (lat === TIMED_OUT) {
      const inWarmup = i < warmup;
      if (inWarmup) {
        warmupTimeouts++;
        console.warn(
          `[bench] warmup timeout (>${SIDDHI_SAMPLE_TIMEOUT_MS}ms) ` +
            `rep=${rep} nTR=${nTR} eventIdx=${i} ` +
            `(warmup timeouts=${warmupTimeouts})`,
        );
      } else {
        measuredTimeouts++;
        console.error(
          `[bench] TIMEOUT >${SIDDHI_SAMPLE_TIMEOUT_MS}ms ` +
            `rep=${rep} nTR=${nTR} eventIdx=${i} sampleIdx=${i - warmup} ` +
            `(post-warmup timeouts=${measuredTimeouts})`,
        );
        if (measuredTimeouts >= MAX_TIMEOUTS_PER_LEVEL) {
          console.error(
            `[bench] ${MAX_TIMEOUTS_PER_LEVEL} post-warmup timeouts ` +
              `on rep=${rep} nTR=${nTR}, aborting level`,
          );
          aborted = true;
          break;
        }
      }
      continue;
    }

    if (i >= warmup) {
      latencies.push(lat);
    }
  }

  if (aborted || latencies.length === 0) {
    console.warn(
      `[bench] rep=${rep} nTR=${nTR} skipped ` +
        `(latencies=${latencies.length}, warmup timeouts=${warmupTimeouts}, ` +
        `measured timeouts=${measuredTimeouts})`,
    );
    return null;
  }

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log(
    `[bench] rep=${rep} nTR=${nTR} mean=${mean.toFixed(3)}ms ` +
      `(${latencies.length} samples, warmup timeouts=${warmupTimeouts})`,
  );

  return {mean, latencies};
}

// ---------------------------------------------------------------------------
// Per-event measurement — differs per engine (see README for rationale).
// ---------------------------------------------------------------------------

function measureJs(jsonStr) {
  const t0 = now();
  JsEngine.evaluateSync(jsonStr);
  return now() - t0;
}

async function measureSiddhi(jsonStr) {
  const t0 = now();
  NativeModules.SiddhiClientModule.sendEvent(jsonStr);

  const result = await Promise.race([
    siddhiGetResultAsync(),
    new Promise(resolve =>
      setTimeout(() => resolve(TIMED_OUT), SIDDHI_SAMPLE_TIMEOUT_MS),
    ),
  ]);

  if (result === TIMED_OUT) {
    return TIMED_OUT;
  }
  return now() - t0;
}
