// One conflict per person and duty, the decision table by requirement, accounts that are not people, and a condition
// met late. Fixtures are DOMAIN §4 (fictional) and a made-up release of 49 requirements held by one person.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { carriedHeadline, metLateDays, metLateText, shownCondition } from '../../src/domain/carried.js';
import { computeDuties, conflictStem, keyList } from '../../src/domain/duties.js';
import { briefFingerprint } from '../../src/domain/briefFingerprint.js';
import { buildPayload } from '../../src/domain/seal.js';
import { applyCoverage, availability, fitWaivers, groupOpenItems, notAPerson, openItems, validateWaiver } from '../../src/domain/signingRules.js';
import { DEFAULT_SETTINGS } from '../../src/contract.js';
import { HISTORY, NOW, P, REQUIREMENTS, RULES, RUNS, assemble, at, run } from './fixtures.js';

// ── a big release: one person is the assignee of everything, tested everything, and is asked to approve ─────────

const me = { id: '712020:5b1c-aa', name: 'Sangnan Wu', kind: 'jira' };
const N = 49;
const reqKey = (i) => `BIG-${i + 1}`;
const caseKey = (i) => `BIG-${i + 101}`;
const event = (issueKey, kind, from, to, when, extra = {}) => ({ issueKey, kind, field: kind, from, to, at: when, actor: me, source: 'jira', ...extra });
const bigHistory = Object.fromEntries(
  Array.from({ length: N }, (_, i) => [
    reqKey(i),
    [
      event(reqKey(i), 'status', null, 'todo', at('2026-11-02'), { baseline: true }),
      event(reqKey(i), 'assignee', null, me.id, at('2026-11-02'), { baseline: true, toPerson: me }),
      event(reqKey(i), 'status', 'todo', 'in_progress', at('2026-11-09')),
    ],
  ]),
);
const bigRequirements = Array.from({ length: N }, (_, i) => ({ key: reqKey(i), caseKeys: [caseKey(i)], defectKeys: [] }));
const bigRuns = Array.from({ length: N }, (_, i) => ({ id: String(i + 1), caseKey: caseKey(i), executedBy: me, executedAt: at('2026-12-01') }));
const big = (extra = {}) =>
  computeDuties({ requirements: bigRequirements, history: bigHistory, runs: bigRuns, approver: me, requester: me, rules: RULES, now: NOW, ...extra });

test('49 requirements built and tested by the approver: one conflict per duty, not one per requirement', () => {
  const { conflicts, builders, testers } = big();
  assert.equal(builders.length, N);
  assert.equal(testers.length, N);
  assert.deepEqual(conflicts.map((c) => c.code), ['D1', 'D2', 'D3', 'D4']);
  const [d1, d2, d3] = conflicts;

  assert.equal(d1.sentence, 'Sangnan Wu built part of this release: assignee of 49 work items while they were in progress (BIG-1, BIG-2, BIG-3 and 46 more).');
  assert.equal(d1.youSentence, 'You built part of this release: assignee of 49 work items while they were in progress (BIG-1, BIG-2, BIG-3 and 46 more).');
  assert.equal(d1.items.length, N);
  assert.equal(d1.issues.length, N);
  assert.ok(d1.fact.startsWith('Assignee while In Progress: BIG-1, BIG-2, ') && d1.fact.endsWith(', BIG-49'), 'the fact lists every work item');
  assert.equal(d1.historyUrl, '/browse/BIG-1');

  assert.equal(d2.sentence, 'Sangnan Wu tested part of this release: recorded runs for 49 requirements (BIG-1, BIG-2, BIG-3 and 46 more). They cannot also approve this release.');
  assert.equal(d2.youSentence, 'You tested part of this release: recorded runs for 49 requirements (BIG-1, BIG-2, BIG-3 and 46 more). You cannot also approve this release.');
  assert.equal(d3.sentence, 'Sangnan Wu built and tested 49 requirements (BIG-1, BIG-2, BIG-3 and 46 more).');
  assert.equal(d3.fact.split(', ').length, N);

  // The id keeps the shape it always had: conflict:<code>:<person id>:<first requirement>.
  assert.deepEqual(conflicts.map((c) => c.id), [
    'conflict:D1:712020:5b1c-aa:BIG-1', 'conflict:D2:712020:5b1c-aa:BIG-1', 'conflict:D3:712020:5b1c-aa:BIG-1', 'conflict:D4:712020:5b1c-aa:',
  ]);

  // Three waivers, not 147, make "Accept with conditions" possible.
  const items = openItems({ requirements: [], defects: [], conflicts, carried: [], rules: RULES });
  assert.equal(items.length, 3);
  assert.deepEqual(availability(items).accepted.reasons, ['3 conflicts']);
  const covered = applyCoverage(items, [], items.map((i, n) => ({ id: `w${n}`, covers: i.id })));
  assert.equal(availability(covered).accepted_with_conditions.allowed, true);

  // The sealed record keeps its shape: one line per conflict, the first requirement as `item`.
  assert.deepEqual(Object.keys(buildPayloadConflict(conflicts[0])), ['code', 'person', 'item', 'fact']);
  assert.equal(buildPayloadConflict(conflicts[0]).item, 'BIG-1');
});

