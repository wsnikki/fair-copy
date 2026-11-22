// [B] Pure history functions: no @forge/* import, so node:test can load this file directly.
// provider.js re-exports `normaliseChangelog` (contract: HistoryProvider) and uses `mergeHistory`.
import { HISTORY_KIND, STATUS_CATEGORY } from '../contract.js';
import { toIso } from '../lib/format.js';

/** @typedef {import('../contract.js').HistoryEvent} HistoryEvent */
/** @typedef {import('../contract.js').Person} Person */
/** @typedef {import('../contract.js').StatusCategory} StatusCategory */

/** Shown when Jira gives no actor (deleted account, anonymous edit). */
const NOBODY = Object.freeze({ id: '', name: '', kind: 'jira' });

const TEXT_FIELDS = new Set(['summary', 'description']);

/**
 * Status id or name → category. The site map (clients/jira getStatusCategories) is the truth; a status that has since
 * been deleted from the workflow is not in it, so its name is read instead.
 * @returns {StatusCategory}
 */
export const statusCategoryOf = (id, name, categories) => {
  const known = (id !== null && id !== undefined && categories[id]) || (name && categories[name]);
  if (known) return known;
  const text = String(name ?? '').toLowerCase();
  if (/done|closed|resolved|complete|released|accepted/.test(text)) return STATUS_CATEGORY.DONE;
  if (/progress|review|test|doing|develop|build/.test(text)) return STATUS_CATEGORY.IN_PROGRESS;
  return STATUS_CATEGORY.TODO;
};

const fieldOf = (item) => String(item.fieldId || item.field || '').toLowerCase() === 'status'
  ? 'status'
  : String(item.fieldId || item.field || '');

const isStatus = (item) => fieldOf(item) === 'status';
const isAssignee = (item) => String(item.fieldId || item.field || '').toLowerCase() === 'assignee';

/** The criteria field may be named by its Jira id (`customfield_10050`) or by its display name. */
const isCriteria = (item, criteriaField) =>
  Boolean(criteriaField) && (item.fieldId === criteriaField || item.field === criteriaField);

const person = (id, name) => (id ? { id, name: name || id, kind: 'jira' } : null);

