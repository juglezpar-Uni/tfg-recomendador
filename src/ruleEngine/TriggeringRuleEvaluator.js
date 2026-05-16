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

  const crs = Object.values(triggeringRule.contextRules ?? {});
  const denyFlags = triggeringRule.denyContextRule ?? [];

  if (crs.length === 0) {
    // A triggering rule with zero context rules can't usefully fire.
    return false;
  }

  for (let i = 0; i < crs.length; i++) {
    const cr = crs[i];
    const matched = contextRuleEvaluations[cr.name] === true;
    const negated = denyFlags[i] === true;

    // negated && matched     → fails (we wanted NOT)
    // !negated && !matched   → fails (we wanted YES)
    if (negated ? matched : !matched) {
      return false;
    }
  }

  return true;
}
