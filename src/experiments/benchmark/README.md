# Rule engine latency benchmark (Sprint 5)

Reproduces the rule-firing latency experiment from the R-Rules paper
(ESWA 2024) with a direct comparison between the **native Siddhi** engine
and the **JavaScript** engine developed in Sprint 3.

## What it measures

For a growing number of active Triggering Rules
`nTR ∈ {10, 20, 30, 50, 80, 100, 120, 150, 200}` the harness measures the
per-event latency to evaluate all rules and emit any triggered
recommendations. Levels match Figure 10 of the R-Rules paper (ESWA 2024)
so plots can be superimposed directly.

Two subtly different definitions of "latency" apply:

| Engine  | What the number captures                                        | Includes                                            |
| ------- | --------------------------------------------------------------- | --------------------------------------------------- |
| **JS**  | Pure synchronous evaluation.                                    | `JSON.parse` + evaluate every CR + evaluate every TR. All in the JS thread. |
| **Siddhi** | Round-trip from `sendEvent` to the FinalResults callback.    | React Native bridge (JS → native), Siddhi CEP evaluation, log sink, callback bridge (native → JS). |

The Siddhi number is inherently higher because it includes the bridge
overhead — a fixed part of "using Siddhi from a JS app" that cannot be
removed without instrumenting the native module. The scaling with `nTR`
is what we care about for the comparison.

The Siddhi app used by the harness is **identical to the production one
minus the `window.timeBatch(7 sec)`** — a pass-through query forwards
`Results` to `FinalResults` so `getResult()` returns immediately after
evaluation. The production Siddhi definition is not modified.

## Design decisions

- **Uniform match** — every synthetic CR is built to match every synthetic
  Context, so every TR fires on every event. This is the worst case
  (no branch pruning) and makes latency directly comparable across engines.
- **Determinism** — no RNG. Rules and contexts are pure functions of an
  index, so both engine runs see byte-identical inputs.
- **Warmup** — first 10 events of each level are discarded (JIT warm-up,
  Siddhi query planner priming).
- **Samples** — 50 measured events per level. Big enough for stable p95.
- **Isolation** — the two engine runs happen in separate app sessions
  (change the `RULE_ENGINE` Parameter, restart, run again). This mirrors
  the paper's protocol and avoids cross-engine interference.
- **Safety** — the harness uses `clearSyntheticRules()` by default,
  wiping only rows with `id >= 1_000_000`. User rules are preserved. Pass
  `wipeAll: true` to `runBenchmark()` to clear everything.

## How to run

Both runs need the app to arrive at `Loading.js#prepareSession()` for
the engine to be initialised.

### One-time setup

Temporarily add a call to `runBenchmark()` somewhere that fires after
the app has settled. The simplest place is at the end of
`Loading.js#prepareSession()`:

```js
import {runBenchmark} from '../experiments/benchmark';
// ... after bootstrapRecommendationBridge() and checkEMAvailability():
setTimeout(() => {
  runBenchmark().catch(err => console.error('[bench] failed:', err));
}, 15000);
```

The 15-second delay lets the app finish loading and the JS engine warm up
before we start measuring.

### Run 1 — Siddhi

```js
// Anywhere before app restart (e.g. Metro console, or a temp line):
storeParameter('*', 'SETTINGS', 'RULE_ENGINE', 'siddhi');
```

Restart the app. Wait for `[bench] === runBenchmark finished ===`.
Collect the CSV from logcat:

```sh
adb logcat -s ReactNativeJS:V | grep '\[BENCH_CSV\]'    > siddhi_summary.csv
adb logcat -s ReactNativeJS:V | grep '\[BENCH_SAMPLE\]' > siddhi_samples.csv
```

### Run 2 — JS

```js
storeParameter('*', 'SETTINGS', 'RULE_ENGINE', 'js');
```

Restart the app. Same wait, then:

```sh
adb logcat -s ReactNativeJS:V | grep '\[BENCH_CSV\]'    > js_summary.csv
adb logcat -s ReactNativeJS:V | grep '\[BENCH_SAMPLE\]' > js_samples.csv
```

### After both runs

- Every summary CSV has the same header:
  `engine,nTR,samples,mean_ms,min_ms,max_ms,p50_ms,p95_ms`
- Every samples CSV has:
  `engine,nTR,sampleIdx,latency_ms`

Concatenate the two summaries (or the two samples) into one file for
plotting. The `engine` column identifies which run each row belongs to.

## What NOT to change

- `src/siddhi/**` (the SiddhiQL generators the harness reuses via import).
- The Realm schemas.
- The production `sendEvent` behaviour — the harness measures a separate
  method (`RuleEngine.evaluateSync`) that shares the same evaluators.

## Cleanup after benchmarking

- Remove the temporary `runBenchmark()` call from `Loading.js`.
- Optional: call `clearSyntheticRules()` once to remove any leftover synth
  rules from a crashed run. The harness normally wipes them before each
  level, but if the app crashed mid-run a few might remain (all in the
  `id >= 1_000_000` range, so easy to identify).

## Files in this folder

| File                       | Responsibility                                              |
| -------------------------- | ----------------------------------------------------------- |
| `benchmarkHarness.js`      | Main runner. Sweeps levels, times events, writes CSV rows.  |
| `syntheticRules.js`        | Deterministic CR + TR generator, plus the two cleanup helpers. |
| `syntheticContexts.js`     | Deterministic Context event generator.                      |
| `siddhiAppNoWindow.js`     | Builds the Siddhi app string without `window.timeBatch`.    |
| `stats.js`                 | `summarize(latencies)` → `{mean, min, max, p50, p95}`.      |
| `csv.js`                   | Prefixed log helpers (`[BENCH_CSV]`, `[BENCH_SAMPLE]`).     |
| `index.js`                 | Public re-exports.                                          |
