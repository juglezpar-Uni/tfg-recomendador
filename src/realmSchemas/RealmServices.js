import {realm} from './RealmInstance';

// Retrieves the current user from the database
export function retrieveUser() {
  const users = realm.objects('User');
  return users.length > 0 ? users[0] : null;
}

/**
 * Removes all user entries from the Realm database.
 * This is typically used to clear the currently stored user before replacing or logging out.
 */
export function removeUsers() {
  realm.write(() => {
    const users = realm.objects('User');

    // Check if there are any users to delete
    if (users.length > 0) {
      console.log(`Removing ${users.length} user(s) from Realm...`);
      realm.delete(users);
      console.log('User(s) removed successfully.');
    } else {
      console.log('No users found to remove.');
    }
  });
}

/**
 * Replaces the current user in the local Realm database.
 * If a user already exists, it is removed before inserting the new one.
 * If no user exists, the new one is simply created.
 *
 * @param {Object} user - The user object containing authentication and profile data.
 */
export function replaceUser(user) {
  console.log('Replacing user with email:', user.email);

  // Remove any existing users from the Realm
  removeUsers();

  // Insert the new user object into Realm
  realm.write(() => {
    realm.create(
      'User',
      {
        name: user.email,
        token: user.token,
        authToken: user.authToken,
        genre: user.genre,
        password: user.password,
        birth: user.birth,
        provider: user.provider,
      },
      true, // 'true' indicates update if the primary key already exists
    );
  });

  console.log('User replaced successfully.');
}

/**
 * Retrieves current activity kind of order
 */
export function retrieveOrder(userId) {
  // Query the 'Setting' collection for entries matching the user ID and type "ORDER"
  const order = realm
    .objects('Setting')
    .filtered('userId == $0 AND type == "ORDER"', userId);

  // Return the order key if found, otherwise return 'default'
  return order.length > 0 ? order[0].key : 'default';
}

/**
 * Updates or creates the "ORDER" setting for a user.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} key - The order value to store in the `key` field.
 */
export function modifyOrder(userId, key) {
  realm.write(() => {
    const existingOrder = realm
      .objects('Setting')
      .filtered(`userId = "${userId}" AND type = "ORDER"`);

    if (existingOrder.length > 0) {
      existingOrder[0].key = key;
    } else {
      realm.create('Setting', {
        userId,
        type: 'ORDER',
        key,
        value: true,
      });
    }
  });
}

// Filters activities based on user settings
export function filterActivities(userId) {
  let activities = realm.objects('Activity');

  // Get settings specific to the user and "SETTINGS" type
  const settings = realm
    .objects('Setting')
    .filtered(`userId = "${userId}" AND type = "SETTINGS"`);

  // Exclude activity types that are disabled in the settings
  settings.forEach(setting => {
    if (!setting.value) {
      const key = setting.key.replace(/ /g, ''); // Normalize key (no spaces)
      activities = activities.filtered(`type != "${key}"`);
    }
  });

  // Get user sorting preference
  const order = retrieveOrder(userId);

  // Sort activities based on the retrieved order preference
  switch (order) {
    case 'title':
      activities = activities.sorted('title');
      break;
    case 'stars':
      activities = activities.sorted([
        ['rating', true], // Sort by rating descending
        ['title', false], // Then by title ascending
      ]);
      break;
    case 'time':
      activities = activities.sorted('ending'); // Sort by end time
      break;
    case 'distance':
      // Not implemented yet
      break;
    case 'type':
      activities = activities.sorted('type');
      break;
    default:
      break;
  }

  return activities;
}

/**
 * Checks if an activity with the given ID already exists.
 */
export function existsActivity(activity) {
  const activities = realm
    .objects('Activity')
    .filtered(`id = "${activity.id}"`);

  return activities.length > 0;
}

/**
 * Marks activity with a specific action and optional value
 */
export function markActivityAs(activity, action, value) {
  if (!existsActivity(activity)) {
    return null;
  }

  realm.write(() => {
    const actions = {
      CLICKED: () => {
        activity.clicked = true;
      },
      SAVED: () => {
        activity.state = value ? 'saved' : 'default';
      },
      DISCARDED: () => {
        activity.discarded = true;
      },
      RATED: () => {
        activity.rating = value;
      },
    };

    if (actions[action]) {
      actions[action]();
    }
  });
}

