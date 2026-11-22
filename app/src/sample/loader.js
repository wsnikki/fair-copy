// [C] "Load sample release" (DOMAIN §4, PRODUCT §4.7).
// Contract: typedef `SampleLoader` in src/contract.js.
//
// Idempotent and resumable. A checkpoint (SampleStatus with loaded:false, the project key and a `progress` step) is
// written as soon as the project exists. If the invocation is cut off (25 s limit), the next call finds the checkpoint
// and carries on: every step first looks at what is already there. If a step throws, everything is removed and the
// person is told (contract). A second call after a finished load answers "already loaded".
import {
  CASE_LABEL,
  CASE_STATE,
  DEFAULT_SETTINGS,
  ERROR,
  SAMPLE_PROJECT_KEY,
  SIGN_OFF_LABEL,
} from '../contract.js';
import { BRAND } from '../lib/brand.js';
import * as jira from '../clients/jira.js';
import { upsertCase } from '../data/cases.js';
import {
  attachConditionsToRecord,
  deleteConditionsOfProject,
  deleteDraftCondition,
  listDraftConditions,
  markConditionMet,
  saveCondition,
} from '../data/conditions.js';
import { deleteLedgerOfProject, insertLedgerEvents } from '../data/ledger.js';
import { releaseLock, takeLock } from '../data/locks.js';
import { upsertPeople } from '../data/people.js';
import { deleteRecordsOfProject, getRecord, insertRecord } from '../data/records.js';
import { closeRequest, deleteRequestsOfProject, getOpenRequest, getRequest, insertRequest } from '../data/requests.js';
import { deleteRunsOfProject, insertRun, listRunsForCases } from '../data/runs.js';
import { getSampleStatus, setSampleStatus } from '../data/settings.js';
import { deleteDraftWaiver, listDraftWaivers, saveWaiver } from '../data/waivers.js';
import { caseState, countStates, latestRun, requirementState } from '../domain/caseState.js';
import { computeDuties } from '../domain/duties.js';
import { ZERO_SEAL, buildPayload, sealPayload, textHash } from '../domain/seal.js';
import { openItems } from '../domain/signingRules.js';
import { staleReasons } from '../domain/staleness.js';
import { STANDARD_PRIORITY_ID, defectBlocks, pickIssueType } from '../domain/whatCounts.js';
import { dayOf, formatDay, nowIso } from '../lib/format.js';
import { absolute, issuePath } from '../lib/links.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { assembleRelease } from '../services/readiness.js';
import { publishPage } from '../services/records.js';
import { projectPagePath } from '../services/support.js';
import {
  DATASET,
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
} from './dataset.js';
import { EMPTY_SAMPLE_STATUS, removeSample } from './remover.js';
import { REFUSAL_PAUSE_MS, afterPhaseFailure, failureSentence, isJiraRefusal, worthAnotherTry } from './retry.js';

/** @typedef {import('../contract.js').SampleLoader} Api */

const ALREADY_LOADED = 'The sample release is already in this project.';
const LOADED_FLAG =
  'Sample release loaded. Priya Raman, the sample test lead, has asked you to decide on Release 2.4 and proposes a condition and a waiver. Open the brief.';
const LOCK = 'sample';
/** A lock older than this was left by a call Forge cut off at 25 s. */
const LOCK_STALE_SECONDS = 40;

/** The four steps the first-run screen shows (PRODUCT §4.7). Written to SampleStatus.progress while loading. */
export const SAMPLE_STEPS = Object.freeze([
  'Creating the ClaimPoint project with releases 2.3, 2.4 and 2.5',
  'Creating requirements, acceptance cases and defects, with runs and evidence files',
  'Writing Record 1 for release 2.3 and sealing it',
  'Adding your own history and the sign-off request addressed to you, with what the test lead proposes',
]);

/** CLM first; a suffix when CLM is taken or still in the trash. The real key is recorded in SampleStatus.projectKey. */
const CANDIDATE_KEYS = [SAMPLE_PROJECT_KEY, ...[2, 3, 4, 5].map((n) => `${SAMPLE_PROJECT_KEY}${n}`)];
// Writes to Jira go a few at a time: on a site created minutes ago Jira answered HTTP 500 (a cluster lock) to three
// of five status changes made side by side. Status changes go three at a time; links, case markers and evidence files
// (each on its own issue) six at a time. A refusal is repeated by the Jira client, and the phase runs again after that:
// the pools are kept this wide because the whole load is one wait for the person on their first click (67 s at 2 and 4).
const JIRA_CONCURRENCY = 6;
const TRANSITION_CONCURRENCY = 3;
/** The status changes of one call stop being started after this long; the phase then runs again in the next call. */
const TRANSITION_MS = 10000;
const SQL_CONCURRENCY = 8;

