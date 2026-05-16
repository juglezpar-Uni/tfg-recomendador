/**
 * Evaluates Location context rules.
 * Matches when the pre-calculated distance to the rule's location
 * is less than or equal to locationError (meters).
 * Note: the distance is calculated by Context.js before reaching this evaluator,
 * not here — this mirrors how Siddhi received pre-computed distances.
 */

export function evaluateLocation(rule, _userContext, observations = []) {
  if (!rule?.name) {
    return false;
  }
  const limit =
    typeof rule.locationError === 'number'
      ? rule.locationError
      : parseInt(rule.locationError, 10);
  if (Number.isNaN(limit)) {
    return false;
  }

  for (const obs of observations) {
    if (obs?.observedProperty !== 'Location') {
      continue;
    }
    if (obs.optionalField !== rule.name) {
      continue;
    }
    const distance = parseInt(obs.observationValue, 10);
    if (Number.isNaN(distance)) {
      continue;
    }
    if (distance <= limit) {
      return true;
    }
  }

  return false;
}
