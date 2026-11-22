// [B] Pure settings helpers (no @forge/* import): defaults merge and the rule-change log entries.
import { DEFAULT_SETTINGS, PRIORITY_ORDER } from '../contract.js';

/** @typedef {import('../contract.js').Settings} Settings */

const strings = (value, fallback) =>
  Array.isArray(value) ? [...new Set(value.filter((x) => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))] : [...fallback];

const boolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const textOrNull = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/**
 * Stored (possibly partial or older) settings over DEFAULT_SETTINGS. Unknown keys are dropped; a value of the wrong
 * type falls back to the default. The result is a fresh, unfrozen object.
 * @param {any} stored
 * @returns {Settings}
 */
export const mergeSettings = (stored) => {
  const s = stored && typeof stored === 'object' ? stored : {};
  const d = DEFAULT_SETTINGS;
  const people = s.people ?? {};
  const rules = s.rules ?? {};
  const whatCounts = s.whatCounts ?? {};
  const records = s.records ?? {};
  return {
    people: {
      approvers: strings(people.approvers, d.people.approvers),
      waiverAuthorities: strings(people.waiverAuthorities, d.people.waiverAuthorities),
      approverMayRecordOwnWaiver: boolean(people.approverMayRecordOwnWaiver, d.people.approverMayRecordOwnWaiver),
    },
    rules: {
      staleBlocks: boolean(rules.staleBlocks, d.rules.staleBlocks),
      unprovenBlocks: boolean(rules.unprovenBlocks, d.rules.unprovenBlocks),
      approverMustNotBuild: boolean(rules.approverMustNotBuild, d.rules.approverMustNotBuild),
      approverMustNotTest: boolean(rules.approverMustNotTest, d.rules.approverMustNotTest),
      noSelfTest: boolean(rules.noSelfTest, d.rules.noSelfTest),
      overdueConditionBlocks: boolean(rules.overdueConditionBlocks, d.rules.overdueConditionBlocks),
      passNeedsEvidence: boolean(rules.passNeedsEvidence, d.rules.passNeedsEvidence),
      defectBlockPriority: textOrNull(rules.defectBlockPriority) ?? d.rules.defectBlockPriority,
      defectBlockPriorityId: textOrNull(rules.defectBlockPriorityId),
    },
    whatCounts: {
      requirementTypes: strings(whatCounts.requirementTypes, d.whatCounts.requirementTypes),
      defectTypes: strings(whatCounts.defectTypes, d.whatCounts.defectTypes),
      requirementTypeIds: strings(whatCounts.requirementTypeIds, d.whatCounts.requirementTypeIds),
      defectTypeIds: strings(whatCounts.defectTypeIds, d.whatCounts.defectTypeIds),
      criteriaField: textOrNull(whatCounts.criteriaField),
      environments: strings(whatCounts.environments, d.whatCounts.environments),
    },
    records: {
      spaceKey: textOrNull(records.spaceKey),
      createTask: boolean(records.createTask, d.records.createTask),
    },
  };
};

/**
 * One log entry per rule whose value changed.
 * @param {Settings} before
 * @param {Settings} after
 * @param {string} by   Person id
 * @param {string} at   IsoTime
 * @returns {{rule: string, by: string, at: string, from: boolean|string, to: boolean|string}[]}
 */
export const ruleChanges = (before, after, by, at) =>
  Object.keys(after.rules)
    .filter((rule) => before.rules[rule] !== after.rules[rule])
    .map((rule) => ({ rule, by, at, from: before.rules[rule], to: after.rules[rule] }));
