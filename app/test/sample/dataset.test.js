// Slice C: the sample dataset is DOMAIN §4 as data, and what it declares as the oracle agrees with itself.
// No rule is computed here: slice A's tests run the domain functions against DATASET and compare with
// DATASET.oracle, EXPECTED_CASES and EXPECTED (all exported from src/sample/dataset.js).
import test from 'node:test';
import assert from 'node:assert/strict';

import { CASE_STATE, RUN_RESULT, SAMPLE_PERSON_PREFIX, SAMPLE_PROJECT_KEY, STALE_CODE, STATUS_CATEGORY } from '../../src/contract.js';
import {
  DATASET,
  EXPECTED,
  EXPECTED_25,
  EXPECTED_CASES,
  conditionText,
  evidenceLog,
  issueKey,
  ledgerEvents,
  rekey,
  rekeyDeep,
  sampleDrafts,
  samplePeople,
  shiftDate,
  shiftTime,
} from '../../src/sample/dataset.js';

const byRef = Object.fromEntries(DATASET.issues.map((i) => [i.ref, i]));
const personIds = new Set(DATASET.people.map((p) => p.id));
const stamp = (row) => shiftTime(DATASET.d0, row.day, row.time);
const of = (role, version) => DATASET.issues.filter((i) => i.role === role && (version === undefined || i.version === version));
const runsOf = (ref) => DATASET.runs.filter((r) => r.caseRef === ref).sort((a, b) => (stamp(a) < stamp(b) ? -1 : 1));

test('setting: ESSA ClaimPoint, CLM, releases 2.3, 2.4 and 2.5, day zero 9 Dec 2026', () => {
  assert.equal(DATASET.d0, '2026-12-09');
  assert.deepEqual(DATASET.project, { key: SAMPLE_PROJECT_KEY, name: 'ClaimPoint' });
  assert.deepEqual(DATASET.space, { key: 'CLMACC', name: 'ClaimPoint Acceptance' });
  assert.deepEqual(DATASET.versions.map((v) => [v.name, v.released, shiftDate(DATASET.d0, v.releaseDay)]), [
    ['2.3', true, '2026-09-21'],
    ['2.4', false, '2026-12-14'],
    ['2.5', false, '2027-01-25'],
  ]);
});

test('people: the ten of DOMAIN §4.2, ids sample:P1 … sample:P10', () => {
  assert.deepEqual(DATASET.people.map((p) => p.id), Array.from({ length: 10 }, (_, i) => `${SAMPLE_PERSON_PREFIX}P${i + 1}`));
  assert.deepEqual(DATASET.people.map((p) => p.name), [
    'Priya Raman', 'Leo Marchetti', 'Tomasz Wrobel', 'Aisha Bello', 'Daniel Okafor',
    'Mei-Ling Chow', 'Grace Whitlock', 'Samuel Ortega', 'Ingrid Solberg', 'Hannah Reyes',
  ]);
  for (const p of DATASET.people) assert.ok(p.title.length > 0, p.id);
  assert.equal(samplePeople()['sample:P7'].kind, 'sample');
});

