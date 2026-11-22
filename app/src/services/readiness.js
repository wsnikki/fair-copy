// [D] Loads the facts of a release and runs the domain rules. Readiness tab.
// Contract: typedef `ServiceReadiness` in src/contract.js.
import {
  CASE_STATE,
  DEFAULT_SETTINGS,
  DUTY_CODE,
  ERROR,
  HISTORY_KIND,
  RELEASE_STATUS,
  RUN_RESULT,
  STALE_CODE,
  STATUS_CATEGORY,
} from '../contract.js';
import { AppError } from '../lib/result.js';
import { compareKeys, nowIso } from '../lib/format.js';
import { issuePath, releasesSetupPath } from '../lib/links.js';
import { BRAND } from '../lib/brand.js';
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import * as dataSettings from '../data/settings.js';
import * as dataCases from '../data/cases.js';
import * as dataRuns from '../data/runs.js';
import * as dataBuilds from '../data/builds.js';
import * as dataRequests from '../data/requests.js';
import * as dataRecords from '../data/records.js';
import * as dataConditions from '../data/conditions.js';
import * as dataWaivers from '../data/waivers.js';
import * as dataLedger from '../data/ledger.js';
import { getHistory } from '../history/provider.js';
import { caseState, countStates, latestRun, requirementState, verdict } from '../domain/caseState.js';
import { staleReasons } from '../domain/staleness.js';
import { carriedHeadline, decidedReleases, defaultReleaseId, shownCondition } from '../domain/carried.js';
import { computeDuties } from '../domain/duties.js';
import { applyCoverage, fitWaivers, openItems as domainOpenItems } from '../domain/signingRules.js';
import { textHash } from '../domain/seal.js';
import { appIssueKeys, defectBlocks, requirementIssues as requirementsOf, typeMatches } from '../domain/whatCounts.js';
import { permissionsOf } from './access.js';
import { listCarried } from './conditions.js';
import {
  caseText,
  loadReleases,
  need,
  personOf,
  projectPagePath,
  requireAccount,
  requirementText,
  resolvePeople,
  stateOf,
  toSummary,
  viewerOf,
} from './support.js';

/** @typedef {import('../contract.js').ServiceReadiness} Api */
/** @typedef {import('../contract.js').Ctx} Ctx */

const NO_RELEASES =
  `No releases yet. ${BRAND} accepts a Jira release (a fix version). Create one, or load the sample.`;
const TEXT_FIELDS = ['summary', 'description'];

// The key comes from Jira itself (getProject) or from services/access.cleanKey; the release id is forced to a number.
const jqlRelease = (projectKey, releaseId) => `project = "${projectKey}" AND fixVersion = ${Number(releaseId)} ORDER BY key ASC`;

/**
 * The exact step for a site where Confluence is not connected to the app (one installation serves both products).
 * Shown under the line "Records are kept in Jira. Connect Confluence later to also get a record page.", so it says
 * only the path, as Atlassian documents it.
 */
export const CONNECT_STEP =
  `A site administrator opens admin.atlassian.com, then Apps, Sites, this site, Connected apps, ${BRAND}, View app details, ` +
  `Connections, and chooses Connect next to Confluence. Then press "Publish the page" on the record.`;

/**
 * The release opened when none is named (domain/carried.defaultReleaseId): the earliest unreleased version that has
 * cases and still waits for a decision, else the earliest with cases, else the earliest unreleased, else null.
 * @param {string} projectKey
 * @param {import('../contract.js').Release[]} releases
 * @param {{records: import('../contract.js').AcceptanceRecord[], requests?: import('../contract.js').Request[]}} known
 */
const defaultRelease = async (projectKey, releases, { records, requests }) => {
  const unreleased = releases.filter((r) => !r.released);
  if (unreleased.length === 0) return null;
  if (unreleased.length === 1) return unreleased[0].id;
  const [cases, asked] = await Promise.all([
    dataCases.listCases(projectKey),
    requests ? Promise.resolve(requests) : dataRequests.listRequests(projectKey),
  ]);
  const issues = cases.length > 0 ? await jira.getIssues([...new Set(cases.flatMap((c) => [c.caseKey, c.requirementKey]))]) : [];
  return defaultReleaseId(releases, {
    withCases: new Set(issues.flatMap((i) => i.fixVersions.map((v) => String(v.id)))),
    decided: decidedReleases(records, asked),
  });
};

