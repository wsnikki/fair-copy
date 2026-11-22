// [D] Helpers shared by the services: people, releases, record summaries. Not part of the contract's module map.
import { CONDITION_STATE, ERROR, SAMPLE_PERSON_PREFIX } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { getAppContext } from '@forge/api';
import { nowIso } from '../lib/format.js';
import { commentPath, projectAppPath } from '../lib/links.js';
import * as jira from '../clients/jira.js';
import * as dataPeople from '../data/people.js';
import * as dataBuilds from '../data/builds.js';
import { conditionState } from '../domain/signingRules.js';
import { pickIssueType } from '../domain/whatCounts.js';

/** @typedef {import('../contract.js').Person} Person */

/** Throws the generic "invalid" error naming the field when a required text input is missing. */
export const need = (payload, field, sentence = GENERIC_ERROR) => {
  const value = payload?.[field];
  if (typeof value !== 'string' || value.trim() === '') throw new AppError(ERROR.INVALID, sentence, { field });
  return value.trim();
};

/** A domain validation answer → throws AppError when it is not ok. */
export const check = (answer, details) => {
  if (answer && answer.ok === false) throw new AppError(answer.code, answer.error, details ?? answer.details);
};

export const personOf = (people, id) =>
  id == null ? null : people[id] ?? { id, name: id, kind: id.startsWith(SAMPLE_PERSON_PREFIX) ? 'sample' : 'jira' };

/**
 * Ids → people. Looks in the app's table first, asks Jira for the rest and remembers them.
 * @param {(string|null|undefined)[]} ids
 * @returns {Promise<Record<string, Person>>}
 */
export const resolvePeople = async (ids) => {
  const wanted = [...new Set(ids.filter((id) => typeof id === 'string' && id !== ''))];
  if (wanted.length === 0) return {};
  const found = { ...(await dataPeople.getPeople(wanted)) };
  const missing = wanted.filter((id) => !found[id]);
  if (missing.length > 0) {
    let fetched = [];
    try {
      fetched = await jira.getUsers(missing);
    } catch (err) {
      console.warn('people lookup failed', err?.message);
    }
    if (fetched.length > 0) await dataPeople.upsertPeople(fetched);
    for (const p of fetched) found[p.id] = p;
  }
  for (const id of wanted) found[id] = personOf(found, id);
  return found;
};

/** The signed-in person. Falls back to the people table when Jira cannot be asked as the user (Confluence surface). */
export const viewerOf = async (ctx) => {
  try {
    const me = await jira.getMyself();
    if (me?.id) {
      await dataPeople.upsertPeople([me]);
      return me;
    }
  } catch (err) {
    console.warn('getMyself failed', err?.message);
  }
  if (!ctx.accountId) throw new AppError(ERROR.FORBIDDEN, GENERIC_ERROR);
  return (await resolvePeople([ctx.accountId]))[ctx.accountId];
};

export const requireAccount = (ctx) => {
  if (!ctx.accountId) throw new AppError(ERROR.FORBIDDEN, GENERIC_ERROR);
  return ctx.accountId;
};

/**
 * Every version of the project as a Release (with the build under acceptance), unreleased first.
 * @returns {Promise<import('../contract.js').Release[]>}
 */
export const loadReleases = async (projectKey) => {
  const versions = await jira.listVersions(projectKey);
  if (versions.length === 0) return [];
  const builds = await dataBuilds.currentBuilds(versions.map((v) => v.id));
  const people = await resolvePeople(Object.values(builds).map((b) => b.setBy));
  const releases = versions.map((v) => {
    const b = builds[v.id] ?? null;
    return {
      id: String(v.id),
      name: v.name,
      projectKey,
      projectId: String(v.projectId),
      released: Boolean(v.released),
      releaseDate: v.releaseDate ?? null,
      build: b ? b.build : null,
      buildSetAt: b ? b.setAt : null,
      buildSetBy: b ? personOf(people, b.setBy) : null,
    };
  });
  return [...releases.filter((r) => !r.released), ...releases.filter((r) => r.released)];
};

/** Text of a requirement as it is hashed and snapshotted (contract typedef Requirement.text). */
export const requirementText = (issue, criteriaField) =>
  `${issue.summary}\n${issue.description}${criteriaField ? `\n${issue.criteria}` : ''}`;
/** Text of a case (contract typedef Case.text). */
export const caseText = (issue) => `${issue.summary}\n${issue.description}`;

/** Condition state now, whatever the repo computed. */
export const stateOf = (condition, now = nowIso()) => conditionState(condition, now);

/**
 * @param {import('../contract.js').AcceptanceRecord} record
 * @param {import('../contract.js').Condition[]} conditions   sealed conditions of this record
 * @returns {import('../contract.js').RecordSummary}
 */
export const toSummary = (record, conditions, now = nowIso()) => {
  const counts = { open: 0, met: 0, overdue: 0 };
  for (const c of conditions) {
    const s = stateOf(c, now);
    if (s === CONDITION_STATE.MET) counts.met += 1;
    else if (s === CONDITION_STATE.OVERDUE) counts.overdue += 1;
    else counts.open += 1;
  }
  return {
    id: record.id,
    number: record.number,
    releaseId: record.releaseId,
    releaseName: record.releaseName,
    outcome: record.outcome,
    decidedBy: record.decidedBy,
    decidedAt: record.decidedAt,
    seal: record.seal,
    prevSeal: record.prevSeal,
    pageUrl: record.pageUrl,
    pageStatus: record.pageStatus,
    pageError: record.pageError ?? null,
    conditions: counts,
    sample: record.sample,
    // What is still to be done after sealing (services/signing.finishSigning), and where the seal was posted in Jira.
    pending: {
      page: (record.followups ?? []).includes('page'),
      issues: (record.followups ?? []).includes('issues'),
      anchor: (record.followups ?? []).includes('anchor'),
    },
    anchorIssueKey: record.anchorIssue ?? null,
    anchorUrl: record.anchorIssue && record.anchorComment ? commentPath(record.anchorIssue, record.anchorComment) : null,
  };
};

/** App id and environment id of the running function (for the seal macro and for links to the app's own pages). null when unknown. */
export const appIds = () => {
  try {
    const parts = String(getAppContext().environmentAri ?? '').split('/');
    return parts.length >= 3 ? { appId: parts[parts.length - 2], environmentId: parts[parts.length - 1] } : null;
  } catch {
    return null;
  }
};

/** Site-relative address of the Acceptance page of a project; the project itself when the ids cannot be read. */
export const projectPagePath = (projectKey) => projectAppPath(projectKey, appIds());

/** May this person restore a record page (PRODUCT §4.5: approvers and waiver authorities; empty lists = anyone)? */
export const mayRestore = (settings, accountId) => {
  const allowed = [...settings.people.approvers, ...settings.people.waiverAuthorities];
  return Boolean(accountId) && (allowed.length === 0 || allowed.includes(accountId));
};

/**
 * How to name the issue type when the app creates an issue: by id (so a site in another language works), falling back
 * to the English name only when the project's types cannot be read.
 * @param {string} projectKey
 * @param {string[]} wanted   untranslated names, best first
 * @returns {Promise<{typeId?: string, type: string}>}
 */
export const issueTypeFor = async (projectKey, wanted = ['Task']) => {
  try {
    const typeId = pickIssueType(await jira.listIssueTypes(projectKey), wanted);
    if (typeId) return { typeId, type: wanted[0] };
  } catch (err) {
    console.warn('issue types could not be read', err?.message);
  }
  return { type: wanted[0] };
};
