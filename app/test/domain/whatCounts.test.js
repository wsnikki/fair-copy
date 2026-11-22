// M6: which issues are requirements and defects, and which defects block — by Jira id, so a site in another language
// counts the same things. Pure.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, PRIORITY_ORDER } from '../../src/contract.js';
import {
  STANDARD_PRIORITY_ID,
  defectBlocks,
  pickIssueType,
  priorityList,
  thresholdIndex,
  typeMatches,
} from '../../src/domain/whatCounts.js';

const RULES = DEFAULT_SETTINGS.rules; // blocks at High, no priority id chosen

// A German site: Jira translates the names, the ids stay those of every Cloud site.
const GERMAN = [
  { id: '1', name: 'Höchste' },
  { id: '2', name: 'Hoch' },
  { id: '3', name: 'Mittel' },
  { id: '4', name: 'Niedrig' },
  { id: '5', name: 'Niedrigste' },
];
// A site that made its own scheme: other ids, other names, another order.
const CUSTOM = [
  { id: '10100', name: 'Blocker' },
  { id: '10101', name: 'Critical' },
  { id: '10102', name: 'Major' },
  { id: '10103', name: 'Minor' },
];
const GERMAN_TYPES = [
  { id: '10001', name: 'Story', untranslatedName: 'Story', subtask: false, level: 0 },
  { id: '10002', name: 'Aufgabe', untranslatedName: 'Task', subtask: false, level: 0 },
  { id: '10004', name: 'Fehler', untranslatedName: 'Bug', subtask: false, level: 0 },
  { id: '10003', name: 'Unteraufgabe', untranslatedName: 'Sub-task', subtask: true, level: -1 },
  { id: '10000', name: 'Epic', untranslatedName: 'Epic', subtask: false, level: 1 },
];

test('priorityList: the site list when there is one, else the five stock priorities with their stock ids', () => {
  assert.equal(priorityList(GERMAN), GERMAN);
  const stock = PRIORITY_ORDER.map((name) => ({ id: STANDARD_PRIORITY_ID[name], name }));
  assert.deepEqual(priorityList(null), stock);
  assert.deepEqual(priorityList(undefined), stock);
  assert.deepEqual(priorityList([]), stock);
  assert.deepEqual(stock.map((p) => p.id), ['1', '2', '3', '4', '5']);
});

test('thresholdIndex: the chosen id wins over the name; then the name; then the stock id of the English name', () => {
  assert.equal(thresholdIndex({ defectBlockPriority: 'High', defectBlockPriorityId: '10102' }, CUSTOM), 2);
  assert.equal(thresholdIndex({ defectBlockPriority: 'Low', defectBlockPriorityId: 2 }, GERMAN), 1, 'an id given as a number');
  assert.equal(thresholdIndex({ defectBlockPriority: ' critical ', defectBlockPriorityId: null }, CUSTOM), 1, 'name, case and spaces ignored');
  assert.equal(thresholdIndex({ defectBlockPriority: 'Major', defectBlockPriorityId: '999' }, CUSTOM), 2, 'an id the site does not have falls back to the name');
  assert.equal(thresholdIndex(RULES, GERMAN), 1, '"High" is not a German name, but its stock id 2 is on the site');
  assert.equal(thresholdIndex(RULES, CUSTOM), -1, 'neither the name nor the stock id exists here');
  assert.equal(thresholdIndex({ defectBlockPriority: 'Urgent', defectBlockPriorityId: null }, GERMAN), -1);
});

test('defectBlocks: by id, at or above the threshold', () => {
  const blocks = (priorityId) => defectBlocks({ priorityId, priority: null }, RULES);
  assert.deepEqual(['1', '2', '3', '4', '5'].map(blocks), [true, true, false, false, false]);
  const atMedium = { ...RULES, defectBlockPriorityId: '3' };
  assert.equal(defectBlocks({ priorityId: '3' }, atMedium), true);
  assert.equal(defectBlocks({ priorityId: '4' }, atMedium), false);
  assert.equal(defectBlocks({ priorityId: 2 }, RULES), true, 'an id given as a number');
});

test('defectBlocks: translated names — the id decides, the shown name is never needed', () => {
  assert.equal(defectBlocks({ priorityId: '1', priority: 'Höchste' }, RULES, GERMAN), true);
  assert.equal(defectBlocks({ priorityId: '2', priority: 'Hoch' }, RULES, GERMAN), true);
  assert.equal(defectBlocks({ priorityId: '3', priority: 'Mittel' }, RULES, GERMAN), false);
  assert.equal(defectBlocks({ priorityId: '5', priority: 'Niedrigste' }, RULES, GERMAN), false);
  // No id on the defect: the name it carries is looked up in the site's own list.
  assert.equal(defectBlocks({ priority: 'hoch' }, RULES, GERMAN), true);
  assert.equal(defectBlocks({ priority: 'Niedrig' }, RULES, GERMAN), false);
  // The id wins when the name says something else.
  assert.equal(defectBlocks({ priorityId: '4', priority: 'Höchste' }, RULES, GERMAN), false);
});

