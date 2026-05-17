import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SwipeListView } from 'react-native-swipe-list-view';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Modal from 'react-native-modal';
// Gluestack UI
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Trash2 } from 'lucide-react-native';

//DB and Siddhi
import * as Schemas from '../realmSchemas/RealmServices';
import {bootstrapRuleEngine} from '../background/ruleEngineAdapter';
/**
 * Serializes a ContextRule object by extracting only its primitive properties.
 * This avoids passing the full Realm object, which can contain circular references
 * (e.g., triggeringRules -> contextRules -> triggeringRules...) and lead to
 * stack overflows or navigation errors.
 *
 * Use this when passing context rules through navigation params or storing them
 * outside Realm to prevent unnecessary dependencies or crashes.
 */
const serializeContextRule = (rule) => ({
  id: rule.id,
  name: rule.name,
  type: rule.type,
  gpsLatitude: rule.gpsLatitude,
  gpsLongitude: rule.gpsLongitude,
  locationError: rule.locationError,
  startTime: rule.startTime,
  endTime: rule.endTime,
  daysOfWeek: rule.daysOfWeek,
  startDate: rule.startDate,
  endDate: rule.endDate,
  weatherStatus: rule.weatherStatus,
  minTemp: rule.minTemp,
  maxTemp: rule.maxTemp,
  server: rule.server,
  measurement: rule.measurement,
  comparator: rule.comparator,
  value: rule.value,
});

const TabListCRules = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [contextRules, setContextRules] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [triggeringRules, setTriggeringRules] = useState([]);

  const loadData = useCallback(() => {
    const rules = Schemas.retrieveContextRules();
    if (rules) {
      const array = [...rules];
      setContextRules(array);
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

  const onPressContextRule = (item) => {
    const routeMap = {
      'Location': 'Edit_Location_Context_Rule',
      'Time-Based': 'Edit_Time_Based_Context_Rule',
      'Calendar-Based': 'Edit_Calendar_Based_Context_Rule',
      'Weather': 'Edit_Weather_Context_Rule',
      'Server-Based': 'Edit_Server_Based_Context_Rule',
    };
    const routeName = routeMap[item.type];
    if (routeName) {
      navigation.navigate('Edit_context_rule_stack', {
        screen: routeName,
        params: { contextRule: serializeContextRule(item) },
      });
    }
  };

  const onDeleteContextRule = (item, index) => {
    if (item.triggeringRules?.length > 0) {
      setTriggeringRules(item.triggeringRules);
      setModalVisible(true);
    } else {
      const updated = [...contextRules];
      updated.splice(index, 1);
      setContextRules(updated);
      const name = item.name;
      Schemas.deleteContextRuleById(item.id);
      bootstrapRuleEngine();
      Alert.alert(name, 'Deleted');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.rowFront}>
      <Text onPress={() => onPressContextRule(item)}>
        <Text style={styles.bold}>{item.name}</Text>
        <Text> #{item.type}</Text>
      </Text>
    </View>
  );

  const renderHiddenItem = ({ item, index }) => (
    <View style={styles.rowBack}>
      <Button onPress={() => onDeleteContextRule(item, index)} action="negative">
        <Icon as={Trash2} size="xl" className="text-white" />
      </Button>
    </View>
  );

  return (
    <>
      <SwipeListView
        data={contextRules}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        renderHiddenItem={renderHiddenItem}
        rightOpenValue={-75}
        style={styles.swipeList}
        contentContainerStyle={styles.swipeContent}
      />
      <Modal isVisible={modalVisible}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Warning:</Text>
          <Text style={styles.modalMessage}>
            You can't delete this context rule because it is used in the following triggering rules:
          </Text>
          <FlatList
            data={triggeringRules}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.modalItem}>
                <Text style={styles.bold}>{item.name}</Text>
                <Text> #{item.recommendationType}</Text>
              </View>
            )}
          />
          <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalButton}>
            <Text style={styles.modalButtonText}>Ok</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bold: {
    fontWeight: 'bold',
  },
  modalButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#03A9F4',
    borderRadius: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
  },
  modalItem: {
    paddingVertical: 10,
  },
  modalMessage: {
    fontSize: 16,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  rowBack: {
    alignItems: 'center',
    backgroundColor: '#eee',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 20,
  },
  rowFront: {
    backgroundColor: '#fff',
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
    height: 80,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 20,
  },
  swipeContent: {
    flexGrow: 1,
  },
  swipeList: {
    flex: 1,
  },
});

export default React.memo(TabListCRules);
