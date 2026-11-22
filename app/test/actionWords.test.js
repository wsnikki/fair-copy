// The ready sentences of the three actions (src/actionWords.js). A proposal is not a decision: every open item is a
// blocker until the approver signs, and the restore sentences belong to a broken seal only.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE_DIFFERS_LINE,
  RESTORE_LINE,
  blockerWords,
  changedLine,
  brokenSealLines,
  conditionSentence,
  lastDecisionLine,
  proposalWords,
} from '../src/actionWords.js';

const base = { approver: 'Sangnan Wu', decided: false, historyUnreadable: false };

test('fresh sample: five open items, each with something proposed, are still five blockers', () => {
  assert.deepEqual(blockerWords({ ...base, count: 5, covered: 5 }), {
    countLine: '5 things block sign-off.',
    openLine:
      '5 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions by Sangnan Wu, or rejected.',
    canAcceptWithConditions: true,
  });
});

test('one open item', () => {
  const all = blockerWords({ ...base, count: 1, covered: 1 });
  assert.equal(all.countLine, '1 thing blocks sign-off.');
  assert.equal(all.openLine, '1 thing is open; a condition or a waiver is proposed for it; it can be accepted with conditions by Sangnan Wu, or rejected.');
  const none = blockerWords({ ...base, count: 1, covered: 0 });
  assert.equal(
    none.openLine,
    '1 thing is open; it has no condition or waiver yet; it can be rejected by Sangnan Wu now, and accepted with conditions once it has a condition or a waiver.',
  );
  assert.equal(none.canAcceptWithConditions, false);
});

test('partly or not covered: it cannot be accepted with conditions yet', () => {
  assert.equal(
    blockerWords({ ...base, count: 5, covered: 2 }).openLine,
    '5 things are open; a condition or a waiver is proposed for 2 of them; it can be rejected by Sangnan Wu now, and accepted with conditions once the other 3 have a condition or a waiver.',
  );
  assert.equal(
    blockerWords({ ...base, count: 5, covered: 4 }).openLine,
    '5 things are open; a condition or a waiver is proposed for 4 of them; it can be rejected by Sangnan Wu now, and accepted with conditions once the last one has a condition or a waiver.',
  );
  assert.equal(
    blockerWords({ ...base, count: 3, covered: 0 }).openLine,
    '3 things are open; none has a condition or a waiver yet; it can be rejected by Sangnan Wu now, and accepted with conditions once each has a condition or a waiver.',
  );
});

test('nobody asked yet, nothing open, decided, unreadable history', () => {
  assert.equal(
    blockerWords({ ...base, approver: null, count: 2, covered: 2 }).openLine,
    '2 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions, or rejected. Nobody has been asked to decide yet.',
  );
  assert.deepEqual(blockerWords({ ...base, count: 0, covered: 0 }), {
    countLine: 'Nothing blocks sign-off.',
    openLine: null,
    canAcceptWithConditions: false,
  });
  assert.deepEqual(blockerWords({ ...base, decided: true, count: 5, covered: 0 }), {
    countLine: null,
    openLine: null,
    canAcceptWithConditions: false,
  });
  const unreadable = blockerWords({ ...base, historyUnreadable: true, count: 5, covered: 5 });
  assert.equal(unreadable.openLine, '5 things are open. The Jira history could not be read, so nothing can be signed yet.');
  assert.equal(unreadable.canAcceptWithConditions, false);
});

test('the answer to "what changed since the last test run"', () => {
  const edit = { code: 'S1', issueKey: 'CLM-8', at: '2026-11-05T09:00:00Z' };
  const reopened = { code: 'S4', issueKey: 'CLM-24', at: '2026-11-06T09:00:00Z' };
  assert.equal(changedLine([[edit], [edit], [reopened]]), '2 things changed after testing; 3 passes no longer count.');
  assert.equal(changedLine([[edit]]), '1 thing changed after testing; 1 pass no longer counts.');
  assert.equal(changedLine([]), 'Nothing changed since testing.');
  assert.equal(changedLine([[], []]), 'Nothing changed since testing.');
});

