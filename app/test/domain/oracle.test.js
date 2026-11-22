// DOMAIN §4.5: what the brief must show for ClaimPoint 2.4 on day zero.
import test from 'node:test';
import assert from 'node:assert/strict';

import { caseState, latestRun, requirementState, verdict } from '../../src/domain/caseState.js';
import { buildersOfIssue, computeDuties, conflictSentence } from '../../src/domain/duties.js';
import { briefFingerprint } from '../../src/domain/briefFingerprint.js';
import { conditionState, openItems } from '../../src/domain/signingRules.js';
import { staleReasons } from '../../src/domain/staleness.js';
import { daysBetween } from '../../src/lib/format.js';
import {
  CARRIED, CLM8_EDIT, HISTORY, NOW, P, REQUIREMENTS, RULES, RUNS, assemble, at, caseOf, edit, evidence, request, run, status,
} from './fixtures.js';

const states = (release) => Object.fromEntries(release.cases.map((c) => [c.key, c.state]));
const verdictOf = (release, extra = {}) =>
  verdict({
    counts: release.counts,
    totalCases: release.cases.length,
    blockingConflicts: release.duties.conflicts.filter((c) => c.blocking).length,
    overdueConditions: 0,
    request: null,
    decided: null,
    now: NOW,
    ...extra,
  });

test('oracle: 12 cases → 8 passed, 3 passed then changed, 1 not run', () => {
  const release = assemble();
  assert.equal(release.cases.length, 12);
  assert.deepEqual(release.counts, { proven: 8, stale: 3, failing: 0, unproven: 1 });
  assert.deepEqual(states(release), {
    'CLM-11': 'passed', 'CLM-12': 'passed', 'CLM-13': 'passed',
    'CLM-14': 'passed', 'CLM-15': 'passed_then_changed', 'CLM-16': 'passed_then_changed',
    'CLM-17': 'passed', 'CLM-18': 'passed_then_changed', 'CLM-19': 'passed',
    'CLM-20': 'passed', 'CLM-21': 'passed', 'CLM-22': 'not_run',
  });
  assert.deepEqual(release.requirements.map((r) => r.state), ['all_passed', 'attention', 'attention', 'attention']);
});

test('oracle: each stale pass names its reason in a sentence the approver can read', () => {
  const release = assemble();
  const [clm15] = caseOf(release, 'CLM-15').staleReasons;
  assert.equal(clm15.code, 'S1');
  assert.equal(clm15.issueKey, 'CLM-8');
  assert.equal(clm15.sentence, 'Requirement edited by Leo Marchetti on 3 Dec, after this test.');
  assert.match(clm15.before, /from the date of the change\.$/);
  assert.match(clm15.after, /from the Monday following the date of the change\.$/);
  assert.equal(caseOf(release, 'CLM-16').staleReasons[0].sentence, clm15.sentence);

  const clm18 = caseOf(release, 'CLM-18').staleReasons;
  assert.equal(clm18.length, 1);
  assert.deepEqual(
    { code: clm18[0].code, issueKey: clm18[0].issueKey, at: clm18[0].at, by: clm18[0].by.id },
    { code: 'S4', issueKey: 'CLM-24', at: '2026-12-04T11:20:00Z', by: P.meiling.id },
  );
  assert.equal(clm18[0].sentence, 'Defect CLM-24 was closed when this was tested. It was reopened on 4 Dec.');
  // CLM-14 was re-run after the edit, CLM-17 and CLM-19 were tested before CLM-24 was ever closed.
  for (const key of ['CLM-14', 'CLM-17', 'CLM-19']) assert.deepEqual(caseOf(release, key).staleReasons, []);
});