const confluenceInfo = async (settings, projectKey) => {
  let available = false;
  try {
    available = await confluence.isAvailable();
  } catch (err) {
    console.warn('confluence check failed', err?.message);
  }
  let spaceKey = settings.records.spaceKey;
  if (!spaceKey) spaceKey = (await dataSettings.getRecordsSpace(projectKey))?.spaceKey ?? null;
  return { available, spaceKey, connectStep: CONNECT_STEP };
};

/** A load is running when a checkpoint exists that is not finished. */
const sampleOf = (status) => ({ ...status, loading: !status.loaded && Boolean(status.projectKey) });

const permissionsFor = async (ctx, projectKey) => {
  const [inProject, onSite] = await Promise.all([
    projectKey ? permissionsOf(ctx, projectKey) : Promise.resolve(null),
    permissionsOf(ctx, null),
  ]);
  return {
    browse: Boolean(inProject?.browse),
    write: Boolean(inProject?.browse && inProject?.write),
    projectAdmin: Boolean(inProject?.projectAdmin),
    siteAdmin: Boolean(onSite.siteAdmin || inProject?.siteAdmin),
  };
};

/** @type {Api['getBootstrap']} A project the person may not browse is simply absent. */
export const getBootstrap = async (ctx) => {
  const viewer = await viewerOf(ctx);
  const permissions = await permissionsFor(ctx, ctx.projectKey);
  const project = ctx.projectKey && permissions.browse ? await jira.getProject(ctx.projectKey) : null;
  const [sample, settings] = await Promise.all([
    dataSettings.getSampleStatus(),
    project ? dataSettings.getSettings(project.key) : Promise.resolve(structuredClone(DEFAULT_SETTINGS)),
  ]);
  const [releases, records, conf] = await Promise.all([
    project ? loadReleases(project.key) : Promise.resolve([]),
    project ? dataRecords.listRecords(project.key) : Promise.resolve([]),
    confluenceInfo(settings, project?.key ?? null),
  ]);
  return {
    brand: BRAND,
    viewer,
    project,
    permissions,
    releases,
    releasesUrl: project ? releasesSetupPath(project) : null,
    defaultReleaseId: project ? await defaultRelease(project.key, releases, { records }) : null,
    sample: sampleOf(sample),
    sampleUrl: sample.projectKey ? projectPagePath(sample.projectKey) : null,
    confluence: conf,
    settings,
    recordCount: records.length,
  };
};

/**
 * The app's page outside any project (jira:globalPage): the first-run screen works on a site with no project at all.
 * Lists only projects the person may browse.
 */
export const getStart = async (ctx) => {
  const base = await getBootstrap({ ...ctx, projectKey: null, projectId: null });
  const keys = await dataRecords.listProjectKeys();
  if (base.sample.projectKey && !keys.includes(base.sample.projectKey) && base.sample.loaded) keys.push(base.sample.projectKey);
  const projects = [];
  for (const key of keys.slice(0, 30)) {
    if (!(await permissionsOf(ctx, key)).browse) continue;
    const project = await jira.getProject(key).catch(() => null);
    if (project) projects.push({ key: project.key, name: project.name, url: projectPagePath(project.key) });
  }
  return { ...base, projects };
};

/**
 * Changes the product-event trigger saw that the history does not carry yet → synthetic text events, so a pass goes
 * stale within seconds of an edit. The changelog stays the truth: an event the history already has is never doubled.
 */