/**
 * Deletes an activity from Realm by its ID
 */
export function deleteActivityById(id) {
  const activity = realm.objectForPrimaryKey('Activity', id);
  if (!activity) {
    return;
  }

  realm.write(() => {
    realm.delete(activity);
  });
}

/**
 * Obtains all activities rated with 3 stars or more
 */
export function getAllActivities() {
  // Consulta Realm para obtener actividades con rating >= 3
  const activities = realm.objects('Activity').filtered('rating >= 3');

  // Mapear a JSON "plano" (Realm devuelve objetos proxys que no son serializables directamente)
  return activities.map(activity => ({
    id: activity.id,
    authorId: activity.authorId,
    author: activity.author,
    title: activity.title,
    type: activity.type,
    description: activity.description,
    img: activity.img,
    longitude: activity.longitude,
    latitude: activity.latitude,
    rating: activity.rating,
    begin: activity.begin,
    ending: activity.ending,
  }));
}

// Retrieves current user token
export const currentAuthToken = () => retrieveUser()?.authToken ?? null;

/**
 * Retrieves the latest context object by key from the database
 */
export const retrieveContext = key => {
  // Query the 'JSON' collection, filtering by key and sorting by id descending
  const objects = realm
    .objects('JSON')
    .filtered('key = "' + key + '"')
    .sorted('id', true);

  // Return the first object if found, otherwise null
  if (objects.length === 0) {
    return null;
  }

  console.log(objects[0].id);
  return objects[0];
};

/**
 * Retrieves a specific setting value for a user
 */
export const retrieveValueSetting = (userId, type, key) => {
  // Query the 'Setting' collection, filtering by userId, type, and key
  const setting = realm
    .objects('Setting')
    .filtered(
      'userId = "' +
        userId +
        '" AND type = "' +
        type +
        '" AND key = "' +
        key +
        '"',
    );

  // Return the setting value if found, otherwise default to true
  return setting.length > 0 ? setting[0].value : true;
};

/**
 * Retrieves the value of a parameter from the Realm database based on user ID, type, and key.
 *
 * @param {string} userId - The user identifier.
 * @param {string} type - The type of the parameter (e.g., "PROFILE").
 * @param {string} key - The key of the parameter to look for.
 * @returns {any|null} The value of the parameter if it exists, or null if not found.
 */
export function retrieveValueParameter(userId, type, key) {
  const setting = realm
    .objects('Parameter')
    .filtered(`userId="${userId}" AND type="${type}" AND key="${key}"`);

  return setting?.[0]?.value ?? null;
}

/**
 * Stores or updates a parameter in the Realm database based on user ID, type, and key.
 * If the parameter already exists, its value is updated; otherwise, a new parameter is created.
 *
 * @param {string} userId - The user identifier.
 * @param {string} type - The type of the parameter (e.g., "SETTINGS", "PROFILE").
 * @param {string} key - The key of the parameter to store.
 * @param {any} value - The value to store or update.
 */
export function storeParameter(userId, type, key, value) {
  const existingParam = retrieveParameter(userId, type, key);

  realm.write(() => {
    if (existingParam) {
      existingParam.value = value;
    } else {
      realm.create('Parameter', {
        userId,
        type, // e.g., "SETTINGS" or "PROFILE"
        key,
        value,
      });
    }
  });
}

/**
 * Retrieves a parameter object from the Realm database based on userId, type, and key.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} type - The type/category of the parameter (e.g., "PROFILE", "SETTINGS").
 * @param {string} key - The key identifying the specific parameter.
 * @returns {Realm.Object|null} The matching Parameter object if found, or null if not found.
 */
export function retrieveParameter(userId, type, key) {
  const result = realm
    .objects('Parameter')
    .filtered(`userId = "${userId}" AND type = "${type}" AND key = "${key}"`);

  return result.length > 0 ? result[0] : null;
}

/**
 * Creates or updates a JSON object in the Realm database with a given key.
 * If an entry with the key already exists, it assigns a new incremented ID.
 *
 * @param {string} key - The unique identifier for the context object.
 * @param {string} json - The JSON string to store.
 */
