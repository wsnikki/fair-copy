// [D] Conditions: carried over from earlier records, confirmed met, and the Jira issue that does the work.
// Contract: typedef `ServiceConditions` in src/contract.js.
import { CONDITION_STATE, ERROR, OUTCOME } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { daysBetween, formatDay, nowIso, plural } from '../lib/format.js';
import { absolute, issuePath } from '../lib/links.js';
import * as jira from '../clients/jira.js';
import * as dataConditions from '../data/conditions.js';
import * as dataRecords from '../data/records.js';
import * as dataRequests from '../data/requests.js';
import { nextRelease } from '../domain/carried.js';
import { needsIssue } from '../domain/signingRules.js';
import { CONDITION_LABEL, appIssueKeys } from '../domain/whatCounts.js';
import { permissionsOf } from './access.js';
import { issueTypeFor, need, requireAccount, resolvePeople, stateOf, toSummary } from './support.js';

/** @typedef {import('../contract.js').ServiceConditions} Api */

export { CONDITION_LABEL };

/**
 * The keys of the Jira issues the app made in this project (condition issues, sign-off tasks, seal-comment issues),
 * for domain/whatCounts.isAppIssue and requirementIssues.
 * @param {string} projectKey
 */
export const loadAppIssues = async (projectKey) => {
  const [conditions, requests, records] = await Promise.all([
    dataConditions.listSealedConditions(projectKey),
    dataRequests.listRequests(projectKey),
    dataRecords.listRecords(projectKey),
  ]);
  return appIssueKeys({ conditions, requests, records });
};

const withState = (condition, now) => ({ ...condition, state: stateOf(condition, now) });

const lineOf = (c, now) => {
  if (c.state === CONDITION_STATE.MET) return `${c.text} — confirmed ${formatDay(c.metAt ?? now, now)}`;
  if (c.state === CONDITION_STATE.OVERDUE) {
    return `${c.text} — owner ${c.owner.name}, was due ${formatDay(c.dueDate, now)}, ${plural(daysBetween(c.dueDate, now), 'day')} late.`;
  }
  return `${c.text} — owner ${c.owner.name}, due ${formatDay(c.dueDate, now)}`;
};

/** @type {Api['listCarried']} */
export const listCarried = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const now = nowIso();
  const [sealed, records] = await Promise.all([
    dataConditions.listSealedConditions(projectKey),
    dataRecords.listRecords(projectKey),
  ]);
  const earlier = records.filter((r) => q.beforeNumber == null || r.number < q.beforeNumber).reverse();
  const conditions = sealed.map((c) => withState(c, now));
  const linked = [...new Set(conditions.map((c) => c.linkedIssue).filter(Boolean))];
  /** @type {Record<string, {name: string, done: boolean}>} */
  const statusByKey = {};
  if (linked.length > 0) {
    try {
      for (const issue of await jira.getIssues(linked)) {
        statusByKey[issue.key] = { name: issue.status.name, done: issue.status.category === 'done' };
      }
    } catch (err) {
      console.warn('condition issues could not be read', err?.message);
    }
  }
  const groups = [];
  for (const record of earlier) {
    const own = conditions.filter((c) => c.recordId === record.id);
    if (own.length === 0) continue;
    const how = record.outcome === OUTCOME.REJECTED ? 'rejected' : 'accepted';
    groups.push({
      record: toSummary(record, own, now),
      sentence: `Release ${record.releaseName} was ${how} with ${plural(own.length, 'condition')} on ${formatDay(record.decidedAt, now)} by ${record.decidedBy.name}.`,
      conditions: own.map((c) => ({
        ...c,
        line: lineOf(c, now),
        linkedIssueStatus: c.linkedIssue ? statusByKey[c.linkedIssue]?.name ?? null : null,
        linkedIssueDone: c.linkedIssue && statusByKey[c.linkedIssue] ? statusByKey[c.linkedIssue].done : null,
        linkedIssueUrl: c.linkedIssue ? issuePath(c.linkedIssue) : null,
        daysLate: c.state === CONDITION_STATE.OVERDUE ? daysBetween(c.dueDate, now) : null,
      })),
    });
  }
  return groups;
};