/** Runs `fn` over `items`, at most `limit` at a time, keeping the order of the results. */
const pool = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

const issueText = (issue, projectKey) => `${rekey(issue.summary, projectKey)}\n${rekey(issue.description, projectKey)}`;

// ───────────────────────────── step 1: project and versions ─────────────────────────────

const ensureProject = async (ctx, status) => {
  if (status.projectKey && status.projectId) {
    const existing = await jira.getProject(status.projectKey);
    if (existing && String(existing.id) === String(status.projectId)) {
      return { project: { id: String(existing.id), key: existing.key }, resumed: true };
    }
  }
  let lastError = null;
  for (const key of CANDIDATE_KEYS) {
    // A project with this key that the loader did not create is somebody's work: never touch it.
    if (await jira.getProject(key)) continue;
    try {
      const name = key === SAMPLE_PROJECT_KEY ? DATASET.project.name : `${DATASET.project.name} ${key.slice(SAMPLE_PROJECT_KEY.length)}`;
      const created = await jira.createProject({ key, name, leadAccountId: ctx.accountId });
      return { project: { id: String(created.id), key: created.key }, resumed: false };
    } catch (err) {
      lastError = err; // the key may sit in the trash: try the next one
    }
  }
  throw lastError ?? new AppError(ERROR.FAILED, 'No project key from CLM to CLM5 is free');
};

const ensureVersions = async (project, d0) => {
  const existing = await jira.listVersions(project.key);
  const versions = {};
  for (const wanted of DATASET.versions) {
    const found = existing.find((v) => v.name === wanted.name);
    const releaseDate = shiftDate(d0, wanted.releaseDay);
    const version =
      found ?? (await jira.createVersion({ projectId: project.id, name: wanted.name, released: wanted.released, releaseDate }));
    versions[wanted.name] = { id: String(version.id), name: wanted.name, released: wanted.released, releaseDate };
  }
  return versions;
};

// ───────────────────────────── step 2: issues, links, statuses, evidence ─────────────────────────────

/** Issue types and priorities are named by id: a site in another language has no "Story", "Bug" or "High". */
const newIssue = (issue, projectKey, naming) => ({
  projectKey,
  type: issue.type,
  typeId: pickIssueType(naming.types, [issue.type, 'Task']),
  summary: rekey(issue.summary, projectKey),
  description: rekey(issue.description, projectKey),
  fixVersion: issue.version,
  labels: issue.role === 'case' ? [CASE_LABEL] : [],
  priority: null,
  priorityId: naming.withPriority && issue.priority ? naming.priorityIds[issue.priority] ?? null : null,
  assigneeId: null,
});

/** The stock priority ids that exist on this site (name → id), else a priority of the same name. */
const priorityIdsOf = (sitePriorities) =>
  Object.fromEntries(
    Object.entries(STANDARD_PRIORITY_ID)
      .map(([name, id]) => [name, sitePriorities.find((p) => p.id === id)?.id ?? sitePriorities.find((p) => p.name === name)?.id ?? null])
      .filter(([, id]) => id),
  );

/** Creates the issues that are missing, in dataset order, and returns key → {id, live} (live = the Issue found on a resume). */
const ensureIssues = async (project, resumed) => {
  const key = project.key;
  const keys = DATASET.issues.map((i) => issueKey(i.ref, key));
  const found = resumed ? await jira.getIssues(keys) : [];
  const live = Object.fromEntries(found.map((i) => [i.key, i]));
  const have = keys.filter((k) => live[k]).length;
  if (keys.slice(0, have).some((k) => !live[k])) {
    throw new AppError(ERROR.FAILED, 'the sample project has gaps in its issues');
  }
  const ids = Object.fromEntries(found.map((i) => [i.key, String(i.id)]));
  const missing = DATASET.issues.slice(have);
  if (missing.length > 0) {
    let created;
    const naming = {
      types: await jira.listIssueTypes(key).catch(() => []),
      priorityIds: priorityIdsOf(await jira.listPriorities()),
      withPriority: true,
    };
    try {
      created = await jira.createIssues(missing.map((i) => newIssue(i, key, naming)));
    } catch (err) {
      // A project whose issue types have no Priority field refuses the whole call. Try once more without it, but only
      // when nothing was created: a half-made batch would shift the keys.
      const after = await jira.getIssues(keys.slice(have));
      if (after.length > 0) throw err;
      created = await jira.createIssues(missing.map((i) => newIssue(i, key, { ...naming, withPriority: false })));
    }
    created.forEach((c, index) => {
      const expected = keys[have + index];
      if (c.key !== expected) throw new AppError(ERROR.FAILED, `Jira gave ${c.key} where ${expected} was expected`);
      ids[c.key] = String(c.id);
    });
  }
  return { keys, ids, live };
};

