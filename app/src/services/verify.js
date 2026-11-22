// [D] Verify seal: V1–V5 and "after signing, in Jira".
// Contract: typedef `ServiceVerify` in src/contract.js.
//
// What the checks show, and what they do not (STATUS.md says the same):
//   V1 stored record  the stored text still hashes to its seal, and the list columns agree with it. The seal is an
//                     unkeyed SHA-256 kept next to the text: this alone only shows the row is consistent with itself.
//   V2 page           every value and all other text of the Confluence page against the record.
//   V3 chain          the neighbours' seals. A removed NEWEST record is not detectable by the chain.
//   V4 evidence       the sealed files still exist with the same bytes.
//   V5 Jira comment   the seal as the signer posted it under their own name at signing. Jira owns that comment's author
//                     and time, so a record rewritten afterwards stops agreeing with it. This is the outside witness.
import { ERROR, HISTORY_KIND, STATUS_CATEGORY, VERIFY_RESULT } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { formatDay, nowIso } from '../lib/format.js';
import { issuePath } from '../lib/links.js';
import { kvs } from '@forge/kvs';
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import * as dataSettings from '../data/settings.js';
import * as dataRecords from '../data/records.js';
import { getHistory } from '../history/provider.js';
import {
  comparePage,
  evidenceNextStart,
  evidenceReadOrder,
  evidenceWords,
  overallResult,
  resultTitle,
  sealedValues,
  verifyAnchor,
  verifyChain,
  verifyEvidence,
  verifySnapshot,
} from '../domain/verify.js';
import { PAGE_FORMAT, extractPageValues, pageValue, restPair } from './recordPage.js';
import { pageOf, peopleIdsOf } from './records.js';
import { mayRestore, need, resolvePeople } from './support.js';

/** @typedef {import('../contract.js').ServiceVerify} Api */
/** @typedef {import('../contract.js').AcceptanceRecord} AcceptanceRecord */

const PAGE_GONE = "The record's Confluence page has been deleted or moved, so it could not be compared. The sealed record is unchanged.";
const PANEL_REMOVED = 'The seal panel was removed from the page.';
const NO_PAGE = { ok: null, notApplicable: true, message: 'This record has no Confluence page, so there is no copy that could differ' };
/** Through MCP a call may carry no site address. The links are then compared by path only, which is not a full check. */
const LINKS_NOT_CHECKED =
  "The site's address was not available to this call, so where the links on the Confluence page go was compared by path only. Every value and all other text on the page match the record. Verify again from the project page";
const none = { editedBy: null, editedAt: null, version: null };

/** @returns {Promise<AcceptanceRecord>} */
const findRecord = async (ctx, q) => {
  let record = null;
  if (q.recordId) record = await dataRecords.getRecord(String(q.recordId));
  else if (q.pageId) {
    record = await dataRecords.getRecordByPage(String(q.pageId));
    if (!record) {
      const property = await confluence.getSealProperty(String(q.pageId)).catch(() => null);
      if (property?.recordId) record = await dataRecords.getRecord(String(property.recordId));
    }
  } else if (q.projectKey) {
    record =
      q.recordNumber == null
        ? await dataRecords.latestRecord(q.projectKey)
        : await dataRecords.getRecordByNumber(q.projectKey, Number(q.recordNumber));
  }
  // A record id or page from another project than the one that was authorised is treated as not found.
  if (record && q.projectKey && record.projectKey !== q.projectKey) record = null;
  if (!record) {
    if (q.pageId) console.warn(`verify: no record for page ${q.pageId}`);
    throw new AppError(ERROR.NOT_FOUND, q.pageId ? 'This page is not an acceptance record.' : GENERIC_ERROR);
  }
  return record;
};

/** V1, second half: the columns the lists and the chain read must say what the sealed text says. */
const indexDifferences = (record) => {
  const p = record.payload;
  if (!p) return [];
  const pairs = [
    ['Outcome', p.decision?.outcome, record.outcome],
    ['Decided by', p.decision?.decidedBy, record.decidedBy?.id],
    ['Decided on', p.decision?.decidedAt, record.decidedAt],
    ['Previous seal', p.prevSeal, record.prevSeal],
    ['Record number', p.recordNumber, record.number],
    ['Release', p.release?.id, record.releaseId],
  ];
  return pairs
    .filter(([, sealed, stored]) => String(sealed ?? '') !== String(stored ?? ''))
    .map(([label, sealed, stored]) => ({
      check: 'snapshot',
      where: `Stored record · ${label}`,
      sealed: sealed == null ? null : String(sealed),
      found: stored == null ? null : String(stored),
      ...none,
    }));
};