test('oracle: the usual sheet says 11 of 12, the honest figure is 8 of 12', () => {
  const release = assemble();
  const naive = release.cases.filter((c) => c.latestRun?.result === 'passed').length;
  assert.equal(naive, 11);
  assert.equal(release.counts.proven, 8);
  const v = verdictOf(release);
  assert.equal(v.status, 'not_ready');
  assert.equal(v.verdict, 'Not ready to sign: 3 passes are no longer true, 1 is not tested.');
  assert.equal(v.usualSheet, 'The usual sheet would show 11 passes. 3 are no longer true.');
});

test('oracle: Grace Whitlock is independent; Samuel Ortega fixed CLM-24 and has the one conflict', () => {
  const grace = assemble({ approver: P.grace, requester: P.priya });
  assert.deepEqual(grace.duties.conflicts, []);

  const samuel = assemble({ approver: P.samuel, requester: P.priya });
  assert.equal(samuel.duties.conflicts.length, 1);
  const [conflict] = samuel.duties.conflicts;
  assert.deepEqual(
    { id: conflict.id, code: conflict.code, person: conflict.person.id, item: conflict.item, blocking: conflict.blocking, historyUrl: conflict.historyUrl },
    { id: 'conflict:D1:sample:P8:CLM-9', code: 'D1', person: 'sample:P8', item: 'CLM-9', blocking: true, historyUrl: '/browse/CLM-24' },
  );
  assert.equal(conflict.fact, 'Assignee while In Progress, since 30 Nov');
  assert.equal(conflict.sentence, 'Samuel Ortega was the assignee of CLM-24 while it was in progress.');
  assert.equal(conflictSentence('D1', { name: 'x', key: 'CLM-24', you: true }), 'You were the assignee of CLM-24 while it was in progress.');
  // The record and a waiver print the third person; a screen shows the second person to the person it is about.
  assert.equal(conflict.youSentence, 'You were the assignee of CLM-24 while it was in progress.');
});

test('oracle: nobody tested their own work; builders and testers come from history and runs', () => {
  const { duties } = assemble();
  const who = (facts, key) => [...new Set(facts.filter((f) => f.requirementKey === key).map((f) => f.person.name))].sort();
  assert.deepEqual(who(duties.builders, 'CLM-7'), ['Tomasz Wrobel']);
  assert.deepEqual(who(duties.builders, 'CLM-8'), ['Tomasz Wrobel']);
  assert.deepEqual(who(duties.builders, 'CLM-9'), ['Aisha Bello', 'Samuel Ortega']);
  assert.deepEqual(who(duties.builders, 'CLM-10'), ['Aisha Bello']);
  assert.deepEqual(who(duties.testers, 'CLM-8'), ['Daniel Okafor']);
  assert.deepEqual(who(duties.testers, 'CLM-9'), ['Mei-Ling Chow']);
  assert.equal(duties.testers.find((t) => t.requirementKey === 'CLM-8').fact, 'Recorded 5 runs, latest 4 Dec');
  assert.equal(duties.builders.find((b) => b.requirementKey === 'CLM-7' && b.basis === 'assignee_in_progress').fact, 'Assignee while In Progress, 9 Nov–20 Nov');
  // Mei-Ling reopened CLM-24; reopening is not building.
  assert.ok(!duties.builders.some((b) => b.person.id === P.meiling.id));
});

test('oracle: release 2.3 carried 2 conditions: 1 met, 1 open and 9 days overdue', () => {
  assert.deepEqual(CARRIED.map((c) => c.state), ['met', 'overdue']);
  assert.equal(daysBetween(CARRIED[1].dueDate, NOW), 9);
  assert.equal(conditionState({ status: 'open', dueDate: '2026-12-09' }, NOW), 'open'); // due today is not late
  assert.equal(conditionState({ status: 'met', dueDate: '2026-01-01' }, NOW), 'met');
});