const buildPayloadConflict = (conflict) =>
  buildPayload({
    site: 's', project: { id: '1', key: 'BIG' }, release: { id: '1', name: '1.0', build: null }, recordNumber: 1,
    request: { id: '1', requestedBy: me, requestedAt: NOW, approver: me, dueDate: '2026-12-20' },
    decision: { outcome: 'rejected', statement: 'x', decidedBy: me, decidedAt: NOW },
    counts: { proven: 0, stale: 0, failing: 0, unproven: 0 }, requirements: [], defects: [],
    duties: { builders: [], testers: [], conflicts: [conflict] }, conditions: [], waivers: [], carried: [], rules: RULES, prevSeal: '0'.repeat(64),
  }).duties.conflicts[0];

test('a mix of work: held some items, closed others; four keys are listed whole, more are counted', () => {
  assert.equal(keyList(['A-1']), 'A-1');
  assert.equal(keyList(['A-1', 'A-2']), 'A-1 and A-2');
  assert.equal(keyList(['A-1', 'A-2', 'A-3', 'A-4']), 'A-1, A-2, A-3 and A-4');
  assert.equal(keyList(['A-1', 'A-2', 'A-3', 'A-4', 'A-5']), 'A-1, A-2, A-3 and 2 more');

  // Tomasz Wrobel held CLM-7, CLM-8 and CLM-23 in the sample history. Leo closes CLM-10 as well.
  const [tomasz] = assemble({ approver: P.tomasz }).duties.conflicts;
  assert.equal(tomasz.sentence, 'Tomasz Wrobel built part of this release: assignee of 3 work items while they were in progress (CLM-7, CLM-8 and CLM-23).');
  assert.deepEqual([tomasz.id, tomasz.item, tomasz.items], ['conflict:D1:sample:P3:CLM-7', 'CLM-7', ['CLM-7', 'CLM-8']]);
  assert.equal(tomasz.fact, 'Assignee while In Progress: CLM-7, CLM-8, CLM-23');

  const closer = { issueKey: 'CLM-9', kind: 'status', field: 'status', from: 'in_progress', to: 'done', at: at('2026-12-06'), actor: P.tomasz, source: 'sample' };
  const reopened = { ...closer, from: 'done', to: 'in_progress', at: at('2026-12-05'), actor: P.leo };
  const [mixed] = assemble({ approver: P.tomasz, history: { ...HISTORY, 'CLM-9': [...HISTORY['CLM-9'], reopened, closer] } }).duties.conflicts;
  assert.equal(
    mixed.sentence,
    'Tomasz Wrobel built part of this release: assignee of 3 work items while they were in progress (CLM-7, CLM-8 and CLM-23) and moved CLM-9 to Done.',
  );
  assert.equal(mixed.fact, 'Assignee while In Progress: CLM-7, CLM-8, CLM-23 · Moved to Done: CLM-9');
});

test('the sample is unchanged: one conflict for the person who holds CLM-24, the same id, sentence and fact', () => {
  const { conflicts } = assemble({ approver: P.samuel, requester: P.priya }).duties;
  assert.equal(conflicts.length, 1);
  const [c] = conflicts;
  assert.deepEqual(
    [c.id, c.item, c.items, c.issues, c.sentence, c.youSentence, c.fact, c.historyUrl],
    [
      'conflict:D1:sample:P8:CLM-9', 'CLM-9', ['CLM-9'], ['CLM-24'],
      'Samuel Ortega was the assignee of CLM-24 while it was in progress.',
      'You were the assignee of CLM-24 while it was in progress.',
      'Assignee while In Progress, since 30 Nov', '/browse/CLM-24',
    ],
  );
  const release = assemble({ approver: P.samuel });
  assert.deepEqual(Object.values(release.counts), [8, 3, 0, 1]);
});