const evidenceFilename = (run, projectKey) => rekey(run.file, projectKey);

/**
 * One evidence file per run that names one. The hash is read back from Jira (hashAttachment), never worked out here;
 * null = "not captured". When the upload is not possible the run simply has no evidence row.
 * @returns {Promise<import('../contract.js').Evidence[]>}
 */
const ensureEvidence = async (run, d0, projectKey, live) => {
  if (!run.file) return [];
  const caseKey = issueKey(run.caseRef, projectKey);
  const filename = evidenceFilename(run, projectKey);
  let attachment = live[caseKey]?.attachments?.find((a) => a.filename === filename) ?? null;
  if (!attachment) {
    try {
      attachment = await jira.addAttachment(caseKey, filename, evidenceLog(run, d0, projectKey), 'text/plain');
    } catch (err) {
      if (isJiraRefusal(err)) throw err; // the phase runs again and attaches only what is missing
      console.warn(`sample loader: ${filename} could not be attached`, err);
    }
  }
  if (!attachment) return [];
  let sha256 = null;
  try {
    sha256 = await jira.hashAttachment(attachment.id);
  } catch (err) {
    console.warn(`sample loader: ${filename} could not be hashed`, err);
  }
  return [{ attachmentId: String(attachment.id), filename: attachment.filename, size: attachment.size, sha256 }];
};

/** One evidence file per run that names one, side by side. Returns run id → Evidence[]. */
const attachEvidence = async (project, d0, live) => {
  const evidence = {};
  await pool(DATASET.runs, JIRA_CONCURRENCY, async (run) => {
    evidence[run.id] = await ensureEvidence(run, d0, project.key, live);
  });
  return evidence;
};

/**
 * Runs every job, at most `limit` at a time, and lets each one finish before the first failure is thrown: a call still
 * on its way when the function answers would be cut off, and what did work need not be done again. A job is not
 * started after `deadline` (a time in ms); the answer is how many were left out.
 */
const runAll = async (jobs, limit, deadline = Infinity) => {
  let failed = null;
  let left = 0;
  await pool(jobs, limit, async (job) => {
    if (Date.now() >= deadline) {
      left += 1;
      return;
    }
    try {
      await job();
    } catch (err) {
      failed ??= err;
    }
  });
  if (failed) throw failed;
  return left;
};

/** Links and case markers. A link that is there is not made again; a marker is simply set again. */
const linkIssues = async (project, live, linkType) => {
  const key = project.key;
  const jobs = [];
  for (const issue of DATASET.issues) {
    const own = issueKey(issue.ref, key);
    const now = live[own];
    if (linkType) {
      for (const link of issue.links) {
        const other = issueKey(link.to, key);
        if (now?.links?.some((l) => l.key === other)) continue;
        jobs.push(() => jira.linkIssues({ type: linkType, inwardKey: own, outwardKey: other }));
      }
    }
    if (issue.role === 'case') {
      jobs.push(() => jira.setCaseProperty(own, { case: true, requirementKey: issueKey(issue.tests, key) }));
    }
  }
  await runAll(jobs, JIRA_CONCURRENCY);
};

/**
 * Statuses, two at a time. Only issues that are not yet where the dataset has them are moved, so a second run carries
 * on. Answers true when time ran out before every issue was moved.
 */
const moveIssues = async (project, live, deadline) => {
  const key = project.key;
  const jobs = [];
  for (const issue of DATASET.issues) {
    const own = issueKey(issue.ref, key);
    // CLM-24 is left for step 4: the installing person moves it, so the history is theirs.
    const current = live[own]?.status?.category ?? 'todo';
    if (issue.ref !== USER_ISSUE_REF && issue.status !== current) {
      jobs.push(async () => {
        const moved = await jira.transitionTo(own, issue.status);
        if (!moved) console.warn(`sample loader: ${own} could not be moved to ${issue.status}`);
      });
    }
  }
  return (await runAll(jobs, TRANSITION_CONCURRENCY, deadline)) > 0;
};

// ───────────────────────────── step 2: app rows ─────────────────────────────

