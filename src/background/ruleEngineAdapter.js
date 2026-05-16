/**
 * Returns the active rule engine (Siddhi or JS) based on Realm config.
 * Default is Siddhi. Change to JS by setting Parameter RULE_ENGINE='js'.
 * Cached per app session — requires restart to switch.
 */

import {NativeModules} from 'react-native';
import {retrieveValueParameter} from '../realmSchemas/RealmServices';
import {RuleEngine as JsEngine} from '../ruleEngine';

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
