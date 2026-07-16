/**
 * stats.js — Descriptive statistics used by the benchmark harness.
 *
 * Everything here is a pure function that operates on numeric arrays. No I/O,
 * no allocations beyond a defensive sort copy.
 *
 * Two families of statistics:
 *
 *   - `summarize(samples)`      → single-sample stats over ALL individual
 *                                 latency measurements pooled together
 *                                 (min, max, p50, p95, mean).
 *
 *   - `aggregateReps(perRepMeans)` → cross-repetition stats over the per-rep
 *                                 means (mean of means, sample std, sample
 *                                 variance, 95% Student-t confidence
 *                                 interval).
 *
 * The two views coexist because they answer different questions: the pooled
 * summary describes the distribution of individual events (useful for
 * outlier detection with p95), while the aggregate over reps describes the
 * uncertainty of our mean estimate (useful for reporting mean ± CI).
 */

// ---------------------------------------------------------------------------
// Percentiles — nearest-rank method (same as Python's numpy.percentile with
// interpolation='lower' rounded up, R's quantile type 3-ish). Reproducible
// across implementations without floating-point interpolation surprises.
// ---------------------------------------------------------------------------

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) {return NaN;}
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

/**
 * Pooled descriptive stats over a flat array of individual latency samples.
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

// ---------------------------------------------------------------------------
// Cross-repetition aggregation with Student-t 95% CI
// ---------------------------------------------------------------------------

/**
 * Two-tailed Student-t critical value at α/2 = 0.025 (i.e. 95% CI),
 * indexed by degrees of freedom (n_reps for a paired mean; strictly it's
 * n-1 but we key by n for the caller's convenience).
 *
 * Values from standard t-tables; commonly used replication counts covered.
 * For n > 30 we fall back to the normal approximation z_{0.975} ≈ 1.96,
 * which introduces <2% error at n=30 and negligible error beyond.
 */
const T_CRITICAL_95 = {
  2: 12.706,
  3: 4.303,
  4: 3.182,
  5: 2.776,
  6: 2.571,
  7: 2.447,
  8: 2.365,
  9: 2.306,
  10: 2.262,
  12: 2.201,
  15: 2.145,
  20: 2.093,
  25: 2.064,
  30: 2.045,
};

/**
 * Student-t critical value for a 95% two-tailed confidence interval given N
 * repetitions. Returns NaN for N <= 1 (a CI needs ≥2 observations).
 *
 * @param {number} n  number of repetitions (NOT degrees of freedom)
 * @returns {number}
 */
export function tCritical95(n) {
  if (n <= 1) {return NaN;}
  if (T_CRITICAL_95[n] != null) {return T_CRITICAL_95[n];}
  return 1.96; // normal approximation for large N
}

/**
 * Aggregate a set of per-repetition mean latencies into
 *   mean ± CI95, plus sample std and variance.
 *
 * When called with n=1 the std/variance are 0 and CI collapses to the point
 * estimate (t=NaN → margin=NaN → both bounds are NaN in output).
 *
 * @param {Array<number>} perRepMeans  one entry per repetition
 * @returns {{
 *   n_reps: number,
 *   mean: number,
 *   std: number,
 *   variance: number,
 *   ci95_low: number,
 *   ci95_high: number,
 *   t_used: number,
 * }}
 */
export function aggregateReps(perRepMeans) {
  const n = perRepMeans.length;
  if (n === 0) {
    return {
      n_reps: 0,
      mean: NaN,
      std: NaN,
      variance: NaN,
      ci95_low: NaN,
      ci95_high: NaN,
      t_used: NaN,
    };
  }

  const mean = perRepMeans.reduce((a, b) => a + b, 0) / n;

  // Sample variance (Bessel's correction, denominator n-1). For n=1 it's 0.
  const variance =
    n > 1
      ? perRepMeans.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)
      : 0;
  const std = Math.sqrt(variance);

  const t = tCritical95(n);
  const margin = Number.isFinite(t) ? t * std / Math.sqrt(n) : NaN;

  return {
    n_reps: n,
    mean,
    std,
    variance,
    ci95_low: mean - margin,
    ci95_high: mean + margin,
    t_used: t,
  };
}