const storeCases = async (project, d0, ids) => {
  const cases = DATASET.issues.filter((i) => i.role === 'case');
  await pool(cases, SQL_CONCURRENCY, (issue) => {
    const createdRow = DATASET.ledger.find((row) => row.ref === issue.ref);
    return upsertCase({
      caseKey: issueKey(issue.ref, project.key),
      caseId: ids[issueKey(issue.ref, project.key)],
      projectKey: project.key,
      requirementKey: issueKey(issue.tests, project.key),
      markedBy: createdRow.actor,
      markedAt: shiftTime(d0, createdRow.day, createdRow.time),
      sample: true,
    });
  });
};

const storeRuns = async (project, d0, versions, evidence) => {
  const key = project.key;
  const byRef = Object.fromEntries(DATASET.issues.map((i) => [i.ref, i]));
  await pool(DATASET.runs, SQL_CONCURRENCY, (run) => {
    const testCase = byRef[run.caseRef];
    const requirement = byRef[testCase.tests];
    const requirementText = run.requirementText ? rekey(run.requirementText, key) : issueText(requirement, key);
    const caseText = issueText(testCase, key);
    return insertRun({
      projectKey: key,
      releaseId: versions[testCase.version].id,
      caseKey: issueKey(run.caseRef, key),
      requirementKey: issueKey(testCase.tests, key),
      result: run.result,
      notes: rekey(run.note, key),
      build: run.build,
      environment: run.environment,
      executedAt: shiftTime(d0, run.day, run.time),
      executedBy: run.tester,
      evidence: evidence[run.id] ?? [],
      snapshot: {
        requirementText,
        requirementTextHash: textHash(requirementText),
        caseText,
        caseTextHash: textHash(caseText),
      },
      sample: true,
    });
  });
};

// ───────────────────────────── step 3: Record 1 ─────────────────────────────

/**
 * Record 1 as it stood on the day it was signed: only the runs and the history up to that moment go in. Built with the
 * same domain functions the live brief uses, sealed with domain/seal.
 * @returns {Promise<string>} the record id
 */
