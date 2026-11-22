// [D] Sign-off requests: check an approver, ask, withdraw.
// Contract: typedef `ServiceRequests` in src/contract.js.
import { ERROR, REQUEST_STATE, SIGN_OFF_LABEL } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { BRAND } from '../lib/brand.js';
import { formatDay, nowIso } from '../lib/format.js';
import * as jira from '../clients/jira.js';
import * as dataSettings from '../data/settings.js';
import * as dataRequests from '../data/requests.js';
import { notAPerson } from '../domain/signingRules.js';
import { permissionsOf } from './access.js';
import { assembleRelease } from './readiness.js';
import { issueTypeFor, loadReleases, need, requireAccount, resolvePeople } from './support.js';

/** @typedef {import('../contract.js').ServiceRequests} Api */

/**
 * A person a duty can be given to (approver, owner of a condition, authoriser of a waiver): a sample person inside the
 * sample, else an active human account of this site. An app account ("Slack", "System") is refused by name:
 * "Slack is an app, not a person. Choose a person."
 * @param {string} id
 * @param {string} field      the form field the refusal belongs to
 * @param {string} sentence   said when Jira does not know the account at all
 */
export const requirePerson = async (id, field, sentence) => {
  const known = (await resolvePeople([id]))[id];
  if (known?.kind === 'sample') {
    if (known.name === id) throw new AppError(ERROR.INVALID, sentence, { field });
    return;
  }
  // clients/jira.getAccount gives the name and Jira's accountType, so the refusal can say why. A client without it
  // refuses the same accounts through isActiveUser, with the general sentence.
  const account = typeof jira.getAccount === 'function' ? await jira.getAccount(id) : null;
  const why = account ? notAPerson(account) : null;
  if (why) throw new AppError(ERROR.INVALID, why, { field });
  if (!account && !(await jira.isActiveUser(id))) throw new AppError(ERROR.INVALID, sentence, { field });
};

/** @type {Api['checkApprover']} An account that is not a person is refused before any history is read. */
export const checkApprover = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const releaseId = need(q, 'releaseId');
  const approverId = need(q, 'approverId', 'Choose an approver.');
  await requirePerson(approverId, 'approverId', 'Choose an approver who is an active person on this site.');
  const { readiness } = await assembleRelease(ctx, { projectKey, releaseId, approverId, requesterId: ctx.accountId });
  if (readiness.historyError) throw new AppError(ERROR.HISTORY_UNREADABLE, readiness.historyError);
  return { conflicts: readiness.duties.conflicts.filter((c) => c.person.id === approverId) };
};

/** @type {Api['requestSignoff']} */
export const requestSignoff = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const releaseId = need(q, 'releaseId');
  const approverId = need(q, 'approverId', 'Choose an approver.');
  const dueDate = need(q, 'dueDate', 'Choose the date to decide by.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new AppError(ERROR.INVALID, 'Choose the date to decide by.', { field: 'dueDate' });
  }
  const accountId = requireAccount(ctx);
  const note = typeof q.note === 'string' ? q.note.trim() : '';

  const [settings, releases, open, project] = await Promise.all([
    dataSettings.getSettings(projectKey),
    loadReleases(projectKey),
    dataRequests.getOpenRequest(projectKey, releaseId),
    jira.getProject(projectKey),
  ]);
  const release = releases.find((r) => r.id === releaseId);
  if (!release || !project) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  if (open) {
    throw new AppError(
      ERROR.REQUEST_OPEN,
      `There is already an open request for this release, with ${open.approver.name}. Withdraw it before sending another.`,
    );
  }
  const people = await resolvePeople([approverId, accountId]);
  const approver = people[approverId];
  await requirePerson(approverId, 'approverId', 'Choose an approver who is an active person on this site.');
  if (note.length > 2000) throw new AppError(ERROR.INVALID, 'Keep the note under 2,000 characters.', { field: 'note' });
  if (settings.people.approvers.length > 0 && !settings.people.approvers.includes(approverId)) {
    throw new AppError(
      ERROR.INVALID,
      `${approver.name} is not on the list of approvers for this project. Choose someone else, or change the list in settings.`,
      { field: 'approverId' },
    );
  }

  let taskKey = null;
  if (q.createTask) {
    try {
      const [task] = await jira.createIssues(
        [
          {
            projectKey,
            ...(await issueTypeFor(projectKey, ['Task'])),
            summary: `Decide on Release ${release.name} of ${project.name} by ${formatDay(dueDate, null, true)}`,
            description: `You are asked to accept Release ${release.name} of ${project.name}. Open the ${BRAND} tab of the project and read the brief.${note ? `\n\n${note}` : ''}`,
            fixVersion: null,
            labels: [SIGN_OFF_LABEL],
            assigneeId: approver.kind === 'jira' ? approver.id : null,
          },
        ],
        { asUser: true },
      );
      taskKey = task?.key ?? null;
    } catch (err) {
      console.warn('sign-off task could not be created', err?.message);
    }
  }
  const id = await dataRequests.insertRequest({
    projectKey,
    releaseId,
    releaseName: release.name,
    requestedBy: accountId,
    requestedAt: nowIso(),
    approver: approverId,
    dueDate,
    note,
    taskKey,
    sample: false,
  });
  return dataRequests.getRequest(id);
};

/** @type {Api['withdrawRequest']} By whoever asked, the approver, or a project administrator. */
export const withdrawRequest = async (ctx, q) => {
  const id = need(q, 'requestId');
  const accountId = requireAccount(ctx);
  const request = await dataRequests.getRequest(id);
  if (!request) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  if (request.state === REQUEST_STATE.OPEN) {
    const may =
      request.requestedBy.id === accountId ||
      request.approver.id === accountId ||
      (await permissionsOf(ctx, request.projectKey)).projectAdmin;
    if (!may) {
      throw new AppError(
        ERROR.FORBIDDEN,
        `Only ${request.requestedBy.name}, ${request.approver.name} or a project administrator can withdraw this request.`,
      );
    }
    const closed = await dataRequests.closeRequest(id, { state: REQUEST_STATE.WITHDRAWN, closedAt: nowIso() });
    if (!closed) throw new AppError(ERROR.REQUEST_OPEN, 'This request is being decided right now and can no longer be withdrawn.');
  }
  return dataRequests.getRequest(id);
};
