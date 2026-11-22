// DOMAIN §4.7: the release after the one that is signed. Release 2.5 of the sample, the line it opens with once
// Release 2.4 has been signed with a condition, and the drafts the sample test lead proposes on the 2.4 request.
// The 2.4 oracle (§4.5) is computed here a second time, straight from the dataset, to show that adding 2.5 moved nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { caseState, countStates, latestRun, requirementState } from '../../src/domain/caseState.js';
import { carriedHeadline, nextRelease } from '../../src/domain/carried.js';
import {
  applyCoverage, availability, conditionState, openItems, suggestedStatement, validateCondition, validateWaiver,
} from '../../src/domain/signingRules.js';
import { staleReasons } from '../../src/domain/staleness.js';
import { DEFAULT_SETTINGS } from '../../src/contract.js';
import {
  DATASET, EXPECTED, EXPECTED_25, EXPECTED_CASES, conditionText, issueKey, ledgerEvents, sampleDrafts, shiftDate, shiftTime,
} from '../../src/sample/dataset.js';
import { NOW, P, RUNS, assemble, at, run } from './fixtures.js';

// ── a release of the dataset, through the pure rules ────────────────────────────────────────────────────────

const textOf = (issue) => `${issue.summary}\n${issue.description}`;

const releaseOf = (version, now = NOW) => {
  const events = ledgerEvents();
  const historyOf = (ref) => events.filter((e) => e.issueKey === issueKey(ref));
  const inRelease = DATASET.issues.filter((i) => i.version === version);
  const defects = inRelease.filter((i) => i.role === 'defect');
  const requirements = inRelease
    .filter((i) => i.role === 'requirement')
    .map((req) => {
      const cases = inRelease
        .filter((c) => c.role === 'case' && c.tests === req.ref)
        .map((c) => {
          const runs = DATASET.runs
            .map((r, index) => ({ r, index }))
            .filter(({ r }) => r.caseRef === c.ref)
            .map(({ r, index }) => ({
              id: String(index + 1), name: r.id, caseKey: issueKey(c.ref), requirementKey: issueKey(req.ref), result: r.result,
              build: r.build, executedAt: shiftTime(DATASET.d0, r.day, r.time), evidence: [],
              snapshot: { requirementText: r.requirementText ?? textOf(req), caseText: textOf(c) },
            }));
          const latest = latestRun(runs);
          const linked = defects.filter((d) => d.links.some((l) => l.to === req.ref || l.to === c.ref));
          const reasons = latest
            ? staleReasons({
                run: latest, requirementEvents: historyOf(req.ref), caseEvents: historyOf(c.ref),
                defectEvents: Object.fromEntries(linked.map((d) => [issueKey(d.ref), historyOf(d.ref)])),
                criteriaField: null, currentBuild: null, buildSetAt: null, liveEvidence: null,
                live: { requirementText: textOf(req), caseText: textOf(c) }, now,
              })
            : [];
          return { key: issueKey(c.ref), state: caseState(latest, reasons), latestRun: latest, staleReasons: reasons };
        });
      return { key: issueKey(req.ref), cases, state: requirementState(cases) };
    });
  return { requirements, cases: requirements.flatMap((r) => r.cases), counts: countStates(requirements) };
};

const shape = (release) =>
  Object.fromEntries(
    release.requirements.flatMap((r) => r.cases.map((c) => [c.key, { state: c.state, latestRun: c.latestRun ? c.latestRun.name : null, requirement: r.key }])),
  );

test('2.4 from the dataset is still 4 requirements, 12 cases, 8 / 3 / 0 / 1 with the same stale reasons', () => {
  const release = releaseOf('2.4');
  assert.equal(release.requirements.length, EXPECTED.totals.requirements);
  assert.equal(release.cases.length, EXPECTED.totals.cases);
  assert.deepEqual(release.counts, DATASET.oracle.counts);
  assert.deepEqual(release.counts, { proven: 8, stale: 3, failing: 0, unproven: 1 });
  assert.deepEqual(shape(release), Object.fromEntries(Object.entries(EXPECTED_CASES).map(([k, { trigger, ...rest }]) => [k, rest])));
  const stale = Object.fromEntries(release.cases.filter((c) => c.staleReasons.length > 0 && c.state === 'passed_then_changed').map((c) => [c.key, c.staleReasons[0].code]));
  assert.deepEqual(stale, DATASET.oracle.stale);
});

test('2.5 on day zero: 2 requirements, 3 cases, 1 passed and 2 not run, nothing stale', () => {
  const release = releaseOf('2.5');
  assert.equal(release.requirements.length, EXPECTED_25.totals.requirements);
  assert.equal(release.cases.length, EXPECTED_25.totals.cases);
  assert.deepEqual(release.counts, EXPECTED_25.counts);
  assert.deepEqual(shape(release), EXPECTED_25.cases);
  assert.ok(release.cases.every((c) => c.staleReasons.length === 0));
  assert.deepEqual(release.requirements.map((r) => r.state), ['attention', 'attention']);
});

