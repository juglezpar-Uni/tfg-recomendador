/**
 * siddhiAppNoWindow.js
 * -----------------------------------------------------------------------------
 * Builds a SiddhiQL app equivalent to the production app but WITHOUT the
 * `window.timeBatch(7 sec)` aggregation at the tail. The pass-through query
 * makes `Results` events reach `FinalResults` immediately, so `getResult()`
 * in the benchmark unblocks as soon as the CEP engine has evaluated the tick.
 *
 * Everything else (streams, JSON parsing queries, CR generators, TR
 * generators, negated-context generators) is reused verbatim from the
 * production Siddhi modules under src/siddhi/**. This module does NOT modify
 * any file in that folder.
 * -----------------------------------------------------------------------------
 */

import {createSiddhiAppIntro} from '../../siddhi/structure.js';
import {writeAllContextRules} from '../../siddhi/rules/context/index.js';
import {writeAllTriggeringRules} from '../../siddhi/rules/triggering/index.js';

/**
 * Pass-through tail — identical to the production `createSiddhiAppEnd()`
 * except no `window.timeBatch` and no `str:groupConcat`. Each Results event
 * is forwarded as-is to FinalResults, which triggers the log sink defined in
 * structure.js (and completes the getResult() callback on the JS side).
 *
 * CRITICAL: the query name MUST stay `'finalResults'`.
 * SiddhiAppManager.kt registers its QueryCallback on the query whose
 * @info(name = 'finalResults'). If we rename this query, the callback is
 * never invoked, `result.setResult()` never fires, and `waitForResult()`
 * hangs for its 20-second timeout on every single sendEvent.
 */
function createBenchmarkEnd() {
  return `
@info(name = 'finalResults')
from Results
select contextId, recommendation
insert into FinalResults;
`;
}

/**
 * Full SiddhiQL app string, ready to hand to SiddhiClientModule.startApp().
 *
 * @param {Array<Object>} contextRules      loaded from Realm (or synthetic)
 * @param {Array<Object>} triggeringRules   loaded from Realm (or synthetic)
 * @returns {string}
 */
export function buildBenchmarkSiddhiApp(contextRules, triggeringRules) {
  return [
    createSiddhiAppIntro(),
    writeAllContextRules(contextRules),
    writeAllTriggeringRules(triggeringRules),
    createBenchmarkEnd(),
  ].join('\n');
}
