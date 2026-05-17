import React, { useState, useLayoutEffect } from 'react';
import { View, Alert, StyleSheet,ScrollView, TextInput } from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {Box} from '@/components/ui/box';
import { Button } from '@/components/ui/button';
import { useRoute } from '@react-navigation/native';

import * as Schemas from '../../realmSchemas/RealmServices';
import {bootstrapRuleEngine} from '../../background/ruleEngineAdapter';

/**
 * Formats a Date object to a "HH:MM" string.
 * @param {Date} date - Date object to format.
 * @returns {string} Time formatted as "HH:MM".
 */
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Validates the name and time fields of a context rule.
 * @param {string} id - ID of the rule (used to avoid false name conflict).
 * @param {string} name - Name of the rule.
 * @param {string} startTime - Start time in "HH:MM".
 * @param {string} endTime - End time in "HH:MM".
 * @returns {{ valid: boolean, message?: string }} Validation result.
 */
function validateContextRule(id, name, startTime, endTime) {
  const [h1, m1] = startTime.split(':').map(Number);
  const [h2, m2] = endTime.split(':').map(Number);

  if (!name) {return { valid: false, message: 'All fields must be completed' };}
  if (/\s/.test(name)) {return { valid: false, message: "Name field can't contain spaces." };}
  if (/^\d+$/.test(name)) {return { valid: false, message: 'Name must include at least one letter.' };}
  if (!/^[a-zA-Z]/.test(name)) {return { valid: false, message: 'First character must be a letter.' };}
  if (h1 > h2 || (h1 === h2 && m1 >= m2)) {return { valid: false, message: 'End Time must be greater than Start Time' };}
  if (Schemas.existsByNameContextRuleAndId(id, name)) {return { valid: false, message: 'Context rule with that name already exists.' };}

  return { valid: true };
}

const LabeledInputField = ({
  label,
  value,
  placeholder,
  onChangeText,
  readOnly = true,
}) => (
  <>
    <Text style={styles.label}>{label}</Text>
    <Input
      style={styles.input}
      size="lg"
      variant="underlined"
      isReadOnly={readOnly}
      isDisabled={readOnly}
    >
      <InputField
        placeholder={placeholder}
        maxLength={30}
        value={value}
        onChangeText={onChangeText}
        editable={!readOnly}
        pointerEvents={readOnly ? 'none' : 'auto'}
      />
    </Input>
  </>
);

const TimeInputField = ({
  label,
  value,
  placeholder,
  onPress,
}) => (
  <View style={styles.timeRow}>
    <Text style={styles.label}>{label}</Text>
    <Input
      style={styles.input}
      size="lg"
      variant="underlined"
      isReadOnly
      onTouchStart={onPress}
    >
      <InputField
        pointerEvents="none"
        editable={false}
        value={value}
        placeholder={placeholder}
      />
    </Input>
  </View>
);

const EditTimeBasedContextRuleScreen = ({ navigation }) => {
  const route = useRoute();
  const { contextRule } = route.params;

  const [name, setName] = useState(contextRule.name);
  const [startTime, setStartTime] = useState(contextRule.startTime);
  const [endTime, setEndTime] = useState(contextRule.endTime);
  const [edit, setEdit] = useState(false);
  const [visiblePickerStart, setVisiblePickerStart] = useState(false);
  const [visiblePickerEnd, setVisiblePickerEnd] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [name, navigation]);

  const handlePickerStart = (date) => {
    setVisiblePickerStart(false);
    setStartTime(formatTime(date));
  };

  const handlePickerEnd = (date) => {
    setVisiblePickerEnd(false);
    setEndTime(formatTime(date));
  };

  const onPressSaveButton = () => {
    const validation = validateContextRule(contextRule.id, name, startTime, endTime);
    if (!validation.valid) {
      Alert.alert('Warning', validation.message);
      return;
    }

    Schemas.updateTimeBasedContextRule(contextRule.id, name, startTime, endTime);
    bootstrapRuleEngine();
    Alert.alert('Success!', 'Context rule updated');
    setEdit(false);
  };



  const renderCommonFields = () => (
    <>
      <Text style={styles.title} size="2xl">Type:</Text>
      <TextInput
        style={styles.input}
        placeholder="Type"
        maxLength={30}
        value={contextRule.type}
        editable={false}
      />
    </>
  );

  const renderViewMode = () => (
    <ScrollView>
      {renderCommonFields()}
      <LabeledInputField
        label="Name"
        value={name}
        placeholder="Insert name"
        readOnly
      />
      <TimeInputField
        label="Start Time"
        value={startTime}
        placeholder="Start Time"
      />
      <TimeInputField
        label="End Time"
        value={endTime}
        placeholder="End Time"
      />
      <DateTimePickerModal isVisible={false} mode="time" onConfirm={() => {}} onCancel={() => {}} />
      <DateTimePickerModal isVisible={false} mode="time" onConfirm={() => {}} onCancel={() => {}} />
      <Button onPress={() => setEdit(true)} style={styles.saveButton}>
        <Text style={styles.saveText}>Edit</Text>
      </Button>
    </ScrollView>
  );

  const renderEditMode = () => (
    <ScrollView>
      {renderCommonFields()}
      <LabeledInputField
        label="Name"
        value={name}
        placeholder="Insert name"
        onChangeText={setName}
        readOnly={false}
      />
      <TimeInputField
        label="Start Time"
        value={startTime}
        placeholder="Start Time"
        onPress={() => setVisiblePickerStart(true)}
      />
      <TimeInputField
        label="End Time"
        value={endTime}
        placeholder="End Time"
        onPress={() => setVisiblePickerEnd(true)}
      />
      <DateTimePickerModal
        isVisible={visiblePickerStart}
        mode="time"
        onConfirm={handlePickerStart}
        onCancel={() => setVisiblePickerStart(false)}
      />
      <DateTimePickerModal
        isVisible={visiblePickerEnd}
        mode="time"
        onConfirm={handlePickerEnd}
        onCancel={() => setVisiblePickerEnd(false)}
      />
      <Button style={styles.saveButton} onPress={onPressSaveButton}>
        <Text style={styles.saveText}>Save</Text>
      </Button>
    </ScrollView>
  );

  return (
    <Box style={styles.innerContainer}>
      {edit ? renderEditMode() : renderViewMode()}
    </Box>
  );


};

export default EditTimeBasedContextRuleScreen;

const styles = StyleSheet.create({
  input: {
      backgroundColor: '#fff',
      borderRadius: 8,
      elevation: 1,
      fontSize: 16,
      marginBottom: 20,
      marginLeft: 20,
      marginRight: 20,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
  label: {
    color: '#111827',
    fontSize: 16,
    marginBottom: 6,
    marginLeft: 20,
  },
  saveButton: {
      alignSelf: 'flex-end',
      backgroundColor: '#2563EB',
      borderRadius: 20,
      elevation: 4,
      marginRight:20,
      marginTop: 32,
      paddingHorizontal: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
    },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
          color: 'black',
          marginBottom: 10,
          marginLeft: 20,
          marginTop: 20,
  },
});