export const CreateContext = (key, json) => {
  try {
    console.log('CreateContext(): updating context');

    // Find the most recent object with the given key
    const results = realm
      .objects('JSON')
      .filtered('key == $0', key)
      .sorted('id', true);
    const lastId = results.length > 0 ? results[0].id : 0;

    const newId = lastId + 1;
    console.log('CreateContext(): new id = ' + newId);

    // Write the new or updated object to Realm
    realm.write(() => {
      realm.create(
        'JSON',
        {
          id: newId,
          key: key,
          json: json,
        },
        true,
      ); // `true` = update if exists
    });

    console.log('CreateContext(): saved successfully');
  } catch (error) {
    console.error('CreateContext(): ERROR', error);
  }
};

// Retrieves current user token
export function currentToken() {
  const user = retrieveUser();
  return user?.token ?? null;
}

/**
 * Retrieves the most recent location stored in the Realm database.
 *
 * @returns {Object|null} The latest Position object if available, otherwise null.
 */
export function retrieveCurrentLocation() {
  const positions = realm.objects('Position').sorted('timestamp', true);
  return positions.length > 0 ? positions[0] : null;
}

/**
 * Stores the user's location in the database.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {Object} position - The position object containing the coordinates.
 */
export function storeLocation(userId, position) {
  const time = Date.now(); // Gets the current timestamp in milliseconds
  realm.write(() => {
    // Creates a new Position record in the realm database
    realm.create('Position', {
      userId,
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      timestamp: time,
    });
  });
}

/**
 * Stores an array of context rules into the Realm database.
 * Each object in the JSON array is inserted as a 'ContextRule' entry.
 *
 * @param {Array<Object>} json - Array of context rule objects to store.
 */
export function storeContextRulesFromJson(json) {
  console.log('Storing context rules from JSON...');

  if (!Array.isArray(json) || json.length === 0) {
    console.warn('No context rules provided or input is not a valid array.');
    return;
  }

  realm.write(() => {
    json.forEach(rule => {
      try {
        realm.create('ContextRule', rule);
      } catch (error) {
        console.error('Failed to store context rule:', rule, error);
      }
    });
  });

  console.log('Finished storing context rules.');
}

/**
 * Stores an array of exclusion sets into the Realm database.
 * Each object in the JSON array is inserted as an 'ExclusionSet' entry.
 *
 * @param {Array<Object>} json - Array of exclusion set objects to store.
 */
export function storeExclusionSetsFromJson(json) {
  console.log('Storing exclusion sets from JSON...');

  if (!Array.isArray(json) || json.length === 0) {
    console.warn('No exclusion sets provided or input is not a valid array.');
    return;
  }

  realm.write(() => {
    json.forEach(set => {
      try {
        realm.create('ExclusionSet', set);
      } catch (error) {
        console.error('Failed to store exclusion set:', set, error);
      }
    });
  });

  console.log('Finished storing exclusion sets.');
}

/**
 * Retrieves all ContextRule objects from the Realm database, sorted by name.
 *
 * @returns {Realm.Results<Object> | null} A list of ContextRule objects or null if none are found.
 */
export function retrieveContextRules() {
  // Query all ContextRule objects and sort them alphabetically by 'name'
  const contextRules = realm.objects('ContextRule').sorted('name');

  // Return the list if any exist, otherwise return null
  return contextRules.length > 0 ? contextRules : null;
}

/**
 * Deletes a ContextRule object from the Realm database by its primary key.
 *
 * @param {string} id - The primary key (ID) of the ContextRule to delete.
 */
export function deleteContextRuleById(id) {
  const contextRule = realm.objectForPrimaryKey('ContextRule', id);

  if (contextRule) {
    realm.write(() => {
      realm.delete(contextRule);
    });
  }
}

/**
 * Checks if a context rule with the given name already exists in the Realm database.
 *
 * @param {string} name - The name of the context rule to check for existence.
 * @returns {boolean} - Returns true if a rule with the given name exists, false otherwise.
 */
export function existsByNameContextRule(name) {
  // Query Realm for any ContextRule objects with the specified name
  const existingRules = realm
    .objects('ContextRule')
    .filtered('name == $0', name);

  // If no matching rules are found, return false; otherwise, return true
  return existingRules.length > 0;
}

/**
 * Checks if a context rule with the specified name already exists,
 * excluding the context rule with the given ID.
 *
 * @param {string} id - The ID of the context rule to exclude from the search.
 * @param {string} name - The name to check for uniqueness.
 * @returns {boolean} True if another context rule with the same name exists, false otherwise.
 */
