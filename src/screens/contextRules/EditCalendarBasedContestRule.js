import React, { useState, useLayoutEffect } from 'react';
import { Alert, StyleSheet,ScrollView, TextInput, TouchableOpacity } from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useRoute } from '@react-navigation/native';
// Gluestack UI
import {Button} from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Checkbox, CheckboxIndicator, CheckboxLabel } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Box } from '@/components/ui/box';
import { X } from 'lucide-react-native';

import * as Schemas from '../../realmSchemas/RealmServices';
import {bootstrapRuleEngine} from '../../background/ruleEngineAdapter';


const EditCalendarBasedContextRuleScreen = ({ navigation }) => {
  const { contextRule } = useRoute().params;

  const [name, setName] = useState(contextRule.name);
  const [checkDays, setCheckDays] = useState(
    contextRule.daysOfWeek.map(({ key, checked }) => ({ key, checked }))
  );
  const [selectedStartDate, setSelectedStartDate] = useState(contextRule.startDate || '__/__/__');
  const [selectedEndDate, setSelectedEndDate] = useState(contextRule.endDate || '__/__/__');
  const [edit, setEdit] = useState(false);
  const [visiblePickerStart, setVisiblePickerStart] = useState(false);
  const [visiblePickerEnd, setVisiblePickerEnd] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [name, navigation]);

  const formatDate = (date) => {
    return `${`${date.getDate()}`.padStart(2, '0')}/${`${date.getMonth() + 1}`.padStart(2, '0')}/${date.getFullYear()}`;
  };

  const handlePickerStart = (date) => {
    setVisiblePickerStart(false);
    setSelectedStartDate(formatDate(date));
  };

  const handlePickerEnd = (date) => {
    setVisiblePickerEnd(false);
    setSelectedEndDate(formatDate(date));
  };

  const onDeleteDate = (type) => {
    if (type === 'start') {setSelectedStartDate('__/__/__');}
    else {setSelectedEndDate('__/__/__');}
  };

  const toggleCheck = (index) => {
    setCheckDays((prev) =>
      prev.map((d, i) => (i === index ? { ...d, checked: !d.checked } : d))
    );
  };

  const validateName = (inputName, id) => {
    if (!inputName) {
      return "Name can't be empty";
    }
    if (/\s/.test(inputName)) {
      return "Name field can't contain spaces.";
    }
    if (/^\d+$/.test(inputName)) {
      return 'Name field must contain at least one letter.';
    }
    if (!/^[a-zA-Z]/.test(inputName)) {
      return 'First character of name field must be a letter.';
    }
    if (Schemas.existsByNameContextRuleAndId(id, inputName)) {
      return 'There is already a context rule with that name.';
    }
    return null;
  };

  const validateDays = (daysOfWeek) => {
    return daysOfWeek.some(({ checked }) => checked)
      ? null
      : 'You must select at least one day of the week.';
  };

  const validateDates = (startDate, endDate) => {
    const isStartSet = startDate !== '__/__/__';
    const isEndSet = endDate !== '__/__/__';

    if ((isStartSet && !isEndSet) || (!isStartSet && isEndSet)) {
      return 'If you select dates, you must select both the start date and the end date.';
    }

    if (isStartSet && isEndSet) {
      const [d1, m1, y1] = startDate.split('/').map(Number);
      const [d2, m2, y2] = endDate.split('/').map(Number);

      const start = new Date(y1, m1 - 1, d1);
      const end = new Date(y2, m2 - 1, d2);

      if (end <= start) {
        return 'End Time must be greater than Start Time';
      }
    }

    return null;
  };

  const onPressSaveButton = () => {
    const id = contextRule.id;
    const daysOfWeek = checkDays;

    const nameError = validateName(name, id);
    const daysError = validateDays(daysOfWeek);
    const datesError = validateDates(selectedStartDate, selectedEndDate);

    if (nameError) {
      Alert.alert('Warning', nameError);
    } else if (daysError) {
      Alert.alert('Warning', daysError);
    } else if (datesError) {
      Alert.alert('Warning', datesError);
    } else {
      Schemas.updateCalendarBasedContextRule(id, name, daysOfWeek, selectedStartDate, selectedEndDate);
      bootstrapRuleEngine();
      Alert.alert('Success!', 'Context rule updated');
      setEdit(false);
    }
  };

  const renderDaysCheckboxes = (isEditMode) => (
    <HStack justifyContent="space-between" style={styles.hstack}>
      <VStack space="md" flex={1}>
        {checkDays.slice(0, 4).map((day, i) => (
          <Checkbox
            key={day.key}
            isChecked={day.checked}
            onChange={isEditMode ? () => toggleCheck(i) : undefined}
            isDisabled={!isEditMode}
            size="md"
            value={day.key}
          >
            <CheckboxIndicator mr="$2" />
            <CheckboxLabel>{day.key}</CheckboxLabel>
          </Checkbox>
        ))}
      </VStack>
      <VStack space="md" flex={1}>
        {checkDays.slice(4).map((day, i) => (
          <Checkbox
            key={day.key}
            isChecked={day.checked}
            onChange={isEditMode ? () => toggleCheck(i + 4) : undefined}
            isDisabled={!isEditMode}
            size="md"
            value={day.key}
          >
            <CheckboxIndicator mr="$2" />
            <CheckboxLabel>{day.key}</CheckboxLabel>
          </Checkbox>
        ))}
      </VStack>
    </HStack>
  );

  const renderDateRow = (label, date, onPress, onDelete, isEditMode) => (
    <HStack style={styles.timeRow} alignItems="center" mt="$2">
      <Text flex={0.4} style={styles.label}>{label}</Text>
      {isEditMode ? (
        <>
          <TouchableOpacity style={styles.touchableOpacity} onPress={onPress}>
            <Box style={styles.timePicker}><Text>{date}</Text></Box>
          </TouchableOpacity>
          <Pressable onPress={onDelete}><Icon as={X} size="md" /></Pressable>
        </>
      ) : (
        <Box style={styles.timePicker}><Text>{date}</Text></Box>
      )}
    </HStack>
  );
  const renderViewMode = () => (
    <ScrollView>
      <Text style={styles.title} size="2xl">Type:</Text>
      <TextInput
        style={styles.input}
        placeholder="Type"
        maxLength={30}
        value={contextRule.type}
        editable={false}
      />

      <Text style={styles.label}>Name</Text>
      <Input size="lg" variant="underlined" style={styles.input} isReadOnly>
        <InputField placeholder="Insert name" value={name} maxLength={30} editable={false} />
      </Input>

      <Text style={styles.label}>Days of the week selected:</Text>
      {renderDaysCheckboxes(false)}

      {renderDateRow('Start date:', selectedStartDate, null, null, false)}
      {renderDateRow('End date:', selectedEndDate, null, null, false)}

      <Button onPress={() => setEdit(true)} style={styles.saveButton}>
        <Text style={styles.saveText}>Edit</Text>
      </Button>
    </ScrollView>
  );

  const renderEditMode = () => (
    <ScrollView>
      <Text style={styles.title} size="2xl">Type:</Text>
      <TextInput
        style={styles.input}
        placeholder="Type"
        maxLength={30}
        value={contextRule.type}
        editable={false}
      />

      <Text style={styles.label}>Name</Text>
      <Input size="lg" variant="underlined" style={styles.input}>
        <InputField placeholder="Insert name" value={name} maxLength={30} onChangeText={setName} />
      </Input>

      <Text style={styles.label}>Select the days of the week you want:</Text>
      {renderDaysCheckboxes(true)}

      <Text style={styles.label}>
        You can select a date range if you want (optional). Press "x" to delete your selection.
      </Text>

      {renderDateRow('Start date:', selectedStartDate, () => setVisiblePickerStart(true), () => onDeleteDate('start'), true)}
      {renderDateRow('End date:', selectedEndDate, () => setVisiblePickerEnd(true), () => onDeleteDate('end'), true)}

      <DateTimePickerModal
        isVisible={visiblePickerStart}
        mode="date"
        onConfirm={handlePickerStart}
        onCancel={() => setVisiblePickerStart(false)}
      />
      <DateTimePickerModal
        isVisible={visiblePickerEnd}
        mode="date"
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

export default EditCalendarBasedContextRuleScreen;

const styles = StyleSheet.create({
  hstack: {
        margin: 20,
    },
  input: {
      backgroundColor: '#fff',
      borderRadius: 8,

      elevation: 1,
      fontSize: 16,
      marginBottom: 20,
      marginLeft: 20,
      marginRight: 20,
      paddingHorizontal: 12,
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
      marginRight:10,
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
  timePicker: {
    backgroundColor: '#fff',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    elevation: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  timeRow: {
        marginBottom: 20,
      },
  title: {
          color: 'black',
          marginBottom: 10,
          marginLeft: 20,
          marginTop: 20,
  },
  touchableOpacity: {
    flex: 0.6,
  },
});
