/**
 * Public entry point for the Sprint 5 rule-engine benchmark.
 *
 * Usage (from anywhere in the app, e.g. temporarily in Loading.js):
 *
 *   import {runBenchmark} from '../experiments/benchmark';
 *   setTimeout(() => runBenchmark(), 15000);
 *
 * See README.md next to this file for the full protocol.
 */

export {runBenchmark} from './benchmarkHarness';
export {
  generateSyntheticRules,
  clearSyntheticRules,
  clearAllRules,
  SYNTHETIC_ID_BASE,
} from './syntheticRules';
export {buildSyntheticContext} from './syntheticContexts';
export {buildBenchmarkSiddhiApp} from './siddhiAppNoWindow';
