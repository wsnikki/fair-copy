// [D] Issue panel: what an issue is to acceptance, mark / add a case, record a run.
// Contract: typedef `ServiceCases` in src/contract.js.
import { CASE_LABEL, CASE_STATE, CASE_STATE_LOZENGE, ERROR, EVIDENCE_HASH_MAX_BYTES, RUN_RESULT } from '../contract.js';
import { isAppIssue, requirementIssues, typeMatches } from '../domain/whatCounts.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { nowIso, plural } from '../lib/format.js';
import { issuePath } from '../lib/links.js';
import * as jira from '../clients/jira.js';
import * as dataSettings from '../data/settings.js';
import * as dataCases from '../data/cases.js';
import * as dataRuns from '../data/runs.js';
import { getHistory } from '../history/provider.js';
import { buildersOfIssue } from '../domain/duties.js';
import { validateRun } from '../domain/signingRules.js';
import { textHash } from '../domain/seal.js';
import { loadAppIssues } from './conditions.js';
import { assembleRelease } from './readiness.js';
import { caseText, check, issueTypeFor, loadReleases, need, requireAccount, requirementText, resolvePeople, viewerOf } from './support.js';

/** @typedef {import('../contract.js').ServiceCases} Api */

const NO_REQUIREMENT = 'Choose the requirement this case tests.';
const noFixVersion = (key) => `${key} has no fix version. Give it one to include it in acceptance.`;
const LINK_TYPE = 'Relates';

const linkToRequirement = async (caseIssueKey, requirementIssue) => {
  try {
    if (requirementIssue.links.some((l) => l.key === caseIssueKey)) return;
    if (!(await jira.listLinkTypes()).includes(LINK_TYPE)) return;
    await jira.linkIssues({ type: LINK_TYPE, inwardKey: caseIssueKey, outwardKey: requirementIssue.key });
  } catch (err) {
    console.warn('case link could not be added', err?.message);
  }
};

/** @type {Api['getPanel']} */
export const getPanel = async (ctx, q) => {
  const issueKey = need(q, 'issueKey');
  const issue = await jira.getIssue(issueKey);
  // An issue that was moved answers under its old key but lives in another project: only the authorised project counts.
  if (!issue || (q.projectKey && issue.projectKey !== q.projectKey)) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const projectKey = issue.projectKey;
  const projectTypes = await jira.listIssueTypes(projectKey).catch(() => []);
  const isRequirementType = (i, s) => typeMatches(i, s.whatCounts.requirementTypes, s.whatCounts.requirementTypeIds, projectTypes);
  const [settings, viewer, caseRow] = await Promise.all([
    dataSettings.getSettings(projectKey),
    viewerOf(ctx),
    dataCases.getCase(issueKey),
  ]);
  /** @type {import('../contract.js').Panel} */
  const panel = {
    mode: 'no_release',
    issue: { key: issue.key, summary: issue.summary },
    viewer,
    release: null,
    caseView: null,
    requirement: null,
    runs: [],
    attachments: [],
    environments: settings.whatCounts.environments,
    passNeedsEvidence: settings.rules.passNeedsEvidence,
    requirementView: null,
    teachLine: null,
    candidates: [],
  };

  if (caseRow) {
    const requirement = await jira.getIssue(caseRow.requirementKey);
    const releaseId = requirement?.fixVersions[0]?.id ?? issue.fixVersions[0]?.id ?? null;
    if (!requirement || !releaseId) return panel;
    const { readiness, runs } = await assembleRelease(ctx, { projectKey, releaseId: String(releaseId) });
    const requirementView = readiness.requirements.find((r) => r.key === requirement.key);
    const caseView = requirementView?.cases.find((c) => c.key === issue.key) ?? null;
    if (!caseView) return panel;
    return {
      ...panel,
      mode: 'case',
      release: readiness.release,
      caseView,
      requirement: { key: requirement.key, summary: requirement.summary, url: issuePath(requirement.key) },
      runs: runs
        .filter((r) => r.caseKey === issue.key)
        .sort((a, b) => (a.executedAt === b.executedAt ? Number(b.id) - Number(a.id) : a.executedAt < b.executedAt ? 1 : -1)),
      attachments: issue.attachments,
    };
  }

  const releaseId = issue.fixVersions[0]?.id ?? null;
  if (!releaseId) return panel;

  if (isRequirementType(issue, settings)) {
    const { readiness } = await assembleRelease(ctx, { projectKey, releaseId: String(releaseId) });
    const requirementView = readiness.requirements.find((r) => r.key === issue.key) ?? null;
    if (requirementView) {
      const fresh = requirementView.cases.filter((c) => c.state === CASE_STATE.PASSED).length;
      return {
        ...panel,
        mode: 'requirement',
        release: readiness.release,
        requirementView,
        teachLine:
          fresh > 0
            ? `Editing this requirement's summary, description or acceptance criteria will stop its ${plural(fresh, 'pass', 'passes')} from counting until the case is run again.`
            : null,
      };
    }
    // Of a requirement type but not a requirement: one of the app's own issues (a condition, a sign-off). Shown as any other issue.
  }

  const [releases, inRelease, caseRows, own] = await Promise.all([
    loadReleases(projectKey),
    jira.searchIssues(`project = "${projectKey}" AND fixVersion = ${Number(releaseId)} ORDER BY key ASC`),
    dataCases.listCases(projectKey),
    loadAppIssues(projectKey),
  ]);
  const caseKeys = new Set(caseRows.map((c) => c.caseKey));
  return {
    ...panel,
    mode: 'other',
    release: releases.find((r) => r.id === String(releaseId)) ?? null,
    candidates: requirementIssues(inRelease, { isRequirementType: (i) => isRequirementType(i, settings), caseKeys, own })
      .filter((i) => i.key !== issue.key)
      .map((i) => ({ key: i.key, summary: i.summary })),
  };
};