test('issues: CLM-1 … CLM-24 in creation order, with the roles and types of DOMAIN §4.3; 2.5 comes after them', () => {
  assert.deepEqual(DATASET.issues.map((i) => i.ref), Array.from({ length: 29 }, (_, i) => i + 1));
  // Every issue of 2.3 and 2.4, and the follow-up, keeps its key: the 2.5 issues are CLM-25 … CLM-29.
  assert.deepEqual(DATASET.issues.filter((i) => i.version !== '2.5').map((i) => i.ref), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.deepEqual(DATASET.issues.filter((i) => i.version === '2.5').map((i) => [i.ref, i.role]), [
    [25, 'requirement'], [26, 'requirement'], [27, 'case'], [28, 'case'], [29, 'case'],
  ]);
  assert.equal(of('requirement', '2.3').length, 2);
  assert.equal(of('case', '2.3').length, 2);
  assert.equal(of('defect', '2.3').length, 1);
  assert.equal(of('requirement', '2.4').length, EXPECTED.totals.requirements);
  assert.equal(of('case', '2.4').length, EXPECTED.totals.cases);
  assert.deepEqual(of('defect', '2.4').map((d) => [d.ref, d.priority]), [[23, 'High'], [24, 'Medium']]);
  assert.deepEqual(of('followup').map((i) => [i.ref, i.version, i.status]), [[6, null, 'in_progress']]);
  const type = { requirement: 'Story', case: 'Task', defect: 'Bug', followup: 'Task' };
  for (const i of DATASET.issues) {
    assert.equal(i.type, type[i.role], `CLM-${i.ref}`);
    assert.ok(i.summary.length > 0);
    assert.equal(typeof i.description, 'string');
    assert.ok(Object.values(STATUS_CATEGORY).includes(i.status));
    assert.ok(i.version === null || DATASET.versions.some((v) => v.name === i.version));
  }
  // The only issues not Done: the follow-up, the case that was not run, the reopened defect; and in 2.5 the
  // requirement still being built and the two cases not run yet.
  assert.deepEqual(DATASET.issues.filter((i) => i.status !== 'done').map((i) => [i.ref, i.status]), [
    [6, 'in_progress'], [22, 'todo'], [24, 'in_progress'], [26, 'in_progress'], [28, 'todo'], [29, 'todo'],
  ]);
});

test('issues: every link target exists; a case tests one requirement of its own release', () => {
  for (const i of DATASET.issues) {
    for (const link of i.links) {
      assert.ok(byRef[link.to], `CLM-${i.ref} links to CLM-${link.to}`);
      assert.notEqual(link.to, i.ref);
      assert.ok(['tests', 'found by', 'relates to'].includes(link.type));
    }
    if (i.role === 'case') {
      assert.equal(byRef[i.tests].role, 'requirement', `CLM-${i.ref}`);
      assert.equal(byRef[i.tests].version, i.version);
      assert.deepEqual(i.links, [{ type: 'tests', to: i.tests }]);
    } else {
      assert.equal(i.tests, null);
    }
    if (i.role === 'defect') {
      const foundBy = byRef[i.links.find((l) => l.type === 'found by').to];
      const relates = byRef[i.links.find((l) => l.type === 'relates to').to];
      assert.equal(foundBy.role, 'case');
      assert.equal(relates.role, 'requirement');
      assert.equal(foundBy.tests, relates.ref, `CLM-${i.ref} was found by a case of the requirement it relates to`);
    }
  }
  const tests = (req) => of('case').filter((c) => c.tests === req).map((c) => c.ref);
  assert.deepEqual(tests(7), [11, 12, 13]);
  assert.deepEqual(tests(8), [14, 15, 16]);
  assert.deepEqual(tests(9), [17, 18, 19]);
  assert.deepEqual(tests(10), [20, 21, 22]);
});

test('runs: R-01 … R-14, three 2.3 runs and one 2.5 run; each references a case and a sample person', () => {
  const ids = DATASET.runs.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.filter((id) => /^R-\d\d$/.test(id)), Array.from({ length: 14 }, (_, i) => `R-${String(i + 1).padStart(2, '0')}`));
  assert.equal(ids.length, 18);
  for (const r of DATASET.runs) {
    assert.equal(byRef[r.caseRef]?.role, 'case', r.id);
    assert.ok(personIds.has(r.tester), r.id);
    assert.ok(Object.values(RUN_RESULT).includes(r.result), r.id);
    assert.match(r.time, /^\d\d:\d\d:\d\d$/);
    assert.ok(Number.isInteger(r.day) && r.day < 0, `${r.id} lies before day zero`);
    assert.equal(r.environment, 'UAT');
    assert.ok(r.build.length > 0);
    if (byRef[r.caseRef].version === '2.4') {
      assert.match(r.file, new RegExp(`^CLM-${r.caseRef}-[a-z-]+\\.log$`), r.id);
      assert.ok(['2.4.0-rc1', '2.4.0-rc2'].includes(r.build));
    }
  }
  const files = DATASET.runs.map((r) => r.file).filter(Boolean);
  assert.equal(new Set(files).size, files.length);
});

