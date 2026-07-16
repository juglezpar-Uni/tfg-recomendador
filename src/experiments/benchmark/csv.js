/**
 * csv.js — Log helpers that emit CSV rows prefixed with grep-friendly tags so
 * you can extract them from `adb logcat` (or React Native's Metro terminal)
 * with one command each:
 *
 *   adb logcat -s ReactNativeJS:V | grep '\[BENCH_CSV\]' > summary.csv
 *   adb logcat -s ReactNativeJS:V | grep '\[BENCH_REP\]' > per_rep.csv
 *
 * Two streams:
 *
 *   [BENCH_CSV]  One aggregated row per (engine, nTR) level. Includes
 *                cross-repetition stats (mean ± CI95, std, variance) AND
 *                pooled distribution stats (min, max, p50, p95).
 *
 *   [BENCH_REP]  One row per (engine, nTR, rep). The per-rep mean latency.
 *                Useful for plotting the per-rep distribution or running your
 *                own aggregation.
 *
 * We deliberately DO NOT emit per-event samples (would be 4500+ lines per
 * engine at reps=10). The per-rep mean is the finest granularity kept.
 */

const CSV_TAG = '[BENCH_CSV]';
const REP_TAG = '[BENCH_REP]';

// Fixed decimal places so downstream tools don't have to guess. 4 dp = 100 ns
// which is well below anything performance.now() delivers on RN.
const FIX = 4;

function fmt(x) {
  return Number.isFinite(x) ? x.toFixed(FIX) : 'NaN';
}

/**
 * Emit both header rows once, at the start of a benchmark run.
 */
export function logCSVHeader() {
  console.log(
    `${CSV_TAG} engine,nTR,n_reps,mean_ms,std_ms,var_ms2,` +
      `ci95_low_ms,ci95_high_ms,min_ms,max_ms,p50_ms,p95_ms`,
  );
  console.log(`${REP_TAG} engine,nTR,rep,mean_ms`);
}

/**
 * Log the per-repetition mean of a single level in one iteration.
 *
 * @param {string} engineId
 * @param {number} nTR
 * @param {number} rep     1-indexed repetition number
 * @param {number} mean    mean latency for this rep at this level, in ms
 */
export function logRepRow(engineId, nTR, rep, mean) {
  console.log(`${REP_TAG} ${engineId},${nTR},${rep},${fmt(mean)}`);
}

/**
 * Log the aggregated stats for one level (across all reps).
 *
 * Combines two views:
 *   - Cross-rep aggregate (mean of means, std, variance, CI95): describes
 *     the uncertainty of our mean estimate.
 *   - Pooled per-event summary (min, max, p50, p95): describes the shape of
 *     individual-event latencies across all reps.
 *
 * @param {string} engineId
 * @param {number} nTR
 * @param {{n_reps: number, mean: number, std: number, variance: number,
 *          ci95_low: number, ci95_high: number}} agg   from aggregateReps()
 * @param {{min: number, max: number, p50: number, p95: number}} pooled
 *                                                       from summarize()
 */
export function logCSVRow(engineId, nTR, agg, pooled) {
  console.log(
    `${CSV_TAG} ${engineId},${nTR},${agg.n_reps},` +
      `${fmt(agg.mean)},${fmt(agg.std)},${fmt(agg.variance)},` +
      `${fmt(agg.ci95_low)},${fmt(agg.ci95_high)},` +
      `${fmt(pooled.min)},${fmt(pooled.max)},${fmt(pooled.p50)},${fmt(pooled.p95)}`,
  );
}
