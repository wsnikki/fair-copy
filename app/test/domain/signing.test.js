// PRODUCT §3.4: the three outcomes, B1–B3, conditions and waivers, and the form checks of §8.6.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../../src/contract.js';
import { briefFingerprint } from '../../src/domain/briefFingerprint.js';
import {
  applyCoverage, availability, needsIssue, openItems, validateCondition, validateDecision, validateRun, validateWaiver,
} from '../../src/domain/signingRules.js';
import { HISTORY, P, RULES, assemble, at, request, status } from './fixtures.js';

const briefOf = (o) => {
  const release = assemble(o);
  const items = openItems({ ...release, conflicts: release.duties.conflicts });
  const fingerprint = briefFingerprint({
    release: { id: '10002', build: null }, requestId: '2', approverId: o.approver.id, counts: release.counts,
    requirements: release.requirements, defects: release.defects, conflicts: release.duties.conflicts, carried: release.carried,
  });
  return { release, items, fingerprint };
};

const CONFLICT = 'conflict:D1:sample:P8:CLM-9';
const conditions = [
  { id: '11', covers: ['case:CLM-18:stale', 'case:CLM-15:stale', 'case:CLM-16:stale'] },
  { id: '12', covers: ['case:CLM-22:not_run'] },
];
const waiver = { id: '5', covers: CONFLICT };

const samuel = briefOf({ approver: P.samuel });
const decide = (extra) => validateDecision({
  request: request(P.samuel), actorId: P.samuel.id, outcome: 'accepted_with_conditions', statement: 'Accepted for go-live on 14 Dec.',
  affirmed: true, fingerprint: samuel.fingerprint, currentFingerprint: samuel.fingerprint,
  items: applyCoverage(samuel.items, conditions, [waiver]), ...extra,
});

test('coverage: conditions cover cases, a waiver covers the conflict; neither can stand in for the other', () => {
  const covered = applyCoverage(samuel.items, conditions, [waiver]);
  assert.deepEqual(covered.map((i) => i.coveredBy), [
    { by: 'condition', id: '11' }, { by: 'condition', id: '11' }, { by: 'condition', id: '11' },
    { by: 'condition', id: '12' }, { by: 'waiver', id: '5' },
  ]);
  const wrongTool = applyCoverage(samuel.items, [{ id: '13', covers: [CONFLICT] }], [{ id: '6', covers: 'case:CLM-22:not_run' }]);
  assert.ok(wrongTool.every((i) => i.coveredBy === null));
  assert.ok(samuel.items.every((i) => i.coveredBy === null), 'the input is not changed');
});

test('availability: what each outcome needs, with the reasons in short phrases', () => {
  const none = availability(samuel.items);
  assert.deepEqual(none.accepted, { allowed: false, reasons: ['3 changed after passing', '1 not tested', '1 conflict'] });
  assert.deepEqual(none.accepted_with_conditions, { allowed: false, reasons: ['5 open items not covered'], covered: 0, total: 5 });
  assert.deepEqual(none.rejected, { allowed: true, reasons: [] });

  const partly = availability(applyCoverage(samuel.items, conditions, []));
  assert.deepEqual(partly.accepted_with_conditions, { allowed: false, reasons: ['1 open item not covered'], covered: 4, total: 5 });

  const all = availability(applyCoverage(samuel.items, conditions, [waiver]));
  assert.equal(all.accepted_with_conditions.allowed, true);
  assert.equal(all.accepted.allowed, false, 'covered items still stop a plain accept');
  assert.equal(availability([]).accepted.allowed, true);
});

test('accept with conditions is allowed once every open item is covered', () => {
  assert.deepEqual(decide({}), { ok: true });
  const missingWaiver = decide({ items: applyCoverage(samuel.items, conditions, []) });
  assert.deepEqual(missingWaiver, {
    ok: false, code: 'not_signable', error: '1 open item has no condition or waiver yet.', details: { uncovered: [CONFLICT] },
  });
  assert.equal(decide({ items: samuel.items }).error, '5 open items have no condition or waiver yet.');
});

test('plain accept is refused with any open item, covered or not', () => {
  const refused = decide({ outcome: 'accepted' });
  assert.equal(refused.code, 'not_signable');
  assert.equal(refused.error, 'This release cannot be accepted as it stands: 3 changed after passing, 1 not tested, 1 conflict. Accept with conditions, or reject.');
  assert.equal(decide({ outcome: 'accepted', items: [samuel.items[3]] }).ok, false);
  assert.deepEqual(decide({ outcome: 'accepted', items: [] }), { ok: true });
});

