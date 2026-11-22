// [D] The one @forge/resolver. Thin: build Ctx → authorise as the user → validate → call ONE service → Result<T>.
// Contract: `INVOKE` and typedef `InvokeMap` (Part 5) in src/contract.js. No logic here beyond the guard table.
import Resolver from '@forge/resolver';
import { ERROR, INVOKE } from '../contract.js';
import { AppError, failFrom, GENERIC_ERROR, ok } from '../lib/result.js';
import * as readiness from '../services/readiness.js';
import * as cases from '../services/cases.js';
import * as requests from '../services/requests.js';
import * as brief from '../services/brief.js';
import * as signing from '../services/signing.js';
import * as records from '../services/records.js';
import * as verify from '../services/verify.js';
import * as conditions from '../services/conditions.js';
import * as settings from '../services/settings.js';
import { assertSiteAdmin, guardProject, LEVEL } from '../services/access.js';
import { loadSample } from '../sample/loader.js';
import { removeSample } from '../sample/remover.js';

/**
 * Forge request context → Ctx. Works for Jira (project page, global page, settings page, issue panel) and Confluence
 * (macro, page). The account always comes from the platform, never from the payload.
 * @param {any} req
 * @returns {import('../contract.js').Ctx}
 */
export const ctxOf = (req) => {
  const c = req?.context ?? {};
  const ext = c.extension ?? {};
  return {
    accountId: c.accountId ?? null,
    cloudId: c.cloudId ?? '',
    siteUrl: c.siteUrl ?? '',
    surface: ext.type?.startsWith('jira:') ? 'jira' : 'confluence',
    projectKey: ext.project?.key ?? null,
    projectId: ext.project?.id ? String(ext.project.id) : null,
    issueKey: ext.issue?.key ?? null,
    contentId: ext.content?.id ? String(ext.content.id) : null,
  };
};

/** Input check: these payload fields must be non-empty text. `details.field` names the first one that is not. */
const required = (payload, ...fields) => {
  for (const field of fields) {
    if (typeof payload[field] !== 'string' || payload[field].trim() === '') {
      throw new AppError(ERROR.INVALID, GENERIC_ERROR, { field });
    }
  }
  return payload;
};

const { READ, WRITE, ADMIN } = LEVEL;

/**
 * Authorises against the project the payload is about (found from its project key, issue, record, request, condition
 * or page — services/access.projectOf) and hands the handler the payload with the checked `projectKey`.
 */
const inProject = (level, pick, handler, ...fields) => async (ctx, p) => {
  const q = pick(p, ctx);
  const projectKey = await guardProject(ctx, q, level);
  return handler(ctx, required({ ...p, ...q, projectKey }, ...fields));
};

const byProject = (p, ctx) => ({ projectKey: p.projectKey ?? ctx.projectKey });
const byIssue = (p, ctx) => ({ issueKey: p.issueKey ?? ctx.issueKey });
const byCase = (p, ctx) => ({ caseKey: p.caseKey ?? ctx.issueKey });
const byRecord = (p) => ({ recordId: p.recordId });
const byRequest = (p) => ({ requestId: p.requestId });
const byCondition = (p) => ({ conditionId: p.conditionId });
const byPage = (p, ctx) => ({ pageId: p.pageId ?? ctx.contentId });

