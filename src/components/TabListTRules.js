import React, { useState, useEffect, useCallback } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SwipeListView } from 'react-native-swipe-list-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Trash2 } from 'lucide-react-native';
import { Switch } from '@/components/ui/switch';

// DB
import * as Schemas from '../realmSchemas/TriggeringRulesServices';
import {bootstrapRuleEngine} from '../background/ruleEngineAdapter';
function toPlainContextRule(rule) {
  return {
    id: rule.id,
    type: rule.type,
    name: rule.name,
    gpsLatitude: rule.gpsLatitude,
    gpsLongitude: rule.gpsLongitude,
    locationError: rule.locationError,
    startTime: rule.startTime,
    endTime: rule.endTime,
    startDate: rule.startDate,
    endDate: rule.endDate,
    server: rule.server,
    measurement: rule.measurement,
    comparator: rule.comparator,
    value: rule.value,
    daysOfWeek: rule.daysOfWeek ? rule.daysOfWeek.map(kb => ({ key: kb.key, value: kb.value })) : [],
    weatherStatus: rule.weatherStatus ? rule.weatherStatus.map(kb => ({ key: kb.key, value: kb.value })) : [],
  };
}

function toPlainTriggeringRule(rule) {
  return {
    id: rule.id,
    name: rule.name,
    recommendationType: rule.recommendationType,
    switchState: rule.switchState,
    contextRules: rule.contextRules ? rule.contextRules.map(toPlainContextRule) : [],
    denyContextRule: rule.denyContextRule ? [...rule.denyContextRule] : [],
  };
}

const TabListTRules = ({ navigation }) => {
  const [triggeringRules, setTriggeringRules] = useState([]);
  const isFocused = useIsFocused();

  const loadData = useCallback(() => {
    const results = Schemas.retrieveTriggeringRules();
    if (results) {
      const plainRules = results.map(toPlainTriggeringRule);
      setTriggeringRules(plainRules);
    }
  }, []);


  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, loadData]);

  const onPressTriggeringRule = (item) => {
    console.log('Navegando a edit rule con ', item);
    navigation.navigate('Triggering_rule_stack', {
      screen: 'Edit_Triggering_Rule',
      params: { triggeringRule: item },
    });
  };

  const onDeleteItem = (item, index) => {
    const copy = [...triggeringRules];
    copy.splice(index, 1);
    setTriggeringRules(copy);
    const name = item.name;
    Schemas.deleteTriggeringRuleById(item.id);
    bootstrapRuleEngine();
    Alert.alert('Success!', `${name} deleted`);
  };

  const onSwitchChange = (item) => {
    const newValue = !item.switchState;
    Schemas.updateStateTriggeringRule(item.id, newValue);
    bootstrapRuleEngine();
    setTriggeringRules(prev =>
      prev.map(rule => rule.id === item.id ? { ...rule, switchState: newValue } : rule)
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.rowFront}>

        <Switch size="md" value={item.switchState} onToggle={() => onSwitchChange(item)} />
        <TouchableOpacity onPress={() => onPressTriggeringRule(item)} style={styles.touchableOpacity}>
          <View style={styles.textContainer}>
            <Text style={styles.bold}>{item.name}</Text>
            <Text> #{item.recommendationType}</Text>
          </View>
        </TouchableOpacity>
    </View>
  );

  const renderHiddenItem = ({ item, index }) => (
    <View style={styles.rowBack}>
      <Button onPress={() => onDeleteItem(item, index)} action="negative">
        <Icon as={Trash2} size="xl" className="text-white" />
      </Button>
    </View>
  );

  return (
    <SwipeListView
      data={triggeringRules}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderItem}
      renderHiddenItem={renderHiddenItem}
      rightOpenValue={-75}
      disableRightSwipe
      contentContainerStyle={styles.swipeList}
    />
  );
};

export default React.memo(TabListTRules);


const styles = StyleSheet.create({
  bold: {
    fontWeight: 'bold',
  },
  rowBack: {
    alignItems: 'center',
    backgroundColor: '#ff4d4f',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 15,
  },
  rowFront: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  swipeList: {
    paddingBottom: 16,
  },
  textContainer: {
    flexDirection: 'column',
  },
  touchableOpacity: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
});
