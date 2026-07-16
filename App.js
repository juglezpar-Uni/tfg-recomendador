// App.js
import React, {useEffect, useRef, useCallback} from 'react';
import {InteractionManager} from 'react-native';
import './global.css';
import {GluestackUIProvider} from '@/components/ui/gluestack-ui-provider';
import {NavigationContainer} from '@react-navigation/native';
import DrawerNavigator from './src/navigation/DrawerNavigator';
import {
  startContextSending,
  stopContextSending,
  startRecommendationPolling,
  stopRecommendationPolling,
} from './src/background/periodicTasks';

import runExperiment from './src/experiments/siddhiExperiment';
/**
 * Root component of the application.
 * Initializes background tasks and sets up navigation and UI provider.
 *
 * @returns {JSX.Element} Main app layout wrapped in providers.
 */
export default function App() {
  const initializedRef = useRef(false);

  /**
   * Initializes async background services only once.
   * Uses a ref to avoid duplicate execution.
   */
  const initialize = useCallback(async () => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    try {
      console.log(
        '[INIT] Waiting 20 seconds before starting background tasks...',
      );
      await new Promise(resolve => setTimeout(resolve, 20000));

      console.log('[INIT] Starting context sending...');
      startContextSending();
      console.log('[INIT] Background tasks started');

      console.log('[INIT] Starting recommendation polling...');
      startRecommendationPolling();
      //Experimental application only
      //console.log('[INIT] Starting experiment...');
      //runExperiment();
      //console.log('[INIT] Experiment started');
    } catch (err) {
      console.error(
        '[INIT] Error during Siddhi/background initialization:',
        err,
      );
    }
  }, []);

  /**
   * useEffect runs only once on mount to initialize tasks.
   * Cleans up polling on unmount.
   */
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      initialize();
    });

    return () => {
      task.cancel();
      stopRecommendationPolling();
      stopContextSending();
      initializedRef.current = false;
    };
  }, [initialize]);

  return (
    <GluestackUIProvider mode="light">
      <NavigationContainer>
        <DrawerNavigator />
      </NavigationContainer>
    </GluestackUIProvider>
  );
}