const sealRecordOne = async (ctx, project, d0, ids, versions) => {
  const key = project.key;
  const k = (ref) => issueKey(ref, key);
  const r1 = rekeyDeep(DATASET.record1, key);
  const decidedAt = shiftTime(d0, r1.day, r1.time);
  const people = samplePeople();
  const rules = DEFAULT_SETTINGS.rules;
  const version = versions[r1.release];

  const events = ledgerEvents(d0, key).filter((e) => e.at <= decidedAt);
  const historyOf = (issue) => events.filter((e) => e.issueKey === issue);
  const statusAt = (issue) => {
    const last = historyOf(issue).filter((e) => e.kind === 'status').pop();
    return { name: last?.toText ?? 'To Do', category: last?.to ?? 'todo' };
  };

  const inRelease = DATASET.issues.filter((i) => i.version === r1.release);
  const requirements = inRelease.filter((i) => i.role === 'requirement');
  const cases = inRelease.filter((i) => i.role === 'case');
  const defects = inRelease.filter((i) => i.role === 'defect');
  const runs = (await listRunsForCases(cases.map((c) => k(c.ref)))).filter((r) => r.executedAt <= decidedAt);
  const defectsOf = (refs) => defects.filter((d) => d.links.some((l) => refs.includes(l.to)));

  const requirementViews = requirements.map((req) => {
    const reqKey = k(req.ref);
    const requirementText = issueText(req, key);
    const caseViews = cases
      .filter((c) => c.tests === req.ref)
      .map((c) => {
        const caseKey = k(c.ref);
        const caseText = issueText(c, key);
        const caseRuns = runs.filter((r) => r.caseKey === caseKey);
        const latest = latestRun(caseRuns);
        const reasons = latest
          ? staleReasons({
              run: latest,
              requirementEvents: historyOf(reqKey),
              caseEvents: historyOf(caseKey),
              defectEvents: Object.fromEntries(defectsOf([req.ref, c.ref]).map((d) => [k(d.ref), historyOf(k(d.ref))])),
              criteriaField: null,
              currentBuild: null,
              buildSetAt: null,
              liveEvidence: null,
              live: { requirementText, caseText },
              now: decidedAt,
            })
          : [];
        const state = caseState(latest, reasons);
        return {
          id: ids[caseKey],
          key: caseKey,
          summary: rekey(c.summary, key),
          url: issuePath(caseKey),
          requirementKey: reqKey,
          textHash: textHash(caseText),
          state,
          latestRun: latest,
          runCount: caseRuns.length,
          staleReasons: state === CASE_STATE.PASSED_THEN_CHANGED ? reasons : [],
          notes: latest && latest.result !== 'passed' ? reasons : [],
        };
      });
    const refs = [req.ref, ...cases.filter((c) => c.tests === req.ref).map((c) => c.ref)];
    return {
      id: ids[reqKey],
      key: reqKey,
      summary: rekey(req.summary, key),
      url: issuePath(reqKey),
      type: req.type,
      status: statusAt(reqKey),
      textHash: textHash(requirementText),
      cases: caseViews,
      state: requirementState(caseViews),
      defectKeys: defectsOf(refs).map((d) => k(d.ref)),
    };
  });

  const defectViews = defects.map((d) => {
    const status = statusAt(k(d.ref));
    const open = status.category !== 'done';
    return {
      key: k(d.ref),
      summary: rekey(d.summary, key),
      url: issuePath(k(d.ref)),
      status,
      priority: d.priority,
      open,
      blocking: open && defectBlocks({ priority: d.priority }, rules, null),
      linkedTo: d.links.map((l) => k(l.to)),
    };
  });

  const approver = people[r1.approver];
  const duties = computeDuties({
    requirements: requirementViews.map((r) => ({ key: r.key, caseKeys: r.cases.map((c) => c.key), defectKeys: r.defectKeys })),
    history: Object.fromEntries(
      [...requirementViews.map((r) => r.key), ...defectViews.map((d) => d.key)].map((issue) => [issue, historyOf(issue)]),
    ),
    runs,
    approver,
    requester: people[r1.requestedBy],
    rules,
    now: decidedAt,
  });
  const items = openItems({ requirements: requirementViews, defects: defectViews, conflicts: duties.conflicts, carried: [], rules });

  const releaseDate = shiftDate(d0, r1.day);
  const requestId = await insertRequest({
    projectKey: key,
    releaseId: version.id,
    releaseName: version.name,
    requestedBy: r1.requestedBy,
    requestedAt: shiftTime(d0, r1.day, '09:00:00'),
    approver: r1.approver,
    dueDate: releaseDate,
    note: '',
    taskKey: null,
    sample: true,
  });

  // A condition covers the open items it names: "Fix CLM-5 and re-run CLM-3" covers the failed case CLM-3 (and CLM-5
  // when it blocks).
  const conditionIds = [];
  for (const condition of r1.conditions) {
    const text = conditionText(condition, d0, key);
    const named = text.match(/[A-Z][A-Z0-9]*-\d+/g) ?? [];
    conditionIds.push(
      await saveCondition({
        projectKey: key,
        requestId,
        text,
        owner: condition.owner,
        dueDate: shiftDate(d0, condition.dueDay),
        covers: items.filter((item) => item.needs === 'condition' && named.includes(item.item)).map((item) => item.id),
        linkedIssue: condition.linkedRef === null ? null : k(condition.linkedRef),
        sample: true,
      }),
    );
  }

  const payload = buildPayload({
    site: ctx.cloudId,
    project,
    release: {
      id: version.id,
      name: version.name,
      projectKey: key,
      projectId: project.id,
      released: version.released,
      releaseDate: version.releaseDate,
      build: null,
      buildSetAt: null,
      buildSetBy: null,
    },
    recordNumber: 1,
    request: await getRequest(requestId),
    decision: { outcome: r1.outcome, statement: rekey(r1.statement, key), decidedBy: approver, decidedAt },
    counts: countStates(requirementViews),
    requirements: requirementViews,
    defects: defectViews,
    duties,
    conditions: await listDraftConditions(requestId),
    waivers: [],
    carried: [],
    rules,
    prevSeal: ZERO_SEAL,
  });
  const { seal, json } = sealPayload(payload);
  const recordId = await insertRecord({
    projectKey: key,
    number: 1,
    releaseId: version.id,
    releaseName: version.name,
    outcome: r1.outcome,
    decidedBy: r1.approver,
    decidedAt,
    seal,
    prevSeal: ZERO_SEAL,
    payloadJson: json,
    sample: true,
  });
  await attachConditionsToRecord(requestId, { recordId, recordNumber: 1, releaseName: version.name });
  await closeRequest(requestId, { state: 'decided', recordId, closedAt: decidedAt });
  for (const [index, condition] of r1.conditions.entries()) {
    if (condition.met) {
      await markConditionMet(conditionIds[index], {
        metAt: shiftTime(d0, condition.met.day, '12:00:00'),
        metBy: condition.met.by,
        note: condition.met.note ?? null,
      });
    }
  }
  return recordId;
};