const addSeenChanges = (history, changes, people, criteriaField) => {
  const textFields = criteriaField ? [...TEXT_FIELDS, criteriaField] : TEXT_FIELDS;
  for (const change of changes) {
    const fields = change.fields.filter((f) => textFields.includes(String(f).toLowerCase()) || f === criteriaField);
    if (fields.length === 0 || !change.actor) continue;
    const events = history[change.issueKey] ?? (history[change.issueKey] = []);
    const floor = new Date(Date.parse(change.changedAt) - 300000).toISOString();
    if (events.some((e) => e.kind === HISTORY_KIND.TEXT && !e.baseline && e.at >= floor)) continue;
    for (const field of fields) {
      events.push({
        issueKey: change.issueKey,
        kind: HISTORY_KIND.TEXT,
        field: field === criteriaField ? field : String(field).toLowerCase(),
        from: null,
        to: null,
        at: change.changedAt,
        actor: personOf(people, change.actor),
        source: 'jira',
      });
    }
    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }
};

/**
 * Everything about one release, plus the raw material other services need (not sent to the frontend).
 * @param {Ctx} ctx
 * @param {{projectKey: string, releaseId?: string|null, releaseName?: string|null, approverId?: string|null, requesterId?: string|null}} q
 * @returns {Promise<{readiness: import('../contract.js').Readiness, settings: import('../contract.js').Settings, issues: Record<string, import('../contract.js').Issue>, runs: import('../contract.js').Run[], carried: import('../contract.js').Condition[], draft: {conditions: import('../contract.js').Condition[], waivers: import('../contract.js').Waiver[]}, records: import('../contract.js').AcceptanceRecord[]}>}
 */
