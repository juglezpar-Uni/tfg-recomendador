/**
 * Evaluates a triggering rule against context rule results.
 * A TR fires when ALL its context rules match (or don't match, if negated).
 * switchState=false means the user has disabled this rule.
 *
 * @param {Object} triggeringRule - { name, recommendationType, switchState, contextRules, denyContextRule }
 * @param {Object} contextRuleEvaluations - { contextRuleName: boolean } results from ContextRuleEvaluator
 * @returns {boolean}
 */
export function evaluateTriggeringRule(triggeringRule, contextRuleEvaluations) {
  if (!triggeringRule?.switchState) {
    return false;
  }

  // Array.from handles both plain JS arrays (tests) and Realm.List (production).
  // Object.values used to be here but on some Realm builds it returned an empty
  // array from Realm.List, which silently disabled every user-defined TR.
  const crs = Array.from(triggeringRule.contextRules ?? []);
  const denyFlags = Array.from(triggeringRule.denyContextRule ?? []);

  if (crs.length === 0) {
    return false;
  }

  for (let i = 0; i < crs.length; i++) {
    const cr = crs[i];
    const matched = contextRuleEvaluations[cr.name] === true;
    const negated = denyFlags[i] === true;

    if (negated ? matched : !matched) {
      return false;
    }
  }

  return true;
}
