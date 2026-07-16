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

Each level is measured across **`reps` full-sweep repetitions** (default
10). For every level we report the **mean of per-repetition means** with a
**95% Student-t confidence interval**, plus the pooled distribution
statistics (min, max, p50, p95) over every individual sample across all
reps.

Two subtly different definitions of "latency" apply:

| Engine     | What the number captures                                       | Includes                                            |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------- |
| **JS**     | Pure synchronous evaluation.                                   | `JSON.parse` + evaluate every CR + evaluate every TR. All in the JS thread. |
| **Siddhi** | Round-trip from `sendEvent` to the FinalResults callback.      | React Native bridge (JS → native), Siddhi CEP evaluation, log sink, callback bridge (native → JS). |

The Siddhi number is inherently higher because it includes the bridge
overhead — a fixed part of "using Siddhi from a JS app" that cannot be
removed without instrumenting the native module. The scaling with `nTR`
is what we care about for the comparison.

The Siddhi app used by the harness is **identical to the production one
minus the `window.timeBatch(7 sec)`** — a pass-through query forwards
`Results` to `FinalResults` so `getResult()` returns immediately after
evaluation. The production Siddhi definition is not modified.

## Design decisions

- **Global warmup** — before the timed sweep begins, the harness sends 30
  events against a nTR=50 ruleset and discards the results. This primes the
  JIT / native bridge / caches so the first measured level is not biased by
  cold-start effects. Fixes the "first level looks slower" artifact.
- **Repetitions** — the full sweep runs `reps` times (default 10),
  producing `reps` per-level means. Aggregation uses Student-t 95% CI
  (t=2.262 for n=10). A small t-table for other N is embedded in
  `stats.js` for reproducibility.
- **Per-rep warmup** — first 10 events of each level are still discarded
  (in addition to the global warmup) to absorb the Siddhi query planner
  priming that happens on every `startApp`.
- **Uniform match** — every synthetic CR is built to match every synthetic
  Context, so every TR fires on every event. Worst case, no branch pruning,
  directly comparable across engines.
- **Determinism** — no RNG. Rules and contexts are pure functions of an
  index, so both engine runs see byte-identical inputs on every rep.
- **Samples** — 50 measured events per level per rep. Total per level:
  50 × reps individual samples (500 with reps=10) pool used for min/max/p50/p95.
- **Isolation** — the two engine runs happen in separate app sessions
  (change the `RULE_ENGINE` Parameter, restart, run again).
- **Safety** — the harness uses `clearSyntheticRules()` by default,
  wiping only rows with `id >= 1_000_000`. User rules are preserved. Pass
  `wipeAll: true` to `runBenchmark()` to clear everything.
- **Timeout guard** — per-sample JS-side safety cap of 1000ms. Warmup
  timeouts are absorbed silently; post-warmup timeouts count toward a
  per-level abort threshold (5 by default).

## How to run

Both runs need the app to arrive at `Loading.js#prepareSession()` for
the engine to be initialised.

### One-time setup

Temporarily add a call to `runBenchmark()` at the end of
`Loading.js#prepareSession()`:

```js
import {runBenchmark} from '../experiments/benchmark';
// ... after bootstrapRecommendationBridge() and checkEMAvailability():
setTimeout(() => {
  runBenchmark().catch(err => console.error('[bench] failed:', err));
}, 15000);
```

The 15-second delay lets the app finish loading before we start measuring.

Estimated total time with reps=10:
- **Siddhi**: ~10 minutes (dominated by settle time + native bridge round-trips)
- **JS**: ~6 minutes (pure JS, no bridge)

### Run 1 — Siddhi

```js
// Set the flag before restart (e.g. Metro console or a temp line):
storeParameter('*', 'SETTINGS', 'RULE_ENGINE', 'siddhi');
```

Restart the app. Wait for `[bench] === runBenchmark finished ===`.
Collect the CSVs from logcat:

```sh
adb logcat -s ReactNativeJS:V | grep '\[BENCH_CSV\]' > siddhi_summary.csv
adb logcat -s ReactNativeJS:V | grep '\[BENCH_REP\]' > siddhi_per_rep.csv
```

### Run 2 — JS

```js
storeParameter('*', 'SETTINGS', 'RULE_ENGINE', 'js');
```

Restart the app. Same wait, then:

```sh
adb logcat -s ReactNativeJS:V | grep '\[BENCH_CSV\]' > js_summary.csv
adb logcat -s ReactNativeJS:V | grep '\[BENCH_REP\]' > js_per_rep.csv
```

### After both runs

Two CSV files per engine:

**`*_summary.csv`** — one aggregated row per level:
```
engine,nTR,n_reps,mean_ms,std_ms,var_ms2,ci95_low_ms,ci95_high_ms,min_ms,max_ms,p50_ms,p95_ms
```
- `mean_ms` is the mean of the `n_reps` per-rep means.
- `ci95_low_ms` / `ci95_high_ms` come from Student-t at 95%.
- `min/max/p50/p95_ms` are over the full pool of individual samples
  (all reps combined).

**`*_per_rep.csv`** — one row per (engine, nTR, rep):
```
engine,nTR,rep,mean_ms
```
Useful for plotting the per-rep distribution or running your own
aggregation (bootstrap CI, other robust estimators, etc.).

Concatenate the summaries from both engines to plot mean±CI95 by nTR,
using the `engine` column as hue.

## What NOT to change

- `src/siddhi/**` (the SiddhiQL generators the harness reuses via import).
- The Realm schemas.
- The production `sendEvent` behaviour — the harness measures a separate
  method (`RuleEngine.evaluateSync`) that shares the same evaluators.

## Cleanup after benchmarking

- Remove the temporary `runBenchmark()` call from `Loading.js`.
- Optional: call `clearSyntheticRules()` once to remove any leftover
  synth rules from a crashed run. The harness normally wipes them before
  each level, but if the app crashed mid-run a few might remain (all in
  the `id >= 1_000_000` range, so easy to identify).

## Files in this folder

| File                   | Responsibility                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `benchmarkHarness.js`  | Main runner. Global warmup + rep×level sweep + aggregation. Writes CSV rows.          |
| `syntheticRules.js`    | Deterministic CR + TR generator, plus the two cleanup helpers.                        |
| `syntheticContexts.js` | Deterministic Context event generator.                                                |
| `siddhiAppNoWindow.js` | Builds the Siddhi app string without `window.timeBatch`.                              |
| `stats.js`             | `summarize(pool)` → min/max/p50/p95; `aggregateReps(means)` → mean/std/var/CI95.      |
| `csv.js`               | Prefixed log helpers (`[BENCH_CSV]` aggregated, `[BENCH_REP]` per-rep).               |
| `index.js`             | Public re-exports.                                                                    |
