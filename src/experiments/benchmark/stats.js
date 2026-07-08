/**
 * stats.js — Descriptive statistics used by the benchmark harness.
 *
 * Everything here is a pure function that operates on a numeric array. No I/O,
 * no allocations beyond a defensive sort copy.
 */

/**
 * Percentile in [0, 1]. Uses the "nearest-rank" method:
 *   index = floor(p * n)   clamped to [0, n-1].
 *
 * We use nearest-rank instead of linear interpolation because it makes the
 * result trivially reproducible across implementations (Python numpy, R, Excel)
 * — one of the assumptions the caller can make when copy-pasting our CSV.
 *
 * @param {Array<number>} sortedAsc
 * @param {number} p
 * @returns {number}
 */
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) {return NaN;}
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

/**
 * Summarize a latency sample.
 *
 * @param {Array<number>} latencies
 * @returns {{samples: number, mean: number, min: number, max: number, p50: number, p95: number}}
 */
export function summarize(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return {samples: 0, mean: NaN, min: NaN, max: NaN, p50: NaN, p95: NaN};
  }
  const sum = sorted.reduce((acc, x) => acc + x, 0);
  return {
    samples: n,
    mean: sum / n,
    min: sorted[0],
    max: sorted[n - 1],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}
