/**
 * benchmarkHarness.js
 * -----------------------------------------------------------------------------
 * Runs the Siddhi-vs-JS latency benchmark for the active engine (whichever
 * `RULE_ENGINE` Parameter is set to). Design decisions live in the README next
 * to this file; the short version:
 *
 *   - Levels: {10, 20, 50, 100, 150, 200} triggering rules — following the
 *     R-Rules paper (ESWA 2024).
 *   - Warmup: 10 events per level (discarded).
 *   - Measured: 50 events per level (used for stats).
 *   - Match: uniform — every event fires every TR (worst case).
 *   - Determinism: no RNG anywhere; both engine runs see the same rules and
 *     the same events.
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
import {summarize} from './stats';
import {logCSVHeader, logCSVRow, logSample} from './csv';

const DEFAULT_LEVELS = [10, 20, 30, 50, 80, 100, 120, 150, 200];
const DEFAULT_WARMUP = 10;
const DEFAULT_SAMPLES = 50;

// Per-sample safety timeout. The native `waitForResult` has a 20s ceiling,
// which would silently pass through as a "20000 ms latency" if we trusted
// it. If a single sample exceeds this JS-side limit we treat it as a
// diagnostic error, discard it, and keep going. See measureSiddhi().
const SIDDHI_SAMPLE_TIMEOUT_MS = 1000;

// If a level accumulates this many POST-WARMUP timeouts we bail out to
// protect against spending hours in a systemic hang (e.g. the query name
// mismatch we hit once already). Timeouts inside the warmup window are the
// whole point of the warmup — Siddhi needs time to compile large rulesets
// after startApp — so those are only logged, never counted here.
const MAX_TIMEOUTS_PER_LEVEL = 5;

// Adaptive settle time after startApp. Empirically, Siddhi's engine
// initialization scales with the number of triggering rules: nTR=150 needed
// roughly 4 s to become responsive (we saw 4 initial 1s-timeouts). This
// covers up to nTR=200 with margin while staying cheap on small levels.
function computeSettleMs(nTR) {
  return Math.max(500, nTR * 25);
}

// Sentinel returned by measureSiddhi() when the safety timeout wins. Not
// exported: `Symbol` guarantees no collision with any legit numeric result.
const TIMED_OUT = Symbol('siddhi-sample-timeout');

// ---------------------------------------------------------------------------
// Time source. `performance.now()` is available on modern React Native and
// gives sub-millisecond precision. Fall back to Date.now() otherwise (which
// caps precision at ~1 ms — noted in the README).
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
 * @param {Array<number>} [opts.levels]  TR counts to sweep, default [10..200]
 * @param {number}        [opts.warmup]  events discarded per level
 * @param {number}        [opts.samples] measured events per level
 * @param {boolean}       [opts.wipeAll] if true, use clearAllRules() (dangerous)
 * @returns {Promise<Array<Object>>} one summary object per level (also logged as CSV)
 */