export const assembleRelease = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const now = nowIso();
  const [project, settings, viewer, releases, sampleStatus, records, projectTypes, sitePriorities, sealedConditions, allRequests] =
    await Promise.all([
      jira.getProject(projectKey),
      dataSettings.getSettings(projectKey),
      viewerOf(ctx),
      loadReleases(projectKey),
      dataSettings.getSampleStatus(),
      dataRecords.listRecords(projectKey),
      jira.listIssueTypes(projectKey).catch(() => []),
      jira.listPriorities(),
      dataConditions.listSealedConditions(projectKey),
      dataRequests.listRequests(projectKey),
    ]);
  if (!project) throw new AppError(ERROR.NOT_FOUND, NO_RELEASES);
  const wantedId = q.releaseId
    ? String(q.releaseId)
    : q.releaseName
      ? releases.find((r) => r.name === q.releaseName)?.id ?? ''
      : await defaultRelease(projectKey, releases, { records, requests: allRequests });
  const release = releases.find((r) => r.id === wantedId);
  if (!release) throw new AppError(ERROR.NOT_FOUND, NO_RELEASES);

  const criteriaField = settings.whatCounts.criteriaField;
  const issueOpts = { criteriaField };
  const [inRelease, caseRows, request] = await Promise.all([
    jira.searchIssues(jqlRelease(projectKey, release.id), issueOpts),
    dataCases.listCases(projectKey),
    dataRequests.getOpenRequest(projectKey, release.id),
  ]);
  /** @type {Record<string, import('../contract.js').Issue>} */
  const issues = Object.fromEntries(inRelease.map((i) => [i.key, i]));
  const caseRowByKey = new Map(caseRows.map((c) => [c.caseKey, c]));
  const { requirementTypes, defectTypes, requirementTypeIds, defectTypeIds } = settings.whatCounts;
  const isRequirementType = (i) => typeMatches(i, requirementTypes, requirementTypeIds, projectTypes);
  const isDefectType = (i) => typeMatches(i, defectTypes, defectTypeIds, projectTypes);

  // The one list of requirements (domain/whatCounts.requirementIssues): the app's own condition and sign-off issues
  // are never requirements, so they are in no count, no case list and no brief.
  const requirementIssues = requirementsOf(inRelease, {
    isRequirementType,
    caseKeys: caseRowByKey,
    own: appIssueKeys({ conditions: sealedConditions, requests: allRequests, records }),
  }).sort((a, b) => compareKeys(a.key, b.key));
  const requirementKeys = new Set(requirementIssues.map((i) => i.key));
  const releaseCases = caseRows.filter((c) => requirementKeys.has(c.requirementKey));

  // Cases outside the fix version and linked issues (defects may live in another release) are fetched once.
  const linkedKeys = [...requirementIssues, ...releaseCases.map((c) => issues[c.caseKey]).filter(Boolean)].flatMap((i) =>
    i.links.map((l) => l.key),
  );
  const missing = [...new Set([...releaseCases.map((c) => c.caseKey), ...linkedKeys])].filter((k) => !issues[k]);
  if (missing.length > 0) for (const i of await jira.getIssues(missing, issueOpts)) issues[i.key] = i;
  const caseLinks = releaseCases
    .map((c) => issues[c.caseKey])
    .filter(Boolean)
    .flatMap((i) => i.links.map((l) => l.key))
    .filter((k) => !issues[k]);
  if (caseLinks.length > 0) for (const i of await jira.getIssues([...new Set(caseLinks)], issueOpts)) issues[i.key] = i;

  const caseIssues = releaseCases.map((c) => issues[c.caseKey]).filter(Boolean);
  const caseKeys = caseIssues.map((i) => i.key);
  const isDefect = (key) => Boolean(issues[key]) && isDefectType(issues[key]) && !caseRowByKey.has(key);
  const defectsOf = (issue) => [...new Set(issue.links.map((l) => l.key).filter(isDefect))];

  /** @type {Record<string, string[]>} requirement key → defect keys (its own links and its cases' links) */
  const defectKeysByReq = {};
  /** @type {Record<string, string[]>} defect key → requirement / case keys */
  const linkedTo = {};
  const noteLink = (defectKey, key) => {
    (linkedTo[defectKey] ?? (linkedTo[defectKey] = [])).push(key);
  };
  for (const req of requirementIssues) {
    const own = defectsOf(req);
    own.forEach((d) => noteLink(d, req.key));
    const viaCases = caseIssues
      .filter((c) => caseRowByKey.get(c.key).requirementKey === req.key)
      .flatMap((c) => {
        const ds = defectsOf(c);
        ds.forEach((d) => noteLink(d, c.key));
        return ds;
      });
    defectKeysByReq[req.key] = [...new Set([...own, ...viaCases])].sort(compareKeys);
  }
  const defectKeys = [
    ...new Set([...Object.keys(linkedTo), ...inRelease.filter((i) => isDefect(i.key)).map((i) => i.key)]),
  ].sort(compareKeys);

  const historyIssues = [...requirementIssues, ...caseIssues, ...defectKeys.map((k) => issues[k])];
  const [runs, seen] = await Promise.all([
    caseKeys.length ? dataRuns.listRunsForCases(caseKeys) : Promise.resolve([]),
    historyIssues.length ? dataLedger.listIssueChanges(historyIssues.map((i) => i.key)) : Promise.resolve([]),
  ]);
  /** @type {Record<string, import('../contract.js').HistoryEvent[]>} */
  let history = {};
  let historyError = null;
  try {
    history = historyIssues.length ? await getHistory(historyIssues, { criteriaField }) : {};
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== ERROR.HISTORY_UNREADABLE) throw err;
    historyError = err.message;
  }
  for (const i of historyIssues) history[i.key] ??= [];
  if (seen.length > 0) {
    addSeenChanges(history, seen, await resolvePeople(seen.map((s) => s.actor)), criteriaField);
  }

  // Cases
  /** @type {Record<string, import('../contract.js').Run[]>} */
  const runsByCase = {};
  for (const run of runs) (runsByCase[run.caseKey] ?? (runsByCase[run.caseKey] = [])).push(run);
  const caseViews = caseIssues.map((issue) => {
    const requirementKey = caseRowByKey.get(issue.key).requirementKey;
    const req = issues[requirementKey];
    const own = runsByCase[issue.key] ?? [];
    const latest = latestRun(own);
    const text = caseText(issue);
    const reasons = latest
      ? staleReasons({
          run: latest,
          requirementEvents: history[requirementKey] ?? [],
          caseEvents: history[issue.key] ?? [],
          defectEvents: Object.fromEntries(
            [...new Set([...defectsOf(req), ...defectsOf(issue)])].map((k) => [k, history[k] ?? []]),
          ),
          criteriaField,
          currentBuild: release.build,
          buildSetAt: release.buildSetAt,
          // Presence only: hashing every file on every load is left to Verify (V4), so S6 fires for a missing file.
          liveEvidence: issue.attachments.map((a) => ({ attachmentId: a.id, filename: a.filename, size: a.size, sha256: null })),
          live: { requirementText: requirementText(req, criteriaField), caseText: text },
          now,
        }).map((reason) => ({ ...reason, url: issuePath(reason.issueKey) }))
      : [];
    const state = caseState(latest, latest && latest.result === RUN_RESULT.PASSED ? reasons : []);
    return {
      id: issue.id,
      key: issue.key,
      summary: issue.summary,
      url: issuePath(issue.key),
      requirementKey,
      textHash: textHash(text),
      state,
      latestRun: latest,
      runCount: own.length,
      staleReasons: state === CASE_STATE.PASSED_THEN_CHANGED ? reasons : [],
      notes: latest && latest.result !== RUN_RESULT.PASSED ? reasons : [],
    };
  });

  const requirements = requirementIssues.map((issue) => {
    const cases = caseViews.filter((c) => c.requirementKey === issue.key).sort((a, b) => compareKeys(a.key, b.key));
    return {
      id: issue.id,
      key: issue.key,
      summary: issue.summary,
      url: issuePath(issue.key),
      type: issue.type,
      status: issue.status,
      textHash: textHash(requirementText(issue, criteriaField)),
      cases,
      state: requirementState(cases),
      defectKeys: defectKeysByReq[issue.key],
    };
  });
  const counts = countStates(requirements);

  const defects = defectKeys.map((key) => {
    const issue = issues[key];
    const open = issue.status.category !== STATUS_CATEGORY.DONE;
    return {
      key,
      summary: issue.summary,
      url: issuePath(key),
      status: issue.status,
      priority: issue.priority,
      open,
      blocking: open && defectBlocks(issue, settings.rules, sitePriorities),
      linkedTo: [...new Set(linkedTo[key] ?? [])].sort(compareKeys),
    };
  });

  // Decision so far, and who is being asked
  const decidedRecord = [...records].reverse().find((r) => r.releaseId === release.id) ?? null;
  const decided = decidedRecord
    ? toSummary(decidedRecord, sealedConditions.filter((c) => c.recordId === decidedRecord.id), now)
    : null;

  const extraPeople = await resolvePeople([q.approverId, q.requesterId]);
  const approverNamed = Boolean(q.approverId || request);
  const approver = q.approverId ? personOf(extraPeople, q.approverId) : request ? request.approver : viewer;
  const requester = q.requesterId ? personOf(extraPeople, q.requesterId) : request ? request.requestedBy : null;
  const duties = computeDuties({
    requirements: requirements.map((r) => ({ key: r.key, caseKeys: r.cases.map((c) => c.key), defectKeys: r.defectKeys })),
    history,
    runs,
    approver,
    requester,
    rules: settings.rules,
    now,
  });

  // A met condition says how late it was met, and its Jira issue's status in words (domain/carried.shownCondition).
  const carriedGroups = (await listCarried(ctx, { projectKey, beforeNumber: decidedRecord ? decidedRecord.number : null })).map(
    (g) => ({ ...g, conditions: g.conditions.map((c) => shownCondition(c, now)) }),
  );
  const carried = carriedGroups.flatMap((g) => g.conditions);

  const stored = request
    ? await Promise.all([dataConditions.listDraftConditions(request.id), dataWaivers.listDraftWaivers(request.id)]).then(
        ([conditions, waivers]) => ({ conditions, waivers }),
      )
    : { conditions: [], waivers: [] };
  const open = domainOpenItems({ requirements, defects, conflicts: duties.conflicts, carried, rules: settings.rules });
  // A waiver for a person's conflict follows that conflict, also one written when there was a conflict per requirement.
  const draft = { conditions: stored.conditions, waivers: fitWaivers(stored.waivers, open) };
  const items = applyCoverage(open, draft.conditions, draft.waivers);

  // An open request newer than the last decision means the release is being judged again.
  const decidedForVerdict =
    decidedRecord && !request
      ? {
          outcome: decidedRecord.outcome,
          decidedByName: decidedRecord.decidedBy.name,
          decidedAt: decidedRecord.decidedAt,
          number: decidedRecord.number,
          conditionCount: decided.conditions.open + decided.conditions.met + decided.conditions.overdue,
          openConditionCount: decided.conditions.open + decided.conditions.overdue,
        }
      : null;
  const v = verdict({
    counts,
    totalCases: caseViews.length,
    // Until somebody is asked, a conflict about the approver is only a warning to the viewer: it alone does not make
    // the release "not ready". Once any conflict counts, the number said is the number of conflict lines under
    // "Who did what" that need a waiver (one per person and duty), which is also the count in the brief.
    blockingConflicts: duties.conflicts.some((c) => c.blocking && (approverNamed || c.code === DUTY_CODE.D3))
      ? duties.conflicts.filter((c) => c.blocking).length
      : 0,
    overdueConditions: settings.rules.overdueConditionBlocks
      ? carried.filter((c) => stateOf(c, now) === 'overdue').length
      : 0,
    request,
    decided: decidedForVerdict,
    now,
  });

  // Line 2 of Readiness and the top of the brief: what was promised last time, in the words it was signed with, and
  // whether it was kept. A condition of an older record that is still not met stays in the line (domain/carried.js).
  const overdue = carried.filter((c) => stateOf(c, now) === 'overdue');
  const promised = carriedHeadline(carriedGroups, now, viewer.id);
  const carriedLine = promised.line;
  const headline =
    v.usualSheet && (v.status === RELEASE_STATUS.NOT_READY || v.status === RELEASE_STATUS.AWAITING_DECISION) ? v.usualSheet : v.verdict;

  /** @type {import('../contract.js').Readiness} */
  const readiness = {
    project,
    release,
    releases,
    viewer,
    counts,
    totals: { requirements: requirements.length, cases: caseViews.length },
    status: v.status,
    headline,
    carriedLine,
    carriedOverdue: overdue.length,
    carriedOwn: promised.own,
    verdict: v.verdict,
    usualSheet: v.usualSheet,
    staleLines: requirements
      .flatMap((r) => r.cases)
      .filter((c) => c.staleReasons.length > 0)
      .map((c) => ({ caseKey: c.key, sentence: c.staleReasons[0].sentence })),
    requirements,
    defects,
    duties,
    approverNamed,
    carried: carriedGroups,
    openItems: items,
    request,
    decided,
    recordCount: records.length,
    sample: Boolean(sampleStatus.loaded) && sampleStatus.projectKey === projectKey,
    historyError,
    assembledAt: now,
  };
  return { readiness, settings, issues, runs, carried, draft, records };
};

