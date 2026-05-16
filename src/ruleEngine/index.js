/**
 * Public entry point for the JS rule engine.
 *
 * Importers should ONLY pull from this file (mirrors the convention used by
 * src/siddhi/index.js).
 */

export { default as RuleEngine } from './RuleEngine';
export {
  onRecommendationTriggered,
  setRecommendationTypeMap,
  getAlgorithmForType,
  dispatchToRecommendationEngine,
} from './RecommendationBridge';
