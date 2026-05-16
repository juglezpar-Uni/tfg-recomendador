/**
 * Routes a context rule to the correct evaluator based on its type.
 * Returns false for unknown types or evaluator errors (never crashes).
 */

import {evaluateTimeBased} from './evaluators/timeBased';
import {evaluateCalendarBased} from './evaluators/calendarBased';
import {evaluateWeather} from './evaluators/weather';
import {evaluateLocation} from './evaluators/location';
import {evaluateServerBased} from './evaluators/serverBased';

const EVALUATORS = {
  'Time-Based': evaluateTimeBased,
  'Calendar-Based': evaluateCalendarBased,
  Weather: evaluateWeather,
  Location: evaluateLocation,
  'Server-Based': evaluateServerBased,
};

/**
 * Evaluate a single context rule against the current event.
 *
 * @param {Object} rule         A ContextRule (Realm proxy or plain JS object)
 * @param {Object} userContext  { contextId, date, time }
 * @param {Array}  observations [{ observedProperty, optionalField, observationValue }, ...]
 * @returns {boolean}
 */
export function evaluateContextRule(rule, userContext, observations) {
  const fn = EVALUATORS[rule?.type];
  if (!fn) {
    console.warn('[RuleEngine] unknown context rule type:', rule?.type);
    return false;
  }
  try {
    return fn(rule, userContext, observations);
  } catch (err) {
    console.error(`[RuleEngine] evaluator for type "${rule.type}" threw:`, err);
    return false;
  }
}