test('reject is always allowed to the named approver, with a statement', () => {
  assert.deepEqual(decide({ outcome: 'rejected', items: samuel.items }), { ok: true });
  assert.equal(decide({ outcome: 'rejected', items: samuel.items, statement: '  ' }).error, 'Write a short statement. It is printed on the record.');
});

test('B1: only the named approver on an open request', () => {
  assert.deepEqual(decide({ actorId: P.grace.id }), { ok: false, code: 'B1', error: 'Only Samuel Ortega can decide on this release.' });
  assert.equal(decide({ actorId: null }).code, 'B1');
  assert.equal(decide({ request: null }).code, 'B1');
  assert.equal(decide({ request: request(P.samuel, { state: 'withdrawn' }) }).code, 'B1');
  assert.equal(decide({ request: request(P.samuel, { state: 'decided' }), outcome: 'rejected' }).code, 'B1');
});

test('B3: the affirmation box', () => {
  assert.deepEqual(decide({ affirmed: false }), { ok: false, code: 'B3', error: 'Tick the box to confirm you have read the brief.' });
  assert.equal(decide({ affirmed: false, outcome: 'rejected' }).code, 'B3');
});

test('B2: the brief changed while the approver was reading', () => {
  // While Samuel reads, CLM-7 is reopened: three more passes stop counting.
  const reopened = { ...HISTORY, 'CLM-7': [...HISTORY['CLM-7'], status('CLM-7', 'done', 'in_progress', at('2026-12-09', '08:59'), P.leo)] };
  const now = briefOf({ approver: P.samuel, history: reopened });
  assert.deepEqual(now.release.counts, { proven: 5, stale: 6, failing: 0, unproven: 1 });
  assert.notEqual(now.fingerprint, samuel.fingerprint);
  const refused = decide({ currentFingerprint: now.fingerprint });
  assert.equal(refused.code, 'B2');
  assert.equal(refused.error, 'Something changed while you were reading. Nothing was signed. The brief has been refreshed and the changes are marked.');
  assert.equal(decide({ currentFingerprint: now.fingerprint, outcome: 'rejected' }).code, 'B2', 'whatever the outcome');
  assert.equal(decide({ fingerprint: '' , currentFingerprint: '' }).code, 'B2', 'a missing fingerprint never matches');
});

test('order of refusal: B1, B3, statement, B2, then the bar', () => {
  const all = { actorId: P.grace.id, affirmed: false, statement: '', currentFingerprint: 'x', outcome: 'accepted' };
  assert.equal(decide(all).code, 'B1');
  assert.equal(decide({ ...all, actorId: P.samuel.id }).code, 'B3');
  assert.equal(decide({ ...all, actorId: P.samuel.id, affirmed: true }).details.field, 'statement');
  assert.equal(decide({ ...all, actorId: P.samuel.id, affirmed: true, statement: 'ok' }).code, 'B2');
  assert.equal(decide({ outcome: 'accepted' }).code, 'not_signable');
  assert.deepEqual(decide({ outcome: 'approved' }).details, { field: 'outcome' });
});

test('waiver: reason of at least 20 characters, one named authoriser, covers a conflict', () => {
  const settings = DEFAULT_SETTINGS;
  const base = {
    covers: CONFLICT, reason: 'No other technical approver is available before go-live.', authorisedById: P.ingrid.id, authorisedByName: null,
    actorId: P.ingrid.id, approverId: P.samuel.id, items: samuel.items, settings,
  };
  assert.deepEqual(validateWaiver(base), { ok: true });
  assert.deepEqual(validateWaiver({ ...base, authorisedById: null, authorisedByName: 'Ingrid Solberg, Quality officer' }), { ok: true });

  const short = validateWaiver({ ...base, reason: 'Nobody else is free' }); // 19 characters
  assert.deepEqual(short, { ok: false, code: 'invalid', error: 'Give a reason of at least 20 characters. It is printed on the record.', details: { field: 'reason' } });
  assert.equal(validateWaiver({ ...base, reason: `Nobody else is free.${' '.repeat(10)}` }).ok, true); // exactly 20
  assert.equal(validateWaiver({ ...base, reason: `   short reason   ${' '.repeat(20)}` }).ok, false, 'spaces do not count');

  assert.equal(validateWaiver({ ...base, authorisedById: null }).error, 'Say who authorised this waiver.');
  assert.equal(validateWaiver({ ...base, authorisedByName: 'Also a name' }).error, 'Say who authorised this waiver.');
  assert.deepEqual(validateWaiver({ ...base, covers: 'case:CLM-22:not_run' }).details, { field: 'covers' });
  assert.deepEqual(validateWaiver({ ...base, covers: 'conflict:D1:nobody:CLM-1' }).details, { field: 'covers' });
});

