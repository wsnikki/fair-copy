// DOMAIN §4 as fixtures for the rule tests: ClaimPoint (CLM), release 2.4 on day zero, with the 2.3 history.
// Everything is fictional. Times not given in DOMAIN (when a story moved to In Progress, for example) are filled in
// so that they agree with it; every time DOMAIN does give is used as written.
import { CASE_STATE, DEFAULT_SETTINGS, PRIORITY_ORDER } from '../../src/contract.js';
import { caseState, countStates, latestRun, requirementState } from '../../src/domain/caseState.js';
import { computeDuties } from '../../src/domain/duties.js';
import { sha256Hex, textHash } from '../../src/domain/seal.js';
import { conditionState } from '../../src/domain/signingRules.js';
import { staleReasons } from '../../src/domain/staleness.js';

export const NOW = '2026-12-09T09:00:00Z'; // D0, Wed 9 Dec 2026
export const RULES = DEFAULT_SETTINGS.rules;
export const at = (day, time = '09:00') => `${day}T${time}:00Z`;

const person = (n, name) => ({ id: `sample:P${n}`, name, kind: 'sample' });
export const P = {
  priya: person(1, 'Priya Raman'),
  leo: person(2, 'Leo Marchetti'),
  tomasz: person(3, 'Tomasz Wrobel'),
  aisha: person(4, 'Aisha Bello'),
  daniel: person(5, 'Daniel Okafor'),
  meiling: person(6, 'Mei-Ling Chow'),
  grace: person(7, 'Grace Whitlock'),
  samuel: person(8, 'Samuel Ortega'),
  ingrid: person(9, 'Ingrid Solberg'),
  hannah: person(10, 'Hannah Reyes'),
};

// ── history events (SPEC §2.3) ──────────────────────────────────────────────────────────────────────────────

const event = (issueKey, kind, field, from, to, when, actor, extra = {}) => ({
  issueKey, kind, field, from, to, at: when, actor, source: 'sample', ...extra,
});
export const status = (key, from, to, when, actor) => event(key, 'status', 'status', from, to, when, actor);
export const edit = (key, field, when, actor) => event(key, 'text', field, null, null, when, actor);
const assign = (key, from, to, when, actor) =>
  event(key, 'assignee', 'assignee', from ? from.id : null, to ? to.id : null, when, actor, { fromPerson: from, toPerson: to });
const born = (key, when, reporter, assignee) => [
  { ...status(key, null, 'todo', when, reporter), baseline: true },
  { ...assign(key, null, assignee, when, reporter), baseline: true },
];

/** A 2.4 story: created 2 Nov, criteria tidied 16 Nov, built by `dev` 9–20 Nov. */
const story = (key, dev) => [
  ...born(key, at('2026-11-02'), P.leo, dev),
  status(key, 'todo', 'in_progress', at('2026-11-09'), dev),
  edit(key, 'description', at('2026-11-16', '14:00'), P.leo),
  status(key, 'in_progress', 'done', at('2026-11-20', '17:00'), dev),
];

export const CLM8_EDIT = edit('CLM-8', 'description', at('2026-12-03', '15:40'), P.leo);
export const CLM24_REOPEN = status('CLM-24', 'done', 'in_progress', at('2026-12-04', '11:20'), P.meiling);

export const HISTORY = {
  'CLM-7': story('CLM-7', P.tomasz),
  'CLM-8': [...story('CLM-8', P.tomasz), CLM8_EDIT],
  'CLM-9': story('CLM-9', P.aisha),
  'CLM-10': story('CLM-10', P.aisha),
  'CLM-23': [
    ...born('CLM-23', at('2026-11-26', '10:50'), P.daniel, P.tomasz),
    status('CLM-23', 'todo', 'in_progress', at('2026-11-27'), P.tomasz),
    status('CLM-23', 'in_progress', 'done', at('2026-11-30', '16:00'), P.tomasz),
  ],
  'CLM-24': [
    ...born('CLM-24', at('2026-11-25', '10:30'), P.meiling, null),
    assign('CLM-24', null, P.samuel, at('2026-11-30', '08:30'), P.samuel),
    status('CLM-24', 'todo', 'in_progress', at('2026-11-30', '08:35'), P.samuel),
    status('CLM-24', 'in_progress', 'done', at('2026-12-01', '15:00'), P.samuel),
    CLM24_REOPEN,
  ],
};

