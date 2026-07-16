//React
import React, {useEffect} from 'react';
import {
  View,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import RNCalendarEvents from 'react-native-calendar-events';
import {request, PERMISSIONS, RESULTS} from 'react-native-permissions';
//App icon
import icon from '../images/icon.png';

//Data for testing
import {
  getContextRulesExamples,
  getExclusionSetsExamples,
} from '../testData/LoadTestData';

//Events
import * as myCalendar from '../events/Calendar';
import * as myPosition from '../events/Position';
//import * as Notifications from '../events/Notification';

//EM
import * as Communication from '../em/Fetch';
import {checkEMAvailability} from '../em/Fetch'; // named export for the new probe

//Schemas
import * as Schemas from '../realmSchemas/RealmServices';

//Rule engine (Siddhi native OR JS, selected via the RULE_ENGINE Parameter)
import {getEngine, bootstrapRuleEngine} from '../background/ruleEngineAdapter';

//Bridge between the rule engine (Sprint 3) and the recommendation engine (Sprint 2)
import {bootstrapRecommendationBridge} from '../ruleEngine';

//Notifications
import * as Notifications from '../events/Notification';

//Settings value
import {getSettingValue} from '../realmSchemas/SettingsServices';

//P2P
import {initializeP2PIfEnabled} from '../p2p/communicationService';

//Zaragoza Open Data (PASEO integration)
import {realm} from '../realmSchemas/RealmInstance';
import {syncPOIs} from '../dataSource/ZaragozaDataSource';

const LoadingScreen = ({navigation}) => {
  useEffect(() => {
    const initialize = async () => {
      try {
        //Notifications.configureNotifications();
        const user = Schemas.retrieveUser();
        console.log('User:', user);

        // Initial load of Zaragoza POIs when the local DB is empty.
        // Kept here (inside Loading.js#initialize) because this screen is
        // the single entry-point that prepares the app state.
        await ensureZaragozaPOIsLoaded();

        if (user) {
          await prepareSession();
          navigation.replace('Home');
        } else {
          // Fake user - no EM needed
          const newUser = {
            email: 'test@test.com',
            token: '999',
            authToken: 'fake-token',
            password: 'fake',
            provider: 'local',
            genre: 'other',
            birth: '2000-01-01',
          };

          Schemas.replaceUser(newUser);

          Alert.alert('INFO', `You are logged in as ${newUser.email} (test)`);

          // Load rules and exclusions
          const rules = getContextRulesExamples();
          const exclusions = getExclusionSetsExamples();

          Schemas.storeContextRulesFromJson(rules);
          Schemas.storeExclusionSetsFromJson(exclusions);

          await fakePermissionLogin();

          navigation.replace('Home');
        }
      } catch (error) {
        console.error('Loading error:', error);
        navigation.replace('Home');
      }
    };

    /**
     * Downloads Zaragoza POIs the first time the app runs (empty Realm).
     * Failures are logged but do NOT block the rest of the initialization:
     * the app must remain usable offline / without the open-data endpoint.
     */
    const ensureZaragozaPOIsLoaded = async () => {
      try {
        const count = realm.objects('ZaragozaPOI').length;
        if (count > 0) {
          console.log(
            `[Loading] ZaragozaPOI already populated (${count} rows), skipping initial sync.`,
          );
          return;
        }

        console.log(
          '[Loading] No POIs found in Realm. Starting initial Zaragoza sync...',
        );
        const result = await syncPOIs();
        console.log(
          `[Loading] Initial Zaragoza sync done: ${result.inserted}/${result.total} POIs stored.`,
        );
      } catch (err) {
        console.warn(
          '[Loading] Initial Zaragoza sync failed, continuing without POIs:',
          err,
        );
      }
    };

    const prepareSession = async () => {
      require('../experiments/benchmark').clearSyntheticRules();
      await myPosition.getLocationAsync();
      await myCalendar.getCalendarAsync();

      getEngine().connect();
      bootstrapRuleEngine();
      // Wire rule-engine triggers to the Sprint-2 recommendation algorithms.
      // Uses the default type→algorithm and type→keywords maps; pass a
      // config object here to override.
      bootstrapRecommendationBridge();

      // Probe the EM backend so AlgorithmRegistry knows whether EM-bound
      // algorithms can be offered. Awaited so any code that runs after this
      // sees the correct flag; the probe itself has a 3s per-EM timeout so it
      // can't stall startup for long.
      await checkEMAvailability();

      const currentToken = Schemas.currentToken();

      // Inicializa P2P automáticamente si está habilitado en settings
      await initializeP2PIfEnabled(currentToken);
    };

    const fakePermissionLogin = async () => {
      //Calendar permissions
      const calendar = await RNCalendarEvents.requestPermissions();

      //Location permissions
      const location =
        Platform.OS === 'ios'
          ? await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE)
          : await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

      //Notifications permissions
      const notificationPermission =
        await Notifications.configureNotifications();
      if (
        calendar === 'authorized' &&
        location === RESULTS.GRANTED &&
        notificationPermission
      ) {
        //Create default channel for notifications
        await Notifications.createDefaultChannel();
        await prepareSession();
      } else {
        Alert.alert('Permisos', 'No se otorgaron los permisos necesarios');
      }
    };

    initialize();
  }, [navigation]);

  return (
    <View style={styles.view}>
      <Image style={styles.icon} source={icon} />
      <ActivityIndicator size="large" color="#000" style={styles.loading} />
    </View>
  );
};

export default LoadingScreen;

const styles = StyleSheet.create({
  icon: {
    height: 120,
    resizeMode: 'contain',
    width: 120,
  },
  loading: {
    marginTop: 20,
  },
  view: {
    alignItems: 'center',
    backgroundColor: 'white',
    flex: 1,
    justifyContent: 'center',
  },
});
