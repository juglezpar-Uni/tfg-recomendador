/**
 * Evaluates Server-Based context rules.
 * Matches when a sensor observation from the specified server
 * meets the comparison condition (e.g., CO2 > 1000).
 */

// Maps rule measurement names (lowercase) to observation property names
const MEASUREMENT_TO_PROPERTY = {
  temperature: 'Temperature',
  co2: 'CO2',
  humidity: 'Humidity',
};
/** Applies a comparison operator between two numbers. */
function compare(left, op, right) {
  switch (op) {
    case '>':
      return left > right;
    case '<':
      return left < right;
    case '=':
      return left === right;
    case '==':
      return left === right;
    case '>=':
      return left >= right;
    case '<=':
      return left <= right;
    case '!=':
      return left !== right;
    default:
      return false;
  }
}

export function evaluateServerBased(rule, _userContext, observations = []) {
  const property = MEASUREMENT_TO_PROPERTY[rule?.measurement];
  if (!property) {
    return false;
  }

  const threshold =
    typeof rule.value === 'number' ? rule.value : parseFloat(rule.value);
  if (Number.isNaN(threshold)) {
    return false;
  }

  for (const obs of observations) {
    if (obs?.observedProperty !== property) {
      continue;
    }
    if (obs.observationValue !== rule.server) {
      continue;
    }
    const measured = parseFloat(obs.optionalField);
    if (Number.isNaN(measured)) {
      continue;
    }
    if (compare(measured, rule.comparator, threshold)) {
      return true;
    }
  }

  return false;
}
