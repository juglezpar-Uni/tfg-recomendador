//Realm schemas services
import * as Schemas from '../realmSchemas/RealmServices';

// Ems
import EM from './Ems.json';

//Context
import * as Context from '../events/Context';
import * as Notification from '../events/Notification';
import * as Location from '../events/Position';

// EM availability cache (read by AlgorithmRegistry to hide EM-only algorithms)
import {setEMAvailable} from './emStatus';

/**
 * Probes every EM in Ems.json in parallel and stores the result via
 * `setEMAvailable()`. Resolves to `true` as soon as ANY EM responds (HTTP <
 * 500); resolves to `false` only when every probe fails or times out.
 *
 * Times out individual requests after `timeoutMs` (default 3000) so a slow /
 * unreachable EM doesn't stall app startup.
 *
 * Side effects:
 *   - Updates emStatus.
 *   - Logs `[EM] available` or `[EM] not available, local-only mode`.
 *
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=3000]
 * @returns {Promise<boolean>}
 */
export async function checkEMAvailability({timeoutMs = 3000} = {}) {
  const managers = EM?.list ?? [];
  if (managers.length === 0) {
    console.log('[EM] not available, local-only mode (no EMs in Ems.json)');
    setEMAvailable(false);
    return false;
  }

  const probe = async em => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${em.address}/ping`, {
        method: 'GET',
        signal: controller.signal,
      });
      // Any response under 500 means the EM is at least answering.
      return resp.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const results = await Promise.all(managers.map(probe));
  const available = results.some(Boolean);

  setEMAvailable(available);
  if (available) {
    const okCount = results.filter(Boolean).length;
    console.log(`[EM] available (${okCount}/${managers.length} reachable)`);
  } else {
    console.log('[EM] not available, local-only mode');
  }
  return available;
}
export async function testConnection() {
  // Log that the connection test is starting
  console.log('Testing connection...');

  // Get the authentication token from the schema
  const tokenAuth = Schemas.currentAuthToken();
  console.log(`AUTHTOKEN: ${tokenAuth} (${typeof tokenAuth})`);

  // Get the list of EMs (Enterprise Managers)
  const managers = EM.list;

  // Loop through each EM to check connection
  for (const em of managers) {
    console.log(`Fetching: ${em.address}/ping`);
    try {
      // Send GET request to each EM's ping endpoint
      const response = await fetch(`${em.address}/ping`, {
        method: 'GET',
        headers: {
          'Authorization': tokenAuth, // Use the auth token in the request header
        },
      });

      // Read the response text
      const plainText = await response.text();
      // Uncomment to log the response if needed
      console.log(`Response from ${em.address}: ${plainText}`);
    } catch (error) {
      // Log any errors encountered while pinging
      console.warn(`Error pinging ${em.address}:`, error.message);
    }
  }
}

export async function fetchFeedback(activity) {
  // Log the feedback endpoint
  console.log('/app/feedback');

  // Build the feedback message for the activity
  const json = Context.buildFeedbackMessage(activity);

  // Get the authentication token from the schema
  const tokenAuth = Schemas.currentAuthToken();
  console.log(`AUTHTOKEN: ${tokenAuth}`);

  // Find the EM that matches the activity author ID
  const emFound = EM.list.find((emItem) => emItem.id === activity.author);

  if (!emFound) {
    // Warn if no EM is found with the given ID
    console.warn(`No EM found with id: ${activity.author}`);
    return;
  }

  // Construct the URL for the feedback endpoint
  const url = `${emFound.address}/app/feedback`;

  try {
    // Send POST request to the feedback endpoint
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: tokenAuth, // Use the auth token in the request header
      },
      body: JSON.stringify(json), // Send the feedback message in the request body
    });

    // Parse and return the response data as JSON
    const data = await response.json();
    return data;
  } catch (error) {
    // Log any errors encountered while sending feedback
    console.error(`Error sending feedback to ${url}:`, error);
  }
}

// Sends a login request to the given manager endpoint.
// Returns the parsed JSON response if successful, or undefined if an error occurs.
async function loginUserAux(em, login) {
  try {
    const response = await fetch(`${em.address}/users/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(login),
    });

    // Check if the response is OK (status 200–299)
    if (!response.ok) {
      console.warn(`Login request failed with status ${response.status} from ${em.address}`);
      return undefined;
    }

    // Attempt to parse and return the JSON body
    const data =  response;
    return data;

  } catch (error) {
    console.error('Error during login fetch:', error);
    return undefined;
  }
}

// Attempts to log in a user using a list of external managers (EM).
// Iterates through each manager, trying to authenticate the user until successful.
export async function loginUser(login) {
  const managers = EM.list;
  let result = null;

  for (const em of managers) {
    console.log('Trying to authenticate with manager at: ' + em.address);

    try {
      const response = await loginUserAux(em, login);

      // If the response is defined, authentication was successful
      if (typeof response !== 'undefined') {
        result = response;
        break; // Stop checking other managers once authenticated
      }

    } catch (error) {
      console.error('Error during authentication with:', em.address, error);
    }
  }

  console.log('Final authentication result:', result);
  return result;
}

/**
 * Sends a "hello" message to the specified EM (Execution Module).
 *
 * @param {Object} em - The EM object that will receive the message. Must contain at least `address` and `id`.
 * @param {Object} message - The message to be sent in the request body.
 * @returns {Promise<Object|null>} The JSON response from the EM or null if there was an error.
 */