/** V2: read the page back; compare every sealed value on it and all of its other text with a fresh render. */
const checkPage = async (ctx, record) => {
  if (!record.pageId) return { check: NO_PAGE, differences: [], exists: false };
  let page = null;
  try {
    page = await confluence.getPage(record.pageId);
  } catch (err) {
    console.warn('record page could not be read', err?.message);
    return { check: { ok: null, message: 'The Confluence page could not be read. Verify again.' }, differences: [], exists: true };
  }
  if (!page) return { check: { ok: null, message: PAGE_GONE }, differences: [], exists: false };

  const property = await confluence.getSealProperty(page.id).catch(() => null);
  if (property && Number(property.format ?? 1) !== PAGE_FORMAT) {
    return {
      check: {
        ok: null,
        restorable: true,
        message: 'This page was written by an earlier version of the app and its layout has changed, so it was not compared. Restore the page from the sealed record, then verify again.',
      },
      differences: [],
      exists: true,
    };
  }

  const expected = sealedValues(record.payload, record.seal);
  const fresh = await pageOf(ctx, record);
  const { values, hasSealPanel } = extractPageValues(page.storage);
  const people = { ...fresh.people, ...(await resolvePeople([page.versionAuthorId])) };
  const edit = { editedBy: page.versionAuthorId ? people[page.versionAuthorId] : null, editedAt: page.versionAt, version: page.version };
  // The page never prints a person id (recordPage.pageValue), so the comparison is with what the page was given.
  // Links: the site's own links count the same with or without the site in front; when the site's address is not
  // known to this call (ctx.siteUrl ''), only their paths are compared and the check is then never "ok".
  const rest = restPair(fresh.storage, page.storage, ctx.siteUrl);
  const compared = comparePage(
    expected.map((sv) => ({ ...sv, value: pageValue(sv, people) })),
    values,
    edit,
    rest,
  );
  // A mention is read back as an account id: say the name.
  const named = (text) => (text !== null && people[text] ? people[text].name : text);
  const differences = compared.differences.map((d) => ({ ...d, sealed: named(d.sealed), found: named(d.found) }));
  if (page.title !== fresh.title) differences.push({ check: 'page', where: 'Page title', sealed: fresh.title, found: page.title, ...edit });
  if (property && property.seal !== record.seal) {
    differences.push({ check: 'page', where: 'Page property · Seal', sealed: record.seal, found: property.seal ?? null, ...edit });
  }
  if (!hasSealPanel) differences.push({ check: 'page', where: 'Seal panel at the top of the page', sealed: 'present', found: PANEL_REMOVED, ...edit });
  const check =
    differences.length > 0
      ? {
          ok: false,
          message:
            differences.length === 1
              ? `The Confluence page differs from the record in 1 place: ${differences[0].where}`
              : `The Confluence page differs from the record in ${differences.length} places`,
          compared: compared.check.compared,
        }
      : rest.linksChecked
        ? compared.check
        : { ok: null, message: LINKS_NOT_CHECKED, compared: compared.check.compared };
  return { check, differences, exists: true };
};

/** V3 */
const checkChain = async (record) => {
  const [previous, next] = await Promise.all([
    record.number > 1 ? dataRecords.getRecordByNumber(record.projectKey, record.number - 1) : Promise.resolve(null),
    dataRecords.getRecordByNumber(record.projectKey, record.number + 1),
  ]);
  return verifyChain(
    { number: record.number, seal: record.seal, prevSeal: record.prevSeal },
    previous ? { number: previous.number, seal: previous.seal } : null,
    next ? { number: next.number, prevSeal: next.prevSeal } : null,
  );
};

/**
 * Where the last evidence check of a record stopped reading bytes, so that the next one carries on (a hint only:
 * nothing is ever reported as checked because of it). Kept in app storage; when that cannot be read or written, in
 * this function's memory, which lasts as long as Forge keeps the function warm.
 */