test('evidence: every run that names a file has a plausible test log of 8 to 15 lines', () => {
  const withFile = DATASET.runs.filter((r) => r.file);
  assert.equal(withFile.length, 15);
  const seen = new Set();
  for (const r of withFile) {
    const log = evidenceLog(r);
    const lines = log.trimEnd().split('\n');
    assert.ok(lines.length >= 8 && lines.length <= 15, `${r.id}: ${lines.length} lines`);
    assert.ok(log.endsWith('\n'));
    assert.match(lines[0], /sample data: everything in it is fictional/);
    assert.match(lines[1], new RegExp(`^run      ${r.id} of CLM-${r.caseRef}: `));
    assert.ok(lines[1].endsWith(byRef[r.caseRef].summary));
    assert.match(lines[2], new RegExp(`^build    ${r.build} on UAT$`));
    assert.match(lines[4], new RegExp(`^started  ${shiftDate(DATASET.d0, r.day)} ${r.time.slice(0, 5)} UTC$`));
    assert.equal(lines.at(-1), `result   ${r.result.toUpperCase()}`);
    assert.ok(lines.filter((l) => /^\[\+\d\d:\d\d\] /.test(l)).length >= 4, `${r.id} lists its steps`);
    assert.ok(lines.some((l) => l.startsWith('expected: ')), r.id);
    assert.equal(lines.some((l) => l.startsWith('actual: ')), r.result === 'failed', r.id);
    assert.doesNotMatch(log, /stands in for|screenshot/i);
    assert.ok(!seen.has(log), `${r.id} has its own text`);
    seen.add(log);
  }
  assert.equal(evidenceLog(DATASET.runs.find((r) => !r.file)), '');
  // The log follows the project key and the load day, like everything else.
  const shifted = evidenceLog(DATASET.runs.find((r) => r.id === 'R-08'), '2026-11-11', 'CLM2');
  assert.match(shifted, /^run      R-08 of CLM2-15: /m);
  assert.match(shifted, /^started  2026-10-29 10:40 UTC$/m);
  assert.match(shifted, /raised CLM2-23$/m);
});

test('release 2.5: after CLM-24, two requirements, three cases, one run, not asked for (§4.7)', () => {
  assert.equal(of('requirement', '2.5').length, EXPECTED_25.totals.requirements);
  assert.equal(of('case', '2.5').length, EXPECTED_25.totals.cases);
  assert.equal(of('defect', '2.5').length, 0);
  assert.deepEqual(Object.keys(EXPECTED_25.cases), of('case', '2.5').map((c) => issueKey(c.ref)));
  const runs = DATASET.runs.filter((r) => byRef[r.caseRef].version === '2.5');
  assert.deepEqual(runs.map((r) => [r.id, r.caseRef, r.result, r.build]), [['R-2.5-1', 27, 'passed', '2.5.0-rc1']]);
  for (const [key, expected] of Object.entries(EXPECTED_25.cases)) {
    const ref = Number(key.split('-')[1]);
    assert.equal(issueKey(byRef[ref].tests), expected.requirement, key);
    assert.equal(runsOf(ref).at(-1)?.id ?? null, expected.latestRun, key);
  }
  const { counts } = EXPECTED_25;
  assert.equal(counts.proven + counts.stale + counts.failing + counts.unproven, EXPECTED_25.totals.cases);
  // Nothing in 2.5 changed after its one run, and its people are not the ones the 2.4 conflict is about.
  const run = runs[0];
  const later = DATASET.ledger.filter((row) => [25, 27].includes(row.ref) && stamp(row) > stamp(run));
  assert.deepEqual(later, []);
  assert.ok(!DATASET.ledger.some((row) => [25, 26, 27, 28, 29].includes(row.ref) && (row.actor === DATASET.oracle.conflictPerson || row.to === DATASET.oracle.conflictPerson)));
  // The request and the sample's one sealed record are about other releases.
  assert.equal(DATASET.request.release, '2.4');
  assert.equal(DATASET.record1.release, '2.3');
  assert.equal(DATASET.versions.find((v) => !v.released).name, '2.4', 'the sample still opens on 2.4');
});