// ── the release a condition comes back in ───────────────────────────────────────────────────────────────────

test('nextRelease: the unreleased version after this one, in Jira order; none after the last', () => {
  const releases = [
    { id: '10002', name: '2.4', released: false },
    { id: '10003', name: '2.5', released: false },
    { id: '10001', name: '2.3', released: true },
  ];
  assert.equal(nextRelease(releases, '10002').name, '2.5');
  assert.equal(nextRelease(releases, '10003'), null);
  assert.equal(nextRelease(releases.slice(0, 1).concat(releases[2]), '10002'), null, 'no later version: nothing to see');
  // Decided on a version that has been released since: the first one still open.
  assert.equal(nextRelease(releases, '10001').name, '2.4');
  assert.equal(nextRelease([], '1'), null);
});

// ── what the next release opens with ────────────────────────────────────────────────────────────────────────

const stored = (text, dueDate, status, now) => ({ text, dueDate, status, state: conditionState({ status, dueDate }, now) });
const group = (number, releaseName, decidedBy, conditions) => ({ record: { id: String(number), number, releaseName, decidedBy }, sentence: '', conditions });

/** Record 1 as the sample loads it. */
const record1 = (now, allMet = false) =>
  group(1, '2.3', P.grace, DATASET.record1.conditions.map((c) =>
    stored(conditionText(c), shiftDate(DATASET.d0, c.dueDay), c.met || allMet ? 'met' : 'open', now)));

/** Record 2: Release 2.4 signed on day zero by `signer` with the condition the test lead proposed. */
const proposed = () => {
  const release = assemble({ approver: P.samuel, requester: P.priya });
  return sampleDrafts(openItems({ ...release, conflicts: release.duties.conflicts }));
};
const record2 = (now, signer, status = 'open') => {
  const { condition } = proposed();
  return group(2, '2.4', signer, [stored(condition.text, condition.dueDate, status, now)]);
};

test('before 2.4 is signed, the line is about Record 1: one met, one 9 days overdue', () => {
  const head = carriedHeadline([record1(NOW)], NOW, P.samuel.id);
  assert.equal(head.line, 'Last time (Release 2.3, Record 1): 2 conditions. 1 is 9 days overdue, 1 met.');
  assert.deepEqual([head.overdue, head.own], [1, false]);
  assert.deepEqual(carriedHeadline([], NOW), { line: null, overdue: 0, own: false });
});