// ───────────────────────────── step 4: your own history ─────────────────────────────

/** CLM-24: the defect the installing person takes and moves to In Progress under their own name. */
const USER_ISSUE_REF = 24;

/** @param {(err: unknown) => boolean} again   true = Jira refused just now and the phase should run once more */
const addOwnHistory = async (ctx, project, live, again) => {
  const key = issueKey(USER_ISSUE_REF, project.key);
  const now = live[key];
  const assigned = now?.assignee?.id === ctx.accountId;
  const moved = now?.status?.category === 'in_progress';
  try {
    if (!assigned) await jira.updateIssue(key, { assigneeId: ctx.accountId }, { asUser: true });
    if (!moved) await jira.transitionTo(key, 'in_progress', { asUser: true });
  } catch (err) {
    // Jira refusing just now (5xx) is not "this person may not": the phase runs again, so the history stays theirs.
    if (again(err)) throw err;
    // Without the person's own calls there is no conflict about them, but the release still reads as DOMAIN §4:
    // CLM-24 is open and In Progress. The app's own move is never counted as anybody's work.
    console.warn(`sample loader: ${key} could not be moved as the user`, err);
    if (!moved) await jira.transitionTo(key, 'in_progress');
  }
};

// ───────────────────────────── the loader ─────────────────────────────
//
// A whole load is about 35 seconds of Jira, SQL and Confluence calls, and Forge stops a function at 25. So the load is
// cut into phases. One invocation runs as many phases as fit in BUDGET_MS, writes the checkpoint (SampleStatus with
// `phase` = phases finished) and answers `pending: true`; the frontend calls again until `pending` is false.
// Every phase may be run twice: it first looks at what is already there, or clears its own rows and writes them again.

/** A new phase is started only this long after the invocation began; the slowest phase needs about 10 s. */
const BUDGET_MS = 9000;

const liveIssues = async (keys) => Object.fromEntries((await jira.getIssues(keys)).map((i) => [i.key, i]));
const projectOf = (status) => ({ id: status.projectId, key: status.projectKey });

