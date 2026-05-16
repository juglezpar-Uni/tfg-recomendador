/**
 * Evaluates Weather context rules.
 * Matches when a Weather observation has a checked status
 * AND its temperature falls within [minTemp, maxTemp].
 */

export function evaluateWeather(rule, _userContext, observations = []) {
  const checkedStatuses = (rule?.weatherStatus ?? [])
    .filter(w => w?.checked)
    .map(w => w.key);

  if (checkedStatuses.length === 0) {
    return false;
  }

  const min =
    typeof rule?.minTemp === 'number'
      ? rule.minTemp
      : parseFloat(rule?.minTemp);
  const max =
    typeof rule?.maxTemp === 'number'
      ? rule.maxTemp
      : parseFloat(rule?.maxTemp);
  if (Number.isNaN(min) || Number.isNaN(max)) {
    return false;
  }

  for (const obs of observations) {
    if (obs?.observedProperty !== 'Weather') {
      continue;
    }
    if (!checkedStatuses.includes(obs.observationValue)) {
      continue;
    }
    const temp = parseFloat(obs.optionalField);
    if (Number.isNaN(temp)) {
      continue;
    }
    if (temp >= min && temp <= max) {
      return true;
    }
  }

  return false;
}