export function existsByNameContextRuleAndId(id, name) {
  // Query all context rules that match the given name but have a different ID
  const existingRules = realm
    .objects('ContextRule')
    .filtered('name == $0 AND id != $1', name, id);

  // Return true if one or more matches are found, false otherwise
  return existingRules.length > 0;
}

/**
 * Stores a new Location Context Rule in the Realm database.
 *
 * The rule is assigned an auto-incremented ID based on the highest existing ID.
 * Other fields not relevant to the "Location" type are set to null.
 *
 * @param {string} name - The name of the context rule.
 * @param {number} gpsLatitude - The latitude coordinate for the location rule.
 * @param {number} gpsLongitude - The longitude coordinate for the location rule.
 * @param {number} meters - The allowed location error (in meters).
 */
export function storeLocationContextRule(
  name,
  gpsLatitude,
  gpsLongitude,
  meters,
) {
  // Get the most recent ContextRule sorted by ID in descending order
  const lastContextRule = realm.objects('ContextRule').sorted('id', true)[0];

  // Calculate the next ID for the new rule
  const maxId = lastContextRule == null ? 0 : lastContextRule.id;
  const newId = maxId === 0 ? 1 : maxId + 1;

  // Write the new rule into the Realm database
  realm.write(() => {
    realm.create('ContextRule', {
      id: newId,
      type: 'Location',
      name: name,
      gpsLatitude: gpsLatitude,
      gpsLongitude: gpsLongitude,
      locationError: meters,
      startTime: null,
      endTime: null,
      startDate: null,
      endDate: null,
      minTemp: null,
      maxTemp: null,
    });
  });
}

/**
 * Updates an existing location context rule in the Realm database.
 * If the rule with the given ID does not exist, it will be created.
 *
 * @param {string} id - Unique identifier of the context rule.
 * @param {string} name - Name of the context rule.
 * @param {number} gpsLatitude - Latitude value for the rule's location.
 * @param {number} gpsLongitude - Longitude value for the rule's location.
 * @param {number} locationError - Acceptable location error in meters.
 */
export function updateLocationContextRule(
  id,
  name,
  gpsLatitude,
  gpsLongitude,
  locationError,
) {
  // Open a Realm write transaction
  realm.write(() => {
    // Create or update the context rule with the provided values
    realm.create(
      'ContextRule',
      {
        id: id,
        name: name,
        gpsLatitude: gpsLatitude,
        gpsLongitude: gpsLongitude,
        locationError: locationError,
      },
      true,
    ); // `true` enables upsert (update if exists, create if not)
  });
}

/**
 * Stores a new time-based context rule in the Realm database.
 *
 * This function creates a new entry in the `ContextRule` schema with the provided
 * name, start time, and end time. It automatically assigns a unique incremental ID
 * and sets the context rule type to "Time-Based". Other properties are set to null
 * as they are not relevant for time-based rules.
 *
 * @param {string} name - The name of the context rule.
 * @param {string} startTime - The start time of the rule in 'HH:mm' format.
 * @param {string} endTime - The end time of the rule in 'HH:mm' format.
 */
export function storeTimeBasedContextRule(name, startTime, endTime) {
  // Retrieve the most recent ContextRule by ID, in descending order.
  const lastContextRule = realm.objects('ContextRule').sorted('id', true)[0];

  // Determine the next available ID.
  const maxId = lastContextRule == null ? 0 : lastContextRule.id;
  const newId = maxId === 0 ? 1 : maxId + 1;

  // Write a new context rule to the Realm database.
  realm.write(() => {
    realm.create('ContextRule', {
      id: newId,
      type: 'Time-Based', // Fixed type for time-based rules.
      name: name,
      startTime: startTime,
      endTime: endTime,

      // The following fields are not used for time-based rules and are set to null.
      gpsLatitude: null,
      gpsLongitude: null,
      locationError: null,
      startDate: null,
      endDate: null,
      minTemp: null,
      maxTemp: null,
    });
  });
}

/**
 * Updates an existing time-based context rule in the Realm database.
 *
 * If a rule with the specified ID exists, it will be updated.
 * If not, a new one will be created with the given parameters.
 *
 * @param {string} id - Unique identifier of the context rule.
 * @param {string} name - Name of the context rule.
 * @param {string} startTime - Start time in HH:mm format (e.g. "08:00").
 * @param {string} endTime - End time in HH:mm format (e.g. "18:00").
 */
