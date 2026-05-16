/**
 * JavaScript rule engine that replaces Siddhi for cross-platform support.
 * Same API as SiddhiClientModule so it can be swapped transparently.
 * Reads context rules from Realm, evaluates them against incoming context ticks,
 * and emits recommendations when triggering rules fire.
 */

import {evaluateContextRule} from './ContextRuleEvaluator';
import {evaluateTriggeringRule} from './TriggeringRuleEvaluator';
import ResultsAggregator from './ResultsAggregator';
import * as Bridge from './RecommendationBridge';

class RuleEngine {
  constructor() {
    this._stopped = true;
    this._contextRules = [];
    this._triggeringRules = [];
    this._aggregator = new ResultsAggregator();
    // Realm import is lazy: this file is also imported by tests under Node,
    // where the `realm` package can't load.
    this._realmServices = null;
  }

  /** Lazily resolve Realm services so tests don't crash. */
  _getRealmServices() {
    if (this._realmServices) {
      return this._realmServices;
    }
    this._realmServices = require('../realmSchemas/RealmServices');
    return this._realmServices;
  }

  // ---------------------------------------------------------------------------
  // SiddhiClientModule-compatible API
  // ---------------------------------------------------------------------------

  connect() {
    // No-op needed for the JS engine. But we keep it because Task.js calls it
  }

  startApp(_appDef) {
    const Schemas = this._getRealmServices();
    const contextRules = Schemas.retrieveContextRules() ?? [];
    const triggeringRules = Schemas.retrieveTriggeringRulesSwitchOn() ?? [];

    // Detach from Realm so we can iterate freely (no transaction concerns).
    this._contextRules = Array.from(contextRules);
    this._triggeringRules = Array.from(triggeringRules);
    this._aggregator.reset();
    this._stopped = false;

    console.log(
      `[RuleEngine] startApp: ${this._contextRules.length} context rules, ` +
        `${this._triggeringRules.length} active triggering rules`,
    );

    // Mirror Siddhi's behavior: with no triggering rules there's nothing to do.
    if (this._triggeringRules.length === 0) {
      console.log('[RuleEngine] no active triggering rules → stopping');
      this.stopApp();
    }
  }

  stopApp() {
    this._stopped = true;
    this._contextRules = [];
    this._triggeringRules = [];
    this._aggregator.reset();
  }

  /**
   * Process one Context tick. Accepts the same JSON shape that
   * `buildSiddhiContextForTest` produces (see src/events/Context.js):
   *   { UserContext: {...}, Observations: [...] }
   *
   * @param {string} jsonStr
   */
  sendEvent(jsonStr) {
    if (this._stopped) {
      return;
    }

    let event;
    try {
      event = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (err) {
      console.error('[RuleEngine] malformed event JSON:', err);
      return;
    }

    const userContext = event?.UserContext;
    const observations = event?.Observations ?? [];
    if (!userContext?.contextId) {
      console.warn(
        '[RuleEngine] event missing UserContext.contextId, skipping',
      );
      return;
    }

    // 1. Evaluate every Context Rule once for this tick.
    const crEvals = {};
    for (const cr of this._contextRules) {
      crEvals[cr.name] = evaluateContextRule(cr, userContext, observations);
    }

    // 2. For each active TR, AND the (optionally negated) results.
    for (const tr of this._triggeringRules) {
      if (!evaluateTriggeringRule(tr, crEvals)) {
        continue;
      }

      // 3. Push to the 7s aggregator AND notify the Sprint-2 bridge.
      this._aggregator.push(userContext.contextId, tr.recommendationType);
      Bridge.notify({
        contextId: userContext.contextId,
        recommendationType: tr.recommendationType,
      });
    }
  }

  /**
   * Siddhi-compatible callback API. Hands the next CSV result (or '') to cb.
   * @param {(result: string) => void} callback
   */
  getResult(callback) {
    const next = this._aggregator.getNext();
    if (typeof callback === 'function') {
      callback(next);
    }
    return next;
  }

  /**
   * Siddhi-compatible callback API. Hands the stopped flag to cb.
   * @param {(stopped: boolean) => void} callback
   */
  isStopped(callback) {
    if (typeof callback === 'function') {
      callback(this._stopped);
    }
    return this._stopped;
  }

  // ---------------------------------------------------------------------------
  // Internals exposed for tests / debugging only (NOT part of the Siddhi API)
  // ---------------------------------------------------------------------------

  /** Inject pre-loaded rules instead of reading from Realm (used in tests). */
  _setRulesForTest(contextRules, triggeringRules) {
    this._contextRules = Array.from(contextRules);
    this._triggeringRules = Array.from(triggeringRules);
    this._stopped = false;
  }

  _getAggregator() {
    return this._aggregator;
  }
}

// Singleton — there's only ever one rule engine alive in the app, same as
// SiddhiClientModule.
export default new RuleEngine();