const lastStop = new Map();
const stopKey = (recordId) => `verify-evidence-next-${recordId}`;
const readStop = async (recordId) => {
  try {
    const kept = await kvs.get(stopKey(recordId));
    if (Number.isInteger(kept)) return kept;
  } catch (err) {
    console.warn('evidence: where the last check stopped could not be read', err?.message);
  }
  return lastStop.get(recordId) ?? 0;
};
const writeStop = async (recordId, next) => {
  lastStop.set(recordId, next);
  try {
    await kvs.set(stopKey(recordId), next);
  } catch (err) {
    console.warn('evidence: where this check stopped could not be kept', err?.message);
  }
};

/**
 * V4. Every sealed file is looked up on its case (id, name, size: one bulk read). Then the bytes of as many as fit
 * before `stopAt` are downloaded and hashed, starting after the ones the last check read; nothing is started after
 * `stopAt` and nothing is left running. What was and was not read is in the sentence (domain/verify.js).
 * @param {AcceptanceRecord} record
 * @param {{stopAt: number, atOnce: number}} limits
 */
const checkEvidence = async (record, limits) => {
  const keys = record.payload.items.flatMap((item) => item.cases.filter((c) => c.run && c.run.evidence.length > 0).map((c) => c.key));
  if (keys.length === 0) return verifyEvidence(record.payload, {});
  let live;
  try {
    const start = await readStop(record.id);
    const order = evidenceReadOrder(record.payload, start);
    live = await jira.liveEvidence(keys, order, { deadline: limits.stopAt, atOnce: limits.atOnce });
    const next = evidenceNextStart(order, live, start);
    if (next !== start) await writeStop(record.id, next);
  } catch (err) {
    console.warn('evidence could not be checked', err?.message);
    live = null;
  }
  return verifyEvidence(record.payload, live);
};

/** V5 */
const checkAnchor = async (record) => {
  const facts = {
    seal: record.seal,
    decidedById: record.payload?.decision?.decidedBy ?? record.decidedBy?.id,
    decidedAt: record.decidedAt,
    anchorIssue: record.anchorIssue,
    sample: record.sample,
  };
  if (!record.anchorIssue || !record.anchorComment) return verifyAnchor({ ...facts, anchorIssue: null }, undefined);
  let comment;
  try {
    comment = await jira.getComment(record.anchorIssue, record.anchorComment);
  } catch (err) {
    console.warn('anchor comment could not be read', err?.message);
    comment = undefined;
  }
  return verifyAnchor(facts, comment);
};

/** What happened in Jira after the decision. Never part of the result; [] when it cannot be read. */
const changedSince = async (record, now) => {
  try {
    const keys = [
      ...record.payload.items.flatMap((item) => [item.requirement.key, ...item.cases.map((c) => c.key)]),
      ...record.payload.defects.map((d) => d.key),
    ];
    if (keys.length === 0) return [];
    const [issues, settings] = await Promise.all([jira.getIssues(keys), dataSettings.getSettings(record.projectKey)]);
    if (issues.length === 0) return [];
    const history = await getHistory(issues, { criteriaField: settings.whatCounts.criteriaField });
    const lines = [];
    for (const issue of issues) {
      const seen = new Set();
      for (const e of history[issue.key] ?? []) {
        if (e.baseline || e.byApp || e.at <= record.decidedAt) continue;
        const on = formatDay(e.at, now);
        let sentence = null;
        if (e.kind === HISTORY_KIND.TEXT) sentence = `${issue.key} edited by ${e.actor.name} on ${on}.`;
        else if (e.kind === HISTORY_KIND.STATUS) {
          sentence =
            e.from === STATUS_CATEGORY.DONE && e.to !== STATUS_CATEGORY.DONE
              ? `${issue.key} reopened by ${e.actor.name} on ${on}.`
              : `${issue.key} moved to ${e.toText ?? e.to} by ${e.actor.name} on ${on}.`;
        }
        if (!sentence || seen.has(sentence)) continue;
        seen.add(sentence);
        lines.push({ issueKey: issue.key, sentence, at: e.at, url: issuePath(issue.key) });
      }
    }
    return lines.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  } catch (err) {
    console.warn('changes since signing could not be read', err?.message);
    return [];
  }
};

/**
 * A check that reads another product gets this long. After that it is reported as not run — and the result is then
 * "not fully checked", never "intact" — instead of holding the whole answer until Forge stops the function at 25 s.
 */
const CHECK_MS = 12000;
const within = (promise, late, ms = CHECK_MS) =>
  Promise.race([promise.catch(() => late), new Promise((resolve) => setTimeout(() => resolve(late), Math.max(0, ms)))]);

const LATE = (what) => ({ ok: null, message: `${what} could not be checked in time. Verify again.` });