const requirementFor = async (requirementKey, caseKey) => {
  const requirement = await jira.getIssue(requirementKey);
  if (
    !requirement ||
    requirement.key === caseKey ||
    (await dataCases.getCase(requirement.key)) ||
    isAppIssue(requirement, await loadAppIssues(requirement.projectKey))
  ) {
    throw new AppError(ERROR.INVALID, NO_REQUIREMENT, { field: 'requirementKey' });
  }
  if (requirement.fixVersions.length === 0) {
    throw new AppError(ERROR.INVALID, noFixVersion(requirement.key), { field: 'requirementKey' });
  }
  return requirement;
};

/** @type {Api['markCase']} */
export const markCase = async (ctx, q) => {
  const issueKey = need(q, 'issueKey');
  const requirementKey = need(q, 'requirementKey', NO_REQUIREMENT);
  const accountId = requireAccount(ctx);
  const issue = await jira.getIssue(issueKey);
  if (!issue || (q.projectKey && issue.projectKey !== q.projectKey)) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const requirement = await requirementFor(requirementKey, issue.key);
  if (requirement.projectKey !== issue.projectKey) throw new AppError(ERROR.INVALID, NO_REQUIREMENT, { field: 'requirementKey' });
  // An issue that other cases test is a requirement: turning it into a case would take it, and them, out of the release.
  const testedBy = await dataCases.listCasesForRequirements([issue.key]);
  if (testedBy.length > 0) {
    throw new AppError(
      ERROR.INVALID,
      `${issue.key} is the requirement of ${plural(testedBy.length, 'acceptance case')} (${testedBy.slice(0, 3).map((c) => c.caseKey).join(', ')}), so it cannot become a case itself.`,
      { field: 'issueKey' },
    );
  }
  // A case that has runs keeps its requirement: its passes were recorded against that requirement's text.
  const already = await dataCases.getCase(issue.key);
  if (already && already.requirementKey !== requirement.key && (await dataRuns.listRunsForCases([issue.key])).length > 0) {
    throw new AppError(
      ERROR.INVALID,
      `${issue.key} already has runs recorded against ${already.requirementKey}, so it cannot be moved to another requirement. Add a new case for ${requirement.key} instead.`,
      { field: 'requirementKey' },
    );
  }
  await resolvePeople([accountId]);
  await dataCases.upsertCase({
    caseKey: issue.key,
    caseId: issue.id,
    projectKey: issue.projectKey,
    requirementKey: requirement.key,
    markedBy: accountId,
    markedAt: nowIso(),
    sample: false,
  });
  await jira.setCaseProperty(issue.key, { case: true, requirementKey: requirement.key });
  if (!issue.labels.includes(CASE_LABEL)) {
    await jira.updateIssue(issue.key, { labels: [...issue.labels, CASE_LABEL] }, { asUser: true });
  }
  if (!issue.links.some((l) => l.key === requirement.key)) await linkToRequirement(issue.key, requirement);
  return getPanel(ctx, { issueKey: issue.key });
};