test('request: the test lead proposes one condition and one waiver; the waiver is not the approver\'s own', () => {
  const { drafts, requestedBy } = DATASET.request;
  assert.equal(drafts.proposedBy, requestedBy);
  assert.equal(DATASET.people.find((p) => p.id === requestedBy).title, 'Test lead');
  assert.deepEqual(drafts.condition.coversRefs, [15, 16, 18, 22]);
  // Exactly the cases the oracle leaves open.
  assert.deepEqual(
    drafts.condition.coversRefs.map((ref) => issueKey(ref)),
    Object.entries(EXPECTED_CASES).filter(([, c]) => c.state !== 'passed').map(([key]) => key),
  );
  assert.equal(drafts.condition.dueDay, 7);
  assert.ok(personIds.has(drafts.condition.owner));
  assert.equal(conditionText(drafts.condition), 'Re-run CLM-15, CLM-16 and CLM-18, and run CLM-22 with a hardship test claimant, by 16 Dec 2026.');
  assert.deepEqual([drafts.waiver.recordedBy, drafts.waiver.authorisedBy], ['sample:P1', 'sample:P9']);
  assert.equal(DATASET.people.find((p) => p.id === drafts.waiver.authorisedBy).title, 'Quality and compliance officer');
  assert.deepEqual([drafts.waiver.code, issueKey(drafts.waiver.itemRef)], [EXPECTED.conflict.code, EXPECTED.conflict.item]);
  assert.ok(drafts.waiver.reason.length >= 20);

  // Fitted to the open items of a real brief: ids are taken from the items, never made up.
  const items = [
    { id: 'case:CLM2-15:stale', kind: 'stale', item: 'CLM2-15', label: 'CLM2-15 passed, then changed', needs: 'condition', coveredBy: null },
    { id: 'case:CLM2-22:not_run', kind: 'not_run', item: 'CLM2-22', label: 'CLM2-22 not run', needs: 'condition', coveredBy: null },
    { id: 'case:CLM2-40:failed', kind: 'failed', item: 'CLM2-40', label: 'CLM2-40 failed', needs: 'condition', coveredBy: null },
    { id: 'conflict:D1:712020:abc:CLM2-9', kind: 'conflict', item: 'CLM2-9', label: 'Conflict: A Person was the assignee of CLM2-24 while it was in progress', needs: 'waiver', coveredBy: null },
    { id: 'conflict:D2:712020:abc:CLM2-7', kind: 'conflict', item: 'CLM2-7', label: 'Conflict: other', needs: 'waiver', coveredBy: null },
  ];
  const fitted = sampleDrafts(items, '2026-11-11', 'CLM2');
  assert.deepEqual(fitted.condition.covers, ['case:CLM2-15:stale', 'case:CLM2-22:not_run']);
  assert.equal(fitted.condition.dueDate, '2026-11-18');
  assert.match(fitted.condition.text, /^Re-run CLM2-15, CLM2-16 and CLM2-18, .* by 18 Nov 2026\.$/);
  assert.equal(fitted.waiver.covers, 'conflict:D1:712020:abc:CLM2-9');
  assert.match(fitted.waiver.reason, /took over CLM2-24 only after it was reopened/);
});

test('runs: the days and offsets DOMAIN §4.4 prints', () => {
  const run = Object.fromEntries(DATASET.runs.map((r) => [r.id, r]));
  assert.equal(stamp(run['R-01']), '2026-11-24T10:05:00Z');
  assert.equal(run['R-01'].day, -15);
  assert.equal(stamp(run['R-08']), '2026-11-26T10:40:00Z');
  assert.equal(run['R-12'].day, -7);
  assert.equal(stamp(run['R-13']), '2026-12-03T10:20:00Z');
  assert.equal(stamp(run['R-14']), '2026-12-04T09:30:00Z');
  assert.equal(run['R-14'].day, -5);
  assert.deepEqual(DATASET.runs.filter((r) => r.result === 'failed').map((r) => r.id), ['R-2.3-1', 'R-05', 'R-08']);
  // The tester of a case is its assignee.
  for (const r of DATASET.runs) {
    const assignee = DATASET.ledger.find((row) => row.ref === r.caseRef && row.kind === 'assignee');
    assert.equal(r.tester, assignee.to, r.id);
  }
});

