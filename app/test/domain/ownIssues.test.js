// The app's own Jira issues (the issue of a signed condition, the sign-off task) are never requirements of a release,
// and the release that opens when none is named. DOMAIN §4.7: Release 2.5 stays 2 requirements, 3 cases, 1 / 0 / 0 / 2
// before and after Release 2.4 is signed, although the condition's issue (CLM-31, a Task) gets fix version 2.5.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CASE_LABEL, DEFAULT_SETTINGS } from '../../src/contract.js';
import { countStates, requirementState } from '../../src/domain/caseState.js';
import { decidedReleases, defaultReleaseId } from '../../src/domain/carried.js';
import { CONDITION_LABEL, appIssueKeys, isAppIssue, requirementIssues, typeMatches } from '../../src/domain/whatCounts.js';
import { DATASET, EXPECTED_25, issueKey } from '../../src/sample/dataset.js';

// ── Release 2.5 as Jira returns it ──────────────────────────────────────────────────────────────────────────

const jiraIssue = (i) => ({ key: issueKey(i.ref), type: i.type, typeId: null, labels: i.role === 'case' ? [CASE_LABEL] : [] });
const IN_25 = DATASET.issues.filter((i) => i.version === '2.5').map(jiraIssue);
const CASE_KEYS = new Set(DATASET.issues.filter((i) => i.role === 'case').map((i) => issueKey(i.ref)));
const isRequirementType = (i) => typeMatches(i, DEFAULT_SETTINGS.whatCounts.requirementTypes, [], []);

/** What the app created when 2.4 was asked for and signed: the sign-off task CLM-30 and the condition's issue CLM-31. */
const SIGN_OFF = { key: 'CLM-30', type: 'Task', typeId: null, labels: ['acceptance-sign-off'] };
const CONDITION = { key: 'CLM-31', type: 'Task', typeId: null, labels: [CONDITION_LABEL] };
const NOTHING = appIssueKeys({});
const AFTER_SIGNING = appIssueKeys({
  // Record 1's conditions point at issues that existed already (CLM-5, CLM-6); Record 2's got its own issue.
  conditions: [{ linkedIssue: 'CLM-5' }, { linkedIssue: 'CLM-6' }, { linkedIssue: 'CLM-31' }, { linkedIssue: null }],
  requests: [{ taskKey: null }, { taskKey: 'CLM-30' }],
  records: [{ anchorIssue: null }, { anchorIssue: 'CLM-30' }],
});

/** Requirements, cases and the four counts of a release, with the case states of the oracle. */
const counted = (issues, own) => {
  const requirements = requirementIssues(issues, { isRequirementType, caseKeys: CASE_KEYS, own }).map((r) => {
    const cases = Object.entries(EXPECTED_25.cases)
      .filter(([, c]) => c.requirement === r.key)
      .map(([key, c]) => ({ key, state: c.state }));
    return { key: r.key, cases, state: requirementState(cases) };
  });
  return {
    requirements: requirements.length,
    cases: requirements.flatMap((r) => r.cases).length,
    counts: countStates(requirements),
    keys: requirements.map((r) => r.key),
  };
};
const ORACLE_25 = { requirements: 2, cases: 3, counts: { proven: 1, stale: 0, failing: 0, unproven: 2 }, keys: ['CLM-25', 'CLM-26'] };

test('2.5 before 2.4 is signed: 2 requirements, 3 cases, 1 / 0 / 0 / 2', () => {
  assert.deepEqual(counted(IN_25, NOTHING), ORACLE_25);
  assert.deepEqual({ ...EXPECTED_25.totals, counts: EXPECTED_25.counts }, { requirements: 2, cases: 3, counts: ORACLE_25.counts });
});

test('2.5 after 2.4 is signed: the condition issue CLM-31 is in the release in Jira, and the release still counts 2, 3, 1 / 0 / 0 / 2', () => {
  const inJira = [...IN_25, CONDITION];
  assert.equal(isRequirementType(CONDITION), true, 'a Task is a requirement type by default: without the rule it would count');
  assert.deepEqual(counted(inJira, AFTER_SIGNING), ORACLE_25);
  // What the rule prevents: a third requirement with no case.
  assert.deepEqual(counted(inJira, NOTHING).keys, ['CLM-25', 'CLM-26', 'CLM-31']);
});

test('a sign-off issue is never a requirement, whatever release somebody puts it in', () => {
  assert.equal(isAppIssue(SIGN_OFF, AFTER_SIGNING), true);
  assert.equal(isAppIssue({ ...SIGN_OFF, labels: [] }, AFTER_SIGNING), true, 'known by its stored key, the label may be gone');
  assert.deepEqual(counted([...IN_25, SIGN_OFF, CONDITION], AFTER_SIGNING), ORACLE_25);
});