/** @type {import('../contract.js').HistoryProvider['normaliseChangelog']} */
export const normaliseChangelog = (issue, changes, categories, criteriaField = null) => {
  const ordered = [...changes].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  // `toString` is a real key in Jira's JSON; on an item without it, `item.toString` would be Object's method.
  const items = ordered.flatMap((change) =>
    change.items.map((item) => ({
      change,
      item: { ...item, toString: typeof item.toString === 'string' ? item.toString : null },
    })),
  );

  const firstStatus = items.find(({ item }) => isStatus(item))?.item;
  const firstAssignee = items.find(({ item }) => isAssignee(item))?.item;

  const startStatusName = firstStatus ? firstStatus.fromString : issue.status.name;
  const startCategory = firstStatus
    ? statusCategoryOf(firstStatus.from, firstStatus.fromString, categories)
    : issue.status.category;
  const startAssignee = firstAssignee ? person(firstAssignee.from, firstAssignee.fromString) : issue.assignee;
  const baselineActor = issue.reporter ?? NOBODY;

  /** @type {HistoryEvent[]} */
  const events = [
    {
      issueKey: issue.key,
      kind: HISTORY_KIND.STATUS,
      field: 'status',
      from: null,
      to: startCategory,
      fromText: null,
      toText: startStatusName ?? null,
      at: issue.created,
      actor: baselineActor,
      source: 'jira',
      baseline: true,
      byApp: false,
    },
    {
      issueKey: issue.key,
      kind: HISTORY_KIND.ASSIGNEE,
      field: 'assignee',
      from: null,
      to: startAssignee ? startAssignee.id : null,
      fromText: null,
      toText: startAssignee ? startAssignee.name : null,
      fromPerson: null,
      toPerson: startAssignee ?? null,
      at: issue.created,
      actor: baselineActor,
      source: 'jira',
      baseline: true,
      byApp: false,
    },
  ];

  for (const { change, item } of items) {
    const author = change.author ?? {};
    const base = {
      issueKey: issue.key,
      at: toIso(change.at),
      actor: author.accountId
        ? { id: author.accountId, name: author.displayName || author.accountId, kind: 'jira' }
        : NOBODY,
      source: 'jira',
      byApp: author.accountType === 'app',
    };

    if (isStatus(item)) {
      events.push({
        ...base,
        kind: HISTORY_KIND.STATUS,
        field: 'status',
        from: statusCategoryOf(item.from, item.fromString, categories),
        to: statusCategoryOf(item.to, item.toString, categories),
        fromText: item.fromString ?? null,
        toText: item.toString ?? null,
      });
    } else if (isAssignee(item)) {
      events.push({
        ...base,
        kind: HISTORY_KIND.ASSIGNEE,
        field: 'assignee',
        from: item.from || null,
        to: item.to || null,
        fromText: item.fromString ?? null,
        toText: item.toString ?? null,
        fromPerson: person(item.from, item.fromString),
        toPerson: person(item.to, item.toString),
      });
    } else if (isCriteria(item, criteriaField) || TEXT_FIELDS.has(String(item.fieldId || item.field).toLowerCase())) {
      // Jira carries the text in fromString / toString (and not always: long bodies can be absent).
      const from = item.fromString ?? item.from ?? null;
      const to = item.toString ?? item.to ?? null;
      events.push({
        ...base,
        kind: HISTORY_KIND.TEXT,
        field: isCriteria(item, criteriaField) ? criteriaField : String(item.fieldId || item.field).toLowerCase(),
        from,
        to,
        fromText: from,
        toText: to,
      });
    } else {
      events.push({
        ...base,
        kind: HISTORY_KIND.OTHER,
        field: fieldOf(item),
        from: item.from ?? item.fromString ?? null,
        to: item.to ?? item.toString ?? null,
        fromText: item.fromString ?? null,
        toText: item.toString ?? null,
      });
    }
  }
  return events;
};

// Ties at the same second: baseline first, then the sample ledger, then Jira.
const rank = (e) => (e.baseline ? 0 : e.source === 'sample' ? 1 : 2);

const identity = (e) =>
  JSON.stringify([e.issueKey, e.kind, e.field, e.from ?? null, e.to ?? null, e.at, e.actor?.id ?? '', Boolean(e.baseline)]);

/**
 * Merge one issue's Jira events and sample-ledger events into one list.
 * - Sorted by `at`; ties: baseline, ledger, Jira; otherwise the order given (the changelog's own order).
 * - Deduplicated: the same fact (issue, kind, field, from, to, time, actor) is kept once, the ledger's copy winning.
 * - When the ledger tells the status (or assignee) story of an issue, the Jira baseline of that kind is dropped: the
 *   ledger starts earlier than the day the loader created the issue, so Jira's "starting state" would be a false reset.
 * Every event keeps its `source`.
 * @param {HistoryEvent[]} jiraEvents
 * @param {HistoryEvent[]} ledgerEvents
 * @returns {HistoryEvent[]}
 */
export const mergeHistory = (jiraEvents, ledgerEvents) => {
  const ledgerKinds = new Set(ledgerEvents.map((e) => e.kind));
  const all = [
    ...ledgerEvents.map((e) => ({ ...e, source: 'sample' })),
    ...jiraEvents.filter((e) => !(e.baseline && ledgerKinds.has(e.kind))),
  ].map((event, index) => ({ event, index }));

  all.sort((a, b) => {
    if (a.event.at !== b.event.at) return a.event.at < b.event.at ? -1 : 1;
    return rank(a.event) - rank(b.event) || a.index - b.index;
  });

  const seen = new Set();
  const merged = [];
  for (const { event } of all) {
    const id = identity(event);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(event);
  }
  return merged;
};
