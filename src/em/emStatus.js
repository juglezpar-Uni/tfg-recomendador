/**
 * emStatus
 * -----------------------------------------------------------------------------
 * Process-level cache of whether any Entity Manager (EM) is reachable.
 *
 * Set by `checkEMAvailability()` (src/em/Fetch.js) at app startup and read by
 * `AlgorithmRegistry.listAvailable()` so EM-bound algorithms are hidden when
 * the backend isn't reachable.
 *
 * Why a separate module: keeps the dependency graph clean. AlgorithmRegistry
 * must NOT pull in Fetch.js (which imports Realm helpers, Context, etc.) just
 * to read a boolean — that would create a circular-ish import for what is
 * essentially a flag.
 * -----------------------------------------------------------------------------
 */

let _available = false;
let _checked = false;

/**
 * Record the result of an EM availability probe.
 * @param {boolean} value
 */
export function setEMAvailable(value) {
  _available = !!value;
  _checked = true;
}

/**
 * True if a prior probe found at least one EM responding.
 * Defaults to false until checkEMAvailability() runs.
 * @returns {boolean}
 */
export function isEMAvailable() {
  return _available;
}

/**
 * True if checkEMAvailability() has run at least once (regardless of result).
 * Useful to detect "we don't know yet" vs "we know there is no EM".
 * @returns {boolean}
 */
export function hasBeenChecked() {
  return _checked;
}

/** Test/dev helper — resets to the initial state. */
export function _resetEMStatus() {
  _available = false;
  _checked = false;
}
