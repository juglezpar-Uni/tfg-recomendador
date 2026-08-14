import { realm } from './RealmInstance';
/**
 * Retrieves all triggering rules from the Realm database, sorted by name.
 *
 * @returns {Realm.Results | null} An array-like Realm Results collection of TriggeringRules,
 *                                 or null if no rules are found.
 */
export function retrieveTriggeringRules() {
    try {
      // Query all TriggeringRule objects and sort them by the 'name' field
      const triggeringRules = realm.objects('TriggeringRule').sorted('name');

      // Return results if not empty, otherwise return null
      return triggeringRules.length > 0 ? triggeringRules : null;
    } catch (error) {
      console.error('Failed to retrieve triggering rules:', error);
      return null;
    }
  }

/**
 * Deletes a triggering rule from the Realm database by its primary key ID.
 *
 * @param {string | number} id - The primary key of the triggering rule to delete.
 * @returns {boolean} Returns true if the rule was found and deleted, false otherwise.
 */
export function deleteTriggeringRuleById(id) {
    try {
      // Find the triggering rule by its primary key
      const rule = realm.objectForPrimaryKey('TriggeringRule', id);

      // If rule exists, perform the deletion in a write transaction
      if (rule) {
        realm.write(() => {
          realm.delete(rule);
        });
        return true;
      } else {
        console.warn(`TriggeringRule with id "${id}" not found.`);
        return false;
      }
    } catch (error) {
      console.error('Failed to delete triggering rule:', error);
      return false;
    }
  }

  /**
 * Updates the switch state of a triggering rule in the Realm database.
 *
 * If the triggering rule with the given ID exists, it updates the `switchState` property.
 * If it does not exist, it will create a new rule with the given ID and state (due to `update: true`).
 *
 * @param {string | number} id - The ID of the triggering rule to update.
 * @param {boolean} ruleState - The new state to assign to the switch.
 * @returns {boolean} Returns true if the update was successful, false otherwise.
 */
export function updateStateTriggeringRule(id, ruleState) {
    try {
      // Perform write transaction to update or insert the rule
      realm.write(() => {
        realm.create('TriggeringRule', {
          id,
          switchState: ruleState,
        }, true); // overwrite existing object with same primary key
      });
      return true;
    } catch (error) {
      console.error('Failed to update switch state of triggering rule:', error);
      return false;
    }
}

/**
 * Updates an existing TriggeringRule in the Realm database with new values.
 *
 * This function replaces the current values of the rule with the specified ID,
 * including its name, recommendation type, associated context rules, and
 * the deny flags for those rules.
 *
 * @param {number|string} id - The ID of the TriggeringRule to update.
 * @param {string} name - The new name for the rule.
 * @param {Array<{selection: string, checked: boolean}>} contextRulesArray -
 *        An array containing selected context rule IDs and their deny flags.
 * @param {string} recommendationType - The type of recommendation associated with the rule.
 */
export function updateTriggeringRule(
  id,
  name,
  contextRulesArray,
  recommendationType,
  algorithm = '',
  algorithmParams = '',
) {
  const contextRules = [];
  const denyContextRule = [];

  // Transform the array into Realm objects and extract 'checked' flags
  contextRulesArray.forEach(({ selection, checked }) => {
    const items = realm.objects('ContextRule').filtered('id == $0', selection);
    if (items.length > 0) {
      contextRules.push(items[0]);
      denyContextRule.push(checked);
    }
  });

  // Write updated data to Realm, with 'true' to perform an upsert
  realm.write(() => {
    realm.create('TriggeringRule', {
      id,
      name,
      recommendationType,
      switchState: true,
      contextRules,
      denyContextRule,
      algorithm,          // v3
      algorithmParams,    // v3
    }, true);
  });
}

/**
 * Checks whether a TriggeringRule with the given name exists in the Realm database.
 *
 * @param {string} name - The name of the TriggeringRule to check.
 * @returns {boolean} True if a TriggeringRule with the specified name exists, otherwise false.
 */
export function existsByNameTriggeringRule(name) {
  const existingRules = realm.objects('TriggeringRule').filtered('name == $0', name);

  // Return true if any matching rule is found, false otherwise
  return existingRules.length > 0;
}

/**
 * Checks whether a TriggeringRule with the given name exists in the Realm database,
 * excluding the rule with the specified ID.
 *
 * This is useful when updating a rule and ensuring that no other rule (besides the one being edited)
 * has the same name.
 *
 * @param {number|string} id - The ID of the TriggeringRule to exclude from the check.
 * @param {string} name - The name to check for uniqueness.
 * @returns {boolean} True if a different TriggeringRule with the same name exists, otherwise false.
 */
export function existsByNameTriggeringRuleAndId(id, name) {
  const existingRules = realm.objects('TriggeringRule').filtered('name == $0 AND id != $1', name, id);

  // Return true if any other rule with the same name exists
  return existingRules.length > 0;
}

/**
 * Stores a new TriggeringRule in the Realm database.
 *
 * This function generates a unique ID for the new rule, prepares its associated
 * context rules and deny flags, and saves the new rule in the Realm database.
 *
 * @param {string} name - The name of the new triggering rule.
 * @param {Array<{selection: string, checked: boolean}>} contextRulesArray -
 *        An array containing selected context rule IDs and their deny flags.
 * @param {string} recommendationType - The type of recommendation to associate.
 */
export function storeTriggeringRule(
  name,
  contextRulesArray,
  recommendationType,
  algorithm = '',
  algorithmParams = '',
) {
  console.log('storeTriggeringRule');

  // Generate new unique ID by finding the highest existing one
  const lastTriggeringRule = realm.objects('TriggeringRule').sorted('id', true)[0];
  const maxId = lastTriggeringRule ? lastTriggeringRule.id : 0;
  const newId = maxId + 1;

  const contextRules = [];
  const denyContextRule = [];

  // Map selections to Realm objects and extract deny flags
  contextRulesArray.forEach(({ selection, checked }) => {
    const items = realm.objects('ContextRule').filtered('id == $0', selection);
    if (items.length > 0) {
      contextRules.push(items[0]);
      denyContextRule.push(checked);
    }
  });

  // Write new rule into Realm
  realm.write(() => {
    realm.create('TriggeringRule', {
      id: newId,
      name,
      recommendationType,
      switchState: true,
      contextRules,
      denyContextRule,
      algorithm,          // v3
      algorithmParams,    // v3
    });
  });
}
