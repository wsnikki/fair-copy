// [D] Product-event trigger, avi:jira:updated:issue (TECH §3(5)). Contract: typedef `Events` in src/contract.js.
// Records "issue X changed at T" so staleness shows within seconds. Never throws; the changelog stays the truth.
import { nowIso, toIso } from './lib/format.js';
import * as dataCases from './data/cases.js';
import * as dataLedger from './data/ledger.js';

/** @typedef {import('./contract.js').Events} Api */

/** The changelog has an edit within minutes; two days of rows is ample. */
const KEEP_MS = 2 * 24 * 3600 * 1000;

/**
 * Pure: the row to store for an event, or null when there is nothing to store (no issue, no changed field, or the
 * change was made by this app — the manifest also filters those with `ignoreSelf`).
 * @param {Parameters<Api['onIssueChanged']>[0] & {selfGenerated?: boolean}} event
 * @param {string} now
 */
export const changeOf = (event, now) => {
  const issueKey = event?.issue?.key;
  if (typeof issueKey !== 'string' || !issueKey.includes('-') || event.selfGenerated === true) return null;
  const fields = [
    ...new Set((event.changelog?.items ?? []).map((item) => item.fieldId ?? item.field).filter((f) => typeof f === 'string' && f)),
  ];
  if (fields.length === 0) return null;
  return {
    projectKey: event.issue.fields?.project?.key ?? issueKey.slice(0, issueKey.lastIndexOf('-')),
    issueKey,
    changedAt: now,
    actor: event.atlassianId ?? null,
    fields,
  };
};

/** @type {Api['onIssueChanged']} */
export const onIssueChanged = async (event) => {
  try {
    const change = changeOf(event, nowIso());
    if (!change) return;
    if ((await dataCases.listCases(change.projectKey)).length === 0) return;
    await dataLedger.insertIssueChange(change);
    // One line per stored event: the proof in `forge logs` that the trigger fires.
    console.log(`issue change stored: ${change.issueKey} [${change.fields.join(', ')}]`);
    await dataLedger.pruneIssueChanges(change.projectKey, toIso(Date.now() - KEEP_MS));
  } catch (err) {
    console.warn('issue change could not be stored', err?.message);
  }
};
