/**
 * Returns the active rule engine (Siddhi or JS) based on Realm config.
 * Default is Siddhi. Change to JS by setting Parameter RULE_ENGINE='js'.
 * Cached per app session — requires restart to switch.
 */

import {NativeModules, Platform} from 'react-native';
import {retrieveValueParameter} from '../realmSchemas/RealmServices';
import {RuleEngine as JsEngine} from '../ruleEngine';
import {createSiddhiAppIntro, createSiddhiAppEnd} from '../siddhi/structure.js';
import {writeAllContextRules} from '../siddhi/rules/context/index.js';
import {writeAllTriggeringRules} from '../siddhi/rules/triggering/index.js';
import * as Schemas from '../realmSchemas/RealmServices';

export const ENGINE_PARAM_USER = '*';
export const ENGINE_PARAM_TYPE = 'SETTINGS';
export const ENGINE_PARAM_KEY = 'RULE_ENGINE';

const ENGINE_SIDDHI = 'siddhi';
const ENGINE_JS = 'js';

let _cached = null;
let _cachedId = null;

/**
 * Read the configured engine id from Realm. Defaults to 'siddhi'.
 * @returns {'siddhi' | 'js'}
 */
export function getActiveEngineId() {
  // iOS has no Siddhi native module (Kotlin-only). Force the JS engine
  // unconditionally so the adapter never returns undefined from
  // NativeModules.SiddhiClientModule on iOS.
  if (Platform.OS === 'ios') {
    return ENGINE_JS;
  }
  let value = null;
  try {
    value = retrieveValueParameter(
      ENGINE_PARAM_USER,
      ENGINE_PARAM_TYPE,
      ENGINE_PARAM_KEY,
    );
  } catch (err) {
    console.warn(
      '[ruleEngineAdapter] could not read engine setting, defaulting to siddhi:',
      err,
    );
  }
  return value === ENGINE_JS ? ENGINE_JS : ENGINE_SIDDHI;
}

/**
 * Returns an object that exposes the SiddhiClientModule contract:
 *   connect(), startApp(def), stopApp(), sendEvent(json), getResult(cb), isStopped(cb)
 *
 * Cached per process — callers are expected to pick the engine at startup.
 *
 * @returns {Object}
 */
export function getEngine() {
  const id = getActiveEngineId();
  if (_cached && _cachedId === id) {
    return _cached;
  }

  if (id === ENGINE_JS) {
    console.log('[ruleEngineAdapter] using JS rule engine');
    _cached = JsEngine;
  } else {
    console.log('[ruleEngineAdapter] using native Siddhi engine');
    _cached = NativeModules.SiddhiClientModule;
  }
  _cachedId = id;
  return _cached;
}

/**
 * Test / dev helper to force-clear the cached engine reference.
 */
export function _resetEngineCache() {
  _cached = null;
  _cachedId = null;
}

/**
 * Starts the active rule engine with the current rules from Realm.
 * Replaces the old direct calls to createSiddhiApp().
 * If Siddhi: builds the SiddhiQL string and passes it to the native module.
 * If JS: calls startApp() which reads rules from Realm directly.
 * Stops the engine if there are no active triggering rules.
 */

export function bootstrapRuleEngine() {
  const engine = getEngine();
  const id = getActiveEngineId();
  console.log(`[ruleEngineAdapter] bootstrapRuleEngine (engine=${id})`);

  const triggeringRules = Schemas.retrieveTriggeringRulesSwitchOn();
  if (!triggeringRules || triggeringRules.length === 0) {
    console.log(
      '[ruleEngineAdapter] no active triggering rules → stopping engine',
    );
    engine.stopApp();
    return;
  }

  if (id === ENGINE_JS) {
    // JS engine reads from Realm itself; the appDef argument is ignored.
    engine.stopApp();
    engine.startApp();
    return;
  }

  // Siddhi path — build the SiddhiQL string from the existing generators.
  try {
    const contextRules = Schemas.retrieveContextRules();
    const appDef = [
      createSiddhiAppIntro(),
      writeAllContextRules(contextRules),
      writeAllTriggeringRules(triggeringRules),
      createSiddhiAppEnd(),
    ].join('\n');
    engine.stopApp();
    engine.startApp(appDef);
    console.log('[ruleEngineAdapter] Siddhi App started');
  } catch (err) {
    console.error('[ruleEngineAdapter] error starting Siddhi:', err);
  }
}