/** @type {Api['addCase']} */
export const addCase = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const requirementKey = need(q, 'requirementKey', NO_REQUIREMENT);
  const summary = need(q, 'summary').slice(0, 250);
  const accountId = requireAccount(ctx);
  const requirement = await requirementFor(requirementKey, null);
  if (requirement.projectKey !== projectKey) throw new AppError(ERROR.INVALID, NO_REQUIREMENT, { field: 'requirementKey' });
  const version =
    requirement.fixVersions.find((v) => String(v.id) === String(q.releaseId ?? '')) ?? requirement.fixVersions[0];
  const [created] = await jira.createIssues(
    [
      {
        projectKey,
        ...(await issueTypeFor(projectKey, ['Task'])),
        summary,
        description: typeof q.steps === 'string' ? q.steps.slice(0, 10000) : '',
        fixVersion: version.name,
        labels: [CASE_LABEL],
      },
    ],
    { asUser: true },
  );
  if (!created) throw new AppError(ERROR.FAILED, GENERIC_ERROR);
  await resolvePeople([accountId]);
  await dataCases.upsertCase({
    caseKey: created.key,
    caseId: created.id,
    projectKey,
    requirementKey: requirement.key,
    markedBy: accountId,
    markedAt: nowIso(),
    sample: false,
  });
  await jira.setCaseProperty(created.key, { case: true, requirementKey: requirement.key });
  await linkToRequirement(created.key, requirement);
  return { caseKey: created.key };
};

/** Is this person a builder of the requirement (its own history or a linked defect's)? Unknown → false. */
const builtBy = async (accountId, requirement, settings) => {
  try {
    const linked = requirement.links.length ? await jira.getIssues([...new Set(requirement.links.map((l) => l.key))]) : [];
    const issues = [
      requirement,
      ...linked.filter((i) => typeMatches(i, settings.whatCounts.defectTypes, settings.whatCounts.defectTypeIds, [])),
    ];
    const history = await getHistory(issues, { criteriaField: settings.whatCounts.criteriaField });
    const now = nowIso();
    return issues.some((i) => buildersOfIssue(i.key, history[i.key] ?? [], now).some((f) => f.person.id === accountId));
  } catch (err) {
    console.warn('builder check failed', err?.message);
    return false;
  }
};