test('an existing issue a condition points at stays a requirement; a label alone takes nothing out', () => {
  // CLM-6 is the follow-up task Record 1's second condition is linked to: stored, but not made by the app.
  const followUp = { key: 'CLM-6', type: 'Task', typeId: null, labels: [] };
  assert.equal(isAppIssue(followUp, AFTER_SIGNING), false);
  assert.deepEqual(requirementIssues([followUp], { isRequirementType, caseKeys: CASE_KEYS, own: AFTER_SIGNING }), [followUp]);
  // Somebody types the app's label on a real requirement: it still counts.
  const labelled = { key: 'CLM-25', type: 'Story', typeId: null, labels: [CONDITION_LABEL] };
  assert.equal(isAppIssue(labelled, AFTER_SIGNING), false);
  // The app's condition issue with its label removed by hand is not recognised any more, and counts: nothing is hidden on a guess.
  assert.equal(isAppIssue({ ...CONDITION, labels: [] }, AFTER_SIGNING), false);
  assert.equal(isAppIssue({ key: 'CLM-31' }, AFTER_SIGNING), false, 'an issue read without labels');
});

test('requirementIssues: a case is never a requirement, and other types are left out', () => {
  const issues = [
    { key: 'CLM-25', type: 'Story', labels: [] },
    { key: 'CLM-27', type: 'Task', labels: [CASE_LABEL] },
    { key: 'CLM-99', type: 'Bug', labels: [] },
  ];
  assert.deepEqual(requirementIssues(issues, { isRequirementType, caseKeys: CASE_KEYS, own: NOTHING }).map((i) => i.key), ['CLM-25']);
  assert.deepEqual(appIssueKeys({}), { conditions: new Set(), signOff: new Set() });
});

// ── the release that opens when none is named ───────────────────────────────────────────────────────────────

// Jira's own order is not the order of the names: the released 2.3 comes last here.
const RELEASES = [
  { id: '10002', name: '2.4', released: false },
  { id: '10003', name: '2.5', released: false },
  { id: '10001', name: '2.3', released: true },
];
const BOTH = new Set(['10001', '10002', '10003']);
const record = (number, releaseId, outcome) => ({ number, releaseId, outcome });
const RECORD_1 = record(1, '10001', 'accepted_with_conditions');
const request = (releaseId, state) => ({ releaseId, state });

test('default release: with 2.4 and 2.5 both unreleased and tested, 2.4 opens until it is decided', () => {
  const decided = decidedReleases([RECORD_1], [request('10002', 'open')]);
  assert.deepEqual([...decided], ['10001']);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided }), '10002');
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: decidedReleases([RECORD_1], []) }), '10002', 'not asked for yet');
});

test('default release: once 2.4 is accepted, 2.5 opens, where the promise is seen and the next decision is', () => {
  const records = [RECORD_1, record(2, '10002', 'accepted_with_conditions')];
  const decided = decidedReleases(records, [request('10002', 'decided')]);
  assert.deepEqual([...decided].sort(), ['10001', '10002']);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided }), '10003');
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: decidedReleases([RECORD_1, record(2, '10002', 'accepted')], []) }), '10003');
});

test('default release: a rejected release, or one asked for again, still waits and stays the default', () => {
  const rejected = decidedReleases([RECORD_1, record(2, '10002', 'rejected')], []);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: rejected }), '10002');
  // Rejected as Record 2, accepted as Record 3: the newest record counts, in whatever order they are read.
  const then = decidedReleases([record(3, '10002', 'accepted'), RECORD_1, record(2, '10002', 'rejected')], []);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: then }), '10003');
  const again = decidedReleases([RECORD_1, record(2, '10002', 'accepted')], [request('10002', 'decided'), request('10002', 'open')]);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: again }), '10002');
  const withdrawn = decidedReleases([RECORD_1, record(2, '10002', 'accepted')], [request('10002', 'withdrawn')]);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: withdrawn }), '10003');
});

test('default release: the fallbacks — every tested one decided, none tested, none unreleased', () => {
  const all = new Set(['10002', '10003']);
  assert.equal(defaultReleaseId(RELEASES, { withCases: BOTH, decided: all }), '10002', 'all decided: the earliest tested one');
  assert.equal(defaultReleaseId(RELEASES, { withCases: new Set(['10003']), decided: new Set() }), '10003', 'only 2.5 has cases');
  assert.equal(defaultReleaseId(RELEASES, { withCases: new Set(['10003']), decided: new Set(['10003']) }), '10003');
  assert.equal(defaultReleaseId(RELEASES, { withCases: new Set(), decided: new Set() }), '10002', 'no cases anywhere: the earliest unreleased');
  assert.equal(defaultReleaseId([RELEASES[2]], { withCases: BOTH, decided: new Set() }), null, 'a released version is never the default');
  assert.equal(defaultReleaseId([], { withCases: BOTH, decided: new Set() }), null);
  assert.equal(defaultReleaseId([{ id: 10002, released: false }], { withCases: BOTH, decided: new Set() }), '10002', 'an id given as a number');
});
