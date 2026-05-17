import React, { useState, useLayoutEffect } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    Alert,
    StyleSheet,
    ScrollView,
  } from 'react-native';
import { useRoute } from '@react-navigation/native';
//Gluestack UI
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

import * as Schemas from '../../realmSchemas/RealmServices';
import {bootstrapRuleEngine} from '../../background/ruleEngineAdapter';
import * as myPosition from '../../events/Position';

const RenderTextField = ({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  inputStyle = styles.input,
  keyboardType = 'default',
  maxLength = 30,
  useRowWrapper = true, //prop for controling if we are using <View style={styles.row}>
}) => (
  <>
    {label && <Text style={styles.label}>{label}</Text>}
    {useRowWrapper ? (
      <View style={styles.row}>
        <TextInput
          style={inputStyle}
          placeholder={placeholder}
          maxLength={maxLength}
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
        />
      </View>
    ) : (
      <TextInput
        style={inputStyle}
        placeholder={placeholder}
        maxLength={maxLength}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
      />
    )}
  </>
);

const EditLocationContextRuleScreen = ({ navigation }) => {
  const { contextRule } = useRoute().params;

  const [name, setName] = useState(contextRule.name);
  const [latitude, setLatitude] = useState(contextRule.gpsLatitude.toString());
  const [longitude, setLongitude] = useState(contextRule.gpsLongitude.toString());
  const [locationError, setLocationError] = useState(contextRule.locationError.toString());
  const [edit, setEdit] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [name, navigation]);

  /**
   * Check if the input name is valid
   * @returns {string|null} Error message or null if valid
   */
  const validateName = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {return 'All fields must be completed';}
    if (trimmedName.includes(' ')) {return "Name field can't contain spaces.";}
    if (/^\d+$/.test(trimmedName)) {return 'Name field must contain at least one letter.';}
    if (!/^[a-zA-Z]/.test(trimmedName)) {return 'First character of name field must be a letter.';}
    if (Schemas.existsByNameContextRuleAndId(contextRule.id, trimmedName)) {
      return 'There is already a context rule with that name. You must choose another one.';
    }
    return null;
  };

  /**
   * Validate numeric fields
   * @returns {boolean} True if all fields are valid numbers
   */
  const areNumericFieldsValid = () => {
    return (
      latitude.trim() !== '' &&
      longitude.trim() !== '' &&
      locationError.trim() !== '' &&
      !isNaN(Number(latitude)) &&
      !isNaN(Number(longitude)) &&
      !isNaN(Number(locationError))
    );
  };

  const handleSave = () => {
    const nameError = validateName();
    if (nameError) {
      Alert.alert('Warning', nameError);
      return;
    }

    if (!areNumericFieldsValid()) {
      Alert.alert('Warning', 'Latitude, Longitude, and Location Error must be valid numbers.');
      return;
    }

    Schemas.updateLocationContextRule(
      contextRule.id,
      name.trim(),
      Number(latitude),
      Number(longitude),
      Number(locationError)
    );

    bootstrapRuleEngine();
    Alert.alert('Success!', 'Context rule updated');
    setEdit(false);
  };

  const getLocation = async () => {
    try {
      const coordinates = await myPosition.getLocationAsyncForRules();
      const [lng, lat] = coordinates.split(',');
      setLongitude(lng);
      setLatitude(lat);
    } catch (error) {
      Alert.alert('Error', 'Unable to retrieve location');
    }
  };



  const renderForm = ({ isEdit }) => (
    <ScrollView>
      <Text style={styles.title} size="2xl">Type:</Text>
      <RenderTextField
      value={contextRule.type}
      placeholder="Type"
      editable={false}
      useRowWrapper={false}
      />

      <RenderTextField
        label="Name:"
        value={name}
        onChangeText={setName}
        placeholder="Insert name"
        editable={isEdit}
        useRowWrapper={false}
      />


      <RenderTextField
        label="GPS latitude:"
        value={latitude}
        onChangeText={setLatitude}
        placeholder="Latitude"
        editable={isEdit}
        inputStyle={styles.gpsInput}
        keyboardType="numeric"
        maxLength={17}
      />

      <RenderTextField
        label="GPS longitude:"
        value={longitude}
        onChangeText={setLongitude}
        placeholder="Longitude"
        editable={isEdit}
        inputStyle={styles.gpsInput}
        keyboardType="numeric"
        maxLength={17}
      />

      {isEdit && (
        <TouchableOpacity style={styles.button} onPress={getLocation}>
          <Text style={styles.buttonText}>Get current GPS location</Text>
        </TouchableOpacity>
      )}

      <RenderTextField
        label={isEdit ? 'Allow location error (meters):' : 'Location error (meters):'}
        value={locationError}
        onChangeText={setLocationError}
        placeholder="Distance"
        editable={isEdit}
        inputStyle={styles.gpsInput}
        keyboardType="numeric"
        maxLength={6}
      />

      <Button
        onPress={isEdit ? handleSave : () => setEdit(true)}
        style={styles.saveButton}
      >
        <Text style={styles.saveText}>{isEdit ? 'Save' : 'Edit'}</Text>
      </Button>
    </ScrollView>
  );
  return (
    <Box style={styles.innerContainer}>
      {renderForm({ isEdit: edit })}
    </Box>
  );

};






const styles = StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: '#6B7280',
      borderRadius: 10,
      elevation: 2,
      marginBottom: 24,
      marginLeft: 20,
      marginRight: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
    },
    gpsInput: {
      backgroundColor: '#fff',
      borderRadius: 8,
      elevation: 1,
      flex: 0.6,
      fontSize: 16,
      paddingHorizontal: 10,
      paddingVertical: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
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
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
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
    title: {
            color: 'black',
            marginBottom: 10,
            marginLeft: 20,
            marginTop: 20,
    },
  });


export default EditLocationContextRuleScreen;