/**
 * @type {Api['confirmConditionMet']} By the condition's owner, the person who signed the record, or a project
 * administrator; with a note saying how it was met. The first confirmation stands and names who gave it.
 */
export const confirmConditionMet = async (ctx, q) => {
  const id = need(q, 'conditionId');
  const accountId = requireAccount(ctx);
  const note = typeof q.note === 'string' ? q.note.trim() : '';
  if (note.length < 3) throw new AppError(ERROR.INVALID, 'Say how the condition was met. The note is kept with the confirmation.', { field: 'note' });
  if (note.length > 1000) throw new AppError(ERROR.INVALID, 'Keep the note under 1,000 characters.', { field: 'note' });
  const condition = await dataConditions.getCondition(id);
  if (!condition || !condition.recordId) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  if (condition.status !== CONDITION_STATE.MET) {
    const record = await dataRecords.getRecord(condition.recordId);
    const may =
      condition.owner.id === accountId ||
      record?.decidedBy?.id === accountId ||
      (await permissionsOf(ctx, condition.projectKey)).projectAdmin;
    if (!may) {
      throw new AppError(
        ERROR.FORBIDDEN,
        `Only ${condition.owner.name} (the owner), the person who signed Record ${condition.recordNumber} or a project administrator can confirm this condition.`,
      );
    }
    await resolvePeople([accountId]);
    await dataConditions.markConditionMet(id, { metAt: nowIso(), metBy: accountId, note });
  }
  return withState(await dataConditions.getCondition(id), nowIso());
};

/** @type {Api['listConditions']} */
export const listConditions = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const now = nowIso();
  const all = (await dataConditions.listSealedConditions(projectKey)).map((c) => withState(c, now));
  return !q.state || q.state === 'all' ? all : all.filter((c) => c.state === q.state);
};

/**
 * SPEC §2.6: an open condition is a Jira issue. Creates one for every sealed condition of the record that has no linked
 * issue yet, in the release after the decided one when there is one, and stores the key. Never throws.
 * @param {import('../contract.js').Ctx} ctx
 * @param {{record: import('../contract.js').AcceptanceRecord, releases: import('../contract.js').Release[]}} q
 * @returns {Promise<string[]>} keys of the issues created
 */
export const createConditionIssues = async (ctx, { record, releases }) => {
  const created = [];
  try {
    const conditions = (await dataConditions.listConditionsOfRecord(record.id)).filter(needsIssue);
    if (conditions.length === 0) return created;
    const next = nextRelease(releases, record.releaseId);
    const page = record.pageUrl ? `\nAcceptance record: ${absolute(ctx.siteUrl, record.pageUrl)}` : '';
    const type = await issueTypeFor(record.projectKey, ['Task']);
    const fields = (withDue) =>
      conditions.map((c) => ({
        projectKey: record.projectKey,
        ...type,
        summary: `Condition from Record ${record.number}: ${c.text}`.slice(0, 250),
        description: `${c.text}\n\nCondition of the decision on Release ${record.releaseName} (Record ${record.number}). Owner ${c.owner.name}, due ${formatDay(c.dueDate, null, true)}.${page}`,
        fixVersion: next ? next.name : null,
        labels: [CONDITION_LABEL],
        assigneeId: c.owner.kind === 'jira' ? c.owner.id : null,
        dueDate: withDue ? c.dueDate : null,
      }));
    // One at a time, stored at once: a call that is cut off leaves no issue without its condition knowing it.
    const [withDue, withoutDue] = [fields(true), fields(false)];
    for (let i = 0; i < conditions.length; i += 1) {
      let issue = null;
      try {
        [issue] = await jira.createIssues([withDue[i]], { asUser: true });
      } catch {
        // A project whose create screen has no Due date field refuses it: the date is in the description as well.
        [issue] = await jira.createIssues([withoutDue[i]], { asUser: true });
      }
      if (!issue) continue;
      await dataConditions.setConditionIssue(conditions[i].id, issue.key);
      created.push(issue.key);
    }
  } catch (err) {
    console.warn('condition issues could not be created', err?.message);
  }
  return created;
};