/** @type {Api['getReadiness']} */
export const getReadiness = async (ctx, q) => (await assembleRelease(ctx, q)).readiness;

const MAX_BUILD = 64;

/** @type {Api['setBuild']} An empty build clears it. The comparison with runs ignores case (domain/staleness S5). */
export const setBuild = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const releaseId = need(q, 'releaseId');
  const build = typeof q.build === 'string' ? q.build.trim() : '';
  if (build.length > MAX_BUILD) throw new AppError(ERROR.INVALID, `A build name can be ${MAX_BUILD} characters at most.`, { field: 'build' });
  const accountId = requireAccount(ctx);
  if (!(await loadReleases(projectKey)).some((r) => r.id === String(releaseId))) throw new AppError(ERROR.NOT_FOUND, NO_RELEASES);
  const previous = (await dataBuilds.currentBuilds([releaseId]))[releaseId] ?? null;
  if (build === '') await dataBuilds.clearBuild(releaseId);
  else if (!previous || previous.build !== build) {
    await dataBuilds.addBuild({ projectKey, releaseId, build, setBy: accountId, setAt: nowIso() });
  }
  const { readiness } = await assembleRelease(ctx, { projectKey, releaseId });
  return {
    release: readiness.release.name,
    previousBuild: previous ? previous.build : null,
    build: build || null,
    nowStale: readiness.requirements
      .flatMap((r) => r.cases)
      .filter((c) => c.staleReasons.some((s) => s.code === STALE_CODE.S5))
      .map((c) => c.key),
  };
};