/**
 * The evidence check stops ITSELF: it starts no download in the last EVIDENCE_LAST_MS of its time, so the downloads
 * still running end before the time is up, and it answers with what it read. The race below is then only a guard for
 * a Jira that does not answer at all, set EVIDENCE_GUARD_MS later (12 + 4 = 16 s for one record, still inside 25 s).
 */
const EVIDENCE_LAST_MS = 2500;
const EVIDENCE_GUARD_MS = 4000;
/** Downloads at the same time: one record alone, and each of the three records that "Verify seals" checks together. */
const EVIDENCE_AT_ONCE = 8;
const EVIDENCE_AT_ONCE_LIGHT = 4;

/**
 * @param {import('../contract.js').Ctx} ctx
 * @param {AcceptanceRecord} record
 * @param {{budgetMs?: number, light?: boolean}} [opts]   light: no "after signing" lines (lists of many records)
 */
const verifyOne = async (ctx, record, opts = {}) => {
  const now = nowIso();
  const ms = Math.min(CHECK_MS, opts.budgetMs ?? CHECK_MS);
  const evidenceLimits = { stopAt: Date.now() + ms - EVIDENCE_LAST_MS, atOnce: opts.light ? EVIDENCE_AT_ONCE_LIGHT : EVIDENCE_AT_ONCE };
  const [page, chain, evidence, anchor, changedSinceSigning, settings] = await Promise.all([
    within(checkPage(ctx, record), { check: LATE('The Confluence page'), differences: [], exists: Boolean(record.pageId) }, ms),
    checkChain(record),
    within(checkEvidence(record, evidenceLimits), { check: LATE('The evidence files'), differences: [] }, ms + EVIDENCE_GUARD_MS),
    within(checkAnchor(record), { check: LATE("The signer's Jira comment"), differences: [] }, ms),
    opts.light ? Promise.resolve([]) : within(changedSince(record, now), [], ms),
    dataSettings.getSettings(record.projectKey),
  ]);
  const index = indexDifferences(record);
  const stored = verifySnapshot(record.payloadJson, record.seal);
  const snapshot =
    stored.ok && index.length > 0
      ? { ok: false, message: 'The stored record matches its seal, but the list columns kept beside it do not agree with it.' }
      : stored;
  const checks = { snapshot, page: page.check, chain: chain.check, evidence: evidence.check, anchor: anchor.check };
  const result = overallResult(checks);
  return {
    result,
    // The heading as every screen shows it, and the sentence under it when the seal holds but the evidence does not
    // (missing, replaced and changed files counted separately: domain/verify.evidenceWords).
    title: resultTitle(result, evidence.check),
    evidenceLine: result === VERIFY_RESULT.INTACT_EVIDENCE_MISSING ? evidenceWords(evidence.check)?.line ?? null : null,
    recordId: record.id,
    recordNumber: record.number,
    releaseName: record.releaseName,
    seal: record.seal,
    sealedAt: record.decidedAt,
    checks,
    differences: [
      ...(stored.ok === false ? [{ check: 'snapshot', where: 'Stored record', sealed: record.seal, found: null, ...none }] : []),
      ...index,
      ...page.differences,
      ...chain.differences,
      ...evidence.differences,
      ...anchor.differences,
    ],
    changedSinceSigning,
    pageUrl: record.pageUrl,
    anchorIssueKey: record.anchorIssue,
    canRestore: page.exists && mayRestore(settings, ctx.accountId),
    checkedAt: now,
  };
};

/** @type {Api['verifyRecord']} */
export const verifyRecord = async (ctx, q) => verifyOne(ctx, await findRecord(ctx, q ?? {}));

/** The whole call must answer well inside Forge's 25 s. */
const ALL_BUDGET_MS = 17000;
const ALL_AT_ONCE = 3;

/** @type {Api['verifyAll']} Three records at a time; whatever does not fit in the time is reported as not checked. */
export const verifyAll = async (ctx, q) => {
  const started = Date.now();
  const records = await dataRecords.listRecords(need(q, 'projectKey'));
  const out = new Array(records.length);
  let next = 0;
  const worker = async () => {
    while (next < records.length) {
      const i = next;
      next += 1;
      out[i] = await verifyOne(ctx, records[i], { light: true, budgetMs: ALL_BUDGET_MS - (Date.now() - started) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(ALL_AT_ONCE, records.length) }, worker));
  return out;
};
