// Pure text helpers added during integration.
import test from 'node:test';
import assert from 'node:assert/strict';

import { changedPart, staleReasonNote } from '../../src/lib/format.js';

test('changedPart: only the words that differ, the rest is shared', () => {
  const before = 'The new award applies from the date of the change; a past date creates arrears.';
  const after = 'The new award applies from the Monday following the date of the change; a past date creates arrears.';
  const d = changedPart(before, after);
  assert.equal(d.head, 'The new award applies from the ');
  assert.equal(d.was, '');
  assert.equal(d.now, 'Monday following the ');
  assert.equal(d.head + d.was + d.tail, before);
  assert.equal(d.head + d.now + d.tail, after);
});

test('changedPart: a replaced word, equal texts, and nothing at all', () => {
  const d = changedPart('Refund by the day.', 'Refund by whole month.');
  assert.deepEqual([d.head, d.was, d.now, d.tail], ['Refund by ', 'the day.', 'whole month.', '']);
  assert.deepEqual(changedPart('same text', 'same text'), { head: 'same text', was: '', now: '', tail: '' });
  assert.deepEqual(changedPart(null, 'new'), { head: '', was: '', now: 'new', tail: '' });
  const grown = changedPart('a b', 'a b b');
  assert.equal(grown.head + grown.was + grown.tail, 'a b');
  assert.equal(grown.head + grown.now + grown.tail, 'a b b');
});

test('staleReasonNote: words for every rule, never the code', () => {
  assert.equal(staleReasonNote('S1', '2026-12-03T16:22:00Z', 'Leo Marchetti (Sample)'), 'Requirement edited by Leo Marchetti (Sample) on 3 Dec 2026');
  assert.equal(staleReasonNote('S2', '2026-12-01T09:00:00Z', null), 'Test steps edited on 1 Dec 2026');
  assert.equal(staleReasonNote('S3', null, 'Priya Raman'), 'Requirement reopened by Priya Raman');
  assert.equal(staleReasonNote('S4', '2026-12-04T08:00:00Z', 'Priya Raman'), 'A linked defect was reopened on 4 Dec 2026');
  assert.equal(staleReasonNote('S5', null, null), 'Tested on an earlier build');
  assert.equal(staleReasonNote('S6', null, null), 'An evidence file is missing or has changed');
  for (const code of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) assert.ok(!/S\d/.test(staleReasonNote(code, null, null)));
});