export const updateTimeBasedContextRule = (id, name, startTime, endTime) => {
  realm.write(() => {
    realm.create(
      'ContextRule',
      {
        id,
        name,
        startTime,
        endTime,
      },
      true, // 'true' means to update the object if it already exists
    );
  });
};

/**
 * Stores a new calendar-based context rule in the Realm database.
 *
 * @param {string} name - The name of the context rule.
 * @param {Array<{ key: string, checked: boolean }>} daysOfWeek - The days of the week associated with the rule.
 * @param {string} startDate - The optional start date for the rule (format: dd/mm/yyyy or empty).
 * @param {string} endDate - The optional end date for the rule (format: dd/mm/yyyy or empty).
 */
export function storeCalendarBasedContextRule(
  name,
  daysOfWeek,
  startDate,
  endDate,
) {
  try {
    console.log('DAYS OF WEEK:', daysOfWeek);

    // Get the last context rule by ID to determine the next ID
    const lastRule = realm.objects('ContextRule').sorted('id', true)[0];
    const newId = lastRule ? lastRule.id + 1 : 1;

    // Write the new rule to the Realm database
    realm.write(() => {
      realm.create('ContextRule', {
        id: newId,
        type: 'Calendar-Based',
        name,
        daysOfWeek,
        startDate,
        endDate,
        startTime: null,
        endTime: null,
        gpsLatitude: null,
        gpsLongitude: null,
        locationError: null,
        minTemp: null,
        maxTemp: null,
      });
    });

    console.log(`Context rule "${name}" saved with ID: ${newId}`);
  } catch (error) {
    console.error('Failed to store calendar-based context rule:', error);
  }
}

/**
 * Updates an existing calendar-based context rule in the Realm database.
 *
 * If a rule with the given `id` already exists, it will be overwritten with the new values.
 * This function should be called inside a write transaction.
 *
 * @param {string} id - Unique identifier of the context rule.
 * @param {string} name - The name of the context rule.
 * @param {Array<{ key: string, checked: boolean }>} daysOfWeek - Array of days with selection status.
 * @param {string} startDate - Start date in the format 'dd/mm/yyyy' or '__/__/__'.
 * @param {string} endDate - End date in the format 'dd/mm/yyyy' or '__/__/__'.
 */
export function updateCalendarBasedContextRule(
  id,
  name,
  daysOfWeek,
  startDate,
  endDate,
) {
  try {
    realm.write(() => {
      realm.create(
        'ContextRule',
        {
          id,
          name,
          daysOfWeek,
          startDate,
          endDate,
        },
        true, // 'true' means to update the object if it already exists
      );
    });
  } catch (error) {
    console.error('Failed to update calendar-based context rule:', error);
  }
}

/**
 * Stores a new weather-based context rule in the Realm database.
 *
 * @param {string} name - The unique name of the context rule.
 * @param {Array<{ key: string, checked: boolean }>} weatherStatus - An array of weather status objects with selection state.
 * @param {number} minTemp - The minimum temperature threshold for this rule.
 * @param {number} maxTemp - The maximum temperature threshold for this rule.
 */
export function storeWeatherContextRule(name, weatherStatus, minTemp, maxTemp) {
  // Retrieve the last context rule sorted by descending ID
  const lastContextRule = realm.objects('ContextRule').sorted('id', true)[0];

  // Generate new unique ID
  const newId = lastContextRule ? lastContextRule.id + 1 : 1;

  // Perform a Realm write transaction
  realm.write(() => {
    realm.create('ContextRule', {
      id: newId,
      type: 'Weather', // Rule type identifier
      name,
      weatherStatus,
      minTemp,
      maxTemp,
      startDate: null,
      endDate: null,
      startTime: null,
      endTime: null,
      gpsLatitude: null,
      gpsLongitude: null,
      locationError: null,
    });
  });
}

/**
 * Updates an existing weather-based context rule in the Realm database.
 *
 * If a context rule with the specified `id` already exists, it will be updated.
 * If it does not exist, a new one will be created with the given values.
 *
 * @param {string} id - Unique identifier of the context rule.
 * @param {string} name - Name of the context rule.
 * @param {Array<{ key: string, checked: boolean }>} weatherStatus - Array of weather status conditions with a checked flag.
 * @param {number} minTemp - Minimum temperature threshold for the rule.
 * @param {number} maxTemp - Maximum temperature threshold for the rule.
 */
