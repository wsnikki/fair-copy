// [D] Draft conditions and waivers on a request, and the act of signing (B1–B3, payload, seal, store), then the
// follow-ups that may be repeated (the signer's Jira comment, condition issues, the Confluence page).
// Contract: typedef `ServiceSigning` in src/contract.js.
//
// Signing is atomic and idempotent:
//   1. a record that already decides this request is returned as it is (a second click, a retry, a second tab);
//   2. the request is CLAIMED with one conditional UPDATE — exactly one caller gets it;
//   3. the record row is inserted (unique on the request and on project + number) and the request is closed.
// Nothing after step 3 can undo or repeat the seal; everything after it lives in finishSigning and can be run again.
import { ERROR, OUTCOME, REQUEST_STATE, SIGN_OFF_LABEL, STATUS_CATEGORY } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { dayOf, nowIso, shortSeal, toIso } from '../lib/format.js';
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import * as dataRequests from '../data/requests.js';
import * as dataRecords from '../data/records.js';
import * as dataConditions from '../data/conditions.js';
import * as dataWaivers from '../data/waivers.js';
import { needsIssue, validateCondition, validateDecision, validateWaiver } from '../domain/signingRules.js';
import { buildPayload, sealPayload, ZERO_SEAL } from '../domain/seal.js';
import { anchorText } from '../domain/verify.js';
import { permissionsOf } from './access.js';
import { getBriefWithSettings } from './brief.js';
import { requirePerson as mustBePerson } from './requests.js';
import { publishPage } from './records.js';
import { createConditionIssues } from './conditions.js';
import { check, issueTypeFor, loadReleases, need, requireAccount, resolvePeople, toSummary } from './support.js';

/** @typedef {import('../contract.js').ServiceSigning} Api */

const onlyApprover = (request) => new AppError(ERROR.B1_NOT_APPROVER, `Only ${request.approver.name} can decide on this release.`);
const BEING_SEALED = 'This decision is being sealed right now. Wait a few seconds, then reload the page.';

const openRequest = async (requestId) => {
  const request = await dataRequests.getRequest(requestId);
  if (!request || request.state !== REQUEST_STATE.OPEN) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  if (request.signing) throw new AppError(ERROR.REQUEST_OPEN, BEING_SEALED);
  return request;
};

const briefOf = (ctx, request) => getBriefWithSettings(ctx, { projectKey: request.projectKey, releaseId: request.releaseId });

/** The issue that does the work when no new one is asked for: a covered defect first, else the first covered issue. */
const existingIssueFor = (covers) => {
  const keys = covers.map((id) => String(id).split(':')).filter(([kind]) => ['defect', 'case', 'req'].includes(kind));
  return (keys.find(([kind]) => kind === 'defect') ?? keys[0])?.[1] ?? null;
};

/** @type {Api['saveCondition']} */
export const saveCondition = async (ctx, q) => {
  const accountId = requireAccount(ctx);
  const request = await openRequest(need(q, 'requestId'));
  if (request.approver.id !== accountId) throw onlyApprover(request);
  const { brief } = await briefOf(ctx, request);
  const text = typeof q.text === 'string' ? q.text.trim() : '';
  const covers = Array.isArray(q.covers) ? [...new Set(q.covers.map(String))] : [];
  check(validateCondition({ text, ownerId: q.ownerId ?? null, dueDate: q.dueDate ?? null, covers, items: brief.openItems }));
  if (text.length > 2000) throw new AppError(ERROR.INVALID, 'Keep the condition under 2,000 characters.', { field: 'text' });
  if (q.dueDate < dayOf(nowIso())) throw new AppError(ERROR.INVALID, 'The due date is in the past. Choose today or later.', { field: 'dueDate' });
  if (q.id && !brief.draft.conditions.some((c) => c.id === String(q.id))) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  await mustBePerson(q.ownerId, 'owner', 'Choose an owner who is an active person on this site.');
  const id = await dataConditions.saveCondition({
    ...(q.id ? { id: String(q.id) } : {}),
    projectKey: request.projectKey,
    requestId: request.id,
    text,
    owner: q.ownerId,
    dueDate: q.dueDate,
    covers,
    // createIssue → left empty here; the issue is created after the decision is sealed (finishSigning).
    linkedIssue: q.createIssue ? null : existingIssueFor(covers),
  });
  return dataConditions.getCondition(id);
};