test('oracle: open items for Samuel — 3 stale, 1 not run, 1 conflict; CLM-24 (Medium) is open but does not block', () => {
  const release = assemble({ approver: P.samuel });
  assert.deepEqual(release.defects.filter((d) => d.open).map((d) => d.key), ['CLM-24']);
  const items = openItems({ ...release, conflicts: release.duties.conflicts });
  assert.deepEqual(items.map((i) => [i.id, i.needs]), [
    ['case:CLM-15:stale', 'condition'],
    ['case:CLM-16:stale', 'condition'],
    ['case:CLM-18:stale', 'condition'],
    ['case:CLM-22:not_run', 'condition'],
    ['conflict:D1:sample:P8:CLM-9', 'waiver'],
  ]);
  assert.equal(items[0].label, 'CLM-15 passed, then changed');
  assert.equal(items[4].label, 'Conflict: Samuel Ortega was the assignee of CLM-24 while it was in progress');
  assert.ok(items.every((i) => i.coveredBy === null));

  const strict = openItems({ ...release, conflicts: release.duties.conflicts, rules: { ...RULES, overdueConditionBlocks: true } });
  assert.deepEqual(strict[5], {
    id: 'overdue:2', kind: 'overdue_condition', item: '', needs: 'waiver', coveredBy: null,
    label: 'Overdue: Deliver CLM-6, the override audit export, by 30 Nov 2026 (Record 1)',
  });
  const lax = openItems({ ...release, conflicts: release.duties.conflicts, rules: { ...RULES, staleBlocks: false, unprovenBlocks: false } });
  assert.deepEqual(lax.map((i) => i.kind), ['conflict']);
});

// ── edge cases ──────────────────────────────────────────────────────────────────────────────────────────────

test('demo step 2: only a new run clears stale → 10 proven, 1 stale, 1 not run', () => {
  const rerun = [
    ...RUNS,
    run(15, 'CLM-15', at('2026-12-09', '08:10'), P.daniel, '2.4.0-rc2', 'passed', 'CLM-15-monday.png'),
    run(16, 'CLM-16', at('2026-12-09', '08:20'), P.daniel, '2.4.0-rc2', 'passed', 'CLM-16-monday.png'),
  ];
  assert.deepEqual(assemble({ runs: rerun }).counts, { proven: 10, stale: 1, failing: 0, unproven: 1 });

  // Nothing else clears it: closing the defect again, a comment, a later forward move.
  const history = {
    ...HISTORY,
    'CLM-24': [...HISTORY['CLM-24'], status('CLM-24', 'in_progress', 'done', at('2026-12-08', '10:00'), P.samuel)],
    'CLM-8': [...HISTORY['CLM-8'], { ...edit('CLM-8', 'comment', at('2026-12-08'), P.leo), kind: 'other' }],
  };
  assert.deepEqual(assemble({ history }).counts, { proven: 8, stale: 3, failing: 0, unproven: 1 });
});

test('a failed case that changed afterwards is still failed; the change is a note', () => {
  const release = assemble({ runs: RUNS.filter((r) => r.id !== '12') }); // CLM-15 keeps only its failed run R-08
  const clm15 = caseOf(release, 'CLM-15');
  assert.equal(clm15.state, 'failed');
  assert.deepEqual(clm15.staleReasons, []);
  assert.deepEqual(clm15.notes.map((n) => n.code), ['S1']);
  assert.deepEqual(release.counts, { proven: 8, stale: 2, failing: 1, unproven: 1 });
  assert.equal(
    verdictOf(release).verdict,
    'Not ready to sign: 2 passes are no longer true, 1 case failed, 1 is not tested.',
  );
});

