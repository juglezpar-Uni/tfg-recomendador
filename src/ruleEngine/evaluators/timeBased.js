/**
 * Evaluates Time-Based context rules.
 * Matches when the current time falls within [startTime, endTime).
 * Times are compared as seconds since midnight.
 */

/** Converts 'HH:mm' or 'HH:mm:ss' to seconds since midnight. NaN if invalid. */
function toSecondsOfDay(hms) {
  if (!hms || typeof hms !== 'string') {
    return NaN;
  }
  const parts = hms.split(':').map(p => parseInt(p, 10));
  if (parts.some(n => Number.isNaN(n))) {
    return NaN;
  }
  const [h = 0, m = 0, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

export function evaluateTimeBased(rule, userContext) {
  const now = toSecondsOfDay(userContext?.time);
  const start = toSecondsOfDay(rule?.startTime);
  const end = toSecondsOfDay(rule?.endTime);

  if (Number.isNaN(now) || Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  // Half-open interval [start, end), same semantics as the Siddhi version
  // (`>= 0 and < 0` against the difference).
  return now >= start && now < end;
}
