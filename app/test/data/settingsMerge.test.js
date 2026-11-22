// Slice B: pure repo helpers. No @forge/* import.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../../src/contract.js';
import { mergeSettings, ruleChanges } from '../../src/data/settingsMerge.js';
import { marks, parseJson, rowMarks, unique } from '../../src/data/rows.js';

test('nothing stored → the defaults, as a fresh unfrozen object', () => {
  const s = mergeSettings(null);
  assert.deepEqual(s, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  s.people.approvers.push('x');
  assert.equal(DEFAULT_SETTINGS.people.approvers.length, 0);
});

test('partial settings are merged over the defaults; wrong types fall back; a site may name its own priorities', () => {
  const s = mergeSettings({
    people: { approvers: ['a', 'a', ''] },
    rules: { staleBlocks: false, defectBlockPriority: 'Urgent', noSelfTest: 'yes' },
    whatCounts: { criteriaField: ' customfield_10050 ', requirementTypes: ['Story'], requirementTypeIds: ['10001', 10001, ''] },
    records: { spaceKey: '' },
    extra: 1,
  });
  assert.deepEqual(s.people.approvers, ['a']);
  assert.equal(s.people.approverMayRecordOwnWaiver, true);
  assert.equal(s.rules.staleBlocks, false);
  assert.equal(s.rules.defectBlockPriority, 'Urgent');
  assert.equal(s.rules.defectBlockPriorityId, null);
  assert.equal(mergeSettings({ rules: { defectBlockPriority: 7, defectBlockPriorityId: ' 10002 ' } }).rules.defectBlockPriority, 'High');
  assert.equal(mergeSettings({ rules: { defectBlockPriorityId: ' 10002 ' } }).rules.defectBlockPriorityId, '10002');
  assert.equal(s.rules.noSelfTest, true);
  assert.equal(s.whatCounts.criteriaField, 'customfield_10050');
  assert.deepEqual(s.whatCounts.requirementTypes, ['Story']);
  assert.deepEqual(s.whatCounts.defectTypes, ['Bug']);
  assert.deepEqual(s.whatCounts.defectTypeIds, []);
  assert.equal(s.records.spaceKey, null);
  assert.equal('extra' in s, false);
});

test('ruleChanges logs one entry per changed rule', () => {
  const before = mergeSettings(null);
  const after = mergeSettings({ rules: { staleBlocks: false, defectBlockPriority: 'Medium' } });
  assert.deepEqual(ruleChanges(before, after, 'u-1', '2026-12-09T10:00:00Z'), [
    { rule: 'staleBlocks', by: 'u-1', at: '2026-12-09T10:00:00Z', from: true, to: false },
    { rule: 'defectBlockPriority', by: 'u-1', at: '2026-12-09T10:00:00Z', from: 'High', to: 'Medium' },
  ]);
  assert.deepEqual(ruleChanges(before, before, 'u-1', '2026-12-09T10:00:00Z'), []);
});

test('row helpers', () => {
  assert.equal(marks(3), '?, ?, ?');
  assert.equal(rowMarks(2, 2), '(?, ?), (?, ?)');
  assert.deepEqual(unique(['a', null, 'a', '', 'b']), ['a', 'b']);
  assert.deepEqual(parseJson('[1]', []), [1]);
  assert.deepEqual(parseJson('{bad', []), []);
});