// ── requirements, cases, defects ────────────────────────────────────────────────────────────────────────────

const CLM8_OLD = 'The new award applies from the date of the change.';
const CLM8_NEW = 'The new award applies from the Monday following the date of the change.';

export const REQUIREMENTS = [
  { key: 'CLM-7', summary: 'Claimant can upload supporting documents to an open claim', defectKeys: [],
    cases: [['CLM-11', 'Upload a 4 MB PDF to an open claim'], ['CLM-12', 'Upload of a 12 MB file or a .exe is refused with a clear message'], ['CLM-13', 'Uploaded document appears on the caseworker screen within one minute']] },
  { key: 'CLM-8', summary: 'Caseworker can record a change of circumstances and the weekly award is recalculated', defectKeys: ['CLM-23'],
    cases: [['CLM-14', 'Award is recalculated when household size changes'], ['CLM-15', 'A change dated in the past creates the correct arrears payment'], ['CLM-16', 'An audit note records who made the change and why']] },
  { key: 'CLM-9', summary: 'Claimant is notified by email and SMS when the claim status changes', defectKeys: ['CLM-24'],
    cases: [['CLM-17', 'Email is sent when the claim status changes'], ['CLM-18', 'SMS is sent when the claim status changes'], ['CLM-19', 'A claimant who opted out receives no email or SMS']] },
  { key: 'CLM-10', summary: 'Caseworker can set an overpayment recovery plan capped at 15% of the weekly award', defectKeys: [],
    cases: [['CLM-20', 'A recovery plan above 15% of the weekly award is refused'], ['CLM-21', 'Claimant can see the repayment schedule'], ['CLM-22', 'Caseworker can pause recovery for hardship']] },
].map((r) => ({ ...r, cases: r.cases.map(([key, summary]) => ({ key, summary })) }));

const requirementOf = (caseKey) => REQUIREMENTS.find((r) => r.cases.some((c) => c.key === caseKey));
const num = (key) => key.split('-')[1];

/** What the requirement said at a moment: only CLM-8 ever changed (3 Dec 15:40). */
export const requirementText = (key, when, history = HISTORY) => {
  const { summary } = REQUIREMENTS.find((r) => r.key === key);
  if (key !== 'CLM-8') return `${summary}\nAcceptance criteria for ${key}.`;
  const edited = (history[key] ?? []).some((e) => e === CLM8_EDIT && e.at <= when);
  return `${summary}\n${edited ? CLM8_NEW : CLM8_OLD}`;
};
const caseText = (c) => `${c.summary}\nSteps for ${c.key}.`;

// ── runs (DOMAIN §4.4) ──────────────────────────────────────────────────────────────────────────────────────

/** The fixture's stand-in for file bytes is the file name; the hash is a real SHA-256 of it. */
export const evidence = (caseKey, filename, id) => ({ attachmentId: String(id), filename, size: 20480, sha256: sha256Hex(filename) });

export const run = (id, caseKey, when, tester, build, result, filename, notes = '') => {
  const requirement = requirementOf(caseKey);
  const snapshot = { requirementText: requirementText(requirement.key, when), caseText: caseText(requirement.cases.find((c) => c.key === caseKey)) };
  return {
    id: String(id), projectKey: 'CLM', releaseId: '10002', caseKey, requirementKey: requirement.key, result, notes,
    build, environment: 'UAT', executedAt: when, executedBy: tester,
    evidence: [evidence(caseKey, filename, 9000 + Number(id))],
    snapshot: { ...snapshot, requirementTextHash: textHash(snapshot.requirementText), caseTextHash: textHash(snapshot.caseText) },
    sample: true,
  };
};