/** @type {Api['deleteCondition']} */
export const deleteCondition = async (ctx, q) => {
  const accountId = requireAccount(ctx);
  const request = await openRequest(need(q, 'requestId'));
  if (request.approver.id !== accountId) throw onlyApprover(request);
  const id = need(q, 'id');
  const drafts = await dataConditions.listDraftConditions(request.id);
  if (!drafts.some((c) => c.id === id)) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  await dataConditions.deleteDraftCondition(id);
};

/** @type {Api['saveWaiver']} */
export const saveWaiver = async (ctx, q) => {
  const accountId = requireAccount(ctx);
  const request = await openRequest(need(q, 'requestId'));
  const { brief, settings } = await briefOf(ctx, request);
  const covers = typeof q.covers === 'string' ? q.covers : '';
  const reason = typeof q.reason === 'string' ? q.reason.trim() : '';
  const authorisedById = q.authorisedById || null;
  const authorisedByName = authorisedById ? null : (typeof q.authorisedByName === 'string' && q.authorisedByName.trim().slice(0, 200)) || null;
  const waiverAnswer = validateWaiver({
    covers,
    reason,
    authorisedById,
    authorisedByName,
    actorId: accountId,
    approverId: request.approver.id,
    items: brief.openItems,
    settings,
  });
  if (waiverAnswer.ok === false) {
    const ids = waiverAnswer.details?.waiverAuthorities ?? [];
    const people = ids.length > 0 ? await resolvePeople(ids) : {};
    const names = ids.map((id) => people[id].name).join(', ');
    throw new AppError(
      waiverAnswer.code,
      names ? waiverAnswer.error.replace('a waiver authority', names) : waiverAnswer.error,
      waiverAnswer.details,
    );
  }
  if (reason.length > 2000) throw new AppError(ERROR.INVALID, 'Keep the reason under 2,000 characters.', { field: 'reason' });
  if (q.id && !brief.draft.waivers.some((w) => w.id === String(q.id))) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const item = brief.openItems.find((i) => i.id === covers);
  if (authorisedById) await mustBePerson(authorisedById, 'authorisedBy', 'Choose an authoriser who is an active person on this site, or type their name and title.');
  await resolvePeople([authorisedById, accountId]);
  const id = await dataWaivers.saveWaiver({
    ...(q.id ? { id: String(q.id) } : {}),
    projectKey: request.projectKey,
    requestId: request.id,
    covers,
    coversLabel: item ? item.label : covers,
    reason,
    authorisedBy: authorisedById,
    authorisedByName,
    reference: typeof q.reference === 'string' ? q.reference.trim().slice(0, 500) : '',
    recordedBy: accountId,
    recordedAt: nowIso(),
    // Recorded by the person who will sign: allowed by the setting, and printed as "Not independent" wherever it shows.
    selfRecorded: accountId === request.approver.id,
  });
  return dataWaivers.getWaiver(id);
};

/** @type {Api['deleteWaiver']} Whoever recorded it, the approver, or a project administrator. */
export const deleteWaiver = async (ctx, q) => {
  const accountId = requireAccount(ctx);
  const request = await openRequest(need(q, 'requestId'));
  const id = need(q, 'id');
  const drafts = await dataWaivers.listDraftWaivers(request.id);
  const waiver = drafts.find((w) => w.id === id);
  if (!waiver) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const may =
    waiver.recordedBy.id === accountId ||
    request.approver.id === accountId ||
    (await permissionsOf(ctx, request.projectKey)).projectAdmin;
  if (!may) {
    throw new AppError(ERROR.FORBIDDEN, `Only ${waiver.recordedBy.name}, the approver or a project administrator can remove this waiver.`);
  }
  await dataWaivers.deleteDraftWaiver(id);
};

