import React, { useState, useLayoutEffect } from 'react';
import { ScrollView, Alert, StyleSheet, TextInput } from 'react-native';
import { useRoute } from '@react-navigation/native';
//Gluestack UI
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Checkbox, CheckboxIndicator, CheckboxLabel } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Box } from '@/components/ui/box';
//DB
import * as Schemas from '../../realmSchemas/RealmServices';
import {bootstrapRuleEngine} from '../../background/ruleEngineAdapter';

const EditWeatherContextRuleScreen = ({ navigation }) => {
  const { contextRule } = useRoute().params;
  const [name, setName] = useState(contextRule.name);
  const [checkWeather, setCheckWeather] = useState(
    contextRule.weatherStatus.map(({ key, checked }) => ({ key, checked }))
  );
  const [minTemp, setMinTemp] = useState(contextRule.minTemp);
  const [maxTemp, setMaxTemp] = useState(contextRule.maxTemp);
  const [edit, setEdit] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [name, navigation]);

  const toggleWeather = (index) => {
    setCheckWeather((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const handleSave = () => {
    const id = contextRule.id;
    const trimmedName = name.trim();
    const hasCheckedWeather = checkWeather.some(w => w.checked);

    if (!trimmedName || minTemp === '' || maxTemp === '') {
      Alert.alert('Warning', 'All fields must be completed');
    } else if (trimmedName.includes(' ')) {
      Alert.alert('Warning', "Name field can't contain spaces.");
    } else if (trimmedName.replace(/[^0-9]/g, '').length === trimmedName.length) {
      Alert.alert('Warning', 'Name field must contain at least one letter.');
    } else if (!(/[a-zA-Z]/).test(trimmedName[0])) {
      Alert.alert('Warning', 'First character of name field must be a letter.');
    } else if (!hasCheckedWeather) {
      Alert.alert('Warning', 'You must select at least one day of the weather status.');
    } else if (Number(minTemp) >= Number(maxTemp)) {
      Alert.alert('Warning', 'MinTemp field must be smaller than maxTemp.');
    } else {
      const exists = Schemas.existsByNameContextRuleAndId(id, trimmedName);
      if (exists) {
        Alert.alert('Warning', 'There is already a context rule with that name. You must choose another one.');
      } else {
        Schemas.updateWeatherContextRule(id, trimmedName, checkWeather, Number(minTemp), Number(maxTemp));
        bootstrapRuleEngine();

        Alert.alert('Success!', 'Context rule saved', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Context_rules'),
          },
        ]);
      }
    }
  };



  const renderTextInput = (label, value, onChange, readOnly = false) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <Input
        style={styles.input}
        size="lg"
        variant="underlined"
        isDisabled={false}
        isInvalid={false}
        isReadOnly={readOnly}
      >
        <InputField
          placeholder={`Insert ${label.toLowerCase()}`}
          maxLength={30}
          value={value}
          onChangeText={onChange}
          editable={!readOnly}
        />
      </Input>
    </>
  );

  const renderTempInput = (label, value, onChange, readOnly = false) => (
    <HStack alignItems="center" style={styles.hstack}>
      <Text mr="$2" color="$coolGray800" size="md">{label}</Text>
      <Input
        size="md"
        variant="underlined"
        style={styles.timePicker}
        isDisabled={false}
        isInvalid={false}
        isReadOnly={readOnly}
      >
        <InputField
          keyboardType="numeric"
          maxLength={2}
          value={String(value)}
          onChangeText={onChange}
          editable={!readOnly}
          placeholder={label === 'Min temp:' ? '5' : '30'}
        />
      </Input>
      <Text ml={2}>ºC</Text>
    </HStack>
  );

  const renderCheckboxes = (isDisabled) => (
    <HStack justifyContent="space-between" mb={4} style={styles.hstack}>
      {[0, 1].map((col) => (
        <VStack key={col} space="md" flex={1}>
          {checkWeather.slice(col * 4, (col + 1) * 4).map((day, i) => (
            <Checkbox
              key={day.key}
              isChecked={day.checked}
              onChange={() => toggleWeather(col * 4 + i)}
              isDisabled={isDisabled}
              value={day.key}
              size="md"
            >
              <CheckboxIndicator mr="$2" />
              <CheckboxLabel>{day.key}</CheckboxLabel>
            </Checkbox>
          ))}
        </VStack>
      ))}
    </HStack>
  );

  const renderMode = (isEditMode) => (
    <ScrollView>
      <Text style={styles.title} size="2xl">Type:</Text>
      <TextInput
        style={styles.input}
        placeholder="Type"
        maxLength={30}
        value={contextRule.type}
        editable={false}
      />

      {renderTextInput('Name', name, setName, !isEditMode)}

      <Text style={styles.label}>
        {isEditMode ? 'Select the weather cases you want:' : 'Weathers selected:'}
      </Text>
      {renderCheckboxes(!isEditMode)}

      <Text style={styles.label}>
        {isEditMode ? 'Select temperature range:' : 'Temperature range selected'}
      </Text>
      {renderTempInput('Min temp:', minTemp, setMinTemp, !isEditMode)}
      {renderTempInput('Max temp:', maxTemp, setMaxTemp, !isEditMode)}

      <Button
        onPress={isEditMode ? handleSave : () => setEdit(true)}
        style={styles.saveButton}
      >
        <Text style={styles.saveText}>{isEditMode ? 'Save' : 'Edit'}</Text>
      </Button>
    </ScrollView>
  );

  return (
    <Box style={styles.innerContainer}>
      {renderMode(edit)}
    </Box>
  );

};

export default EditWeatherContextRuleScreen;

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
        marginRight: 20,
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
        paddingHorizontal: 8,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        width: 80,
      },
    title: {
            color: 'black',
            marginBottom: 10,
            marginLeft: 20,
            marginTop: 20,
    },
  });