/** @type {Record<string, (ctx: import('../contract.js').Ctx, payload: any) => Promise<any>>} */
const HANDLERS = {
  // These two answer for a person who may see no project at all; the services decide what each person gets.
  [INVOKE.getBootstrap]: (ctx) => readiness.getBootstrap(ctx),
  [INVOKE.getStart]: (ctx) => readiness.getStart(ctx),

  // Site administrators only: the sample creates and deletes a whole Jira project.
  [INVOKE.loadSample]: async (ctx) => {
    await assertSiteAdmin(ctx);
    return loadSample(ctx);
  },
  [INVOKE.removeSample]: async (ctx, p) => {
    await assertSiteAdmin(ctx);
    if (p.confirm !== true) throw new AppError(ERROR.INVALID, 'Confirm that the sample project should be deleted.', { field: 'confirm' });
    return removeSample(ctx);
  },

  // Read: Browse Projects.
  [INVOKE.getReadiness]: inProject(READ, byProject, (ctx, p) => readiness.getReadiness(ctx, { projectKey: p.projectKey, releaseId: p.releaseId })),
  [INVOKE.getPanel]: inProject(READ, byIssue, (ctx, p) => cases.getPanel(ctx, { issueKey: p.issueKey, projectKey: p.projectKey }), 'issueKey'),
  [INVOKE.checkApprover]: inProject(READ, byProject, (ctx, p) => requests.checkApprover(ctx, p), 'releaseId'),
  [INVOKE.getBrief]: inProject(READ, byProject, (ctx, p) => brief.getBrief(ctx, { projectKey: p.projectKey, releaseId: p.releaseId })),
  [INVOKE.listRecords]: inProject(READ, byProject, (ctx, p) => records.listRecords(ctx, p)),
  [INVOKE.getRecord]: inProject(READ, byRecord, (ctx, p) => records.getRecord(ctx, p), 'recordId'),
  [INVOKE.verifyRecord]: inProject(READ, byRecord, (ctx, p) => verify.verifyRecord(ctx, { recordId: p.recordId }), 'recordId'),
  [INVOKE.verifyAll]: inProject(READ, byProject, (ctx, p) => verify.verifyAll(ctx, p)),
  [INVOKE.verifyPage]: inProject(READ, byPage, (ctx, p) => verify.verifyRecord(ctx, { pageId: p.pageId }), 'pageId'),
  [INVOKE.getSettings]: inProject(READ, byProject, (ctx, p) => settings.getSettings(ctx, p)),

  // Write: Edit Issues. The services add who-may rules on top (approver, requester, owner, waiver authority).
  [INVOKE.setBuild]: inProject(WRITE, byProject, (ctx, p) => readiness.setBuild(ctx, p), 'releaseId'),
  [INVOKE.markCase]: inProject(WRITE, byIssue, (ctx, p) => cases.markCase(ctx, p), 'issueKey'),
  [INVOKE.addCase]: inProject(WRITE, byProject, (ctx, p) => cases.addCase(ctx, p)),
  [INVOKE.recordRun]: inProject(WRITE, byCase, (ctx, p) => cases.recordRun(ctx, p), 'caseKey'),
  [INVOKE.requestSignoff]: inProject(WRITE, byProject, (ctx, p) => requests.requestSignoff(ctx, p), 'releaseId'),
  [INVOKE.withdrawRequest]: inProject(WRITE, byRequest, (ctx, p) => requests.withdrawRequest(ctx, p), 'requestId'),
  [INVOKE.saveCondition]: inProject(WRITE, byRequest, (ctx, p) => signing.saveCondition(ctx, p), 'requestId'),
  [INVOKE.deleteCondition]: inProject(WRITE, byRequest, async (ctx, p) => (await signing.deleteCondition(ctx, p)) ?? {}, 'requestId', 'id'),
  [INVOKE.saveWaiver]: inProject(WRITE, byRequest, (ctx, p) => signing.saveWaiver(ctx, p), 'requestId'),
  [INVOKE.deleteWaiver]: inProject(WRITE, byRequest, async (ctx, p) => (await signing.deleteWaiver(ctx, p)) ?? {}, 'requestId', 'id'),
  [INVOKE.sign]: inProject(WRITE, byRequest, (ctx, p) => signing.sign(ctx, p), 'requestId'),
  [INVOKE.finishSigning]: inProject(WRITE, byRecord, (ctx, p) => signing.finishSigning(ctx, p), 'recordId'),
  [INVOKE.publishPage]: inProject(WRITE, byRecord, (ctx, p) => records.publishPage(ctx, p), 'recordId'),
  [INVOKE.restorePage]: inProject(WRITE, byRecord, (ctx, p) => records.restorePage(ctx, p), 'recordId'),
  [INVOKE.confirmConditionMet]: inProject(WRITE, byCondition, (ctx, p) => conditions.confirmConditionMet(ctx, p), 'conditionId'),

  // Project administrators.
  [INVOKE.saveSettings]: inProject(ADMIN, byProject, (ctx, p) => settings.saveSettings(ctx, p)),
  [INVOKE.listSpaces]: inProject(ADMIN, byProject, (ctx) => settings.listSpaces(ctx)),
  [INVOKE.testConnection]: inProject(ADMIN, byProject, (ctx, p) => settings.testConnection(ctx, { spaceKey: p.spaceKey ?? null })),
};

/** Wraps a handler `(ctx, payload) => data` so that it always answers with a Result and never throws to the bridge. */
const guard = (name, handler) => async (req) => {
  try {
    const ctx = ctxOf(req);
    if (!ctx.accountId) throw new AppError(ERROR.FORBIDDEN, 'Log in to Jira to use this.');
    return ok(await handler(ctx, req?.payload ?? {}));
  } catch (err) {
    // A refusal a person can read is still worth one log line: it is the only trace of what the screen was told.
    if (err instanceof AppError) console.warn(`${name} refused: ${err.code} ${err.message} [${req?.context?.extension?.type ?? 'no module'}]`);
    return failFrom(err);
  }
};

const resolver = new Resolver();
for (const name of Object.values(INVOKE)) resolver.define(name, guard(name, HANDLERS[name]));

export const handler = resolver.getDefinitions();