/** @type {{step: number, run: (ctx: any, status: any) => Promise<object|void>}[]} step = which of SAMPLE_STEPS is shown */
const PHASES = [
  {
    step: 1, // releases
    run: async (ctx, status) => {
      const versions = await ensureVersions(projectOf(status), status.d0);
      return { versions, versionIds: Object.values(versions).map((v) => v.id) };
    },
  },
  {
    step: 2, // issues
    run: async (ctx, status) => {
      const { keys, ids } = await ensureIssues(projectOf(status), true);
      return { issueKeys: keys, issueIds: ids };
    },
  },
  {
    step: 2, // links and case markers
    run: async (ctx, status) => {
      const [live, linkTypes] = await Promise.all([liveIssues(status.issueKeys), jira.listLinkTypes()]);
      const linkType = linkTypes.includes('Relates') ? 'Relates' : (linkTypes[0] ?? null);
      await linkIssues(projectOf(status), live, linkType);
    },
  },
  {
    step: 2, // statuses; `again` = not every issue was moved in time, so the phase runs once more in the next call
    run: async (ctx, status) => {
      const deadline = Date.now() + TRANSITION_MS;
      const again = await moveIssues(projectOf(status), await liveIssues(status.issueKeys), deadline);
      return { again };
    },
  },
  {
    step: 2, // evidence files and the app's own rows
    run: async (ctx, status) => {
      const project = projectOf(status);
      const live = await liveIssues(status.issueKeys);
      // Rows of an attempt that was cut off: start them again rather than guess what is complete.
      await deleteRunsOfProject(project.key);
      await deleteLedgerOfProject(project.key);
      const [evidence] = await Promise.all([
        attachEvidence(project, status.d0, live),
        (async () => {
          await upsertPeople([
            ...DATASET.people.map((p) => ({ id: p.id, name: p.name, kind: 'sample', title: p.title })),
            status.loadedBy,
          ]);
          await storeCases(project, status.d0, status.issueIds);
          await insertLedgerEvents(project.key, ledgerEvents(status.d0, project.key));
        })(),
      ]);
      await storeRuns(project, status.d0, status.versions, evidence);
    },
  },
  {
    step: 3, // Record 1
    run: async (ctx, status) => {
      const project = projectOf(status);
      await deleteConditionsOfProject(project.key);
      await deleteRecordsOfProject(project.key);
      await deleteRequestsOfProject(project.key);
      const recordId = await sealRecordOne(ctx, project, status.d0, status.issueIds, status.versions);
      return { recordIds: [recordId] };
    },
  },
  {
    step: 3, // its Confluence page
    run: async (ctx, status) => {
      const [recordId] = status.recordIds;
      let pageId = (await getRecord(recordId))?.pageId ?? null;
      if (!pageId) {
        try {
          await publishPage(ctx, { recordId }); // a page that cannot be written never undoes the seal
          pageId = (await getRecord(recordId))?.pageId ?? null;
        } catch (err) {
          console.warn('sample loader: the page of Record 1 was not published', err);
        }
      }
      return { pageIds: pageId ? [pageId] : [] };
    },
  },
  {
    step: 4, // your own history
    run: async (ctx, status) => {
      const key = issueKey(USER_ISSUE_REF, status.projectKey);
      const again = (err) => worthAnotherTry(status.tries, status.phase, err);
      await addOwnHistory(ctx, projectOf(status), { [key]: await jira.getIssue(key) }, again);
    },
  },
  {
    step: 4, // the sign-off request: the sample's test lead asks the installing person to decide on 2.4
    run: async (ctx, status) => {
      const key = status.projectKey;
      const ask = rekeyDeep(DATASET.request, key);
      const version = status.versions[ask.release];
      if (await getOpenRequest(key, version.id)) return;
      const dueDate = shiftDate(status.d0, ask.dueDay);
      let taskKey = null;
      try {
        const [task] = await jira.createIssues([
          {
            projectKey: key,
            type: 'Task',
            typeId: pickIssueType(await jira.listIssueTypes(key).catch(() => []), ['Task']),
            summary: `Decide on Release ${version.name} of ${DATASET.project.name} by ${formatDay(dueDate, null, true)}`,
            description: `You are asked to accept Release ${version.name} of ${DATASET.project.name}. Open the ${BRAND} tab of the project and read the brief.\n\n${ask.note}\n\nSample data: the person asking is fictional.`,
            fixVersion: null,
            labels: [SIGN_OFF_LABEL],
            assigneeId: ctx.accountId,
          },
        ]);
        taskKey = task?.key ?? null;
      } catch (err) {
        if (worthAnotherTry(status.tries, status.phase, err)) throw err; // refused just now: the phase runs again
        console.warn('sample loader: the sign-off task was not created', err);
      }
      await insertRequest({
        projectKey: key,
        releaseId: version.id,
        releaseName: version.name,
        requestedBy: ask.requestedBy,
        requestedAt: shiftTime(status.d0, ask.day, ask.time),
        approver: ctx.accountId,
        dueDate,
        note: ask.note,
        taskKey,
        sample: true,
      });
    },
  },
  {
    step: 4, // what the test lead proposes with the request: one draft condition and one draft waiver
    run: async (ctx, status) => {
      const key = status.projectKey;
      const ask = DATASET.request;
      const version = status.versions[ask.release];
      try {
        const request = await getOpenRequest(key, version.id);
        if (!request || !request.sample) return;
        // Drafts of an attempt that was cut off go first, so a second run of this phase never doubles them.
        for (const c of await listDraftConditions(request.id)) await deleteDraftCondition(c.id);
        for (const w of await listDraftWaivers(request.id)) await deleteDraftWaiver(w.id);
        // The ids of the open items are the brief's own: the conflict is about the person who loads the sample, and
        // exists only when Jira's history really shows them holding CLM-24.
        const { readiness } = await assembleRelease(ctx, { projectKey: key, releaseId: version.id });
        const { condition, waiver } = sampleDrafts(readiness.openItems, status.d0, key);
        if (condition) {
          // No linked issue: the condition gets its own Jira issue, in the next release, once the decision is sealed.
          await saveCondition({ projectKey: key, requestId: request.id, ...condition, linkedIssue: null, sample: true });
        }
        if (waiver) {
          await saveWaiver({
            projectKey: key,
            requestId: request.id,
            ...waiver,
            authorisedByName: null,
            reference: '',
            recordedAt: request.requestedAt,
            selfRecorded: false,
          });
        }
      } catch (err) {
        if (worthAnotherTry(status.tries, status.phase, err)) throw err; // refused just now: the phase runs again
        // Without the drafts the approver adds a condition and a waiver by hand: the sample is still whole.
        console.warn('sample loader: the proposed condition and waiver were not added', err);
      }
    },
  },
];

const progressOf = (phase) => {
  const step = PHASES[Math.min(phase, PHASES.length - 1)].step;
  return { step, of: SAMPLE_STEPS.length, label: SAMPLE_STEPS[step - 1] };
};