test('self-testing is one conflict per person, whoever approves', () => {
  const selfTest = [...RUNS, run(20, 'CLM-11', at('2026-12-05'), P.tomasz, '2.4.0-rc2', 'passed', 'x.png'), run(21, 'CLM-14', at('2026-12-05'), P.tomasz, '2.4.0-rc2', 'passed', 'y.png')];
  const { conflicts } = assemble({ runs: selfTest }).duties;
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].sentence, 'Tomasz Wrobel built and tested 2 requirements (CLM-7 and CLM-8).');
  assert.equal(conflicts[0].fact, 'Built and tested: CLM-7, CLM-8');
  assert.equal(conflicts[0].id, 'conflict:D3:sample:P3:CLM-7');
});

test('waivers written when there was one conflict per requirement are still read, and follow the conflict', () => {
  assert.equal(conflictStem('conflict:D2:712020:5b1c-aa:BIG-7'), 'conflict:D2:712020:5b1c-aa');
  assert.equal(conflictStem('conflict:D4:712020:5b1c-aa:'), 'conflict:D4:712020:5b1c-aa');
  assert.equal(conflictStem('case:CLM-15:stale'), null);
  assert.equal(conflictStem('overdue:2'), null);

  const items = openItems({ requirements: [], defects: [], conflicts: big().conflicts, carried: [], rules: RULES });
  const old = [
    { id: '1', covers: 'conflict:D2:712020:5b1c-aa:BIG-7', coversLabel: 'Conflict: Sangnan Wu recorded a run on BIG-107. They cannot also approve this release' },
    { id: '2', covers: 'conflict:D1:someone-else:BIG-7', coversLabel: 'Conflict: other' },
    { id: '3', covers: 'overdue:2', coversLabel: 'Overdue: x' },
  ];
  const fitted = fitWaivers(old, items);
  assert.equal(fitted[0].covers, 'conflict:D2:712020:5b1c-aa:BIG-1');
  assert.equal(fitted[0].coversLabel, items[1].label, 'the waiver says what the conflict is now');
  assert.deepEqual(fitted.slice(1), old.slice(1), 'a waiver for another person, or for another kind of item, is left alone');
  const covered = applyCoverage(items, [], fitted);
  assert.deepEqual(covered.map((i) => i.coveredBy), [null, { by: 'waiver', id: '1' }, null]);

  // A waiver whose id is the conflict's own is not touched (the sample's proposed waiver).
  const sample = openItems({ ...assemble({ approver: P.samuel }), conflicts: assemble({ approver: P.samuel }).duties.conflicts });
  const own = [{ id: '5', covers: 'conflict:D1:sample:P8:CLM-9', coversLabel: 'as written' }];
  assert.equal(fitWaivers(own, sample)[0], own[0]);
  assert.equal(
    validateWaiver({
      covers: 'conflict:D1:sample:P8:CLM-9', reason: 'No other technical approver is available.', authorisedById: P.ingrid.id, authorisedByName: null,
      actorId: P.ingrid.id, approverId: P.samuel.id, items: sample, settings: DEFAULT_SETTINGS,
    }).ok,
    true,
  );
});

test('the fingerprint notices work added to a conflict although its id stays', () => {
  const release = assemble({ approver: P.samuel });
  const facts = (conflicts) => ({
    release: { id: '10002', build: null }, requestId: '2', approverId: P.samuel.id, counts: release.counts,
    requirements: release.requirements, defects: release.defects, conflicts, carried: release.carried,
  });
  const [c] = release.duties.conflicts;
  assert.notEqual(briefFingerprint(facts([c])), briefFingerprint(facts([{ ...c, issues: [...c.issues, 'CLM-23'] }])));
  assert.equal(briefFingerprint(facts([c])), briefFingerprint(facts([{ ...c }])));
});

test('the decision table: open cases of one requirement with the same answer are one row; the sample reads shorter, never longer', () => {
  const release = assemble({ approver: P.samuel });
  const items = openItems({ ...release, conflicts: release.duties.conflicts });
  assert.equal(items.length, 5);
  const rows = groupOpenItems(applyCoverage(items, [], []), release.requirements);
  assert.deepEqual(rows.map((r) => [r.label, r.detail, r.items.length, r.needs]), [
    ['CLM-8: 2 cases passed, then changed', null, 2, 'condition'],
    ['CLM-18 passed, then changed', null, 1, 'condition'],
    ['CLM-22 not run', null, 1, 'condition'],
    ['Conflict: Samuel Ortega was the assignee of CLM-24 while it was in progress', null, 1, 'waiver'],
  ]);
  assert.deepEqual(rows[0].items.map((i) => i.id), ['case:CLM-15:stale', 'case:CLM-16:stale']);

  // Cases of one requirement answered by different conditions stay apart; mixed states are counted by state.
  const split = groupOpenItems(applyCoverage(items, [{ id: 'c1', covers: ['case:CLM-15:stale'] }], []), release.requirements);
  assert.deepEqual(split.slice(0, 2).map((r) => [r.label, r.coveredBy]), [
    ['CLM-15 passed, then changed', { by: 'condition', id: 'c1' }],
    ['CLM-16 passed, then changed', null],
  ]);
  const mixed = groupOpenItems(
    [
      { id: 'case:X-2:stale', kind: 'stale', item: 'X-2', label: 'X-2 passed, then changed', needs: 'condition', coveredBy: null },
      { id: 'case:X-3:not_run', kind: 'not_run', item: 'X-3', label: 'X-3 not run', needs: 'condition', coveredBy: null },
      { id: 'case:X-4:not_run', kind: 'not_run', item: 'X-4', label: 'X-4 not run', needs: 'condition', coveredBy: null },
      { id: 'defect:X-9', kind: 'defect', item: 'X-9', label: 'Defect X-9 (High)', needs: 'condition', coveredBy: null },
    ],
    [{ key: 'X-1', cases: [{ key: 'X-2' }, { key: 'X-3' }, { key: 'X-4' }] }],
  );
  assert.deepEqual(mixed.map((r) => [r.label, r.detail]), [['X-1: 3 cases', '1 passed, then changed · 2 not run'], ['Defect X-9 (High)', null]]);
});