test('after 2.4 is signed with a condition, 2.5 opens with that condition in its own words, and Record 1 stays', () => {
  const head = carriedHeadline([record2(NOW, P.samuel), record1(NOW)], NOW, P.samuel.id);
  assert.equal(head.line, EXPECTED_25.afterSigning24.line);
  assert.match(head.line, /^Last time \(Release 2\.4, Record 2\): 1 condition, due 16 Dec, open: "Re-run CLM-15/);
  assert.match(head.line, /Record 1 \(Release 2\.3\) still has 1 condition 9 days overdue\.$/);
  assert.equal(head.overdue, EXPECTED_25.afterSigning24.overdue);
  assert.equal(head.own, true, 'the reader signed Record 2');
  assert.equal(carriedHeadline([record2(NOW, P.samuel), record1(NOW)], NOW, P.grace.id).own, false);
});

test('the promise does not go away: late, it says how late; met, it says so; an older record leaves only when all of it is met', () => {
  const later = at('2026-12-17');
  const late = carriedHeadline([record2(later, P.samuel), record1(later)], later);
  assert.match(late.line, /^Last time \(Release 2\.4, Record 2\): 1 condition, was due 16 Dec, 1 day overdue: "/);
  assert.match(late.line, /Record 1 \(Release 2\.3\) still has 1 condition 17 days overdue\.$/);
  assert.equal(late.overdue, 2);

  const met = carriedHeadline([record2(NOW, P.samuel, 'met'), record1(NOW)], NOW);
  assert.match(met.line, /^Last time \(Release 2\.4, Record 2\): 1 condition, met: "/);
  assert.match(met.line, /Record 1 \(Release 2\.3\) still has 1 condition 9 days overdue\.$/);

  const clean = carriedHeadline([record2(NOW, P.samuel), record1(NOW, true)], NOW);
  assert.doesNotMatch(clean.line, /Record 1/);
  assert.equal(clean.overdue, 0);

  const long = carriedHeadline([group(3, '2.6', P.grace, [stored('x'.repeat(400), '2026-12-20', 'open', NOW)])], NOW);
  assert.ok(long.line.length < 260 && long.line.includes('…"'), 'a long condition is cut, not dropped');
});

// ── what the test lead proposes on the sample request ───────────────────────────────────────────────────────

test('proposed drafts: one condition covering CLM-15, CLM-16, CLM-18 and CLM-22, due in 7 days, owned by a sample person', () => {
  const release = assemble({ approver: P.samuel, requester: P.priya });
  const items = openItems({ ...release, conflicts: release.duties.conflicts });
  const { condition } = sampleDrafts(items);
  assert.deepEqual(condition, {
    text: 'Re-run CLM-15, CLM-16 and CLM-18, and run CLM-22 with a hardship test claimant, by 16 Dec 2026.',
    owner: P.priya.id,
    dueDate: '2026-12-16',
    covers: ['case:CLM-15:stale', 'case:CLM-16:stale', 'case:CLM-18:stale', 'case:CLM-22:not_run'],
  });
  assert.equal(condition.dueDate, shiftDate(DATASET.d0, 7));
  assert.deepEqual(validateCondition({ text: condition.text, ownerId: condition.owner, dueDate: condition.dueDate, covers: condition.covers, items }), { ok: true });
});

test('proposed drafts: the waiver for the approver\'s own conflict is recorded by the test lead and authorised by the quality officer', () => {
  const release = assemble({ approver: P.samuel, requester: P.priya });
  const items = openItems({ ...release, conflicts: release.duties.conflicts });
  const { waiver } = sampleDrafts(items);
  assert.equal(waiver.covers, 'conflict:D1:sample:P8:CLM-9');
  assert.equal(waiver.coversLabel, 'Conflict: Samuel Ortega was the assignee of CLM-24 while it was in progress');
  assert.deepEqual([waiver.recordedBy, waiver.authorisedBy], [P.priya.id, P.ingrid.id]);
  assert.notEqual(waiver.recordedBy, P.samuel.id, 'not recorded by the approver, so not marked "Not independent"');
  assert.ok(waiver.reason.length >= 20);
  // The rule itself is unchanged: the test lead may record it; the approver may only because the setting allows it.
  const ask = (actorId, settings = DEFAULT_SETTINGS) =>
    validateWaiver({ covers: waiver.covers, reason: waiver.reason, authorisedById: waiver.authorisedBy, authorisedByName: null, actorId, approverId: P.samuel.id, items, settings });
  assert.deepEqual(ask(waiver.recordedBy), { ok: true });
  const strict = { ...DEFAULT_SETTINGS, people: { ...DEFAULT_SETTINGS.people, approverMayRecordOwnWaiver: false } };
  assert.deepEqual(ask(waiver.recordedBy, strict), { ok: true });
  assert.equal(ask(P.samuel.id, strict).ok, false);
});

test('proposed drafts: together they cover every open item, so "Accept with conditions" needs nothing more', () => {
  const release = assemble({ approver: P.samuel, requester: P.priya });
  const items = openItems({ ...release, conflicts: release.duties.conflicts });
  const { condition, waiver } = sampleDrafts(items);
  const covered = applyCoverage(items, [{ id: 'c1', covers: condition.covers }], [{ id: 'w1', covers: waiver.covers }]);
  assert.ok(covered.every((i) => i.coveredBy !== null));
  const a = availability(covered);
  assert.deepEqual([a.accepted.allowed, a.accepted_with_conditions.allowed, a.accepted_with_conditions.covered], [false, true, 5]);
});

test('proposed drafts: nothing is proposed for an item that is not open', () => {
  // An approver with no conflict gets no waiver.
  const grace = assemble({ approver: P.grace, requester: P.priya });
  const forGrace = sampleDrafts(openItems({ ...grace, conflicts: grace.duties.conflicts }));
  assert.equal(forGrace.waiver, null);
  assert.equal(forGrace.condition.covers.length, 4);
  // Two cases run again before the sample is read: the condition covers the two that are left.
  const rerun = [
    ...RUNS,
    run(15, 'CLM-15', at('2026-12-09', '08:10'), P.daniel, '2.4.0-rc2', 'passed', 'a.log'),
    run(16, 'CLM-16', at('2026-12-09', '08:20'), P.daniel, '2.4.0-rc2', 'passed', 'b.log'),
  ];
  const fresh = assemble({ approver: P.samuel, runs: rerun });
  assert.deepEqual(sampleDrafts(openItems({ ...fresh, conflicts: fresh.duties.conflicts })).condition.covers, ['case:CLM-18:stale', 'case:CLM-22:not_run']);
  assert.deepEqual(sampleDrafts([]), { condition: null, waiver: null });
});

test('suggested statement: offered per outcome, counts the conditions and waivers, never empty words', () => {
  const s = (outcome, conditions = 0, waivers = 0) => suggestedStatement({ outcome, releaseName: '2.4', conditions, waivers });
  assert.equal(s('accepted'), 'I accept Release 2.4 as it was tested.');
  assert.match(s('accepted_with_conditions', 1, 1), /^I accept Release 2\.4 with 1 condition and 1 waiver\. /);
  assert.match(s('accepted_with_conditions', 2, 0), /^I accept Release 2\.4 with 2 conditions\. /);
  assert.match(s('rejected'), /^I do not accept Release 2\.4 as it stands\./);
  assert.equal(s('accepted_with_conditions', 0, 0), null);
  assert.equal(s(null), null);
});
