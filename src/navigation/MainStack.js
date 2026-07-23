// ~/R-Rules/MobileApp/src/navigation/MainStack.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

//Screens
import LoadingScreen from '../screens/Loading';
import HomeScreen from '../screens/Home';
import SavedScreen from '../screens/Saved';
import HistoricScreen from '../screens/Historic';
import ContextRulesScreen from '../screens/contextRules/ContextRules';
import ExclusionAndPriorities from '../screens/exclusionSets/ExclusionAndPriorities';
import TriggeringRules from '../screens/triggeringRules/TriggeringRules';
import SettingsScreen from '../screens/Settings';
import ProfileScreen from '../screens/Profile';
import ActivityScreen from '../screens/Activity';
import POIsScreen from '../screens/POIs';
import RecommendationsScreen from '../screens/Recommendations';
//Stacks
import ContextRuleStack from './ContextRuleStack';
import EditContextRuleStack from './EditContextRuleStack';
import ExlusionSetStack from './ExclusionSetStack';
import TriggerinRuleStack from './TriggeringRuleStack';
const Stack = createStackNavigator();

const MainStack = () => {
  return (
    <Stack.Navigator initialRouteName="Loading">
      <Stack.Screen name="Loading" component={LoadingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Saved" component={SavedScreen} />
      <Stack.Screen name="Historic" component={HistoricScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
      <Stack.Screen name="POIs" component={POIsScreen} options={{ title: 'POIs de Zaragoza' }} />
      <Stack.Screen name="Recommendations" component={RecommendationsScreen} options={{ title: 'Recomendaciones' }} />
      <Stack.Screen name="Context_rules" component={ContextRulesScreen} options={{ title: 'Context Rules' }}/>
      <Stack.Screen name="Context_rule_stack" component={ContextRuleStack} options={{ headerShown: false }} />
      <Stack.Screen name="Edit_context_rule_stack" component={EditContextRuleStack} options={{ headerShown: false }} />
      <Stack.Screen name="Recommendation_exclusions_and_priorities" component={ExclusionAndPriorities}
      options={{ title: 'Exclusions and priorities' }}/>
      <Stack.Screen name="Exclusion_set_stack" component={ExlusionSetStack} options={{ headerShown: false }} />
      <Stack.Screen name="Recommendation_triggering_rules" component={TriggeringRules}
      options={{ title: 'Triggering rules' }}/>
      <Stack.Screen name="Triggering_rule_stack" component={TriggerinRuleStack} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};


export default MainStack;
