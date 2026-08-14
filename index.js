/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { processItem } from './src/events/Notification';
import { navigateToScreen } from './src/navigation/navigationRef';

// This block manages notification events when the app is in the foreground
notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      console.log('NOTIFICATION (foreground):', detail.notification);
      const data = detail.notification?.data;
      // v3: bridge-driven notifications open the Recommendations screen so
      // the user lands directly on the auto-generated batch.
      if (data?.source === 'rule-engine-bridge') {
        console.log(
          '[index] rule-engine-bridge press (foreground) → navigating to Recommendations',
        );
        navigateToScreen('Recommendations');
        return;
      }
      try {
        processItem(data);
      } catch (e) {
        console.log('Error processing notification in foreground:', e);
      }
    }
  });

// This block manages notification events when the app is in the background or quit
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    console.log('NOTIFICATION (background):', detail.notification);
    const data = detail.notification?.data;
    // v3: navigate to Recommendations for bridge-driven notifications (same as
    // the foreground handler). See navigationRef.js — if the navigator is not
    // yet ready (cold start via notification tap), the call becomes a no-op.
    if (data?.source === 'rule-engine-bridge') {
      console.log(
        '[index] rule-engine-bridge press (background) → navigating to Recommendations',
      );
      navigateToScreen('Recommendations');
      return;
    }
    try {
      await processItem(data);  // Asegúrate de usar async/await si es necesario
    } catch (e) {
      console.log('Error processing notification in background:', e);
    }
  }
});

AppRegistry.registerComponent(appName, () => App);