test('what is proposed for one open item', () => {
  const draft = {
    conditions: [{ id: 7, text: 'Re-run CLM-15 and CLM-16 on the release build. ', owner: { name: 'Daniel Okafor' }, dueDate: '2026-11-27' }],
    waivers: [{ id: 'w1', reason: 'The approver only held the defect while it was triaged.' }],
  };
  assert.equal(proposalWords(null, draft), null);
  assert.equal(
    proposalWords({ by: 'condition', id: '7' }, draft),
    'Condition proposed: "Re-run CLM-15 and CLM-16 on the release build." (owner Daniel Okafor, due 27 Nov 2026)',
  );
  assert.equal(proposalWords({ by: 'waiver', id: 'w1' }, draft), 'Waiver proposed: "The approver only held the defect while it was triaged."');
  // Only Readiness was read (no drafts at hand): still said, without the text.
  assert.equal(proposalWords({ by: 'condition', id: '7' }, undefined), 'A condition is proposed for it.');
  assert.equal(proposalWords({ by: 'waiver', id: 'zz' }, draft), 'A waiver is proposed for it.');
});

test('the answer to "what did we promise last time"', () => {
  const q = { release: '2.3', recordNumber: 1, outcomeInWords: 'Accepted with conditions', decidedBy: 'Grace Whitlock', decidedAtInWords: '21 Aug 2026' };
  assert.equal(
    lastDecisionLine({ ...q, conditions: { open: 0, met: 1, overdue: 1 } }),
    'Release 2.3 was accepted with conditions by Grace Whitlock on 21 Aug 2026 (Record 1): 2 conditions, 1 met, 1 overdue.',
  );
  assert.equal(
    lastDecisionLine({ ...q, outcomeInWords: 'Accepted', conditions: { open: 0, met: 0, overdue: 0 } }),
    'Release 2.3 was accepted by Grace Whitlock on 21 Aug 2026 (Record 1): no conditions.',
  );
  assert.equal(
    lastDecisionLine({ ...q, conditions: { open: 1, met: 0, overdue: 0 } }),
    'Release 2.3 was accepted with conditions by Grace Whitlock on 21 Aug 2026 (Record 1): 1 condition, 1 open.',
  );
});

test('a met condition names its owner', () => {
  const met = 'Fix CLM-5 and re-run CLM-3 by 18 Sep 2026. — confirmed 14 Sep';
  assert.equal(conditionSentence(met, 'met', 'Tomasz Wrobel'), `${met}, owner Tomasz Wrobel`);
  const overdue = 'Deliver CLM-6. — owner Aisha Bello, was due 2 Nov, 9 days late.';
  assert.equal(conditionSentence(overdue, 'overdue', 'Aisha Bello'), overdue);
  assert.equal(conditionSentence(met, 'met', null), met);
});

test('restore and "only the page differs" belong to a broken seal only', () => {
  const none = { pageDiffersLine: null, restoreLine: null };
  assert.deepEqual(brokenSealLines({ result: 'intact', snapshotOk: true, pageOk: true, canRestore: true }), none);
  assert.deepEqual(brokenSealLines({ result: 'not_fully_checked', snapshotOk: true, pageOk: null, canRestore: true }), none);
  assert.deepEqual(brokenSealLines({ result: 'intact_evidence_missing', snapshotOk: true, pageOk: true, canRestore: true }), none);
  assert.deepEqual(brokenSealLines({ result: 'broken', snapshotOk: true, pageOk: false, canRestore: true }), {
    pageDiffersLine: PAGE_DIFFERS_LINE,
    restoreLine: RESTORE_LINE,
  });
  // The stored record itself fails its seal: the page is not the only thing that differs.
  assert.deepEqual(brokenSealLines({ result: 'broken', snapshotOk: false, pageOk: false, canRestore: true }), {
    pageDiffersLine: null,
    restoreLine: RESTORE_LINE,
  });
  // Broken by the chain, page fine; or the caller may not restore.
  assert.deepEqual(brokenSealLines({ result: 'broken', snapshotOk: true, pageOk: true, canRestore: true }), none);
  assert.equal(brokenSealLines({ result: 'broken', snapshotOk: true, pageOk: false, canRestore: false }).restoreLine, null);
});
