import React, { useState, useLayoutEffect } from 'react';
import { ScrollView, Alert, StyleSheet, TextInput } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
//Gluestack UI
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import {
    Select,
    SelectTrigger,
    SelectInput,
    SelectIcon,
    SelectPortal,
    SelectBackdrop,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import { Box } from '@/components/ui/box';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from 'lucide-react-native';
import { HStack } from '@/components/ui/hstack';

//DB
import * as Schemas from '../../realmSchemas/RealmServices';
import {bootstrapRuleEngine} from '../../background/ruleEngineAdapter';
import * as ExternalServers from '../../services/externalServers/externalServers.json';
// ExternalSelect.js
const ExternalSelect = ({ label, selectedValue, onValueChange, options, disabled }) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <Select selectedValue={selectedValue} onValueChange={onValueChange} isDisabled={disabled}>
        <SelectTrigger variant="underlined" size="2xl" style={styles.select}>
          <SelectInput placeholder="Pick server" />
          <SelectIcon className="mr-3" as={ChevronDownIcon} />
        </SelectTrigger>
        <SelectPortal>
          <SelectBackdrop />
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <SelectContent>
              <SelectItem label="Pick server" value="default1" />
              {options.map((srv) => (
                <SelectItem
                  key={srv.name}
                  label={srv.name}
                  value={srv.name.toLowerCase()}
                />
              ))}
            </SelectContent>
          </SafeAreaView>
        </SelectPortal>
      </Select>
    </>
  );

  // MeasurementSignSelect.js
  const MeasurementSignSelect = ({ measurement, comparator, setMeasurement, setComparator, measurements, signs, disabled }) => (
    <HStack alignItems="center" style={styles.hstack}>
      <Select selectedValue={measurement} onValueChange={setMeasurement} isDisabled={disabled}>
        <SelectTrigger variant="underlined" size="2xl" style={styles.select}>
          <SelectInput placeholder="Measurement" />
          <SelectIcon className="mr-3" as={ChevronDownIcon} />
        </SelectTrigger>
        <SelectPortal>
          <SelectBackdrop />
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <SelectContent>
              {measurements.map((m) => (
                <SelectItem key={m.key} label={m.value} value={m.key} />
              ))}
            </SelectContent>
          </SafeAreaView>
        </SelectPortal>
      </Select>

      <Select selectedValue={comparator} onValueChange={setComparator} isDisabled={disabled}>
        <SelectTrigger variant="underlined" size="2xl" style={styles.select}>
          <SelectInput placeholder="Comparator" />
          <SelectIcon className="mr-3" as={ChevronDownIcon} />
        </SelectTrigger>
        <SelectPortal>
          <SelectBackdrop />
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <SelectContent>
              {signs.map((sign) => (
                <SelectItem key={sign.key} label={sign.value} value={sign.value} />
              ))}
            </SelectContent>
          </SafeAreaView>
        </SelectPortal>
      </Select>
    </HStack>
  );

  // ReadOnlyInput.js
  const ReadOnlyInput = ({ label, value, placeholder }) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <Input style={styles.input} size="lg" variant="underlined" isReadOnly={true}>
        <InputField placeholder={placeholder} value={value} editable={false} />
      </Input>
    </>
  );

  // EditableInput.js
  const EditableInput = ({ label, value, onChange, placeholder, keyboardType }) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <Input style={styles.input} size="lg" variant="underlined">
        <InputField
          placeholder={placeholder}
          maxLength={30}
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChange}
        />
      </Input>
    </>
  );
