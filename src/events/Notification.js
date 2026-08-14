import notifee, {
  AuthorizationStatus,
  AndroidImportance,
  EventType,
} from '@notifee/react-native';

import * as Schemas from '../realmSchemas/RealmServices';
/**
 * Requests notification permissions from the user.
 * Should be called on app startup or before scheduling notifications.
 *
 * @returns {Promise<boolean>} True if permission is granted, false otherwise.
 */
export async function configureNotifications() {
  const settings = await notifee.requestPermission();

  const granted = settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;

  if (granted) {
    console.log('Notification permission granted');
  } else {
    console.log('Notification permission denied');
  }

  return granted;
}



/**
 * Handles foreground notification events, specifically when the user presses a notification.
 * Logs the notification and attempts to process its data using the `processItem` function.
 *
 * This listener should be set up once, typically at app startup.
 *
 * @function onForegroundEvent
 */
notifee.onForegroundEvent(({ type, detail }) => {
  if (type === EventType.PRESS) {
    console.log('NOTIFICATION (foreground):', detail.notification);
    const data = detail.notification?.data;
    // v3: bridge-driven notifications open the Recommendations screen so
    // the user can immediately see the automatically-generated batch. Skip
    // the heredado processItem() (which expects an R-Rules Activity payload).
    if (data?.source === 'rule-engine-bridge') {
      console.log(
        '[Notification] rule-engine-bridge press → navigating to Recommendations',
      );
      // Lazy require to avoid loading navigation code in test envs.
      // eslint-disable-next-line global-require
      const {navigateToScreen} = require('../navigation/navigationRef');
      navigateToScreen('Recommendations');
      return;
    }
    try {
      // Ensure data exists before processing
      if (data) {
        processItem(data);
      } else {
        console.warn('Notification data is undefined.');
      }
    } catch (error) {
      console.error('Error processing notification data:', error);
    }
  }
});


/**
 * Handles background notification events, specifically when the user presses a notification.
 * Logs the notification and attempts to process its data using the `processItem` function.
 *
 * This listener must be defined in the root of your JavaScript entry file (e.g., index.js).
 * Notifee requires background handlers to be registered early and only once.
 *
 * @function onBackgroundEvent
 */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    console.log('NOTIFICATION (background):', detail.notification);
    const data = detail.notification?.data;
    // v3: navigate to Recommendations for bridge-driven notifications
    // (same as the foreground handler). If the navigator is not ready yet
    // — because the app was cold-started by tapping the notification — the
    // navigateToScreen helper logs and returns silently. The user still
    // ends up in Home, one tap away from Recommendations.
    if (data?.source === 'rule-engine-bridge') {
      console.log(
        '[Notification] rule-engine-bridge press (background) → navigating to Recommendations',
      );
      // eslint-disable-next-line global-require
      const {navigateToScreen} = require('../navigation/navigationRef');
      navigateToScreen('Recommendations');
      return;
    }
    try {
      if (data) {
        await processItem(data);
      } else {
        console.warn('Notification data is undefined.');
      }
    } catch (error) {
      console.error('Error processing notification data:', error);
    }
  }
});


/**
 * Processes a notification item by validating its required fields and storing it.
 * Logs the item, checks for mandatory fields, builds a normalized object, and stores it via `Schemas.storeActivity`.
 *
 * @function processItem
 * @param {Object} item - The notification data payload.
 * @returns {boolean} - Returns true if the item was stored successfully, false if validation or storage fails.
 */
export function processItem(item = {}) {
  console.log(`CREATE NOTIFICATION ${item.id}: ${JSON.stringify(item)}`);

  const requiredFields = ['id', 'authorId', 'author', 'title', 'description'];
  for (const field of requiredFields) {
    if (item[field] == null) {
      console.warn(`Missing required field: ${field}`);
      return false;
    }
  }

  const {
    id,
    authorId,
    author,
    title,
    description,
    img = null,
    type = 'Others',
    latitude = 0,
    longitude = 0,
    begin = 0,
    ending = 0,
  } = item;

  let user;
  try {
    user = Schemas.retrieveUser();
  } catch (err) {
    console.error('Failed to retrieve user:', err);
    return false;
  }

  const notification = {
    id,
    authorId,
    author,
    title,
    description,
    img,
    type,
    latitude,
    longitude,
    begin,
    ending,
    user,
  };

  console.log('Activity to store:', notification);

  try {
    return Schemas.storeActivity(notification);
  } catch (err) {
    console.error('Failed to store activity:', err);
    return false;
  }
}