test('case state: first match wins; the latest run is by time, then by id', () => {
  const [a, b] = [run(7, 'CLM-11', at('2026-12-01'), P.daniel, 'b', 'passed', 'a.png'), run(10, 'CLM-11', at('2026-12-01'), P.daniel, 'b', 'failed', 'b.png')];
  assert.equal(latestRun([]), null);
  assert.equal(latestRun([b, a]).id, '10'); // 10 after 7, not '10' < '7'
  assert.equal(latestRun([a, run(3, 'CLM-11', at('2026-12-02'), P.daniel, 'b', 'blocked', 'c.png')]).id, '3');
  const reason = [{ code: 'S1' }];
  assert.equal(caseState(null, reason), 'not_run');
  assert.equal(caseState(b, reason), 'failed');
  assert.equal(caseState({ ...b, result: 'blocked' }, reason), 'blocked');
  assert.equal(caseState(a, reason), 'passed_then_changed');
  assert.equal(caseState(a, []), 'passed');
  assert.equal(requirementState([]), 'no_case');
});

test('staleness: what counts and what does not', () => {
  const r = RUNS.find((x) => x.id === '9'); // CLM-16, 26 Nov 11:20
  const input = (extra) => ({
    run: r, requirementEvents: [], caseEvents: [], defectEvents: {}, criteriaField: null, currentBuild: null, buildSetAt: null,
    liveEvidence: null, live: { requirementText: 'now', caseText: 'now' }, now: NOW, ...extra,
  });
  const codes = (extra) => staleReasons(input(extra)).map((x) => x.code);
  const later = at('2026-12-01');

  assert.deepEqual(codes({}), []);
  // Times are whole seconds: an edit in the very second of the run cannot be shown to have come first, so it counts.
  assert.deepEqual(codes({ requirementEvents: [edit('CLM-8', 'description', r.executedAt, P.leo)] }), ['S1'], 'the same second counts');
  assert.deepEqual(codes({ requirementEvents: [edit('CLM-8', 'description', at('2026-11-01'), P.leo)] }), [], 'before T does not');
  assert.deepEqual(codes({ requirementEvents: [{ ...edit('CLM-8', 'summary', later, P.leo), byApp: true }] }), [], 'the app itself');
  assert.deepEqual(codes({ requirementEvents: [{ ...edit('CLM-8', 'summary', later, P.leo), baseline: true }] }), [], 'baseline');
  assert.deepEqual(codes({ requirementEvents: [edit('CLM-8', 'customfield_10050', later, P.leo)] }), [], 'not the criteria field');
  assert.deepEqual(codes({ requirementEvents: [edit('CLM-8', 'customfield_10050', later, P.leo)], criteriaField: 'customfield_10050' }), ['S1']);
  assert.deepEqual(codes({ requirementEvents: [status('CLM-8', 'in_progress', 'done', later, P.tomasz)] }), [], 'forward move');
  assert.deepEqual(codes({ caseEvents: [edit('CLM-16', 'description', later, P.priya)] }), ['S2']);
  assert.deepEqual(codes({ requirementEvents: [status('CLM-8', 'done', 'todo', later, P.leo)] }), ['S3']);
  // S4 needs the defect closed at T: one raised or still open at T that is reopened later is not this case's problem.
  assert.deepEqual(codes({ defectEvents: { 'CLM-24': HISTORY['CLM-24'] } }), []);

  // one reason per (code, issue): the earliest edit; sorted by code
  const two = staleReasons(input({
    caseEvents: [edit('CLM-16', 'summary', later, P.priya)],
    requirementEvents: [edit('CLM-8', 'summary', at('2026-12-05'), P.priya), CLM8_EDIT],
  }));
  assert.deepEqual(two.map((x) => [x.code, x.at]), [['S1', CLM8_EDIT.at], ['S2', later]]);
  assert.equal(two[1].sentence, 'The test steps were edited by Priya Raman on 1 Dec, after this test.');
});

test('S5 applies only when a build is set on the release (SPEC decision 11)', () => {
  assert.deepEqual(assemble({ build: null }).counts, { proven: 8, stale: 3, failing: 0, unproven: 1 });
  const rc3 = assemble({ build: '2.4.0-rc3' });
  assert.deepEqual(rc3.counts, { proven: 0, stale: 11, failing: 0, unproven: 1 });
  const s5 = caseOf(rc3, 'CLM-11').staleReasons[0];
  assert.equal(s5.sentence, 'Tested on 2.4.0-rc1. The release is now 2.4.0-rc3.');
  assert.deepEqual([s5.before, s5.after, s5.at], ['2.4.0-rc1', '2.4.0-rc3', null]);
});

