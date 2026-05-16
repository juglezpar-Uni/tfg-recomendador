// Engine reference resolved via the adapter (Siddhi or JS based on Setting).
import {getEngine} from './ruleEngineAdapter';

import {isStopped, getResult} from './siddhiUtils';
import * as Schemas from '../realmSchemas/RealmServices';

import {loginSensorizarServer} from '../services/externalServers/externalServers';
import {buildSiddhiContextForTest} from '../events/Context';
import {getRecommendationsWithExclusionSets} from '../services/exclusionSets/checkExclusionSets';
import * as Notification from '../events/Notification';
import {
  getActivitiesExamples,
  getContextExamples,
} from '../testData/LoadTestData';
import {startRecommendation} from '../em/Fetch';
//let jsonContextExample = getContextExamples();
/**
 * Background task that sends context data to the Siddhi engine if the user is logged in.
 * It prepares the test context and sends it through the Siddhi client.
 *
 * @returns {Promise<void>}
 */
export const SendContextTask = async () => {
  let jsonContextExample = getContextExamples();
  console.log('SENDCONTEXT TASK');

  const user = Schemas.retrieveUser();
  console.log('SENDCONTEXTTASK user:', user);

  // Skip execution if user is not logged in
  if (!user) {
    console.log('User not logged in. Aborting context task.');
    return;
  }

  console.log('User is logged. Connecting to Siddhi...');
  getEngine().connect();

  const stopped = await isStopped('S');
  console.log('Is Siddhi stopped:', stopped);

  if (stopped) {
    console.log('Siddhi app is stopped. Task terminated.');
    return;
  }

  // Load test context (Fake context)
  let context = jsonContextExample;
  console.log('Step 1 - Test Context:', context);

  Schemas.CreateContext('LOCATION', JSON.stringify(context.Location));
  Schemas.CreateContext('WEATHER', JSON.stringify(context.Weather));
  Schemas.CreateContext('SENSORIZAR', JSON.stringify(context.Sensorizar));

  // Retrieve or renew sensorizar token
  const tokenObject = Schemas.retrieveCurrentToken();
  const now = new Date();

  let sensorizarToken;
  const tokenIsExpired =
    !tokenObject || Math.abs(now - tokenObject.timestamp) / (60 * 1000) > 150;

  if (tokenIsExpired) {
    sensorizarToken = await loginSensorizarServer();
  } else {
    sensorizarToken = tokenObject.token;
  }

  console.log('[NEW] Token value:', sensorizarToken);

  // NOTE: For testing only – generating fake user context
  context = buildSiddhiContextForTest(context.UserContext);

  if (!context) {
    console.log('Context was not generated.');
    return;
  }

  const contextStr = JSON.stringify(context);
  console.log('Step 2 - Sending context to Siddhi:', contextStr);

  const activeTR = Schemas.getActiveTriggeringRulesName();
  console.log('Step 3 - Active Triggering Rules:', activeTR);

  getEngine().sendEvent(contextStr);
};

let jsonActivitiesExample = getActivitiesExamples();
/**
 * Background task that continuously listens for recommendation results
 * from the Siddhi engine, processes them, and launches the corresponding actions.
 *
 * @returns {Promise<void>}
 */
export const ListenRecommendationResultTask = async () => {
  console.log('ListenRecommendationResultTask: one pass');

  // TEMP: Disabled login (replace with real check if needed)
  const user = ''; // const user = Schemas.retrieveUser();

  if (user === null) {
    console.log('L USER NOT LOGGED');
    return;
  }

  const stopped = await isStopped('L');
  console.log('L isStopped:', stopped);

  if (stopped) {
    console.log(
      'LOG: INFO: Siddhi app is STOPPED -> no active triggering rules',
    );
    return;
  }

  console.log('L Result: WANTED');
  const result = await getResult();
  console.log('L Result:', result);

  if (result === 'start' || result == null || result === '') {
    return;
  }

  const r = result.split(',').filter(Boolean);
  const id = r.shift();

  console.log(
    'Step 4 - Recommendation types triggered by Siddhi for context:',
    id,
  );
  console.log('Cleaned Recommendation Types:', r);

  //Don't include "" as a result
  const recommendations =
    getRecommendationsWithExclusionSets(r).filter(Boolean);

  console.log(
    'Step 5 - Filtered Recommendations (after Exclusion Sets):',
    recommendations,
  );

  const recommendationsCopy = [...r];
  console.log(
    'GOING TO START RECOMMENDATION:',
    JSON.stringify(recommendationsCopy),
  );

  if (recommendationsCopy.includes('changeRoom')) {
    console.log('[NEW] -> NEW RECOMMENDER ACTIVE');

    const activity = jsonActivitiesExample.shift();
    Notification.processItem(activity);

    if (recommendationsCopy.length > 2) {
      console.log('[NEW] -> OLD RECOMMENDER ACTIVE TOO');
      startRecommendation(recommendations);
    }
  } else {
    console.log('[NEW] -> OLD RECOMMENDER ACTIVE');
    startRecommendation(recommendations);
  }
};
