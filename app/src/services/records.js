// [D] Records list, the Confluence page (publish, restore, render, read back).
// Contract: typedef `ServiceRecords` in src/contract.js. The pure page code lives in ./recordPage.js.
import { ERROR } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import { nowIso } from '../lib/format.js';
import { issuePath } from '../lib/links.js';
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import * as dataSettings from '../data/settings.js';
import * as dataRecords from '../data/records.js';
import * as dataConditions from '../data/conditions.js';
import * as dataWaivers from '../data/waivers.js';
import { sealedValues } from '../domain/verify.js';
import { PAGE_FORMAT, PARENT_PAGE_TITLE, recordPageTitle, recordsSpaceKey, renderRecordPage as render } from './recordPage.js';
import { appIds, mayRestore, need, resolvePeople, toSummary } from './support.js';

export { extractPageValues, renderRecordPage } from './recordPage.js';

/** @typedef {import('../contract.js').ServiceRecords} Api */
/** @typedef {import('../contract.js').AcceptanceRecord} AcceptanceRecord */

const NO_CONFLUENCE = 'Confluence is not connected to this app on this site';
const PAGE_GONE = "The record's page has been deleted or moved. The sealed record is unchanged.";

const summaryOf = async (record) => toSummary(record, await dataConditions.listConditionsOfRecord(record.id), nowIso());

const mustGet = async (recordId) => {
  const record = await dataRecords.getRecord(recordId);
  if (!record) throw new AppError(ERROR.NOT_FOUND, GENERIC_ERROR);
  return record;
};

/** Every person id a record names. */
export const peopleIdsOf = (payload) => [
  payload.request.requestedBy,
  payload.request.approver,
  payload.decision.decidedBy,
  ...payload.items.flatMap((item) => item.cases.flatMap((c) => [c.run?.executedBy, ...c.staleReasons.map((s) => s.by)])),
  ...payload.duties.builders.map((d) => d.person),
  ...payload.duties.testers.map((d) => d.person),
  ...payload.duties.conflicts.map((d) => d.person),
  ...payload.conditions.map((c) => c.owner),
  ...payload.waivers.flatMap((w) => [w.authorisedBy, w.recordedBy]),
];

/** @type {Api['listRecords']} */
export const listRecords = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const [records, conditions] = await Promise.all([
    dataRecords.listRecords(projectKey),
    dataConditions.listSealedConditions(projectKey),
  ]);
  const now = nowIso();
  const newestFirst = [...records].reverse();
  return {
    records: newestFirst.map((r) => toSummary(r, conditions.filter((c) => c.recordId === r.id), now)),
    chainLine: newestFirst.length
      ? `Each record carries the seal of the one before it: ${newestFirst.map((r) => `Record ${r.number}`).join(' ← ')}. A changed or missing earlier record breaks the link. The chain cannot show that the newest record was removed, or that every record was rewritten together: for that, Verify compares each seal with the comment its signer posted in Jira.`
      : '',
  };
};

/** @type {Api['getRecord']} */
export const getRecord = async (ctx, q) => {
  const record = await mustGet(need(q, 'recordId'));
  const [conditions, waivers, people] = await Promise.all([
    dataConditions.listConditionsOfRecord(record.id),
    dataWaivers.listWaiversOfRecord(record.id),
    resolvePeople(peopleIdsOf(record.payload)),
  ]);
  const linked = [...new Set(conditions.map((c) => c.linkedIssue).filter(Boolean))];
  /** @type {Record<string, {name: string, done: boolean}>} */
  const status = {};
  if (linked.length > 0) {
    try {
      for (const i of await jira.getIssues(linked)) status[i.key] = { name: i.status.name, done: i.status.category === 'done' };
    } catch (err) {
      console.warn('condition issues could not be read', err?.message);
    }
  }
  const p = record.payload;
  const keys = [
    ...p.items.flatMap((item) => [item.requirement.key, ...item.cases.map((c) => c.key)]),
    ...p.defects.map((d) => d.key),
    ...p.duties.conflicts.map((c) => c.item),
    ...linked,
    ...(record.anchorIssue ? [record.anchorIssue] : []),
  ].filter((k) => /^[A-Z][A-Z0-9_]*-\d+$/.test(String(k)));
  return {
    record,
    summary: toSummary(record, conditions, nowIso()),
    people,
    conditions: conditions.map((c) => ({
      ...c,
      linkedIssueUrl: c.linkedIssue ? issuePath(c.linkedIssue) : null,
      linkedIssueStatus: c.linkedIssue ? status[c.linkedIssue]?.name ?? null : null,
      linkedIssueDone: c.linkedIssue && status[c.linkedIssue] ? status[c.linkedIssue].done : null,
    })),
    waivers,
    issueUrls: Object.fromEntries([...new Set(keys)].map((k) => [k, issuePath(k)])),
  };
};


/** The space and the parent page records are published under. Throws Error(reason) when there is nowhere to publish. */
const placeFor = async (settings, project) => {
  const chosen = settings.records.spaceKey;
  const stored = chosen ? null : await dataSettings.getRecordsSpace(project.key);
  let space = null;
  if (chosen) space = await confluence.getSpaceByKey(chosen);
  else if (stored) space = { id: stored.spaceId, key: stored.spaceKey, homepageId: null };
  else {
    const key = recordsSpaceKey(project.key);
    space = (await confluence.getSpaceByKey(key)) ?? (await confluence.createSpace({ key, name: `${project.name} Acceptance` }));
  }
  if (!space) throw new Error(chosen ? `space ${chosen} was not found` : 'the space for records could not be created');

  let parentId = stored?.parentPageId ?? null;
  if (parentId && !(await confluence.getPage(parentId))) parentId = null;
  if (!parentId) {
    const parent =
      (await confluence.findPageByTitle(space.id, PARENT_PAGE_TITLE)) ??
      (await confluence.createPage({
        spaceId: space.id,
        parentId: space.homepageId ?? null,
        title: PARENT_PAGE_TITLE,
        storage: '<p>Every acceptance decision is sealed and listed here, each chained to the one before.</p>',
      }));
    parentId = parent?.id ?? null;
  }
  if (!chosen && (!stored || stored.parentPageId !== parentId)) {
    await dataSettings.setRecordsSpace({ spaceId: space.id, spaceKey: space.key, parentPageId: parentId }, project.key);
  }
  return { space, parentId };
};

