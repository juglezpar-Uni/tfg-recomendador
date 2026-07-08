/**
 * syntheticContexts.js
 * -----------------------------------------------------------------------------
 * Deterministic Context event generator. Produces events shaped exactly like
 * what `buildSiddhiContextForTest` (src/events/Context.js) emits so both the
 * JS engine and the native Siddhi module see the exact same input.
 *
 * By construction, every generated event MATCHES every synthetic Context Rule
 * from syntheticRules.js:
 *
 *   - Time-Based    : rule window is [00:00, 23:59); event time is 12:00:00.
 *   - Calendar-Based: rule accepts all 7 weekdays and no date range; event
 *                     date is a fixed 01/06/2026.
 *   - Weather       : rule accepts every status with 0-50°C; event sends
 *                     Clear at 20°C.
 *   - Location      : rule locationError is 999999m; event sends a Location
 *                     observation per Location CR with distance 0.
 *   - Server-Based  : rule threshold is > 0 for server='sensorizar'; event
 *                     sends three sensor observations (Temperature, CO2,
 *                     Humidity) with value 999.
 *
 * This uniform-match design gives us the worst-case evaluation cost that the
 * benchmark exists to measure.
 * -----------------------------------------------------------------------------
 */

// Kept as compile-time constants so both engines see identical strings and
// there is no per-call formatting cost inside the measured section.
const FIXED_DATE = '01/06/2026';
const FIXED_TIME = '12:00:00';

const WEATHER_OBS = {
  observedProperty: 'Weather',
  optionalField: '20',
  observationValue: 'Clear',
};
const SENSOR_OBS = [
  {observedProperty: 'CO2',         optionalField: '999', observationValue: 'sensorizar'},
  {observedProperty: 'Temperature', optionalField: '999', observationValue: 'sensorizar'},
  {observedProperty: 'Humidity',    optionalField: '999', observationValue: 'sensorizar'},
];

/**
 * @param {number} i                      0-based event index within a level
 * @param {Array<Object>} contextRules    the exact set of CRs currently loaded;
 *                                        needed so we can emit one Location
 *                                        observation per Location CR
 * @returns {Object} event ready to JSON.stringify
 */
export function buildSyntheticContext(i, contextRules) {
  const observations = [WEATHER_OBS, ...SENSOR_OBS];

  // One Location observation per Location CR — that's the contract in
  // buildLocationSiddhiContext (src/events/Context.js): each Location CR is
  // resolved to a single observation whose optionalField is the CR's name.
  for (const cr of contextRules) {
    if (cr.type === 'Location') {
      observations.push({
        observedProperty: 'Location',
        optionalField: cr.name,
        observationValue: '0',
      });
    }
  }

  return {
    UserContext: {
      contextId: `synth-ctx-${i}`,
      date: FIXED_DATE,
      time: FIXED_TIME,
    },
    Observations: observations,
  };
}