/** @type {Api['recordRun']} */
export const recordRun = async (ctx, q) => {
  const caseKey = need(q, 'caseKey');
  const accountId = requireAccount(ctx);
  const caseRow = await dataCases.getCase(caseKey);
  if (!caseRow) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const settings = await dataSettings.getSettings(caseRow.projectKey);
  const criteriaField = settings.whatCounts.criteriaField;
  const build = typeof q.build === 'string' ? q.build.trim() : '';
  const notes = typeof q.notes === 'string' ? q.notes.trim() : '';
  const environment = typeof q.environment === 'string' && q.environment.trim() ? q.environment.trim() : 'Other';
  if (build.length > 64) throw new AppError(ERROR.INVALID, 'A build name can be 64 characters at most.', { field: 'build' });
  if (environment.length > 64) throw new AppError(ERROR.INVALID, 'An environment name can be 64 characters at most.', { field: 'environment' });
  if (notes.length > 4000) throw new AppError(ERROR.INVALID, 'Keep the notes under 4,000 characters. Attach longer text as a file.', { field: 'notes' });
  const attachmentIds = Array.isArray(q.attachmentIds) ? [...new Set(q.attachmentIds.map(String))].slice(0, 20) : [];
  check(
    validateRun({ result: q.result ?? null, build, notes, evidenceCount: attachmentIds.length, rules: settings.rules }),
  );

  // The moment of the run is fixed BEFORE the texts are read: an edit made while this runs then counts as later.
  const executedAt = nowIso();
  const found = await jira.getIssues([caseRow.caseKey, caseRow.requirementKey], { criteriaField });
  const caseIssue = found.find((i) => i.key === caseRow.caseKey);
  const requirement = found.find((i) => i.key === caseRow.requirementKey);
  if (!caseIssue || !requirement) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const version = requirement.fixVersions[0] ?? caseIssue.fixVersions[0];
  if (!version) throw new AppError(ERROR.INVALID, noFixVersion(requirement.key), { field: 'caseKey' });

  const attachments = attachmentIds.map((id) => caseIssue.attachments.find((a) => String(a.id) === id));
  if (attachments.some((a) => !a)) {
    throw new AppError(ERROR.INVALID, 'Evidence file is missing. Attach it to this issue, then tick it here.', {
      field: 'attachmentIds',
    });
  }
  /** @type {import('../contract.js').Evidence[]} */
  const evidence = await Promise.all(
    attachments.map(async (a) => ({
      attachmentId: String(a.id),
      filename: a.filename,
      size: a.size,
      // Larger files are not downloaded: they are sealed by id, name and size, and Verify says so.
      sha256: a.size > EVIDENCE_HASH_MAX_BYTES ? null : await jira.hashAttachment(String(a.id)).catch(() => null),
    })),
  );
  const unread = evidence.find((e) => e.sha256 === null && e.size <= EVIDENCE_HASH_MAX_BYTES);
  if (unread) {
    throw new AppError(
      ERROR.FAILED,
      `The evidence file ${unread.filename} could not be read to take its fingerprint, so the run was not recorded. Try again.`,
      { field: 'attachmentIds' },
    );
  }

  const reqText = requirementText(requirement, criteriaField);
  const cText = caseText(caseIssue);
  await resolvePeople([accountId]);
  const [releases] = await Promise.all([loadReleases(caseRow.projectKey)]);
  const release = releases.find((r) => r.id === String(version.id)) ?? null;
  const runId = await dataRuns.insertRun({
    projectKey: caseRow.projectKey,
    releaseId: String(version.id),
    caseKey: caseRow.caseKey,
    requirementKey: caseRow.requirementKey,
    result: q.result,
    notes,
    build,
    environment,
    executedAt,
    executedBy: accountId,
    evidence,
    snapshot: {
      requirementText: reqText,
      requirementTextHash: textHash(reqText),
      caseText: cText,
      caseTextHash: textHash(cText),
    },
    sample: false,
  });
  const run = await dataRuns.getRun(runId);

  // Straight after a run nothing can have changed except the build: a pass on another build is already stale (S5).
  const state =
    q.result === RUN_RESULT.PASSED
      ? release?.build && release.build.trim().toLowerCase() !== build.toLowerCase()
        ? CASE_STATE.PASSED_THEN_CHANGED
        : CASE_STATE.PASSED
      : q.result === RUN_RESULT.FAILED
        ? CASE_STATE.FAILED
        : CASE_STATE.BLOCKED;
  const builder = await builtBy(accountId, requirement, settings);
  return {
    run,
    state,
    flag: `Run recorded. ${caseRow.caseKey} is now ${CASE_STATE_LOZENGE[state].text}.`,
    builderWarning: builder
      ? `You were the assignee of ${requirement.key} while it was in progress. This run is recorded, and it will show as a conflict in the brief.`
      : null,
  };
};