/**
 * The page of a record exactly as the app writes it NOW: title and storage. Publish and restore write this; Verify
 * compares the page with it. Besides the sealed values it carries two live facts that are not sealed: the Jira issue of
 * each condition and the issue where the signer posted the seal.
 * @param {import('../contract.js').Ctx} ctx
 * @param {AcceptanceRecord} record
 * @returns {Promise<{title: string, storage: string, people: Record<string, import('../contract.js').Person>, projectInfo: {key: string, name: string}}>}
 */
export const pageOf = async (ctx, record) => {
  const [project, people, conditions] = await Promise.all([
    jira.getProject(record.projectKey).catch(() => null),
    resolvePeople(peopleIdsOf(record.payload)),
    dataConditions.listConditionsOfRecord(record.id),
  ]);
  const projectInfo = project ?? { key: record.projectKey, name: record.projectKey };
  const byId = new Map(conditions.map((c) => [String(c.id), c]));
  const storage = render(record, people, sealedValues(record.payload, record.seal), {
    macro: appIds(),
    siteUrl: ctx.siteUrl,
    conditionIssues: record.payload.conditions.map((c) => byId.get(String(c.id))?.linkedIssue ?? c.linkedIssue ?? null),
    anchorIssue: record.anchorIssue,
  });
  return { title: recordPageTitle(record, projectInfo.name), storage, people, projectInfo };
};

/**
 * Writes the page from the sealed payload: a new page, or a new version of the page the record already has.
 * Never throws for Confluence trouble: stores pageStatus 'failed' + pageError and returns.
 * @param {import('../contract.js').Ctx} ctx
 * @param {AcceptanceRecord} record
 * @param {string} message   version comment
 */
const writePage = async (ctx, record, message) => {
  try {
    const [settings, { title, storage, projectInfo }] = await Promise.all([
      dataSettings.getSettings(record.projectKey),
      pageOf(ctx, record),
    ]);

    let page = null;
    const existing = record.pageId ? await confluence.getPage(record.pageId) : null;
    if (existing) {
      page = await confluence.updatePage(existing.id, { title, storage, version: existing.version + 1, message });
    } else {
      if (!(await confluence.isAvailable())) throw new Error(NO_CONFLUENCE);
      const { space, parentId } = await placeFor(settings, projectInfo);
      const sameTitle = await confluence.findPageByTitle(space.id, title);
      page = sameTitle
        ? await confluence.updatePage(sameTitle.id, { title, storage, version: sameTitle.version + 1, message })
        : await confluence.createPage({ spaceId: space.id, parentId, title, storage });
    }
    if (!page) throw new Error('Confluence did not return the page');
    await confluence.setFullWidth(page.id);
    await confluence.setSealProperty(page.id, {
      recordId: record.id,
      recordNumber: record.number,
      projectKey: record.projectKey,
      seal: record.seal,
      prevSeal: record.prevSeal,
      sealedVersion: page.version,
      format: PAGE_FORMAT,
    });
    await dataRecords.setRecordPage(record.id, { pageId: page.id, pageUrl: page.url, pageStatus: 'published', pageError: null });
    if (record.followups.includes('page')) await dataRecords.setFollowups(record.id, record.followups.filter((f) => f !== 'page'));
  } catch (err) {
    console.warn('record page could not be written', err?.message);
    // "Not connected" is a state, not a failed try: storing it as an error made screens repeat it after Confluence was connected.
    const reason = String(err?.message ?? err).replace(/\.$/, '') || NO_CONFLUENCE;
    const notConnected = reason === NO_CONFLUENCE && !record.pageId;
    await dataRecords.setRecordPage(record.id, {
      pageId: record.pageId,
      pageUrl: record.pageUrl,
      pageStatus: notConnected ? 'none' : 'failed',
      pageError: notConnected ? null : reason,
    });
  }
  return summaryOf(await dataRecords.getRecord(record.id));
};

/** @type {Api['publishPage']} */
export const publishPage = async (ctx, q) => writePage(ctx, await mustGet(need(q, 'recordId')), 'Published from the sealed record');

/** @type {Api['restorePage']} */
export const restorePage = async (ctx, q) => {
  const record = await mustGet(need(q, 'recordId'));
  const settings = await dataSettings.getSettings(record.projectKey);
  if (!mayRestore(settings, ctx.accountId)) {
    throw new AppError(
      ERROR.FORBIDDEN,
      `You do not have permission to do this in ${record.projectKey}. Ask a project administrator.`,
    );
  }
  if (!record.pageId || !(await confluence.getPage(record.pageId))) throw new AppError(ERROR.CONFLUENCE, PAGE_GONE);
  const summary = await writePage(ctx, record, 'Restored from the sealed record');
  if (summary.pageStatus !== 'published') {
    const after = await dataRecords.getRecord(record.id);
    throw new AppError(
      ERROR.CONFLUENCE,
      `The sealed record is unchanged. The Confluence page could not be written: ${after?.pageError ?? NO_CONFLUENCE}.`,
    );
  }
  return summary;
};
