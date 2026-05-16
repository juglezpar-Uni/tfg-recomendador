/**
 * Accumulates recommendation triggers during a 7-second window,
 * deduplicates per contextId, and outputs CSV strings like "ctx-1,Restaurants,Museums".
 * Mirrors Siddhi's timeBatch(7 sec) + groupConcat behavior.
 */

const WINDOW_MS = 7000;

export default class ResultsAggregator {
  constructor({
    windowMs = WINDOW_MS,
    now = () => Date.now(),
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {}) {
    this._windowMs = windowMs;
    this._now = now;
    this._schedule = schedule;
    this._cancel = cancel;

    this._buckets = new Map(); // contextId -> Set<recommendationType>
    this._timerId = null;
    this._outQueue = []; // queue of CSV strings ready for getNext()
  }

  /**
   * Register a fired recommendation.
   *
   * @param {string} contextId
   * @param {string} recommendationType
   */
  push(contextId, recommendationType) {
    if (!contextId || !recommendationType) {
      return;
    }

    let set = this._buckets.get(contextId);
    if (!set) {
      set = new Set();
      this._buckets.set(contextId, set);
    }
    set.add(recommendationType);

    if (this._timerId == null) {
      this._timerId = this._schedule(() => this._flush(), this._windowMs);
    }
  }

  /**
   * Removes and returns the next aggregated CSV string, or '' if none ready.
   *
   * @returns {string}
   */
  getNext() {
    return this._outQueue.shift() ?? '';
  }

  /**
   * True when no buckets are pending and no output is queued.
   */
  isIdle() {
    return this._buckets.size === 0 && this._outQueue.length === 0;
  }

  /**
   * Cancel any pending timer and discard all state.
   */
  reset() {
    if (this._timerId != null) {
      this._cancel(this._timerId);
      this._timerId = null;
    }
    this._buckets.clear();
    this._outQueue.length = 0;
  }

  /**
   * Force an immediate flush regardless of the window timer. Useful for tests.
   */
  flushNow() {
    if (this._timerId != null) {
      this._cancel(this._timerId);
      this._timerId = null;
    }
    this._flush();
  }

  // ---- internal --------------------------------------------------------------

  _flush() {
    this._timerId = null;
    if (this._buckets.size === 0) {
      return;
    }

    for (const [contextId, set] of this._buckets) {
      const csv = [contextId, ...set].join(',');
      this._outQueue.push(csv);
    }
    this._buckets.clear();
  }
}