const EditServerBasedContextRuleScreen = ({ navigation }) => {
  const { contextRule } = useRoute().params;

  const measurements = [
    { key: 'co2', value: 'CO2 (ppm)' },
    { key: 'humidity', value: 'Humidity (%)' },
    { key: 'temperature', value: 'Temperature (ºC)' },
  ];

  const signs = [
    { key: 'less', value: '>' },
    { key: 'equal', value: '=' },
    { key: 'greater', value: '<' },
  ];

  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(contextRule.name);
  const [server, setServer] = useState(contextRule.server);
  const [measurement, setMeasurement] = useState(contextRule.measurement);
  const [comparator, setComparator] = useState(contextRule.comparator);
  const [value, setValue] = useState(contextRule.value.toString());

    useLayoutEffect(() => {
      navigation.setOptions({ title: name });
    }, [name, navigation]);

  const handleSave = () => {
    const id = contextRule.id;
    const trimmedName = name.trim();

    if (
      trimmedName === '' ||
      value === '' ||
      comparator === 'default2' ||
      measurement === 'default3' ||
      server === 'default1'
    ) {
      Alert.alert('Warning', 'All fields must be completed');
    } else if (trimmedName.includes(' ')) {
      Alert.alert('Warning', "Name field can't contain spaces.");
    } else if (trimmedName.replace(/[^0-9]/g, '').length === trimmedName.length) {
      Alert.alert('Warning', 'Name field must contain at least one letter.');
    } else if (!/[a-zA-Z]/.test(trimmedName[0])) {
      Alert.alert('Warning', 'First character of name field must be a letter.');
    } else {
      const exists = Schemas.existsByNameContextRuleAndId(id, trimmedName);
      if (exists) {
        Alert.alert('Warning', 'There is already a context rule with that name. You must choose another one.');
      } else {
        Schemas.updateServerBasedContextRule(
          id,
          trimmedName,
          server,
          measurement,
          comparator,
          parseFloat(value)
        );
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


  const renderViewMode = () => (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} size="2xl">Type:</Text>
      <TextInput style={styles.input} placeholder="Type" maxLength={30} value={contextRule.type} editable={false} />

      <ReadOnlyInput label="Name" value={name} placeholder="Insert name" />
      <ExternalSelect label="External server selected" selectedValue={server} onValueChange={setServer} options={ExternalServers.list} disabled={true} />
      <Text style={styles.label}>Measurment and sign</Text>
      <MeasurementSignSelect measurement={measurement} comparator={comparator} setMeasurement={setMeasurement} setComparator={setComparator} measurements={measurements} signs={signs} disabled={true} />
      <ReadOnlyInput label="Compared value:" value={value}  placeholder="Example: 37" keyboardType="numeric" />

      <Button onPress={() => setEdit(true)} style={styles.saveButton}>
        <Text style={styles.saveText}>Edit</Text>
      </Button>
    </ScrollView>
  );

  const renderEditMode = () => (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} size="2xl">Type:</Text>
      <TextInput style={styles.input} placeholder="Type" maxLength={30} value={contextRule.type} editable={false} />

      <EditableInput label="Name" value={name} onChange={setName} placeholder="Insert name" />
      <ExternalSelect label="Select the external server you want:" selectedValue={server} onValueChange={setServer} options={ExternalServers.list} disabled={false} />
      <Text style={styles.label}>Select the measurement and sign:</Text>
      <MeasurementSignSelect measurement={measurement} comparator={comparator} setMeasurement={setMeasurement} setComparator={setComparator} measurements={measurements} signs={signs} disabled={false} />
      <EditableInput label="Introduce value to compare:" value={value} onChange={(text) => setValue(text.replace(/[^0-9.]/g, ''))} placeholder="Example: 37" keyboardType="numeric" />

      <Button onPress={handleSave} style={styles.saveButton}>
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

export default EditServerBasedContextRuleScreen;

const styles = StyleSheet.create({
    hstack: {

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
    select: {
        backgroundColor: '#fff',
        borderRadius: 8,
        elevation: 1,
        justifyContent: 'space-between',
        marginBottom: 20,
        marginLeft: 20,
        marginRight:20,
        paddingHorizontal: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
    title: {
            color: 'black',
            marginBottom: 10,
            marginLeft: 20,
            marginTop: 20,
    },
  });