test('waiver: who may record one', () => {
  const base = {
    covers: CONFLICT, reason: 'No other technical approver is available before go-live.', authorisedById: P.ingrid.id, authorisedByName: null,
    approverId: P.samuel.id, items: samuel.items,
  };
  const people = (extra) => ({ ...DEFAULT_SETTINGS, people: { ...DEFAULT_SETTINGS.people, ...extra } });
  // single-user default: the approver may record their own
  assert.equal(validateWaiver({ ...base, actorId: P.samuel.id, settings: DEFAULT_SETTINGS }).ok, true);
  const own = validateWaiver({ ...base, actorId: P.samuel.id, settings: people({ approverMayRecordOwnWaiver: false, waiverAuthorities: [P.ingrid.id] }) });
  assert.equal(own.code, 'forbidden');
  assert.match(own.error, /^A waiver must be recorded by someone other than the approver\./);
  assert.deepEqual(own.details, { waiverAuthorities: [P.ingrid.id] });
  assert.equal(validateWaiver({ ...base, actorId: P.priya.id, settings: people({ waiverAuthorities: [P.ingrid.id] }) }).code, 'forbidden');
  assert.equal(validateWaiver({ ...base, actorId: P.ingrid.id, settings: people({ waiverAuthorities: [P.ingrid.id] }) }).ok, true);
});

test('condition: text, owner, due date; covers only what a condition can cover', () => {
  const base = { text: 'Run CLM-22 with a hardship test claimant by 18 Dec 2026.', ownerId: P.meiling.id, dueDate: '2026-12-18', covers: ['case:CLM-22:not_run'], items: samuel.items };
  assert.deepEqual(validateCondition(base), { ok: true });
  assert.deepEqual(validateCondition({ ...base, covers: [] }), { ok: true }, 'a promise carried forward covers nothing');
  assert.equal(validateCondition({ ...base, ownerId: null }).error, 'A condition needs an owner and a due date.');
  assert.equal(validateCondition({ ...base, dueDate: null }).error, 'A condition needs an owner and a due date.');
  assert.equal(validateCondition({ ...base, dueDate: '18 Dec' }).details.field, 'dueDate');
  assert.equal(validateCondition({ ...base, text: ' ' }).details.field, 'text');
  assert.equal(validateCondition({ ...base, covers: [CONFLICT] }).details.field, 'covers');
});

test('run form (PRODUCT 8.6)', () => {
  const base = { result: 'passed', build: '2.4.0-rc2', notes: '', evidenceCount: 1, rules: RULES };
  assert.deepEqual(validateRun(base), { ok: true });
  assert.equal(validateRun({ ...base, result: null }).error, 'Choose a result.');
  assert.equal(validateRun({ ...base, result: 'skipped' }).error, 'Choose a result.');
  assert.equal(validateRun({ ...base, result: 'failed' }).error, 'Say what happened. For a fail: what you did, what you expected, what you saw.');
  assert.equal(validateRun({ ...base, result: 'blocked', notes: 'No test claimant.', evidenceCount: 0 }).ok, true);
  assert.equal(validateRun({ ...base, evidenceCount: 0 }).error, 'A pass needs at least one evidence file. Attach it to this issue, then tick it here.');
  assert.equal(validateRun({ ...base, evidenceCount: 0, rules: { ...RULES, passNeedsEvidence: false } }).ok, true);
  assert.equal(validateRun({ ...base, build: ' ' }).error, 'Enter the build you tested.');
});

test('a condition waits for its Jira issue only while it has none and is not met', () => {
  assert.equal(needsIssue({ linkedIssue: null, status: 'open' }), true);
  assert.equal(needsIssue({ status: 'open' }), true);
  assert.equal(needsIssue({ linkedIssue: 'CLM-30', status: 'open' }), false);
  // Confirmed met before an issue could be created: no issue will ever be made, so nothing is left to finish.
  assert.equal(needsIssue({ linkedIssue: null, status: 'met' }), false);
  assert.equal(needsIssue({ linkedIssue: 'CLM-30', status: 'met' }), false);
});