export function updateWeatherContextRule(
  id,
  name,
  weatherStatus,
  minTemp,
  maxTemp,
) {
  // Begin a write transaction in the Realm database
  realm.write(() => {
    // Create or update a ContextRule object with the provided values
    realm.create(
      'ContextRule',
      {
        id: id,
        name: name,
        weatherStatus: weatherStatus,
        minTemp: minTemp,
        maxTemp: maxTemp,
      },
      true,
    ); // `true` indicates that this is an upsert operation
  });
}

/**
 * Stores a new server-based context rule in the Realm database.
 *
 * @param {string} name - The name of the context rule.
 * @param {string} server - The name of the external server to use.
 * @param {string} measurement - The measurement type (e.g., "co2", "temperature").
 * @param {string} comparator - The comparator to apply (e.g., ">", "<", "=").
 * @param {number} value - The numeric value to compare against.
 */
export function storeServerBasedContextRule(
  name,
  server,
  measurement,
  comparator,
  value,
) {
  console.log('storeServerBasedContextRule');

  // Retrieve the latest ContextRule by descending ID
  const lastContextRule = realm.objects('ContextRule').sorted('id', true)[0];

  // Determine the next available ID
  const maxId = lastContextRule == null ? 0 : lastContextRule.id;
  const newId = maxId === 0 ? 1 : maxId + 1;

  // Write the new context rule to the Realm database
  realm.write(() => {
    realm.create('ContextRule', {
      id: newId,
      type: 'Server-Based',
      name: name,
      server: server,
      measurement: measurement,
      comparator: comparator,
      value: value,
    });
  });
}

/**
 * Updates or creates a server-based context rule in the Realm database.
 *
 * @param {string} id - Unique identifier of the context rule.
 * @param {string} name - Name of the context rule.
 * @param {string} server - The server associated with the rule.
 * @param {string} measurement - The measurement to be evaluated.
 * @param {string} comparator - The comparator to be used (e.g., '>', '<=', '==').
 * @param {number} value - The value to compare the measurement against.
 */
export function updateServerBasedContextRule(
  id,
  name,
  server,
  measurement,
  comparator,
  value,
) {
  // Use a Realm write transaction to create or update the context rule
  realm.write(() => {
    realm.create(
      'ContextRule',
      {
        id,
        name,
        server,
        measurement,
        comparator,
        value,
      },
      true, // `true` indicates that this is an upsert operation
    );
  });
}

/**
 * Retrieves the current user server token from Realm.
 * @returns {Token | null} The token object or null if none found.
 */
export function retrieveCurrentToken() {
  const tokens = realm.objects('Token');
  return tokens.length > 0 ? tokens[0] : null;
}

/**
 * Stores a server token in the local Realm database.
 *
 * It automatically assigns a unique `id` by incrementing the highest current ID.
 * The token is associated with a provider and a timestamp (date).
 *
 * @param {string} token - The authentication token to store.
 * @param {string} provider - The name of the service provider (e.g., 'sensorizar').
 * @param {Date} date - The timestamp indicating when the token was received.
 */
export function storeServerToken(token, provider, date) {
  // Get the highest current ID from the Token entries
  const lastToken = realm.objects('Token').sorted('id', true)[0];
  const maxId = lastToken ? lastToken.id : 0;
  const newId = maxId + 1;

  // Write the new token into the Realm database
  realm.write(() => {
    realm.create('Token', {
      id: newId,
      token,
      provider,
      timestamp: date,
    });
  });
}

/**
 * Retrieves the most recent JSON object stored under a given key from the Realm database.
 *
 * The entries are sorted by `id` in descending order to get the latest one.
 *
 * @param {string} key - The key associated with the stored JSON context (e.g., 'LOCATION', 'WEATHER').
 * @returns {Object|null} The most recent JSON Realm object for the given key, or null if none exist.
 */
export function retrieveLastContext(key) {
  const objects = realm
    .objects('JSON')
    .filtered('key == $0', key)
    .sorted('id', true);

  return objects.length > 0 ? objects[0] : null;
}

/**
 * Retrieves all stored Context Rules of type 'Location' from the Realm database.
 *
 * @returns {Realm.Results<Object>|null} A list of 'Location' context rules, or null if none are found.
 */