test('S6: an evidence file that is gone or changed; a hash that was never captured is compared by id only', () => {
  const r = RUNS[0];
  const file = r.evidence[0];
  const reasons = (liveEvidence, theRun = r) => staleReasons({
    run: theRun, requirementEvents: [], caseEvents: [], defectEvents: {}, criteriaField: null, currentBuild: null, buildSetAt: null,
    liveEvidence, live: { requirementText: '', caseText: '' }, now: NOW,
  });
  assert.deepEqual(reasons(null), []);
  assert.deepEqual(reasons([file]), []);
  assert.equal(reasons([])[0].sentence, 'Evidence file CLM-11-upload-pdf.png is missing.');
  assert.equal(reasons([{ ...file, sha256: evidence('CLM-11', 'other.png', 1).sha256 }])[0].code, 'S6');
  assert.deepEqual(reasons([{ ...file, sha256: null }]), []);
  assert.deepEqual(reasons([{ ...file, sha256: 'f'.repeat(64) }], { ...r, evidence: [{ ...file, sha256: null }] }), []);
});

test('duties: D2, D3, D4 and rules switched off', () => {
  const requirements = REQUIREMENTS.map((r) => ({ key: r.key, caseKeys: r.cases.map((c) => c.key), defectKeys: r.defectKeys }));
  const duties = (extra) => computeDuties({ requirements, history: HISTORY, runs: RUNS, approver: null, requester: null, rules: RULES, now: NOW, ...extra });

  // One conflict per person and duty: Daniel tested cases of CLM-7 and of CLM-8, and that is one conflict, one waiver.
  const d2 = duties({ approver: P.daniel }).conflicts;
  assert.deepEqual(d2.map((c) => c.id), ['conflict:D2:sample:P5:CLM-7']);
  assert.deepEqual([d2[0].items, d2[0].issues], [['CLM-7', 'CLM-8'], ['CLM-13', 'CLM-14']]);
  assert.equal(d2[0].sentence, 'Daniel Okafor tested part of this release: recorded runs for 2 requirements (CLM-7 and CLM-8). They cannot also approve this release.');
  assert.equal(d2[0].youSentence, 'You tested part of this release: recorded runs for 2 requirements (CLM-7 and CLM-8). You cannot also approve this release.');
  assert.equal(d2[0].fact, 'Recorded runs for: CLM-7, CLM-8');
  // One requirement only: the sentence it always was.
  const one = duties({ approver: P.daniel, runs: RUNS.filter((r) => r.requirementKey === 'CLM-7') }).conflicts;
  assert.equal(one[0].sentence, 'Daniel Okafor recorded a run on CLM-13. They cannot also approve this release.');
  assert.equal(one[0].youSentence, 'You recorded a run on CLM-13. You cannot also approve this release.');


  const selfTest = [...RUNS, run(20, 'CLM-11', at('2026-12-05'), P.tomasz, '2.4.0-rc2', 'passed', 'x.png')];
  const [d3] = duties({ runs: selfTest }).conflicts;
  assert.equal(d3.id, 'conflict:D3:sample:P3:CLM-7');
  assert.equal(d3.sentence, 'Tomasz Wrobel built and tested CLM-7.');
  assert.equal(d3.youSentence, null);
  assert.equal(d3.fact, 'Assignee while In Progress, 9 Nov–20 Nov · recorded a run on CLM-11, 5 Dec.');
  assert.equal(duties({ runs: selfTest, rules: { ...RULES, noSelfTest: false } }).conflicts[0].blocking, false);

  const [d4] = duties({ approver: P.grace, requester: P.grace }).conflicts;
  assert.deepEqual([d4.code, d4.item, d4.blocking], ['D4', '', false]);
  assert.equal(d4.sentence, 'Grace Whitlock asked for this sign-off and is also the approver.');
  assert.equal(d4.youSentence, 'You asked for this sign-off and are also the approver.');

  assert.equal(duties({ approver: P.samuel, rules: { ...RULES, approverMustNotBuild: false } }).conflicts[0].blocking, false);
});