const RC1 = '2.4.0-rc1';
const RC2 = '2.4.0-rc2';
export const RUNS = [
  run(1, 'CLM-11', at('2026-11-24', '10:05'), P.daniel, RC1, 'passed', 'CLM-11-upload-pdf.png'),
  run(2, 'CLM-12', at('2026-11-24', '10:30'), P.daniel, RC1, 'passed', 'CLM-12-refused-message.png'),
  run(3, 'CLM-13', at('2026-11-24', '11:10'), P.daniel, RC1, 'passed', 'CLM-13-caseworker-view.png', 'Seen after 20 seconds'),
  run(4, 'CLM-17', at('2026-11-25', '09:40'), P.meiling, RC1, 'passed', 'CLM-17-email.png'),
  run(5, 'CLM-18', at('2026-11-25', '10:15'), P.meiling, RC1, 'failed', 'CLM-18-no-sms.png', 'No SMS for +prefix number; raised CLM-24'),
  run(6, 'CLM-19', at('2026-11-25', '11:00'), P.meiling, RC1, 'passed', 'CLM-19-opt-out.png'),
  run(7, 'CLM-14', at('2026-11-26', '09:50'), P.daniel, RC1, 'passed', 'CLM-14-recalc.png'),
  run(8, 'CLM-15', at('2026-11-26', '10:40'), P.daniel, RC1, 'failed', 'CLM-15-arrears-wrong.png', 'Arrears 0.04 short; raised CLM-23'),
  run(9, 'CLM-16', at('2026-11-26', '11:20'), P.daniel, RC1, 'passed', 'CLM-16-audit-note.png'),
  run(10, 'CLM-20', at('2026-11-27', '10:00'), P.meiling, RC1, 'passed', 'CLM-20-cap-refused.png'),
  run(11, 'CLM-21', at('2026-11-27', '10:45'), P.meiling, RC1, 'passed', 'CLM-21-schedule.png'),
  run(12, 'CLM-15', at('2026-12-02', '14:10'), P.daniel, RC2, 'passed', 'CLM-15-arrears-retest.png', 'Retest of CLM-23 fix'),
  run(13, 'CLM-18', at('2026-12-03', '10:20'), P.meiling, RC2, 'passed', 'CLM-18-sms-retest.png', 'Retest of CLM-24 fix, +prefix number only'),
  run(14, 'CLM-14', at('2026-12-04', '09:30'), P.daniel, RC2, 'passed', 'CLM-14-recalc-monday.png', 'Re-run against the edited CLM-8'),
];

// ── carried conditions of Record 1 (DOMAIN §4.6) ────────────────────────────────────────────────────────────

const condition = (id, text, owner, dueDate, stored, extra = {}) => ({
  id, projectKey: 'CLM', requestId: '1', recordId: '1', recordNumber: 1, releaseName: '2.3', text, owner, dueDate,
  covers: [], linkedIssue: null, status: stored, state: conditionState({ status: stored, dueDate }, NOW),
  metAt: null, metBy: null, sample: true, ...extra,
});
export const CARRIED = [
  condition('1', 'Fix CLM-5 and re-run CLM-3 by 16 Oct 2026.', P.tomasz, '2026-10-16', 'met',
    { covers: ['case:CLM-3:failed'], linkedIssue: 'CLM-5', metAt: at('2026-10-12', '15:00'), metBy: P.daniel }),
  condition('2', 'Deliver CLM-6, the override audit export, by 30 Nov 2026.', P.aisha, '2026-11-30', 'open', { linkedIssue: 'CLM-6' }),
];

// ── assembling a release the way a service would, from the pure rules ───────────────────────────────────────

const pick = (history, keys) => Object.fromEntries(keys.map((k) => [k, history[k] ?? []]));