export function retrieveLocationCR() {
  const locationCR = realm
    .objects('ContextRule')
    .filtered("type == 'Location'");
  return locationCR.length > 0 ? locationCR : null;
}

/**
 * Retrieves the names of all active TriggeringRules sorted by name.
 * @returns {string[]} An array of active triggering rule names.
 */
export function getActiveTriggeringRulesName() {
  const triggeringRules = realm
    .objects('TriggeringRule')
    .filtered('switchState == true')
    .sorted('name');

  return triggeringRules.map(rule => rule.name);
}

/**
 * Retrieves all TriggeringRule objects with switchState set to true,
 * sorted alphabetically by name.
 *
 * @returns {Realm.Results | null} An array-like Realm.Results of active TriggeringRule objects, or null if none found.
 */
export const retrieveTriggeringRulesSwitchOn = () => {
  // Query Realm for TriggeringRules where switchState is true and sort them by name
  const triggeringRules = realm
    .objects('TriggeringRule')
    .filtered('switchState == true')
    .sorted('name');

  // Return the results if any are found, otherwise return null
  return triggeringRules.length > 0 ? triggeringRules : null;
};

/**
 * Retrieve the activity with
 * the same activity.authorId &
 * user provided
 */
function retrieveActivityAuthor(activity) {
  let token = currentToken();
  // If token or activity is null it cannot exit
  if (token == null || activity == null) {
    return null;
  }
  let activities = realm
    .objects('Activity')
    .filtered(
      'authorId = "' +
        activity.authorId +
        '" AND ' +
        ' author = "' +
        activity.author +
        '" AND ' +
        'user = "' +
        token +
        '"',
    );
  // console.log(activities[0]);
  if (activities.length > 0) {
    return activities[0];
  } else {
    return null;
  }
}

/**
 * Guarda o actualiza una actividad en Realm.
 * Devuelve `true` si se ha creado/actualizado, `false` si no era relevante.
 */
export function storeActivity(activity) {
  console.log('storeActivity');

  const user = retrieveUser();
  if (!user?.token) {
    console.warn('No user token found, skipping activity store.');
    return false;
  }

  // Verificar si ya existe una actividad del mismo autor/usuario
  const oldActivity = retrieveActivityAuthor(activity);
  if (oldActivity) {
    return updateActivity(oldActivity, activity);
  }

  const date = new Date();

  // Campos base para todas las actividades
  const baseData = {
    id: activity.id,
    authorId: activity.authorId,
    author: activity.author ?? '',
    title: activity.title,
    type: activity.type,
    description: activity.description,
    img: activity.img,
    longitude: activity.longitude,
    latitude: activity.latitude,
    user: user.token,
    discarded: false,
    clicked: false,
    date,
  };

  // Solo añadir begin/ending si existen y son válidos
  if (activity.begin && activity.ending) {
    baseData.begin = activity.begin;
    baseData.ending = activity.ending;
  }

  // Escritura en Realm
  realm.write(() => {
    realm.create('Activity', baseData, 'modified');
    // "modified" asegura update si ya existe la PK
  });

  return true;
}

/**
 * Actualiza una actividad en Realm.
 * Considera "cambio relevante" si se modifican título o coordenadas.
 *
 * @param {Object} old - Actividad existente en Realm
 * @param {Object} activity - Nueva actividad con datos actualizados
 * @returns {boolean} - true si hubo cambio relevante, false en caso contrario
 */
export function updateActivity(old, activity) {
  console.log('UPDATE ACTIVITY');

  const date = new Date();

  // Detectar cambio relevante
  const change =
    old.title !== activity.title ||
    old.longitude !== activity.longitude ||
    old.latitude !== activity.latitude;

  realm.write(() => {
    // Campos comunes
    old.author = activity.author;
    old.title = activity.title;
    old.type = activity.type;
    old.description = activity.description;
    old.img = activity.img;
    old.longitude = activity.longitude;
    old.latitude = activity.latitude;
    old.date = date;

    // Solo si tiene begin/ending válidos
    if (activity.begin && activity.ending) {
      old.begin = activity.begin;
      old.ending = activity.ending;
    }
  });

  return change;
}

/**
 * Actualiza la puntuación (rating) de una actividad en Realm.
 *
 * @param {Realm.Object} activity - Objeto de actividad gestionado por Realm.
 * @param {number} newRating - Nuevo valor de la puntuación (ej. de 0 a 5).
 */