test('builders: assignee crossed with status; the app is never a builder', () => {
  const facts = buildersOfIssue('CLM-24', HISTORY['CLM-24'], NOW);
  assert.deepEqual(facts.map((f) => [f.person.id, f.basis, f.from, f.to]), [
    ['sample:P8', 'assignee_in_progress', '2026-11-30T08:35:00Z', null],
    ['sample:P8', 'moved_to_done', '2026-12-01T15:00:00Z', '2026-12-01T15:00:00Z'],
  ]);
  // Assigned while the issue was still To Do, then handed over before work began: not a builder.
  const handover = [
    ...HISTORY['CLM-24'].slice(0, 3),
    { ...HISTORY['CLM-24'][2], from: P.samuel.id, to: P.aisha.id, fromPerson: P.samuel, toPerson: P.aisha, at: at('2026-11-30', '08:32') },
    ...HISTORY['CLM-24'].slice(3, 4),
    { ...status('CLM-24', 'in_progress', 'done', at('2026-12-01', '15:00'), P.aisha), byApp: true },
  ];
  assert.deepEqual(buildersOfIssue('CLM-24', handover, NOW).map((f) => [f.person.id, f.basis]), [['sample:P4', 'assignee_in_progress']]);
  assert.deepEqual(buildersOfIssue('CLM-99', [], NOW), []);
});

test('verdict sentences (PRODUCT 8.4) and precedence', () => {
  const clean = { counts: { proven: 12, stale: 0, failing: 0, unproven: 0 }, totalCases: 12, blockingConflicts: 0, overdueConditions: 0, request: null, decided: null, now: NOW };
  assert.deepEqual(verdict(clean), { status: 'ready', verdict: 'Ready to sign. All 12 cases passed and nothing has changed since.', usualSheet: null });
  assert.equal(verdict({ ...clean, blockingConflicts: 1 }).verdict, 'Not ready to sign: 1 conflict is open.');
  assert.equal(verdict({ ...clean, overdueConditions: 1 }).status, 'not_ready');
  assert.equal(
    verdict({ ...clean, request: request(P.grace) }).verdict,
    'Awaiting a decision from Grace Whitlock, due 18 Dec.',
  );
  assert.equal(verdict({ ...clean, request: request(P.grace, { state: 'withdrawn' }) }).status, 'ready');
  const decided = { outcome: 'accepted_with_conditions', decidedByName: 'Grace Whitlock', decidedAt: at('2026-09-18', '16:10'), number: 1, conditionCount: 2, openConditionCount: 1 };
  assert.deepEqual(
    [verdict({ ...clean, request: request(P.grace), decided }).status, verdict({ ...clean, decided }).verdict],
    ['accepted_with_conditions', 'Accepted with 2 conditions by Grace Whitlock on 18 Sep. 1 still open.'],
  );
  assert.equal(verdict({ ...clean, decided: { ...decided, outcome: 'rejected' } }).verdict, 'Rejected by Grace Whitlock on 18 Sep. Record 1.');
  assert.equal(verdict({ ...clean, decided: { ...decided, outcome: 'accepted' } }).verdict, 'Accepted by Grace Whitlock on 18 Sep. Record 1.');
});