async function fetchHello(em, message) {
  const tokenAuth = Schemas.currentAuthToken();

  // First see if EM is avialable
  console.log(`Fetching: ${em.address}/ping`);
  try {
    const pingResponse = await fetch(`${em.address}/ping`, {
      method: 'GET',
      headers: {
        Authorization: tokenAuth,
      },
    });

    // If no response or no 200 we consider it unavialable
    if (!pingResponse.ok) {
      console.warn(`Ping failed for ${em.address}: HTTP ${pingResponse.status}`);
      return 'undefined';
    }

    const plainText = await pingResponse.text();
    console.log(`Response from ${em.address}: ${plainText}`);
  } catch (error) {
    console.warn(`Error pinging ${em.address}:`, error.message);
    return undefined;
  }

  // If ping is correct we send a hello
  try {
    console.log('FetchHello: Communication try');
    console.log('EM:', em.address);
    console.log('Message:', JSON.stringify(message));

    const response = await fetch(`${em.address}/app/hello`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: tokenAuth,
      },
      body: JSON.stringify(message),
    });

    console.log(`OK: ${em.address}; ${em.id}`);
    return await response.json();
  } catch (error) {
    console.error('Error sending hello message to EM:', error);
    return null;
  }
}

/**
 * Sends a recommendation request to an EM (Execution Manager)
 * using the current context (weather, location, events).
 *
 * @param {string[]} recommendations - List of recommendation types to request
 * @param {string} token - User authentication token (unused here, kept for compatibility)
 * @param {{ address: string, id: string }} em - Execution Manager object with address and ID
 * @returns {Promise<Object|undefined>} - The JSON response from the EM, or undefined on error
 */
async function fetchRecommendation(recommendations, token, em) {
  const weather = Schemas.retrieveLastContext('WEATHER');
  const location = Schemas.retrieveLastContext('LOCATION');
  const events = Schemas.retrieveContext('EVENTS');

  const json = Context.buildRecommendationMessage(
    recommendations,
    weather?.json,
    location?.json,
    events?.json
  );

  console.log('Message to send:', JSON.stringify(json));

  const tokenAuth = Schemas.currentAuthToken();
  console.log('Auth token:', tokenAuth);

  try {
    const response = await fetch(`${em.address}/app/context`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: tokenAuth,
      },
      body: JSON.stringify(json),
    });

    const resJson = await response.json();
    console.log('Response from EM:', resJson);
    return resJson;
  } catch (error) {
    console.error('fetchRecommendation error:', error);
  }
}

const lastByEM = new Map();
/**
 * Starts communication with an Environment Manager (EM), sends settings,
 * receives recommendations, and processes them.
 *
 * @param {string} token - User's authentication token.
 * @param {Object} em - The environment manager object to communicate with.
 * @param {Array} recommendations - List of recommendations to send.
 */
export async function buildHello(token, em, recommendations) {
  try {

      const rate = Number(Schemas.retrieveValueParameter(token, 'PROFILE', 'RATE'));
      const currentLast = lastByEM.get(em.id) || 1;
      console.log('rate included by user: ', rate);
      console.log('currenLastRate of EM: ', currentLast);
      if (currentLast >= rate) {
        lastByEM.set(em.id, 1);
      } else {
          lastByEM.set(em.id, currentLast + 1);
          return; // Skip this cycle for this specific EM
      }

      console.log('build Hello');

      const message = Context.buildHelloMessage();

      // Step 1: Start communication
      const response = await fetchHello(em, message);
      console.log('Hello');
      console.log('RESPONSE:', JSON.stringify(response));

      // Step 2: Validate response
      if (typeof response === 'undefined') {
          console.warn('Response undefined, EM not found:', em);
          return;
      }

      if (response.result === 'false') {
          console.warn('Request not accepted by EM:', em);
          return;
      }

      // Step 3: Fetch recommendations
      const activities = await fetchRecommendation(recommendations, token, em);
      console.log('LOG: Recommended items by EM:', activities.length);
      activities.forEach(act => {
          console.log(`LOG: ${act.id}; ${act.title}; ${act.type}; ${act.subcategories}`);
      });

      // Step 4: Process activities
      let notify = false;
      activities.forEach(act => {
          console.log('Processing activity...');
          if (Notification.processItem(act)) {
              console.log('Activity processed and valid.');
              notify = true;
          }
      });

      // Step 5: Trigger local notification if any valid activity
      if (notify) {
          Notification.localTest();
      }

  } catch (error) {
      console.error('Error in buildHello:', error);
  }
}

/**
 * Starts communication with EMs within profile distance.
 * @param {Array} recommendations - List of recommendations to send.
 */
export function startRecommendation(recommendations) {
  console.log('startRecommendation');

  const user = Schemas.retrieveUser();
  if (!user) {return null;}

  const token = user.token;
  const currentLocation = Schemas.retrieveCurrentLocation();
  if (!currentLocation) {return;}

  const maxDistance = Number(Schemas.retrieveValueParameter(token, 'PROFILE', 'DISTANCE'));
  const managers = EM.list;

  managers.forEach(manager => {
      const coords = manager.coords;

      // Check if coordinates are available and within range (if applicable)
      if (coords) {
          const distance = Location.getDistanceLatLon(
              currentLocation.lat, currentLocation.lon,
              coords.lat, coords.lon
          );
          console.log(`Checking EM @ (${coords.lat}, ${coords.lon}) - Distance: ${distance}, Max allowed: ${maxDistance}`);
      } else {
          console.log('EM has no coordinates');
      }

      // We always call buildHello regardless of distance/coordinates
      buildHello(token, manager, recommendations);
  });
}