test('ledger: every row names an issue and a person; history runs forward', () => {
  for (const row of DATASET.ledger) {
    assert.ok(byRef[row.ref], `row for CLM-${row.ref}`);
    assert.ok(personIds.has(row.actor));
    assert.ok(['text', 'status', 'assignee', 'other'].includes(row.kind));
    assert.match(row.time, /^\d\d:\d\d:\d\d$/);
    assert.ok(Number.isInteger(row.day) && row.day < 0);
    if (row.kind === 'assignee' && row.to !== null) assert.ok(personIds.has(row.to));
  }
  for (const issue of DATASET.issues) {
    const rows = DATASET.ledger.filter((row) => row.ref === issue.ref);
    assert.equal(rows.filter((row) => row.field === 'reporter').length, 1, `CLM-${issue.ref} has a reporter`);
    const moves = rows.filter((row) => row.kind === 'status');
    assert.equal(moves[0].from, null);
    assert.equal(moves[0].to, 'todo');
    for (let n = 1; n < moves.length; n += 1) {
      assert.equal(moves[n].from, moves[n - 1].to, `CLM-${issue.ref} status chain`);
      assert.ok(stamp(moves[n]) > stamp(moves[n - 1]), `CLM-${issue.ref} status order`);
    }
    assert.equal(moves.at(-1).to, issue.status, `CLM-${issue.ref} ends in its DOMAIN status`);
  }
});

test('ledger: the two events behind the stale passes, and the conflict (§4.3, §4.6)', () => {
  const edits = DATASET.ledger.filter((row) => row.kind === 'text');
  assert.equal(edits.length, 1);
  const [edit] = edits;
  assert.deepEqual([edit.ref, edit.field, edit.actor, edit.day, stamp(edit)], [8, 'description', 'sample:P2', -6, '2026-12-03T15:40:00Z']);
  assert.match(edit.from, /^The new award applies from the date of the change;/);
  assert.match(edit.to, /^The new award applies from the Monday following the date of the change;/);
  assert.equal(byRef[8].description, edit.to, 'the issue is created with the text as it stands today');

  const reopens = DATASET.ledger.filter((row) => row.kind === 'status' && row.from === 'done');
  assert.equal(reopens.length, 1);
  assert.deepEqual([reopens[0].ref, reopens[0].to, reopens[0].actor, reopens[0].day, stamp(reopens[0])], [24, 'in_progress', 'sample:P6', -5, '2026-12-04T11:20:00Z']);

  // Samuel Ortega took CLM-24, moved it to In Progress and to Done; he appears nowhere else as a builder or a tester.
  const samuel = DATASET.oracle.conflictPerson;
  assert.equal(samuel, 'sample:P8');
  const his = DATASET.ledger.filter((row) => row.actor === samuel || row.to === samuel);
  assert.deepEqual([...new Set(his.map((row) => row.ref))], [24]);
  assert.ok(!DATASET.runs.some((r) => r.tester === samuel));
  assert.deepEqual(EXPECTED.conflict, { code: 'D1', person: samuel, item: 'CLM-9', issueKey: 'CLM-24' });
  assert.equal(byRef[24].links.find((l) => l.type === 'relates to').to, 9);

  // Grace Whitlock built nothing and tested nothing.
  const grace = EXPECTED.independentApprover;
  assert.ok(!DATASET.ledger.some((row) => row.actor === grace || row.to === grace));
  assert.ok(!DATASET.runs.some((r) => r.tester === grace));

  // No tester moved or held anything a requirement's builders are read from, except the reopening of CLM-24, which is
  // a move out of Done, not into it.
  const testers = new Set(DATASET.runs.map((r) => r.tester));
  const builderIssues = new Set(DATASET.issues.filter((i) => i.role !== 'case').map((i) => i.ref));
  for (const row of DATASET.ledger) {
    if (!builderIssues.has(row.ref)) continue;
    if (row.kind === 'assignee') assert.ok(!testers.has(row.to), `a tester is assignee of CLM-${row.ref}`);
    if (row.kind === 'status' && row.to === 'done') assert.ok(!testers.has(row.actor), `a tester closed CLM-${row.ref}`);
  }
});