const followupsFor = ({ conditions, taskKey }) => ['anchor', ...(conditions > 0 ? ['issues'] : []), 'page', ...(taskKey ? ['task'] : [])];

const sealedAnswer = async (record) => ({
  record: toSummary(record, await dataConditions.listConditionsOfRecord(record.id), nowIso()),
  flag: `Sealed. Record ${record.number} · seal ${shortSeal(record.seal)}.`,
  pending: record.followups.length > 0,
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isDuplicate = (err) => /duplicate|ER_DUP|1062|unique/i.test(`${err?.code ?? ''} ${err?.message ?? err}`);

/** @type {Api['sign']} */
export const sign = async (ctx, q) => {
  const accountId = requireAccount(ctx);
  const request = await dataRequests.getRequest(need(q, 'requestId'));
  if (!request) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);

  // 1. Already sealed for this request (second click, retry after a cut-off, second tab): the same record again.
  const existing = await dataRecords.getRecordByRequest(request.id);
  if (existing) {
    if (request.approver.id !== accountId) throw onlyApprover(request);
    return sealedAnswer(existing);
  }

  const { brief, settings } = await briefOf(ctx, request);
  if (brief.historyError) throw new AppError(ERROR.HISTORY_UNREADABLE, brief.historyError);

  const statement = typeof q.statement === 'string' ? q.statement.trim() : '';
  if (statement.length > 4000) throw new AppError(ERROR.INVALID, 'Keep the statement under 4,000 characters.', { field: 'statement' });
  const answer = validateDecision({
    request,
    actorId: accountId,
    outcome: q.outcome,
    statement,
    affirmed: q.affirmed === true,
    fingerprint: typeof q.fingerprint === 'string' ? q.fingerprint : '',
    currentFingerprint: brief.fingerprint,
    items: brief.openItems,
  });
  if (answer.ok === false) {
    throw new AppError(answer.code, answer.error, answer.code === ERROR.B2_BRIEF_CHANGED ? { brief } : answer.details);
  }

  // 2. Claim. Whoever loses the race waits for the winner's record and answers with it.
  const now = nowIso();
  const staleAt = toIso(Date.now() - dataRequests.CLAIM_STALE_SECONDS * 1000);
  if (!(await dataRequests.claimRequest(request.id, now, staleAt))) {
    for (let i = 0; i < 8; i += 1) {
      const theirs = await dataRecords.getRecordByRequest(request.id);
      if (theirs) return sealedAnswer(theirs);
      await pause(500);
    }
    throw new AppError(ERROR.REQUEST_OPEN, BEING_SEALED);
  }

  // 3. Seal. Only the claimant is here.
  let recordId = null;
  let recordNumber = 0;
  let seal = '';
  const conditions = q.outcome === OUTCOME.ACCEPTED_WITH_CONDITIONS ? brief.draft.conditions : [];
  const waivers = q.outcome === OUTCOME.REJECTED ? [] : brief.draft.waivers;
  try {
    for (let attempt = 0; recordId === null; attempt += 1) {
      const previous = await dataRecords.latestRecord(request.projectKey);
      recordNumber = previous ? previous.number + 1 : 1;
      const payload = buildPayload({
        site: ctx.cloudId,
        project: { id: brief.project.id, key: brief.project.key },
        release: brief.release,
        recordNumber,
        request,
        decision: { outcome: q.outcome, statement, decidedBy: brief.viewer, decidedAt: now },
        counts: brief.counts,
        requirements: brief.requirements,
        defects: brief.defects.filter((d) => d.open),
        duties: brief.duties,
        conditions,
        waivers,
        carried: brief.carried.flatMap((g) => g.conditions),
        rules: settings.rules,
        prevSeal: previous ? previous.seal : ZERO_SEAL,
      });
      const sealed = sealPayload(payload);
      seal = sealed.seal;
      try {
        recordId = await dataRecords.insertRecord({
          projectKey: request.projectKey,
          number: recordNumber,
          releaseId: request.releaseId,
          releaseName: request.releaseName,
          outcome: q.outcome,
          decidedBy: accountId,
          decidedAt: now,
          seal,
          prevSeal: payload.prevSeal,
          payloadJson: sealed.json,
          sample: false,
          requestId: request.id,
          followups: followupsFor({ conditions: conditions.length, taskKey: request.taskKey }),
        });
      } catch (err) {
        // The request already has a record (unique request_id): answer with it.
        const theirs = await dataRecords.getRecordByRequest(request.id);
        if (theirs) return sealedAnswer(theirs);
        // Another request of this project took the number in the same moment: take the next one, re-chained.
        if (!isDuplicate(err) || attempt >= 3) throw err;
      }
    }
  } catch (err) {
    await dataRequests.releaseRequest(request.id);
    throw err;
  }

  // The seal exists from here on. Nothing below may undo it; each line is safe to run twice (finishSigning repeats them).
  await settle(request, { recordId, recordNumber, conditions, waivers, closedAt: now });
  return sealedAnswer(await dataRecords.getRecord(recordId));
};

/** Drafts become part of the record, unused drafts go, the request closes. Idempotent. */
const settle = async (request, { recordId, recordNumber, conditions, waivers, closedAt }) => {
  const [allConditions, allWaivers] = await Promise.all([
    dataConditions.listDraftConditions(request.id),
    dataWaivers.listDraftWaivers(request.id),
  ]);
  const keepC = new Set(conditions.map((c) => String(c.id)));
  const keepW = new Set(waivers.map((w) => String(w.id)));
  // Drafts the chosen outcome does not use (a rejection has no conditions) are dropped, never attached.
  for (const c of allConditions) if (!keepC.has(String(c.id))) await dataConditions.deleteDraftCondition(c.id);
  for (const w of allWaivers) if (!keepW.has(String(w.id))) await dataWaivers.deleteDraftWaiver(w.id);
  await dataConditions.attachConditionsToRecord(request.id, { recordId, recordNumber, releaseName: request.releaseName });
  await dataWaivers.attachWaiversToRecord(request.id, recordId);
  await dataRequests.closeRequest(request.id, { state: REQUEST_STATE.DECIDED, recordId, closedAt });
};

const STEP_LABEL = {
  anchor: 'Posting the seal as your comment in Jira…',
  issues: 'Creating the Jira issues for the conditions…',
  page: 'Publishing the record page in Confluence…',
  task: 'Closing the sign-off task…',
};
const ORDER = ['anchor', 'issues', 'page', 'task'];
/** A new step is started only this long after the call began (the slowest, the page, takes about 8 s). */
const FINISH_BUDGET_MS = 9000;

/**
 * Posts the seal as a comment written AS THE SIGNER on the release's sign-off issue (created now, as the signer, when
 * the request has none). Jira then holds the seal with an author and a time the app cannot rewrite (check V5).
 */
const postAnchor = async (ctx, record, request) => {
  const signer = record.payload.decision.decidedBy;
  if (ctx.accountId !== signer) return { done: false, note: `Only ${record.decidedBy.name} can post the seal as their own Jira comment. Ask them to open Records and choose "Finish publishing".` };
  let issueKey = request?.taskKey ?? null;
  if (issueKey && !(await jira.getIssue(issueKey).catch(() => null))) issueKey = null;
  if (!issueKey) {
    const [task] = await jira.createIssues(
      [
        {
          projectKey: record.projectKey,
          ...(await issueTypeFor(record.projectKey, ['Task'])),
          summary: `Sign-off of Release ${record.releaseName} (Record ${record.number})`,
          description: `The decision on Release ${record.releaseName} was sealed as Record ${record.number}. The signer's comment below carries the seal.`,
          fixVersion: null,
          labels: [SIGN_OFF_LABEL],
          assigneeId: signer,
        },
      ],
      { asUser: true },
    );
    issueKey = task?.key ?? null;
  }
  if (!issueKey) return { done: false, note: 'The sign-off issue could not be created, so the seal was not posted as a Jira comment.' };
  const comment = await jira.addComment(
    issueKey,
    anchorText({ recordNumber: record.number, releaseName: record.releaseName, outcome: record.outcome, seal: record.seal, prevSeal: record.prevSeal }),
    { asUser: true },
  );
  await dataRecords.setRecordAnchor(record.id, { issueKey, commentId: comment.id });
  return { done: true, note: null };
};

/**
 * Everything that follows a seal and may be repeated. Runs the steps the record still lists, as many as fit in the
 * time, and answers `pending: true` while there is more to do and progress was made. Never throws for a failed step:
 * the reason is a sentence in `notes` and the step stays listed for "Finish publishing".
 * @param {import('../contract.js').Ctx} ctx
 * @param {{recordId: string}} q
 * @returns {Promise<{record: import('../contract.js').RecordSummary, pending: boolean, step: string, notes: string[]}>}
 */
export const finishSigning = async (ctx, q) => {
  requireAccount(ctx);
  const started = Date.now();
  let record = await dataRecords.getRecord(need(q, 'recordId'));
  if (!record) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  const request = record.requestId ? await dataRequests.getRequest(record.requestId) : null;
  // A seal whose call was cut off before the drafts were attached: finish that first.
  if (request && request.state === REQUEST_STATE.OPEN) {
    const p = record.payload;
    await settle(request, {
      recordId: record.id,
      recordNumber: record.number,
      conditions: p.conditions,
      waivers: p.waivers,
      closedAt: record.decidedAt,
    });
  }

  const notes = [];
  let left = ORDER.filter((s) => record.followups.includes(s));
  let progressed = false;
  for (const step of [...left]) {
    if (Date.now() - started > FINISH_BUDGET_MS) break;
    let done = false;
    let keep = true;
    try {
      if (step === 'anchor') {
        const out = await postAnchor(ctx, record, request);
        done = out.done;
        if (out.note) notes.push(out.note);
      } else if (step === 'issues') {
        await createConditionIssues(ctx, { record, releases: await loadReleases(record.projectKey) });
        const missing = (await dataConditions.listConditionsOfRecord(record.id)).filter(needsIssue).length;
        done = missing === 0;
        if (!done) notes.push('A Jira issue could not be created for every condition. The conditions are sealed; use "Finish publishing" to try again.');
      } else if (step === 'page') {
        const summary = await publishPage(ctx, { recordId: record.id });
        done = summary.pageStatus === 'published';
        if (!done) {
          const connected = await confluence.isAvailable().catch(() => false);
          keep = connected;
          notes.push(
            connected
              ? `The Confluence page could not be written: ${summary.pageError ?? 'Confluence did not answer'}. The record is sealed and kept in Jira; use "Finish publishing" to try again.`
              : 'Confluence is not connected to this app, so there is no record page. The record is sealed, kept and verified in Jira.',
          );
        }
      } else if (step === 'task') {
        keep = false;
        if (request?.taskKey) await jira.transitionTo(request.taskKey, STATUS_CATEGORY.DONE).catch(() => false);
        done = true;
      }
    } catch (err) {
      console.warn(`finishSigning ${step} failed`, err?.message);
      notes.push(
        step === 'anchor'
          ? 'The seal could not be posted as your Jira comment (Jira refused the comment). The record is sealed; use "Finish publishing" to try again.'
          : `A step after sealing did not finish (${STEP_LABEL[step].replace('…', '')}). The record is sealed; use "Finish publishing" to try again.`,
      );
    }
    if (done || !keep) {
      left = left.filter((s) => s !== step);
      progressed = progressed || done;
      // The page prints the condition issues and where the seal was posted: write it again when they arrive after it.
      if (done && (step === 'anchor' || step === 'issues') && !left.includes('page') && record.pageId) left = ORDER.filter((s) => s === 'page' || left.includes(s));
      await dataRecords.setFollowups(record.id, left);
      record = await dataRecords.getRecord(record.id);
    }
  }

  const more = left.length > 0 && (progressed || Date.now() - started > FINISH_BUDGET_MS) && notes.length === 0;
  return {
    record: toSummary(record, await dataConditions.listConditionsOfRecord(record.id), nowIso()),
    pending: more,
    step: left.length > 0 ? STEP_LABEL[left[0]] : 'Done.',
    notes,
  };
};