/**
 * Schedules a local notification to appear 5 seconds from now using Notifee.
 *
 * This is a test function meant to verify scheduled notification behavior.
 *
 * @function localScheduledTest
 * @returns {Promise<void>}
 */
export async function localScheduledTest() {
  const triggerTimestamp = Date.now() + 5000; // 5 seconds from now

  await notifee.createTriggerNotification(
    {
      title: 'Test Notification',
      body: 'Tap on me please ;)',
      android: {
        channelId: 'default', // Ensure this channel is created beforehand
        smallIcon: 'ic_cars_fore',
        largeIcon: 'ic_cars_fore',
      },
    },
    {
      type: notifee.TriggerType.TIMESTAMP,
      timestamp: triggerTimestamp,
    }
  );
}


/**
 * Displays an immediate local notification using Notifee.
 * Intended for testing notification appearance and behavior.
 *
 * @function localTest
 * @returns {Promise<void>}
 */
export async function localTest() {
  await notifee.displayNotification({
    title: 'CARS Notification',
    body: 'You may have new activities',
    android: {
      channelId: 'default', // Must be created beforehand
      smallIcon: 'ic_launcher_foreground',
      largeIcon: 'ic_launcher_foreground',
      color: 'green',
      pressAction: {
        id: 'default', // Used to handle press events
      },
      vibrationPattern: [0, 300],
      sound: 'default',
    },
  });
}

/**
 * Displays a local notification informing the user that new activities are available.
 *
 * This function is intended to notify the user of new content in the app.
 *
 * @function activityUpdate
 * @returns {Promise<void>}
 */
export async function activityUpdate() {
  await notifee.displayNotification({
    title: 'New items available',
    body: 'Check new activities',
    android: {
      channelId: 'default', // Ensure this channel exists
      smallIcon: 'ic_cars_fore',
      largeIcon: 'ic_cars_fore',
      color: 'green',
      pressAction: {
        id: 'default',
      },
      vibrationPattern: [0, 300],
    },
  });
}

/**
 * Displays a local push notification triggered by the rule-engine bridge
 * when a triggering rule fires and its associated recommendation algorithm
 * has just produced a fresh batch.
 *
 * The body is composed from the payload received by the bridge:
 *   - `recommendationType`: the type the rule requested (e.g. "Restaurants")
 *   - `algorithmId`: the algorithm that actually ran
 *   - `count`: number of POIs the algorithm returned
 *   - `ruleName` (optional): the name of the triggering rule, for traceability
 *
 * Uses the "default" channel created at startup by `createDefaultChannel()`.
 *
 * @param {Object} payload
 * @param {string} payload.recommendationType
 * @param {string} payload.algorithmId
 * @param {number} payload.count
 * @param {string} [payload.ruleName]
 * @returns {Promise<void>}
 */
export async function notifyRecommendation({
  recommendationType,
  algorithmId,
  count,
  ruleName,
}) {
  const type = recommendationType ?? 'recomendaciones';
  const algo = algorithmId ?? 'desconocido';
  const rule = ruleName ? ` por regla «${ruleName}»` : '';
  const body =
    count > 0
      ? `${count} sugerencias de ${type}${rule} con «${algo}»`
      : `Sin resultados para ${type}${rule}`;

  await notifee.displayNotification({
    title: 'Nueva recomendación disponible',
    body,
    android: {
      channelId: 'default',
      smallIcon: 'ic_launcher_foreground',
      largeIcon: 'ic_launcher_foreground',
      color: '#1e90ff',
      pressAction: {id: 'default'},
      // notifee requires all values in the pattern to be positive.
      // Format: [waitBeforeVibration, vibrateDuration, waitBetween, vibrate, ...]
      vibrationPattern: [300, 500],
      sound: 'default',
    },
    data: {
      source: 'rule-engine-bridge',
      recommendationType: type,
      algorithmId: algo,
      ruleName: ruleName ?? '',
    },
  });
}

/**
 * Creates the default notification channel required for Android.
 * Should be called before any notifications are displayed or scheduled.
 *
 * @function createDefaultChannel
 * @returns {Promise<void>}
 */
export async function createDefaultChannel() {
  await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
  });
}