test('ledgerEvents: normalised HistoryEvents, sorted, baselines first, shifted to the load day', () => {
  const events = ledgerEvents();
  assert.equal(events.length, DATASET.ledger.length);
  for (let n = 1; n < events.length; n += 1) assert.ok(events[n].at >= events[n - 1].at);
  for (const e of events) {
    assert.equal(e.source, 'sample');
    assert.equal(e.actor.kind, 'sample');
    assert.match(e.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
  for (const issue of DATASET.issues) {
    const mine = events.filter((e) => e.issueKey === `CLM-${issue.ref}`);
    assert.equal(mine.filter((e) => e.baseline && e.kind === 'status').length, 1, `CLM-${issue.ref}`);
    assert.equal(mine.filter((e) => e.baseline && e.kind === 'assignee').length, 1, `CLM-${issue.ref}`);
    assert.ok(mine.filter((e) => e.baseline).every((e) => e.from === null));
  }
  const take = events.find((e) => e.issueKey === 'CLM-24' && e.kind === 'assignee' && !e.baseline);
  assert.equal(take.toPerson.name, 'Samuel Ortega');

  const shifted = ledgerEvents('2026-11-10', 'CLM2');
  const edit = shifted.find((e) => e.kind === 'text');
  assert.equal(edit.issueKey, 'CLM2-8');
  assert.equal(edit.at, '2026-11-04T15:40:00Z');
  assert.ok(shifted.every((e) => e.at < '2026-11-10T00:00:00Z'), 'on the load day everything lies in the past');
});

test('oracle: 12 cases = 8 / 3 / 1, declared consistently (DOMAIN §4.5)', () => {
  const { counts, usualSheetPasses, stale, openDefects } = DATASET.oracle;
  assert.deepEqual(counts, { proven: 8, stale: 3, failing: 0, unproven: 1 });
  const cases = of('case', EXPECTED.release);
  assert.deepEqual(Object.keys(EXPECTED_CASES), cases.map((c) => issueKey(c.ref)));
  assert.equal(counts.proven + counts.stale + counts.failing + counts.unproven, cases.length);

  const states = Object.values(EXPECTED_CASES).map((c) => c.state);
  const count = (state) => states.filter((s) => s === state).length;
  assert.equal(count(CASE_STATE.PASSED), counts.proven);
  assert.equal(count(CASE_STATE.PASSED_THEN_CHANGED), counts.stale);
  assert.equal(count(CASE_STATE.FAILED) + count(CASE_STATE.BLOCKED), counts.failing);
  assert.equal(count(CASE_STATE.NOT_RUN), counts.unproven);
  assert.equal(usualSheetPasses, counts.proven + counts.stale);
  assert.equal(usualSheetPasses, 11);

  assert.deepEqual(
    Object.keys(stale).sort(),
    Object.entries(EXPECTED_CASES).filter(([, c]) => c.state === CASE_STATE.PASSED_THEN_CHANGED).map(([key]) => key).sort(),
  );
  for (const code of Object.values(stale)) assert.ok(Object.values(STALE_CODE).includes(code));
  assert.deepEqual(stale, { 'CLM-15': 'S1', 'CLM-16': 'S1', 'CLM-18': 'S4' });

  assert.deepEqual(openDefects, of('defect', EXPECTED.release).filter((d) => d.status !== 'done').map((d) => issueKey(d.ref)));
});

test('oracle: each declared latest run and each declared trigger is in the data', () => {
  for (const [key, expected] of Object.entries(EXPECTED_CASES)) {
    const ref = Number(key.split('-')[1]);
    const runs = runsOf(ref);
    assert.equal(issueKey(byRef[ref].tests), expected.requirement, key);
    if (expected.latestRun === null) {
      assert.equal(runs.length, 0, key);
      assert.equal(expected.state, CASE_STATE.NOT_RUN);
      continue;
    }
    const last = runs.at(-1);
    assert.equal(last.id, expected.latestRun, key);
    assert.equal(last.result, 'passed', `${key}: the usual sheet counts it as a pass`);

    const stale = expected.state === CASE_STATE.PASSED_THEN_CHANGED;
    assert.equal(Boolean(expected.trigger), stale, key);
    if (!stale) continue;
    const t = expected.trigger;
    const row = DATASET.ledger.find((r) => r.ref === t.ref && r.kind === t.kind && r.day === t.day && r.time === t.time);
    assert.ok(row, `${key}: trigger row`);
    assert.ok(stamp(row) > stamp(last), `${key}: the change came after the pass`);
    if (DATASET.oracle.stale[key] === 'S1') {
      assert.equal(t.ref, byRef[ref].tests, `${key}: S1 is an edit of its own requirement`);
      assert.ok(last.requirementText, `${key}: the run kept the text it was tested against`);
      assert.notEqual(last.requirementText, `${byRef[t.ref].summary}\n${byRef[t.ref].description}`);
      assert.equal(last.requirementText, `${byRef[t.ref].summary}\n${row.from}`);
    } else {
      assert.equal(byRef[t.ref].role, 'defect');
      assert.ok(byRef[t.ref].links.some((l) => l.to === ref), `${key}: S4 is a defect linked to the case`);
      assert.equal(row.from, 'done');
      const closed = DATASET.ledger.find((r) => r.ref === t.ref && r.kind === 'status' && r.to === 'done');
      assert.ok(stamp(closed) < stamp(last), `${key}: the defect was closed when the case passed`);
    }
  }
  // CLM-14 was re-run after the edit, so its latest run carries today's text (no snapshot override).
  assert.equal(DATASET.runs.find((r) => r.id === 'R-14').requirementText, undefined);
  // Runs on CLM-8's cases before the edit all carry the old text; no other run carries one.
  const edit = DATASET.ledger.find((row) => row.kind === 'text');
  for (const r of DATASET.runs) {
    const before = byRef[r.caseRef].tests === edit.ref && stamp(r) < stamp(edit);
    assert.equal(Boolean(r.requirementText), before, r.id);
  }
});

test('record 1: release 2.3, accepted with two conditions, one met and one 9 days overdue on day zero (§4.6)', () => {
  const r1 = DATASET.record1;
  assert.equal(r1.release, EXPECTED.record1.release);
  assert.equal(r1.outcome, 'accepted_with_conditions');
  assert.equal(shiftTime(DATASET.d0, r1.day, r1.time), '2026-09-18T16:10:00Z');
  assert.equal(r1.approver, 'sample:P7');
  assert.ok(personIds.has(r1.requestedBy));
  assert.notEqual(r1.requestedBy, r1.approver);
  assert.ok(r1.statement.length >= 20);
  assert.equal(r1.conditions.length, EXPECTED.record1.conditions);

  assert.deepEqual(r1.conditions.map((c) => conditionText(c)), [
    'Fix CLM-5 and re-run CLM-3 by 16 Oct 2026.',
    'Deliver CLM-6, the override audit export, by 30 Nov 2026.',
  ]);
  assert.deepEqual(r1.conditions.map((c) => [c.owner, c.linkedRef, shiftDate(DATASET.d0, c.dueDay)]), [
    ['sample:P3', 5, '2026-10-16'],
    ['sample:P4', 6, '2026-11-30'],
  ]);
  for (const c of r1.conditions) {
    assert.ok(personIds.has(c.owner));
    assert.ok(byRef[c.linkedRef]);
    assert.ok(c.dueDay > r1.day, 'due after signing');
  }
  const [first, second] = r1.conditions;
  assert.equal(shiftDate(DATASET.d0, first.met.day), '2026-10-12');
  assert.ok(first.met.day <= first.dueDay && first.met.day > r1.day);
  assert.ok(personIds.has(first.met.by));
  assert.equal(second.met, null);
  assert.equal(-second.dueDay, EXPECTED.record1.daysOverdueOnDayZero);
  assert.equal(byRef[second.linkedRef].status, 'in_progress');
  assert.deepEqual(EXPECTED.record1.carriedOnDayZero, { met: 1, overdue: 1, open: 0 });

  // At signing: CLM-3 had failed and was not re-run, CLM-4 had passed, CLM-5 was open.
  const signedAt = shiftTime(DATASET.d0, r1.day, r1.time);
  const atSigning = (ref) => runsOf(ref).filter((r) => stamp(r) <= signedAt).map((r) => r.result);
  assert.deepEqual(atSigning(3), ['failed']);
  assert.deepEqual(atSigning(4), ['passed']);
  assert.deepEqual(runsOf(3).map((r) => r.result), ['failed', 'passed']);
  assert.deepEqual(EXPECTED.record1.countsAtSigning, { proven: 1, stale: 0, failing: 1, unproven: 0 });
  const closed5 = DATASET.ledger.find((row) => row.ref === 5 && row.to === 'done');
  assert.ok(stamp(closed5) > signedAt);
  assert.equal(shiftDate(DATASET.d0, closed5.day), '2026-10-09');
  assert.deepEqual(EXPECTED.record1.openDefectsAtSigning, ['CLM-5']);
});

test('helpers: a suffix key and a load day are carried through', () => {
  assert.equal(issueKey(15), 'CLM-15');
  assert.equal(issueKey(15, 'CLM2'), 'CLM2-15');
  assert.equal(rekey('Fix CLM-5 and re-run CLM-3', 'CLM2'), 'Fix CLM2-5 and re-run CLM2-3');
  assert.equal(rekey('Fix CLM-5', 'CLM'), 'Fix CLM-5');
  assert.equal(conditionText(DATASET.record1.conditions[1], '2026-11-10', 'CLM3'), 'Deliver CLM3-6, the override audit export, by 1 Nov 2026.');
  assert.equal(shiftTime('2026-11-10', -5, '09:30:00'), '2026-11-05T09:30:00Z');
});

test('a load into CLM2: no text the loader stores or prints keeps a CLM-n key', () => {
  const key = 'CLM2';
  const d0 = '2026-11-11';
  const r1 = rekeyDeep(DATASET.record1, key);
  const ask = rekeyDeep(DATASET.request, key);
  // The note of the met condition was the one text that kept "CLM-5 … CLM-3" on a CLM2 sample.
  assert.equal(r1.conditions[0].met.note, 'CLM2-5 was resolved and CLM2-3 passed when it was run again.');
  assert.match(r1.statement, /defect CLM2-5 is open/);
  assert.equal(conditionText(r1.conditions[0], d0, key), conditionText(DATASET.record1.conditions[0], d0, key), 'rekeying twice changes nothing');
  // Everything but texts is untouched.
  assert.equal(r1.conditions[0].met.by, DATASET.record1.conditions[0].met.by);
  assert.equal(r1.conditions[0].dueDay, DATASET.record1.conditions[0].dueDay);
  assert.equal(r1.conditions[1].met, null);
  assert.equal(ask.dueDay, DATASET.request.dueDay);
  assert.deepEqual(ask.drafts.condition.coversRefs, DATASET.request.drafts.condition.coversRefs);
  assert.equal(rekeyDeep(DATASET.record1, 'CLM'), DATASET.record1, 'CLM itself: the dataset as it is');

  const openItems = [
    { id: 'case:CLM2-15:stale', kind: 'stale', item: 'CLM2-15', label: 'CLM2-15 passed, then changed', needs: 'condition', coveredBy: null },
    { id: 'conflict:D1:712020:abc:CLM2-9', kind: 'conflict', item: 'CLM2-9', label: 'Conflict', needs: 'waiver', coveredBy: null },
  ];
  const texts = JSON.stringify([
    r1,
    ask,
    r1.conditions.map((c) => conditionText(c, d0, key)),
    sampleDrafts(openItems, d0, key),
    DATASET.issues.map((i) => [issueKey(i.ref, key), rekey(i.summary, key), rekey(i.description, key)]),
    DATASET.runs.map((r) => [rekey(r.note, key), rekey(r.file, key), r.requirementText ? rekey(r.requirementText, key) : '', evidenceLog(r, d0, key)]),
    ledgerEvents(d0, key),
  ]);
  assert.match(texts, /CLM2-5/);
  assert.doesNotMatch(texts, /\bCLM-\d/);
});
