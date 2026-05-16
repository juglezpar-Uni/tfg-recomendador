/**
 * Calendar-Based context rule evaluator.
 *
 * Mirrors `createCalendarBasedContextRule` in src/siddhi/rules/context/generator.js:
 *   matches when:
 *     dayOfWeek(date) ∈ checked daysOfWeek
 *   AND (if both startDate and endDate are valid)
 *     startDate ≤ date ≤ endDate
 *
 * Inputs:
 *   - rule.daysOfWeek : Array<{ key: string, checked: boolean }>
 *                       key is an English weekday name ('Monday', 'Tuesday', ...)
 *   - rule.startDate  : 'dd/MM/yyyy' or '__/__/__' (sentinel for "not set")
 *   - rule.endDate    : same
 *   - userContext.date : 'dd/MM/yyyy'
 *
 * Returns boolean.
 */

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

const DATE_SENTINEL = '__/__/__';

/**
 * Parses a 'dd/MM/yyyy' string into a Date (UTC midnight) or null.
 * @param {string} ddmmyyyy
 * @returns {Date|null}
 */
function parseDDMMYYYY(ddmmyyyy) {
  if (!ddmmyyyy || typeof ddmmyyyy !== 'string') {return null;}
  const parts = ddmmyyyy.split('/').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {return null;}
  const [day, month, year] = parts;
  // Use UTC to avoid timezone drift on the >=/<= comparisons below.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null; // invalid date
  }
  return d;
}

export function evaluateCalendarBased(rule, userContext /* , observations */) {
  const date = parseDDMMYYYY(userContext?.date);
  if (!date) {return false;}

  // ----- Days-of-week check -----
  const checkedDays = (rule?.daysOfWeek ?? [])
    .filter((d) => d?.checked)
    .map((d) => d.key);

  if (checkedDays.length === 0) {
    // The Siddhi generator emits an explicit error when no days are selected;
    // a rule with no days can never trigger.
    return false;
  }

  const dayName = WEEKDAYS[date.getUTCDay()];
  if (!checkedDays.includes(dayName)) {return false;}

  // ----- Date-range check (only when both endpoints are real dates) -----
  const validRange =
    rule?.startDate && rule?.endDate &&
    rule.startDate !== DATE_SENTINEL &&
    rule.endDate !== DATE_SENTINEL;

  if (validRange) {
    const start = parseDDMMYYYY(rule.startDate);
    const end = parseDDMMYYYY(rule.endDate);
    if (!start || !end) {return false;}
    if (date < start || date > end) {return false;}
  }

  return true;
}
