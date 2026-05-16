// Engine reference is resolved via the adapter so the same code path serves
// both the native Siddhi client and the JS rule engine. The selection is
// controlled by the 'RULE_ENGINE' Parameter (see ruleEngineAdapter.js).
import {getEngine} from './ruleEngineAdapter';
/**
 * Delays the execution for a given number of milliseconds.
 *
 * @param {number} ms - Milliseconds to wait before resolving.
 * @returns {Promise<void>} A Promise that resolves after the specified delay.
 */
export const sleep = ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

/**
 * Retrieves the recommendation result from the Siddhi client.
 *
 * @returns {Promise<string>} A Promise that resolves with the recommendation result as a string.
 */
export const getResult = async () => {
  return new Promise(resolve => {
    getEngine().getResult(eventId => {
      resolve(eventId);
    });
  });
};

/**
 * Checks whether the Siddhi app is currently stopped.
 *
 * @param {string} task - A label used for logging purposes (e.g., task name).
 * @returns {Promise<string>} A Promise that resolves with the result from Siddhi, indicating if it's stopped.
 */
export const isStopped = async task => {
  console.log(`${task} async isStopped entering`);

  return new Promise(resolve => {
    getEngine().isStopped(eventId => {
      console.log(`${task} Result obtained`);
      resolve(eventId);
    });
  });
};
