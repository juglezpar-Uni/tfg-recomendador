import {createNavigationContainerRef} from '@react-navigation/native';

/**
 * Global navigation ref that can be dispatched from outside the React tree.
 * Used by the notifee event handlers (foreground and background), which run
 * outside any component and therefore cannot use the useNavigation() hook.
 *
 * Wire up the ref by passing it to <NavigationContainer ref={navigationRef}>
 * (see App.js). After that, any module can import navigateToScreen() and
 * trigger a navigation.
 */
export const navigationRef = createNavigationContainerRef();

/**
 * Navigate to a screen from outside the React component tree.
 *
 * The app uses a Drawer → Stack layout:
 *   Drawer  →  "Main"  →  Stack  →  "POIs" | "Recommendations" | ...
 *
 * Therefore navigation to a stack screen must be nested: we target the
 * drawer route "Main" and pass the inner stack screen through `screen`.
 *
 * @param {string} screenName - Name of the stack screen (e.g. "Recommendations")
 * @param {Object} [params]   - Optional params passed to the screen
 */
export function navigateToScreen(screenName, params) {
  if (!navigationRef.isReady()) {
    console.log(
      `[navigationRef] navigate(${screenName}) skipped: navigator not ready yet`,
    );
    return;
  }
  navigationRef.navigate('Main', {screen: screenName, params});
}