export async function runBenchmark({
  levels = DEFAULT_LEVELS,
  warmup = DEFAULT_WARMUP,
  samples = DEFAULT_SAMPLES,
  wipeAll = false,
} = {}) {
  const engineId = getActiveEngineId();
  const engine = getEngine();
  const clearFn = wipeAll ? clearAllRules : clearSyntheticRules;

  console.log(
    `[bench] === runBenchmark start (engine=${engineId}, warmup=${warmup}, samples=${samples}) ===`,
  );
  logCSVHeader();

  const results = [];
  for (const nTR of levels) {
    console.log(`[bench] --- level nTR=${nTR} ---`);

    // 1. Reset synthetic rules from the previous level.
    clearFn();

    // 2. Generate a fresh ruleset for this level. nCR grows with nTR so every
    // TR has enough CRs to combine — pattern from the paper.
    const nCR = Math.max(20, nTR);
    const {contextRules, triggeringRules} = generateSyntheticRules({nCR, nTR});

    // 3. (Re)start the engine with the fresh ruleset.
    engine.stopApp();
    if (engineId === 'js') {
      engine.startApp();                                         // reads Realm
    } else {
      engine.startApp(buildBenchmarkSiddhiApp(contextRules, triggeringRules));
    }

    // 4. Give the engine a moment to become ready. Siddhi in particular
    //    parses the app string on a native thread; measuring the very first
    //    event would include compile time and skew the min statistic. Time
    //    scales with the ruleset size (see computeSettleMs).
    if (engineId !== 'js') {
      const settleMs = computeSettleMs(nTR);
      console.log(`[bench] settling ${settleMs}ms for Siddhi compile`);
      await new Promise(res => setTimeout(res, settleMs));
    }

    // 5. Deterministically build all events up front so per-event allocation
    //    is not part of the measured section.
    const events = [];
    for (let i = 0; i < warmup + samples; i++) {
      events.push(JSON.stringify(buildSyntheticContext(i, contextRules)));
    }

    // 6. Measure each event; discard the first `warmup`.
    //    Timeout policy:
    //      - Warmup timeouts are informational only (engine compile still in
    //        progress → that's the whole point of the warmup window).
    //      - Post-warmup timeouts count toward MAX_TIMEOUTS_PER_LEVEL and
    //        abort the level when the limit is hit.
    const latencies = [];
    let warmupTimeouts = 0;
    let measuredTimeouts = 0;
    let levelAborted = false;
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
            `[bench] warmup timeout (>${SIDDHI_SAMPLE_TIMEOUT_MS}ms)  ` +
              `engine=${engineId} nTR=${nTR} eventIdx=${i}  ` +
              `(absorbed by warmup, warmup timeouts=${warmupTimeouts})`,
          );
        } else {
          measuredTimeouts++;
          console.error(
            `[bench] TIMEOUT >${SIDDHI_SAMPLE_TIMEOUT_MS}ms  ` +
              `engine=${engineId} nTR=${nTR} eventIdx=${i} sampleIdx=${i - warmup}  ` +
              `(sample discarded, post-warmup timeouts=${measuredTimeouts})`,
          );
          if (measuredTimeouts >= MAX_TIMEOUTS_PER_LEVEL) {
            console.error(
              `[bench] ${MAX_TIMEOUTS_PER_LEVEL} post-warmup timeouts on nTR=${nTR}, aborting level`,
            );
            levelAborted = true;
            break;
          }
        }
        continue;
      }

      if (i >= warmup) {
        const sampleIdx = i - warmup;
        latencies.push(lat);
        logSample(engineId, nTR, sampleIdx, lat);
      }
    }

    if (levelAborted || latencies.length === 0) {
      console.warn(
        `[bench] level nTR=${nTR} skipped in CSV output ` +
          `(latencies=${latencies.length}, warmup timeouts=${warmupTimeouts}, measured timeouts=${measuredTimeouts})`,
      );
      continue;
    }
    if (warmupTimeouts > 0) {
      console.log(
        `[bench] level nTR=${nTR} absorbed ${warmupTimeouts} warmup timeout(s) — informational only`,
      );
    }

    // 7. Summarize and log the aggregated row.
    const stats = summarize(latencies);
    logCSVRow(engineId, nTR, stats);
    results.push({engine: engineId, nTR, ...stats});

    console.log(
      `[bench] level nTR=${nTR} done  ` +
        `mean=${stats.mean.toFixed(3)}ms  ` +
        `p50=${stats.p50.toFixed(3)}ms  ` +
        `p95=${stats.p95.toFixed(3)}ms`,
    );
  }

  console.log('[bench] === runBenchmark finished ===');
  return results;
}

// ---------------------------------------------------------------------------
// Per-event measurement — differs per engine (see README for rationale).
// ---------------------------------------------------------------------------

/**
 * JS engine: pure synchronous evaluation. Measures JSON.parse + CR eval + TR
 * eval, all in-process, single-threaded.
 *
 * We call the JsEngine singleton directly (not `engine` which is whatever
 * `getEngine()` returned) so that even in the pathological case where the
 * adapter cache disagrees, we always measure the JS engine when engineId=='js'.
 */
function measureJs(jsonStr) {
  const t0 = now();
  JsEngine.evaluateSync(jsonStr);
  return now() - t0;
}

/**
 * Siddhi engine: measured as the round-trip from `sendEvent` to the callback
 * firing on FinalResults. Includes the React Native bridge overhead, which is
 * a fixed part of "using Siddhi from JS" and cannot be separated from JS
 * without instrumenting the native module. See README.
 *
 * Wrapped in a Promise.race against a JS-side safety timeout: if the native
 * getResult callback doesn't fire within SIDDHI_SAMPLE_TIMEOUT_MS we resolve
 * with the TIMED_OUT sentinel instead of waiting up to 20 s (the native
 * `waitForResult` ceiling). The pending native thread will still fire its
 * callback eventually — that resolve is a no-op on the Promise we already
 * settled, which is safe. Callers must check for the sentinel.
 */
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