test('defectBlocks: a custom scheme ranks by the site order', () => {
  const rules = { ...RULES, defectBlockPriority: 'Critical', defectBlockPriorityId: '10101' };
  assert.equal(defectBlocks({ priorityId: '10100' }, rules, CUSTOM), true);
  assert.equal(defectBlocks({ priorityId: '10101' }, rules, CUSTOM), true);
  assert.equal(defectBlocks({ priorityId: '10102' }, rules, CUSTOM), false);
  assert.equal(defectBlocks({ priority: 'Minor' }, rules, CUSTOM), false);
});

test('defectBlocks: whatever cannot be ranked blocks', () => {
  // The defect: an unknown id, an unknown name, no priority at all.
  assert.equal(defectBlocks({ priorityId: '77', priority: null }, RULES), true);
  assert.equal(defectBlocks({ priorityId: null, priority: 'Trivial' }, RULES), true);
  assert.equal(defectBlocks({ priorityId: null, priority: null }, RULES), true);
  assert.equal(defectBlocks({}, RULES), true);
  assert.equal(defectBlocks({ priorityId: '77', priority: 'Whatever' }, RULES, GERMAN), true);
  // The threshold: configured priority not on this site — even the lowest defect blocks.
  assert.equal(defectBlocks({ priorityId: '10103' }, RULES, CUSTOM), true);
  assert.equal(defectBlocks({ priorityId: '5' }, { defectBlockPriority: 'Urgent', defectBlockPriorityId: null }), true);
  // An unknown id with a name the site knows is ranked by the name.
  assert.equal(defectBlocks({ priorityId: '77', priority: 'Low' }, RULES), false);
});

test('typeMatches: chosen ids win, and then only the id counts', () => {
  const bug = { type: 'Fehler', typeId: '10004' };
  assert.equal(typeMatches(bug, ['Bug'], ['10004'], GERMAN_TYPES), true);
  assert.equal(typeMatches(bug, ['Bug'], [10004].map(String), GERMAN_TYPES), true);
  assert.equal(typeMatches({ type: 'Bug', typeId: '10099' }, ['Bug'], ['10004'], GERMAN_TYPES), false, 'the name matches, the id does not');
  assert.equal(typeMatches({ type: 'Bug', typeId: null }, ['Bug'], ['10004'], GERMAN_TYPES), false, 'no id on the issue');
  assert.equal(typeMatches({ type: 'Story', typeId: 10001 }, [], ['10001']), true, 'an id given as a number');
});

test('typeMatches: without ids, the shown name or the name before translation', () => {
  assert.equal(typeMatches({ type: 'Bug', typeId: '1' }, ['Bug'], []), true);
  assert.equal(typeMatches({ type: ' bug ', typeId: '1' }, ['Bug'], []), true, 'case and spaces ignored');
  assert.equal(typeMatches({ type: 'Fehler', typeId: '10004' }, ['Bug'], [], GERMAN_TYPES), true, 'translated: found by its untranslated name');
  assert.equal(typeMatches({ type: 'Aufgabe', typeId: '10002' }, DEFAULT_SETTINGS.whatCounts.requirementTypes, [], GERMAN_TYPES), true);
  assert.equal(typeMatches({ type: 'Fehler', typeId: '10004' }, DEFAULT_SETTINGS.whatCounts.requirementTypes, [], GERMAN_TYPES), false);
  assert.equal(typeMatches({ type: 'Fehler', typeId: '10004' }, ['Bug'], []), false, 'translated and the project types unknown: no match');
  assert.equal(typeMatches({ type: 'Fehler', typeId: null }, ['Bug'], [], GERMAN_TYPES), false);
  assert.equal(typeMatches({ type: 'Fehler', typeId: '10004' }, ['Bug'], undefined, GERMAN_TYPES), true, 'ids missing altogether');
});

test('pickIssueType: the first wanted name the project has, by untranslated or shown name, as an id', () => {
  assert.equal(pickIssueType(GERMAN_TYPES, ['Task']), '10002');
  assert.equal(pickIssueType(GERMAN_TYPES, ['Aufgabe']), '10002');
  assert.equal(pickIssueType(GERMAN_TYPES, ['Test', 'bug']), '10004', 'the order of the wanted names decides');
  assert.equal(pickIssueType(GERMAN_TYPES, ['Improvement']), '10001', 'none wanted: the first ordinary type');
  const noOrdinary = GERMAN_TYPES.filter((t) => t.subtask || t.level !== 0);
  assert.equal(pickIssueType(noOrdinary, ['Task']), null, 'never a sub-task or an epic by default');
  assert.equal(pickIssueType([], ['Task']), null);
});