test('brief fingerprint: same facts → same value whenever assembled; any changed fact → a different value', () => {
  const facts = (release, approver = P.samuel) => ({
    release: { id: '10002', build: null }, requestId: '2', approverId: approver.id, counts: release.counts,
    requirements: release.requirements, defects: release.defects, conflicts: release.duties.conflicts, carried: release.carried,
  });
  const read = briefFingerprint(facts(assemble({ approver: P.samuel })));
  assert.match(read, /^[0-9a-f]{64}$/);
  assert.equal(briefFingerprint(facts(assemble({ approver: P.samuel, now: '2026-12-09T17:30:00Z' }))), read);

  const reopened = { ...HISTORY, 'CLM-7': [...HISTORY['CLM-7'], status('CLM-7', 'done', 'in_progress', at('2026-12-09', '08:59'), P.leo)] };
  assert.notEqual(briefFingerprint(facts(assemble({ approver: P.samuel, history: reopened }))), read);
  assert.notEqual(briefFingerprint(facts(assemble({ approver: P.grace }), P.grace)), read);
  assert.notEqual(briefFingerprint({ ...facts(assemble({ approver: P.samuel })), carried: [{ ...CARRIED[1], state: 'met' }, CARRIED[0]] }), read);

  // Drafts and rules decide what the record says: a draft added, changed or removed by anyone, or a rule switched,
  // while the approver reads must refuse the signature (B2).
  const base = facts(assemble({ approver: P.samuel }));
  const condition = { id: '11', text: 'Re-run CLM-18.', owner: P.meiling, dueDate: '2026-12-18', covers: ['case:CLM-18:stale'], linkedIssue: null };
  const waiver = { id: '5', covers: 'conflict:D1:sample:P8:CLM-9', reason: 'No other approver is available before go-live.', authorisedBy: P.ingrid, authorisedByName: null, reference: 'QC-1', recordedBy: P.ingrid };
  const withDrafts = { ...base, drafts: { conditions: [condition], waivers: [waiver] }, rules: RULES };
  const sealedRead = briefFingerprint(withDrafts);
  assert.equal(briefFingerprint({ ...base, drafts: { conditions: [], waivers: [] }, rules: {} }), read, 'no drafts and no rules is the bare value');
  assert.notEqual(sealedRead, read);
  assert.equal(briefFingerprint({ ...withDrafts, drafts: { conditions: [{ ...condition, owner: P.meiling.id }], waivers: [waiver] } }), sealedRead, 'a person or their id');
  const differs = (change, why) => assert.notEqual(briefFingerprint({ ...withDrafts, ...change }), sealedRead, why);
  differs({ drafts: { conditions: [], waivers: [waiver] } }, 'condition removed');
  differs({ drafts: { conditions: [condition], waivers: [] } }, 'waiver removed');
  differs({ drafts: { conditions: [{ ...condition, text: 'Re-run CLM-18 later.' }], waivers: [waiver] } }, 'condition text');
  differs({ drafts: { conditions: [{ ...condition, dueDate: '2027-01-18' }], waivers: [waiver] } }, 'condition due date');
  differs({ drafts: { conditions: [{ ...condition, owner: P.priya }], waivers: [waiver] } }, 'condition owner');
  differs({ drafts: { conditions: [{ ...condition, covers: [] }], waivers: [waiver] } }, 'condition coverage');
  differs({ drafts: { conditions: [condition], waivers: [{ ...waiver, reason: 'Another reason of twenty characters.' }] } }, 'waiver reason');
  differs({ drafts: { conditions: [condition], waivers: [{ ...waiver, authorisedBy: null, authorisedByName: 'A name' }] } }, 'waiver authoriser');
  differs({ drafts: { conditions: [condition], waivers: [{ ...waiver, recordedBy: P.samuel }] } }, 'waiver recorder');
  for (const rule of Object.keys(RULES)) {
    const flipped = typeof RULES[rule] === 'boolean' ? !RULES[rule] : `${RULES[rule]}x`;
    differs({ rules: { ...RULES, [rule]: flipped } }, `rule ${rule}`);
  }
});