const defectView = (key, summary, priority, history, linkedTo) => {
  const statuses = (history[key] ?? []).filter((e) => e.kind === 'status');
  const category = statuses.length ? statuses[statuses.length - 1].to : 'todo';
  const open = category !== 'done';
  const name = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[category];
  const blocking = open && PRIORITY_ORDER.indexOf(priority) <= PRIORITY_ORDER.indexOf(RULES.defectBlockPriority);
  return { key, summary, url: `/browse/${key}`, status: { name, category }, priority, open, blocking, linkedTo };
};

/**
 * @param {{now?: string, runs?: object[], history?: object, approver?: object|null, requester?: object|null,
 *          build?: string|null, rules?: object, requirements?: object[]}} [o]
 */
export const assemble = (o = {}) => {
  const now = o.now ?? NOW;
  const runs = o.runs ?? RUNS;
  const history = o.history ?? HISTORY;
  const rules = o.rules ?? RULES;
  const source = o.requirements ?? REQUIREMENTS;

  const requirements = source.map((r) => {
    const liveText = requirementText(r.key, now, history);
    const cases = r.cases.map((c) => {
      const mine = runs.filter((x) => x.caseKey === c.key);
      const latest = latestRun(mine);
      const reasons = latest === null ? [] : staleReasons({
        run: latest,
        requirementEvents: history[r.key] ?? [],
        caseEvents: history[c.key] ?? [],
        defectEvents: pick(history, r.defectKeys),
        criteriaField: null,
        currentBuild: o.build ?? null,
        buildSetAt: null,
        liveEvidence: null,
        live: { requirementText: liveText, caseText: caseText(c) },
        now,
      });
      const state = caseState(latest, reasons);
      return {
        id: `2${num(c.key)}`, key: c.key, summary: c.summary, url: `/browse/${c.key}`, requirementKey: r.key,
        textHash: textHash(caseText(c)), state, latestRun: latest, runCount: mine.length,
        staleReasons: state === CASE_STATE.PASSED_THEN_CHANGED ? reasons : [],
        notes: state === CASE_STATE.FAILED || state === CASE_STATE.BLOCKED ? reasons : [],
      };
    });
    return {
      id: `1${num(r.key)}`, key: r.key, summary: r.summary, url: `/browse/${r.key}`, type: 'Story',
      status: { name: 'Done', category: 'done' }, textHash: textHash(liveText), cases, state: requirementState(cases),
      defectKeys: r.defectKeys,
    };
  });

  const defects = [
    defectView('CLM-23', 'Arrears are rounded per week, not per period, so the claimant is underpaid by a few cents', 'High', history, ['CLM-8', 'CLM-15']),
    defectView('CLM-24', 'SMS is not sent when the phone number has a country prefix or spaces', 'Medium', history, ['CLM-9', 'CLM-18']),
  ];
  const duties = computeDuties({
    requirements: source.map((r) => ({ key: r.key, caseKeys: r.cases.map((c) => c.key), defectKeys: r.defectKeys })),
    history, runs, approver: o.approver ?? null, requester: o.requester ?? null, rules, now,
  });
  const cases = requirements.flatMap((r) => r.cases);
  return { now, rules, requirements, cases, defects, duties, counts: countStates(requirements), carried: CARRIED };
};

export const caseOf = (release, key) => release.cases.find((c) => c.key === key);

export const RELEASE_24 = {
  id: '10002', name: '2.4', projectKey: 'CLM', projectId: '10000', released: false, releaseDate: '2026-12-14',
  build: null, buildSetAt: null, buildSetBy: null,
};
export const request = (approver, extra = {}) => ({
  id: '2', projectKey: 'CLM', releaseId: '10002', releaseName: '2.4', requestedBy: P.priya, requestedAt: at('2026-12-08', '16:00'),
  approver, dueDate: '2026-12-18', note: '', state: 'open', taskKey: null, recordId: null, ...extra,
});