export function updateActivityRating(activity, newRating) {
  realm.write(() => {
    activity.rating = Math.round(newRating);
  });
}

// ===========================================================================
// Recommendation system helpers
// ===========================================================================

/**
 * Returns every ZaragozaPOI as a plain JS array, detached from Realm.
 *
 * Recommendation algorithms run as pure functions and must NOT receive Realm
 * proxies (they could be GC'd, re-emitted on a different thread, or invalidated
 * by a write transaction). We materialize coordinates and identifiers eagerly.
 *
 * @returns {Array<Object>} Plain POI objects ready to feed an algorithm.
 */
export function getAllZaragozaPOIs() {
  return realm.objects('ZaragozaPOI').map(p => ({
    id: p.id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    type: p.type,
    description: p.description ?? null,
    photoUrl: p.photoUrl ?? null,
    source: p.source,
    lastUpdated: p.lastUpdated,
  }));
}

/**
 * Removes every cached recommendation row for a given (user, algorithm) pair.
 * Used by the engine before persisting a fresh recommendation batch so callers
 * never see a mix of old and new entries.
 *
 * @param {string} userId
 * @param {string} algorithmId
 */
export function clearRecommendationCache(userId, algorithmId) {
  realm.write(() => {
    const stale = realm
      .objects('RecommendationCache')
      .filtered('userId == $0 AND algorithm == $1', userId, algorithmId);
    if (stale.length > 0) {
      realm.delete(stale);
    }
  });
}

/**
 * Reads a cached recommendation batch back from Realm, sorted DESC by score.
 * Returned as plain objects so the caller can pass them around freely.
 *
 * @param {string} userId
 * @param {string} algorithmId
 * @returns {Array<{id: string, userId: string, poiId: number, score: number, algorithm: string, timestamp: Date}>}
 */
export function getCachedRecommendations(userId, algorithmId) {
  return realm
    .objects('RecommendationCache')
    .filtered('userId == $0 AND algorithm == $1', userId, algorithmId)
    .sorted('score', true)
    .map(r => ({
      id: r.id,
      userId: r.userId,
      poiId: r.poiId,
      score: r.score,
      algorithm: r.algorithm,
      timestamp: r.timestamp,
    }));
}

/**
 * Returns the most recent cached recommendation batch for a user, already
 * hydrated with the corresponding POIs. Looks across every algorithm and
 * picks the one whose latest row has the newest timestamp — that is, the
 * batch produced by whichever engine or bridge fired most recently.
 *
 * Used by the Recommendations screen to surface recommendations produced
 * automatically by the rule-engine bridge (which persists them to the cache
 * without pushing anything to the UI on its own).
 *
 * @param {string} userId
 * @returns {{
 *   algorithm: string,
 *   timestamp: Date,
 *   items: Array<{poiId: number, score: number, poi: Object|null}>
 * } | null}
 */
export function getLatestCachedBatch(userId) {
  const allCached = realm
    .objects('RecommendationCache')
    .filtered('userId == $0', userId)
    .sorted('timestamp', true);
  if (allCached.length === 0) {
    return null;
  }

  const latestAlgo = allCached[0].algorithm;
  const latestTs = new Date(allCached[0].timestamp);

  const batch = allCached
    .filtered('algorithm == $0', latestAlgo)
    .sorted('score', true);

  const poisById = new Map(
    realm.objects('ZaragozaPOI').map(p => [
      p.id,
      {
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        type: p.type,
        description: p.description ?? null,
        photoUrl: p.photoUrl ?? null,
        source: p.source,
        lastUpdated: p.lastUpdated,
      },
    ]),
  );

  return {
    algorithm: latestAlgo,
    timestamp: latestTs,
    items: Array.from(batch).map(r => ({
      poiId: r.poiId,
      score: r.score,
      poi: poisById.get(r.poiId) ?? null,
    })),
  };
}

/**
 * Returns all valorations for a user as plain objects.
 * Used by CustomAlgorithm to factor in historical ratings.
 *
 * @param {string} userId
 * @returns {Array<{id, userId, poiId, rating, timestamp}>}
 */
export function getValorations(userId) {
  return realm
    .objects('Valoration')
    .filtered('userId == $0', userId)
    .map(v => ({
      id: v.id,
      userId: v.userId,
      poiId: v.poiId,
      rating: v.rating,
      timestamp: v.timestamp,
    }));
}
