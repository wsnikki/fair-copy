// [D] Authorisation. The app reads and writes Jira with its own identity, so before ANY project data is returned or
// changed the resolver (and every action) asks Jira what the signed-in person may do — as that person.
//   read   BROWSE_PROJECTS            every screen, the panel, the seal macro, the agent's tools
//   write  EDIT_ISSUES                runs, cases, build, requests, conditions, waivers, signing, publishing
//   admin  ADMINISTER_PROJECTS        project settings
//   site   ADMINISTER (global)        load and remove the sample project
// Fails closed: when Jira cannot be asked as the user, nothing is shown.
import { ERROR } from '../contract.js';
import { AppError } from '../lib/result.js';
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import * as dataRecords from '../data/records.js';
import * as dataRequests from '../data/requests.js';
import * as dataConditions from '../data/conditions.js';
import * as dataCases from '../data/cases.js';

/** @typedef {import('../contract.js').Ctx} Ctx */
/** @typedef {{browse: boolean, write: boolean, create: boolean, projectAdmin: boolean, siteAdmin: boolean}} Permissions */

export const LEVEL = Object.freeze({ READ: 'read', WRITE: 'write', ADMIN: 'admin', SITE: 'site' });

const NONE = Object.freeze({ browse: false, write: false, create: false, projectAdmin: false, siteAdmin: false });
const KEY_SHAPE = /^[A-Z][A-Z0-9_]{1,19}$/;

const NOT_VISIBLE = 'This project does not exist, or you do not have permission to see it.';
const sentence = {
  [LEVEL.WRITE]: (key) => `You can see ${key} but you may not edit its work items, so you cannot change anything here. Ask a project administrator.`,
  [LEVEL.ADMIN]: (key) => `Only an administrator of ${key} can do this. Ask a project administrator.`,
  [LEVEL.SITE]: () => 'Only a Jira administrator can do this. Ask a Jira administrator of this site.',
};

// One answer per person and project for a short while: a screen makes several calls in a row.
const TTL_MS = 20000;
/** @type {Map<string, {at: number, value: Promise<Permissions|null>}>} */
const cache = new Map();

/** A project key as Jira writes it, or an AppError: nothing else ever reaches JQL or a URL. */
export const cleanKey = (projectKey) => {
  const key = typeof projectKey === 'string' ? projectKey.trim().toUpperCase() : '';
  if (!KEY_SHAPE.test(key)) throw new AppError(ERROR.NOT_FOUND, NOT_VISIBLE);
  return key;
};

/**
 * What the signed-in person may do in a project (or, without a key, on the site).
 * @param {Ctx} ctx
 * @param {string|null} projectKey
 * @returns {Promise<Permissions>}
 */
export const permissionsOf = async (ctx, projectKey) => {
  if (!ctx?.accountId) return { ...NONE };
  const id = `${ctx.accountId}|${projectKey ?? ''}`;
  const hit = cache.get(id);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return (await hit.value) ?? { ...NONE };
  const value = jira.myPermissions(projectKey);
  cache.set(id, { at: now, value });
  if (cache.size > 500) for (const [k, v] of cache) if (now - v.at >= TTL_MS) cache.delete(k);
  const answer = await value;
  if (answer === null) cache.delete(id); // Jira could not be asked: do not remember a refusal that is not Jira's
  return answer ?? { ...NONE };
};

const allows = (p, level) =>
  level === LEVEL.READ ? p.browse : level === LEVEL.WRITE ? p.browse && p.write : level === LEVEL.ADMIN ? p.projectAdmin : p.siteAdmin;

/**
 * Throws unless the signed-in person has this level in the project. Returns the clean key.
 * A project they cannot see and a project that does not exist read the same.
 * @param {Ctx} ctx
 * @param {string} projectKey
 * @param {string} [level]
 */
export const assertProject = async (ctx, projectKey, level = LEVEL.READ) => {
  const key = cleanKey(projectKey);
  const p = await permissionsOf(ctx, key);
  if (!p.browse) throw new AppError(ERROR.NOT_FOUND, NOT_VISIBLE);
  if (!allows(p, level)) throw new AppError(ERROR.FORBIDDEN, sentence[level](key));
  return key;
};

/** Throws unless the signed-in person administers Jira. */
export const assertSiteAdmin = async (ctx) => {
  const p = await permissionsOf(ctx, null);
  if (!p.siteAdmin) throw new AppError(ERROR.FORBIDDEN, sentence[LEVEL.SITE]());
};

/**
 * The project a payload is about, found from whatever it names. The app's own rows are read to learn the project;
 * nothing from them is returned before assertProject has passed.
 * @param {Ctx} ctx
 * @param {{projectKey?: string|null, issueKey?: string|null, caseKey?: string|null, recordId?: string|null, requestId?: string|null, conditionId?: string|null, pageId?: string|null}} q
 * @returns {Promise<string|null>}
 */
export const projectOf = async (ctx, q) => {
  if (q.recordId) return (await dataRecords.getRecord(String(q.recordId)))?.projectKey ?? null;
  if (q.requestId) return (await dataRequests.getRequest(String(q.requestId)))?.projectKey ?? null;
  if (q.conditionId) return (await dataConditions.getCondition(String(q.conditionId)))?.projectKey ?? null;
  const issueKey = q.issueKey ?? q.caseKey ?? null;
  if (issueKey) {
    const known = await dataCases.getCase(String(issueKey));
    if (known) return known.projectKey;
    const at = String(issueKey).lastIndexOf('-');
    return at > 0 ? String(issueKey).slice(0, at) : null;
  }
  if (q.pageId) {
    const byPage = await dataRecords.getRecordByPage(String(q.pageId));
    if (byPage) return byPage.projectKey;
    const property = await confluence.getSealProperty(String(q.pageId)).catch(() => null);
    return property?.projectKey ?? null;
  }
  return q.projectKey ?? ctx.projectKey ?? null;
};

/**
 * The one guard: resolve the project, check the level, return the key. `missing` is the sentence when the payload
 * names nothing that exists.
 * @param {Ctx} ctx
 * @param {Parameters<typeof projectOf>[1]} q
 * @param {string} level
 */
export const guardProject = async (ctx, q, level) => {
  const projectKey = await projectOf(ctx, q);
  if (!projectKey) throw new AppError(ERROR.NOT_FOUND, q.pageId ? 'This page is not an acceptance record.' : NOT_VISIBLE);
  return assertProject(ctx, projectKey, level);
};
