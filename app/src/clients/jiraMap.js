// [B] Pure mapping between Jira REST v3 JSON and the contract's shapes. No @forge/* import (unit-testable).
import { STATUS_CATEGORY } from '../contract.js';
import { toIso } from '../lib/format.js';

/** @typedef {import('../contract.js').Issue} Issue */
/** @typedef {import('../contract.js').RawChange} RawChange */

/** Jira prints offsets as `+0000`; make them `+00:00` so every engine parses them. Epoch numbers pass through. */
export const jiraTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return toIso(value);
  if (/^\d{10,}$/.test(String(value))) return toIso(Number(value));
  return toIso(String(value).replace(/([+-]\d{2})(\d{2})$/, (_, h, m) => `${h}:${m}`));
};

const INLINE_PARENTS = new Set(['paragraph', 'heading', 'codeBlock', 'caption']);

const flatten = (node) => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'mention':
    case 'emoji':
    case 'status':
      return node.attrs?.text ?? node.attrs?.shortName ?? '';
    case 'date':
      return node.attrs?.timestamp ? toIso(Number(node.attrs.timestamp)).slice(0, 10) : '';
    case 'inlineCard':
    case 'blockCard':
    case 'embedCard':
      return node.attrs?.url ?? '';
    default:
  }
  const parts = (node.content ?? []).map(flatten);
  if (INLINE_PARENTS.has(node.type)) return parts.join('');
  if (node.type === 'listItem') return `- ${parts.join('\n')}`;
  if (node.type === 'tableRow') return parts.join(' | ');
  if (node.type === 'tableCell' || node.type === 'tableHeader') return parts.join(' ');
  return parts.join('\n');
};

/** Atlassian Document Format (or a plain string, or null) → plain text. One line per block. */
export const adfToText = (value) => flatten(value).replace(/\s+$/, '');

/** Plain text → ADF, one paragraph per line, so that adfToText(textToAdf(t)) === t for trimmed text. */
export const textToAdf = (text) => ({
  type: 'doc',
  version: 1,
  content: String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] })),
});

/** Jira statusCategory.key → StatusCategory. */
export const categoryOf = (key) =>
  key === 'done' ? STATUS_CATEGORY.DONE : key === 'indeterminate' ? STATUS_CATEGORY.IN_PROGRESS : STATUS_CATEGORY.TODO;

export const toPerson = (user) =>
  user && user.accountId ? { id: user.accountId, name: user.displayName || user.accountId, kind: 'jira' } : null;

export const toAttachment = (a) => ({
  id: String(a.id),
  filename: a.filename ?? '',
  size: Math.trunc(Number(a.size ?? 0)),
  created: jiraTime(a.created) ?? toIso(0),
});

/** The field list every issue read asks for. */
export const issueFields = (criteriaField) => [
  'summary',
  'description',
  'issuetype',
  'status',
  'priority',
  'assignee',
  'reporter',
  'fixVersions',
  'labels',
  'issuelinks',
  'attachment',
  'created',
  'updated',
  'project',
  ...(criteriaField ? [criteriaField] : []),
];

/** @returns {Issue} */
export const toIssue = (raw, criteriaField = null) => {
  const f = raw.fields ?? {};
  return {
    id: String(raw.id),
    key: raw.key,
    projectKey: f.project?.key ?? String(raw.key).split('-')[0],
    summary: f.summary ?? '',
    description: adfToText(f.description),
    criteria: criteriaField ? adfToText(f[criteriaField]) : '',
    type: f.issuetype?.name ?? '',
    typeId: f.issuetype?.id ? String(f.issuetype.id) : null,
    status: { name: f.status?.name ?? '', category: categoryOf(f.status?.statusCategory?.key) },
    priority: f.priority?.name ?? null,
    priorityId: f.priority?.id ? String(f.priority.id) : null,
    assignee: toPerson(f.assignee),
    reporter: toPerson(f.reporter),
    fixVersions: (f.fixVersions ?? []).map((v) => ({ id: String(v.id), name: v.name })),
    labels: f.labels ?? [],
    links: (f.issuelinks ?? [])
      .map((l) =>
        l.outwardIssue
          ? { type: l.type?.name ?? '', direction: 'outward', key: l.outwardIssue.key }
          : l.inwardIssue
            ? { type: l.type?.name ?? '', direction: 'inward', key: l.inwardIssue.key }
            : null,
      )
      .filter(Boolean),
    attachments: (f.attachment ?? []).map(toAttachment),
    created: jiraTime(f.created) ?? toIso(0),
    updated: jiraTime(f.updated) ?? jiraTime(f.created) ?? toIso(0),
  };
};

/**
 * One changelog entry from `GET /issue/{key}/changelog` (`created` is a string) or from
 * `POST /changelog/bulkfetch` (`created` is epoch milliseconds) → RawChange.
 * @returns {RawChange}
 */
export const toRawChange = (history) => ({
  at: jiraTime(history.created) ?? toIso(0),
  author: {
    accountId: history.author?.accountId ?? '',
    displayName: history.author?.displayName ?? '',
    accountType: history.author?.accountType ?? '',
  },
  items: (history.items ?? []).map((i) => ({
    field: i.field ?? '',
    fieldId: i.fieldId ?? null,
    from: i.from ?? null,
    to: i.to ?? null,
    fromString: i.fromString ?? null,
    // `toString` on a parsed JSON object is an own property; anything else is Object.prototype.toString.
    toString: Object.hasOwn(i, 'toString') ? i.toString : null,
  })),
});

export const sortChanges = (changes) => [...changes].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

/** JQL string literal. */
export const jqlQuote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