/** The project comes first: nothing can be checkpointed, or cleaned up, before it is known. */
const begin = async (ctx, previous) => {
  const me = await jira.getMyself();
  const { project, resumed } = await ensureProject(ctx, previous);
  const status = {
    ...EMPTY_SAMPLE_STATUS,
    ...(resumed ? previous : {}),
    projectKey: project.key,
    projectId: project.id,
    loadedBy: me,
    d0: (resumed && previous.d0) || dayOf(nowIso()),
    phase: resumed ? (previous.phase ?? 0) : 0,
  };
  status.progress = progressOf(status.phase);
  await setSampleStatus({ ...status });
  return status;
};

const load = async (ctx, previous) => {
  const started = Date.now();
  const status = previous.projectKey && previous.loadedBy ? { ...previous } : await begin(ctx, previous);
  status.phase = status.phase ?? 0;

  console.log(`sample loader: ready for phase ${status.phase} after ${Date.now() - started} ms`);
  while (status.phase < PHASES.length && Date.now() - started < BUDGET_MS) {
    const phaseStarted = Date.now();
    let result;
    try {
      result = await PHASES[status.phase].run(ctx, status);
    } catch (err) {
      // Jira refusing a write (5xx) is not the end: the phase may run twice, so the next call tries it again. The load
      // is given up only when the same phase was refused three times, or for any other failure (./retry.js).
      const { tries, giveUp } = afterPhaseFailure(status.tries, status.phase, err);
      if (giveUp) throw err;
      console.warn(`sample loader: phase ${status.phase} was refused by Jira (try ${tries.count}), it will run again`, err?.details ?? err);
      status.tries = tries;
      await setSampleStatus({ ...status });
      await new Promise((resolve) => setTimeout(resolve, REFUSAL_PAUSE_MS));
      break;
    }
    const { again, ...found } = result ?? {};
    Object.assign(status, found);
    console.log(`sample loader: phase ${status.phase} took ${Date.now() - phaseStarted} ms${again ? ', not finished' : ''}`);
    if (again) break;
    status.phase += 1;
    status.progress = progressOf(status.phase);
    await setSampleStatus({ ...status });
  }
  if (status.phase < PHASES.length) {
    return { pending: true, projectKey: status.projectKey, projectId: status.projectId, progress: status.progress };
  }

  const { progress, phase, versions, issueIds, tries, ...kept } = status;
  await setSampleStatus({ ...kept, loaded: true, loadedAt: nowIso() });
  return {
    pending: false,
    projectKey: status.projectKey,
    projectId: status.projectId,
    releaseId: versions[DATASET.versions.find((v) => !v.released).name].id,
    url: absolute(ctx.siteUrl, projectPagePath(status.projectKey)),
    issues: status.issueKeys.length,
    flag: LOADED_FLAG,
  };
};

/** @type {Api['loadSample']} */
export const loadSample = async (ctx) => {
  if (!ctx?.accountId) throw new AppError(ERROR.FAILED, GENERIC_ERROR);
  const previous = await getSampleStatus();
  if (previous.loaded) throw new AppError(ERROR.SAMPLE_LOADED, ALREADY_LOADED);
  // One loader at a time, across tabs and people: a second call while one runs only reports the progress. Without
  // this, two first clicks each created a project and one of them was orphaned.
  const holder = `${ctx.accountId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  if (!(await takeLock(LOCK, holder, LOCK_STALE_SECONDS))) {
    return {
      pending: true,
      projectKey: previous.projectKey,
      projectId: previous.projectId,
      progress: previous.progress ?? { step: 1, of: SAMPLE_STEPS.length, label: SAMPLE_STEPS[0] },
    };
  }
  try {
    // Read again inside the lock: the call that held it may just have finished or moved on.
    const current = await getSampleStatus();
    if (current.loaded) throw new AppError(ERROR.SAMPLE_LOADED, ALREADY_LOADED);
    return await load(ctx, current);
  } catch (err) {
    if (err instanceof AppError && err.code === ERROR.SAMPLE_LOADED) throw err;
    // The raw answer of Jira (it can be JSON with an SQL statement) is for the log only, never for the person.
    console.error('sample loader failed', err, err?.details ?? '');
    let removed = true;
    try {
      await removeSample(ctx);
    } catch (cleanupError) {
      removed = false;
      console.error('sample loader: clean-up failed', cleanupError);
    }
    throw new AppError(ERROR.SAMPLE_FAILED, failureSentence(err, removed));
  } finally {
    await releaseLock(LOCK, holder);
  }
};