test('an app account is not a person', () => {
  assert.equal(notAPerson({ name: 'Slack', accountType: 'app', active: true }), 'Slack is an app, not a person. Choose a person.');
  assert.equal(notAPerson({ name: 'Former colleague', accountType: 'atlassian', active: false }), 'Former colleague is no longer active on this site. Choose a person.');
  assert.equal(notAPerson({ name: 'A Customer', accountType: 'customer', active: true }), 'A Customer is a customer account, not a member of this site. Choose a person.');
  assert.equal(notAPerson({ name: 'Sangnan Wu', accountType: 'atlassian', active: true }), null);
  assert.equal(notAPerson({ name: 'Sangnan Wu', accountType: null, active: true }), null);
});

test('a condition met after its due date says so wherever it is shown as met', () => {
  const base = { id: '2', text: 'Deliver CLM-6.', dueDate: '2026-11-30', linkedIssue: 'CLM-6', linkedIssueStatus: 'In Progress', linkedIssueDone: false };
  const met = { ...base, status: 'met', state: 'met', metAt: at('2026-12-09', '10:00'), line: 'Deliver CLM-6. — confirmed 9 Dec' };
  assert.equal(metLateDays(met), 9);
  assert.equal(metLateText(met), 'met 9 days late');
  assert.equal(metLateDays({ ...met, metAt: at('2026-11-30', '23:00') }), 0, 'met on the due date is in time');
  assert.equal(metLateText({ ...met, metAt: at('2026-11-28') }), null);
  assert.equal(metLateDays({ ...met, metAt: null }), 0, 'no date of confirmation: nothing is claimed');
  assert.equal(metLateDays({ ...base, status: 'open', state: 'overdue', metAt: null }), 0);
  assert.equal(metLateText({ ...met, metAt: at('2026-12-01') }), 'met 1 day late');

  const shown = shownCondition(met, NOW);
  assert.equal(shown.line, 'Deliver CLM-6. — confirmed 9 Dec, met 9 days late (was due 30 Nov)');
  assert.equal(shown.linkedIssueStatus, 'is still In Progress in Jira', 'read after the issue key: "CLM-6 is still In Progress in Jira"');
  assert.equal(shown.metLateDays, 9);
  // Met in time with its issue done: nothing more to say, and no status beside "Met".
  const clean = shownCondition({ ...met, metAt: at('2026-11-20'), linkedIssueStatus: 'Done', linkedIssueDone: true }, NOW);
  assert.deepEqual([clean.line, clean.linkedIssueStatus, clean.metLateDays], ['Deliver CLM-6. — confirmed 9 Dec', null, 0]);
  // A condition that is not met is shown as it was.
  const open = { ...base, status: 'open', state: 'overdue', metAt: null, line: 'x' };
  assert.deepEqual(shownCondition(open, NOW), { ...open, metLateDays: 0 });

  const group = (conditions) => [{ record: { id: '1', number: 1, releaseName: '2.3', decidedBy: P.grace }, sentence: '', conditions }];
  assert.equal(carriedHeadline(group([met]), NOW).line, 'Last time (Release 2.3, Record 1): 1 condition, met 9 days late: "Deliver CLM-6."');
  assert.equal(
    carriedHeadline(group([met, { ...met, id: '1', metAt: at('2026-11-01') }]), NOW).line,
    'Last time (Release 2.3, Record 1): 2 conditions. 2 met (1 late).',
  );
  assert.equal(REQUIREMENTS.length, 4);
});
