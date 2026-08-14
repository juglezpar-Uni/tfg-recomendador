import Realm from 'realm';
import * as Schemas from './Schema';

const realmConfig = {
  schema: Object.values(Schemas),  // import all schemas
  // v2: added ZaragozaPOI, Valoration, Favourite, Feedback, RecommendationCache
  // v3: added TriggeringRule.algorithm and TriggeringRule.algorithmParams
  //     (both optional strings, existing rows migrate transparently to null)
  schemaVersion: 3,
};

export const realm = new Realm(realmConfig);
