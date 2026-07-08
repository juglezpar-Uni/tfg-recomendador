/**
 * csv.js — Log helpers that emit CSV rows prefixed with grep-friendly tags so
 * you can extract them from `adb logcat` (or React Native's Metro terminal)
 * with one command:
 *
 *   adb logcat -s ReactNativeJS:V | grep '\[BENCH_CSV\]'   > summary.csv
 *   adb logcat -s ReactNativeJS:V | grep '\[BENCH_SAMPLE\]' > samples.csv
 *
 * Two streams:
 *   [BENCH_CSV]    one aggregated row per (engine, nTR) level.
 *   [BENCH_SAMPLE] one row per measured event (post-warmup).
 */

const CSV_TAG = '[BENCH_CSV]';
const SAMPLE_TAG = '[BENCH_SAMPLE]';

// Fixed decimal places so downstream tools don't have to guess. 4 dp = 100 ns
// which is well below anything performance.now() delivers on RN.
const FIX = 4;

/**
 * Log the header rows once, at the start of a benchmark run.
 */
export function logCSVHeader() {
  console.log(`${CSV_TAG} engine,nTR,samples,mean_ms,min_ms,max_ms,p50_ms,p95_ms`);
  console.log(`${SAMPLE_TAG} engine,nTR,sampleIdx,latency_ms`);
}

/**
 * One aggregated row per (engine, nTR).
 * @param {string} engineId
 * @param {number} nTR
 * @param {{samples: number, mean: number, min: number, max: number, p50: number, p95: number}} stats
 */
export function logCSVRow(engineId, nTR, stats) {
  console.log(
    `${CSV_TAG} ${engineId},${nTR},${stats.samples},` +
      `${stats.mean.toFixed(FIX)},${stats.min.toFixed(FIX)},${stats.max.toFixed(FIX)},` +
      `${stats.p50.toFixed(FIX)},${stats.p95.toFixed(FIX)}`,
  );
}

/**
 * One row per measured (post-warmup) sample.
 * @param {string} engineId
 * @param {number} nTR
 * @param {number} sampleIdx  0-based, warmup already excluded
 * @param {number} latency    milliseconds
 */
export function logSample(engineId, nTR, sampleIdx, latency) {
  console.log(`${SAMPLE_TAG} ${engineId},${nTR},${sampleIdx},${latency.toFixed(FIX)}`);
}
