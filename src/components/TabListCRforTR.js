import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import {  View, Text, Alert, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
//Gluestack ui
import { Input, InputField } from '@/components/ui/input';
import { HStack } from '@/components/ui/hstack';
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
import {
    Checkbox,
    CheckboxIndicator,
    CheckboxIcon,
} from '@/components/ui/checkbox';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/icon';
import { CheckIcon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon, CircleMinus } from 'lucide-react-native';

import * as Schemas from '../realmSchemas/RealmServices';
import * as TriggerinSchema from '../realmSchemas/TriggeringRulesServices';
import {bootstrapRuleEngine} from '../background/ruleEngineAdapter';
import {listAvailable} from '../recommendation/AlgorithmRegistry';

const RECOMMENDATION_TYPES = [
  'Restaurants', 'Shops', 'Museums', 'Places Of Interest',
  'Accommodation', 'ShowsHalls', 'EntertainmentEstablishments', 'Leisure', 'ChangeRoom',
];

// Algorithm identifier used to mean "no algorithm chosen for this rule,
// fall back to the bridge's typeToAlgorithm map". Stored in Realm as ''.
const ALGORITHM_DEFAULT = 'default';

// Algorithms that need the user to provide a keyword-like parameter.
const NEEDS_KEYWORD = new Set(['keyword', 'custom']);

const LabeledInputField = ({
  label,
  value,
  placeholder,
  onChangeText,
  readOnly = true,
}) => (
  <>
    <Text style={styles.label} size="2xl">{label}</Text>
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

const RecommendationSelect = ({ selectedValue, onChange, isDisabled }) => (
  <Select selectedValue={selectedValue} onValueChange={onChange} isDisabled={isDisabled}>
    <SelectTrigger variant="underlined" size="xl" style={styles.select}>
      <SelectInput placeholder="Pick one" />
      <SelectIcon className="ml-3" as={ChevronDownIcon} style={styles.safeArea} />
    </SelectTrigger>

    <SelectPortal>
      <SelectBackdrop />
      <SafeAreaView edges={['bottom']}>
        <SelectContent>
          <SelectItem label="Pick one" value="default" key="default" />
          {RECOMMENDATION_TYPES.map((type) => (
            <SelectItem label={type} value={type} key={type} />
          ))}
        </SelectContent>
      </SafeAreaView>
    </SelectPortal>
  </Select>
);

const TabListCRforTR = ({ createScreen }) => {
  const navigation = useNavigation();
  const route = useRoute();
  const triggeringRule = route.params?.triggeringRule;

  const [edit, setEdit] = useState(createScreen);
  const [name, setName] = useState('');
  const [contextRules, setContextRules] = useState([]);
  const [typeOfRecommendation, setTypeOfRecommendation] = useState('default');
  const [allContextRules, setAllContextRules] = useState([]);

  // v3: algorithm the user picks for this rule + its keyword-like param.
  // 'default' means "let the bridge decide via its typeToAlgorithm map".
  const [algorithm, setAlgorithm] = useState(ALGORITHM_DEFAULT);
  const [keywordParam, setKeywordParam] = useState('');

  // All algorithms the system currently offers, plus 'default' at the front.
  const algorithmOptions = useMemo(
    () => [
      ALGORITHM_DEFAULT,
      ...listAvailable().map(a => a.constructor.id),
    ],
    [],
  );

  useEffect(() => {
    const fetchedContextRules = Schemas.retrieveContextRules() || [];
    const pickerItems = [
      { label: 'Pick one', value: 'default' },
      ...fetchedContextRules.map((value) => ({
        label: `${value.name} #${value.type}`,
        value: String(value.id),
      })),
    ];
    setAllContextRules(pickerItems);
  }, []);

  const addContextRuleRow = useCallback(() => {
    setContextRules((prev) => [
      ...prev,
      {
        index: prev.length,
        selection: 'default',
        checked: false,
      },
    ]);
  }, []);

  useEffect(() => {
    if (!createScreen && triggeringRule) {
      setName(triggeringRule.name || '');
      setTypeOfRecommendation(triggeringRule.recommendationType || 'default');

      const contextRulesAux = (triggeringRule.contextRules || []).map((rule, idx) => ({
        index: idx,
        selection: String(rule.id),
        checked: triggeringRule.denyContextRule?.[idx] ?? false,
        type: rule.type,
        name: rule.name,
        label: `${rule.name} #${rule.type}`,
      }));


      setContextRules(contextRulesAux);

      // v3: hydrate the algorithm chip + keyword param from the stored rule.
      // Empty/null algorithm maps to 'default' (bridge fallback).
      const storedAlg = triggeringRule.algorithm;
      setAlgorithm(storedAlg && storedAlg !== '' ? storedAlg : ALGORITHM_DEFAULT);
      if (triggeringRule.algorithmParams) {
        try {
          const parsed = JSON.parse(triggeringRule.algorithmParams);
          if (parsed && typeof parsed === 'object') {
            if (typeof parsed.keyword === 'string') {
              setKeywordParam(parsed.keyword);
            } else if (Array.isArray(parsed.matchKeywords)) {
              setKeywordParam(parsed.matchKeywords.join(' '));
            }
          }
        } catch {
          // Malformed JSON in storage — ignore, keep the input empty.
        }
      }
    } else if (createScreen) {
      addContextRuleRow();
    }
  }, [createScreen, triggeringRule, addContextRuleRow]);

  useLayoutEffect(() => {

    if (!createScreen && name) {
      navigation.setOptions({ title: name });
    }
  }, [createScreen, name, navigation]);



  const toggleChecked = useCallback((index) => {
    setContextRules((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, checked: !item.checked } : item
      )
    );
  }, []);

  const updateSelection = useCallback((index, selection) => {
    setContextRules((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, selection } : item
      )
    );
  }, []);

  const deleteContextRule = useCallback((indexToDelete) => {
    setContextRules((prev) =>
      prev.filter((item) => item.index !== indexToDelete)
    );
  }, []);

  const onPressSaveButton = useCallback(() => {
    const validationError = (() => {
      if (!name || typeOfRecommendation === 'default' || contextRules.length === 0) {
        return 'All fields must be completed';
      }
      if (/\s/.test(name)) {return "Name field can't contain spaces.";}
      if (!/[a-zA-Z]/.test(name)) {return 'Name must contain at least one letter.';}
      if (!/^[a-zA-Z]/.test(name)) {return 'First character must be a letter.';}
      if (contextRules.length < 2) {return 'You must select at least 2 context rules';}

      const selections = contextRules.map((item) => item.selection);
      const uniqueSelections = new Set(selections);
      if (uniqueSelections.size !== selections.length) {
        return "Recommendation types selected can't be repeated.";
      }

      // v3: keyword algorithm requires a keyword. Custom accepts empty
      // (it falls back to recommendationType as a single keyword).
      if (algorithm === 'keyword' && !keywordParam.trim()) {
        return "Keyword algorithm requires a keyword.";
      }

      return null;
    })();

    if (validationError) {
      Alert.alert('Warning', validationError);
      return;
    }

    const alreadyExists = createScreen
      ? TriggerinSchema.existsByNameTriggeringRule(name)
      : TriggerinSchema.existsByNameTriggeringRuleAndId(triggeringRule.id, name);

    if (alreadyExists) {
      Alert.alert('Warning', 'There is already a triggering rule with that name.');
      return;
    }

    // v3: build the algorithm and params to store.
    //   - 'default' chip → empty string in Realm → bridge uses its map.
    //   - keyword → {keyword: "..."} serialized as JSON.
    //   - custom  → {matchKeywords: [...]} serialized as JSON (split by whitespace).
    //   - random/closeness → no params.
    const algToStore = algorithm === ALGORITHM_DEFAULT ? '' : algorithm;
    let algParamsToStore = '';
    const trimmedKw = keywordParam.trim();
    if (algorithm === 'keyword' && trimmedKw) {
      algParamsToStore = JSON.stringify({keyword: trimmedKw});
    } else if (algorithm === 'custom' && trimmedKw) {
      const words = trimmedKw.split(/\s+/).filter(Boolean);
      algParamsToStore = JSON.stringify({matchKeywords: words});
    }

    if (createScreen) {
      TriggerinSchema.storeTriggeringRule(
        name,
        contextRules,
        typeOfRecommendation,
        algToStore,
        algParamsToStore,
      );
    } else {
      TriggerinSchema.updateTriggeringRule(
        triggeringRule.id,
        name,
        contextRules,
        typeOfRecommendation,
        algToStore,
        algParamsToStore,
      );
    }

    bootstrapRuleEngine();

    Alert.alert('Success!', `Triggering rule ${createScreen ? 'saved' : 'updated'}`, [
      {
        text: 'OK',
        onPress: () => {
          if (createScreen) {
            navigation.navigate('Recommendation_triggering_rules');
          } else {
            setEdit(false);
          }
        },
      },
    ]);
  }, [name, typeOfRecommendation, contextRules, algorithm, keywordParam, createScreen, navigation, triggeringRule]);


  const renderAlgorithmSection = (isEditable) => (
    <>
      <View style={styles.lineView}>
        <View style={styles.lineStyle} />
      </View>

      <Text style={styles.title}>Algorithm:</Text>
      <View style={styles.chipRow}>
        {algorithmOptions.map((id) => {
          const selected = id === algorithm;
          return (
            <TouchableOpacity
              key={id}
              onPress={isEditable ? () => setAlgorithm(id) : undefined}
              disabled={!isEditable}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                !isEditable && styles.chipDisabled,
              ]}>
              <Text
                style={[
                  styles.chipText,
                  selected && styles.chipTextSelected,
                ]}>
                {id === ALGORITHM_DEFAULT ? '(por defecto)' : id}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {NEEDS_KEYWORD.has(algorithm) && (
        <>
          <Text style={styles.title}>
            {algorithm === 'keyword' ? 'Keyword:' : 'Context words:'}
          </Text>
          <Input
            style={styles.input}
            size="lg"
            variant="underlined"
            isReadOnly={!isEditable}
            isDisabled={!isEditable}>
            <InputField
              placeholder={algorithm === 'keyword' ? 'e.g. museo' : 'e.g. museo goya'}
              maxLength={80}
              value={keywordParam}
              onChangeText={setKeywordParam}
              editable={isEditable}
              pointerEvents={isEditable ? 'auto' : 'none'}
            />
          </Input>
        </>
      )}
    </>
  );

  const renderContextRuleRow = (item, index, isEditable = true) => (
    <HStack key={item.index} space="md" style={styles.hstack}>
      {/* Checkbox */}
      <Checkbox
        size="md"
        isChecked={item.checked}
        isDisabled={!isEditable}
        onChange={() => toggleChecked(item.index)}
        style={styles.checkbox}
      >
        <CheckboxIndicator>
          <CheckboxIcon as={CheckIcon} />
        </CheckboxIndicator>
      </Checkbox>

      {/* Select */}
      <Select
        selectedValue={item.label}
        onValueChange={(value) => updateSelection(item.index, value)}
        isDisabled={!isEditable}
        style={styles.littleSelect}
      >
        <SelectTrigger variant="underlined" size="xl" style={styles.select}>
          <SelectInput placeholder="Pick one" />
          <SelectIcon as={ChevronDownIcon} />
        </SelectTrigger>

        <SelectPortal>
          <SelectBackdrop />
          <SafeAreaView edges={['bottom']}>
            <SelectContent>
              {allContextRules.map((rule) => (
                <SelectItem label={rule.label} value={rule.value} key={rule.value} />
              ))}
            </SelectContent>
          </SafeAreaView>
        </SelectPortal>
      </Select>

      {/* Delete button only when editable*/}
      {isEditable && (
        <Pressable
          onPress={() => deleteContextRule(index)}
          hitSlop={10}
          style={styles.pressable}
        >
          <Icon as={CircleMinus} size="3xl" color="black" style={styles.icon} />
        </Pressable>
      )}
    </HStack>
  );



  const renderEditOrCreateMode = () => (
    <View style={styles.externalView}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        <LabeledInputField
          label="Name:"
          value={name}
          placeholder="Insert name"
          readOnly={false}
          onChangeText={setName}
        />

        <Text style={styles.description}>
          Add the context rules that must be satisfied.
          Check the box on the left if you want to deny the rule.
        </Text>

        <HStack space="md" style={styles.hstack}>
          <Text style={styles.label}>Not</Text>
          <Text style={styles.label}>Context Rules:</Text>
        </HStack>

        {contextRules.map((item, index) => renderContextRuleRow(item, index, true))}

        <Button onPress={addContextRuleRow} style={styles.addButton}>
          <Text style={styles.addText}>+</Text>
        </Button>

        <View style={styles.lineView}>
          <View style={styles.lineStyle} />
        </View>

        <Text style={styles.title}>Type of recommendation:</Text>

        <RecommendationSelect
          selectedValue={typeOfRecommendation}
          onChange={setTypeOfRecommendation}
          isDisabled={false}
        />

        {renderAlgorithmSection(true)}

        <Button style={styles.saveButton} onPress={onPressSaveButton}>
          <Text style={styles.saveText}>Save</Text>
        </Button>
      </ScrollView>
    </View>
  );


  const renderViewMode = () => (
    <View style={styles.externalView}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        <LabeledInputField
          label="Name:"
          value={name}
          placeholder="Insert name"
          readOnly={true}
        />

        <Text style={styles.description}>
          List of context rules that must be satisfied. Rule is denied if the box on the left is checked.
        </Text>

        <HStack space="md" style={styles.hstack}>
          <Text style={styles.label}>Not</Text>
          <Text style={styles.label}>Context Rules:</Text>
        </HStack>
        {contextRules.map((item, index) => renderContextRuleRow(item, index, false))}

        <View style={styles.lineView}>
          <View style={styles.lineStyle} />
        </View>

        <Text style={styles.title}>Type of recommendation:</Text>

        <RecommendationSelect
          selectedValue={typeOfRecommendation}
          onChange={setTypeOfRecommendation}
          isDisabled={true}
        />

        {renderAlgorithmSection(false)}

        <Button style={styles.saveButton} onPress={() => setEdit(true)}>
          <Text style={styles.saveText}>Edit</Text>
        </Button>
      </ScrollView>
    </View>
  );

  return (
    <>
      {edit ? renderEditOrCreateMode() : renderViewMode()}
    </>
  );
};

export default React.memo(TabListCRforTR);

const styles = StyleSheet.create({
  addButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#03A9F4',
    borderRadius: 30,
    elevation: 4,
    height: 60,
    marginRight:20,
    marginTop: 32,
    paddingHorizontal: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    width: 60,
  },
  addText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
  },
  checkbox: {
        marginLeft: 30,
    },
  description: {
      fontSize: 16,
      marginBottom: '7%',
      marginLeft: 20,
      marginRight: 20,
    },
  externalView: {
        flex: 1,
    },
  hstack: {
        alignItems: 'center',
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
        fontSize: 20,
        marginBottom: 6,
        marginLeft: 20,
    },
    lineStyle: {
    backgroundColor: '#e0e0e0',
    height: 1,
    width: '100%',
  },
    lineView: {
    alignSelf: 'stretch',
    marginVertical: 24,
  },
    littleSelect: {
    flex: 1,
    marginLeft: '6%',
  },
    pressable: {
    marginLeft: '3%',
    marginRight: '3%',
  },
    saveButton: {
      alignSelf: 'flex-end',
      backgroundColor: '#2563EB',
      borderRadius: 20,
      elevation: 4,
      marginRight:20,
      marginTop: 32,
      paddingHorizontal: 40,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
    },
    saveText: {
      color: '#FFFFFF',
      fontSize: 20,

    },
    scrollView: {
    paddingBottom: 100,
    paddingHorizontal: 20,
    },
    select: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
    title: {
    color: 'black',
    fontSize: 25,
    marginBottom: 10,
    marginLeft: 20,
    marginTop: 20,
  },
  chip: {
    backgroundColor: '#f4f4f4',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    marginLeft: 20,
    marginRight: 20,
  },
  chipSelected: {
    backgroundColor: '#1e90ff',
  },
  chipText: {
    color: '#333',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
