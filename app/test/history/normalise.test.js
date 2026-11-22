// Slice B: the pure history functions, against recorded changelog JSON (shape from TECH §3(4)). No @forge/* import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mergeHistory, normaliseChangelog, statusCategoryOf } from '../../src/history/normalise.js';
import { adfToText, jiraTime, sortChanges, textToAdf, toIssue, toRawChange } from '../../src/clients/jiraMap.js';
import { toIso } from '../../src/lib/format.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const CATEGORIES = {
  10000: 'todo',
  'To Do': 'todo',
  10001: 'in_progress',
  'In Progress': 'in_progress',
  10002: 'done',
  Done: 'done',
};
const CRITERIA = 'customfield_10050';

const issue = {
  id: '10009',
  key: 'CLM-9',
  projectKey: 'CLM',
  summary: 'Upload supporting documents (max 5)',
  description: 'A claimant can upload up to 5 documents.',
  criteria: '5 files accepted',
  type: 'Story',
  status: { name: 'Released', category: 'done' },
  priority: 'Medium',
  assignee: { id: 'u-ana', name: 'Ana Reyes', kind: 'jira' },
  reporter: { id: 'app-0001', name: 'Fair Copy', kind: 'jira' },
  fixVersions: [{ id: '10020', name: '2.4' }],
  labels: [],
  links: [],
  attachments: [],
  created: '2026-12-01T09:00:00Z',
  updated: '2026-12-05T13:30:10Z',
};

const changes = () => fixture('changelog-CLM-9.json').values.map(toRawChange);
const events = () => normaliseChangelog(issue, changes(), CATEGORIES, CRITERIA);

test('toRawChange keeps author, items and the toString key; times become IsoTime', () => {
  const raw = changes();
  assert.equal(raw.length, 6);
  assert.equal(raw[0].at, '2026-12-01T09:00:05Z');
  assert.deepEqual(raw[0].author, { accountId: 'app-0001', displayName: 'Fair Copy', accountType: 'app' });
  assert.deepEqual(raw[1].items[1], {
    field: 'status',
    fieldId: 'status',
    from: '10000',
    to: '10001',
    fromString: 'To Do',
    toString: 'In Progress',
  });
  // an offset other than +0000 is converted to UTC
  assert.equal(raw[3].at, '2026-12-03T10:05:44Z');
});

test('toRawChange never mistakes Object.prototype.toString for a value', () => {
  const raw = toRawChange({ created: '2026-12-01T09:00:05.120+0000', author: null, items: [{ field: 'labels' }] });
  assert.equal(raw.items[0].toString, null);
  assert.deepEqual(raw.author, { accountId: '', displayName: '', accountType: '' });
});

test('bulk changelog: epoch times, oldest first after sorting', () => {
  const entry = fixture('changelog-bulkfetch.json').issueChangeLogs[0];
  const raw = sortChanges(entry.changeHistories.map(toRawChange));
  assert.equal(raw[0].at, toIso(1796816940000));
  assert.equal(raw[0].items[0].field, 'assignee');
  assert.equal(raw[1].items[0].toString, 'In Progress');
  assert.ok(raw[0].at < raw[1].at);
});

test('jiraTime', () => {
  assert.equal(jiraTime('2026-12-03T15:40:12.345+0000'), '2026-12-03T15:40:12Z');
  assert.equal(jiraTime('2026-12-03T15:40:12.345-0530'), '2026-12-03T21:10:12Z');
  assert.equal(jiraTime(0), '1970-01-01T00:00:00Z');
  assert.equal(jiraTime(null), null);
});

test('baselines: first status category and first assignee, at the creation time', () => {
  const [status, assignee] = events();
  assert.deepEqual(
    { kind: status.kind, from: status.from, to: status.to, toText: status.toText, at: status.at, baseline: status.baseline },
    { kind: 'status', from: null, to: 'todo', toText: 'To Do', at: '2026-12-01T09:00:00Z', baseline: true },
  );
  assert.deepEqual(
    { kind: assignee.kind, from: assignee.from, to: assignee.to, toPerson: assignee.toPerson, baseline: assignee.baseline },
    { kind: 'assignee', from: null, to: null, toPerson: null, baseline: true },
  );
  assert.equal(status.source, 'jira');
});

test('baselines fall back to the current values when nothing ever changed', () => {
  const list = normaliseChangelog(issue, [], CATEGORIES, null);
  assert.equal(list.length, 2);
  assert.equal(list[0].to, 'done');
  assert.equal(list[0].toText, 'Released');
  assert.equal(list[1].to, 'u-ana');
  assert.deepEqual(list[1].toPerson, { id: 'u-ana', name: 'Ana Reyes', kind: 'jira' });
  assert.ok(list.every((e) => e.baseline === true && e.at === issue.created));
});

test('status moves carry categories, names, actor and time', () => {
  const moves = events().filter((e) => e.kind === 'status' && !e.baseline);
  assert.deepEqual(
    moves.map((e) => [e.from, e.to, e.fromText, e.toText, e.at, e.actor.name]),
    [
      ['todo', 'in_progress', 'To Do', 'In Progress', '2026-12-01T10:15:00Z', 'Leo Marchetti'],
      ['in_progress', 'done', 'In Progress', 'Done', '2026-12-02T16:40:31Z', 'Leo Marchetti'],
      ['done', 'in_progress', 'Done', 'In Progress', '2026-12-05T13:30:10Z', 'Ana Reyes'],
      // status 10009 is not in the site map: its name decides
      ['in_progress', 'done', 'In Progress', 'Released', '2026-12-05T13:30:10Z', 'Ana Reyes'],
    ],
  );
  assert.ok(moves.every((e) => e.field === 'status' && e.source === 'jira' && e.byApp === false));
});

test('assignee changes carry ids and people', () => {
  const moves = events().filter((e) => e.kind === 'assignee' && !e.baseline);
  assert.equal(moves.length, 2);
  assert.deepEqual([moves[0].from, moves[0].to, moves[0].fromPerson], [null, 'u-leo', null]);
  assert.deepEqual(moves[0].toPerson, { id: 'u-leo', name: 'Leo Marchetti', kind: 'jira' });
  assert.deepEqual([moves[1].from, moves[1].to], ['u-leo', 'u-ana']);
  assert.deepEqual(moves[1].fromPerson, { id: 'u-leo', name: 'Leo Marchetti', kind: 'jira' });
  assert.equal(moves[1].actor.id, 'u-ana');
});

test('text edits: summary, description and the configured criteria field', () => {
  const edits = events().filter((e) => e.kind === 'text');
  assert.deepEqual(edits.map((e) => e.field), ['description', 'summary', CRITERIA]);
  assert.equal(edits[0].from, 'A claimant can upload up to 3 documents.');
  assert.equal(edits[0].toText, 'A claimant can upload up to 5 documents.');
  assert.equal(edits[0].at, '2026-12-03T10:05:44Z');
  assert.deepEqual(edits[0].actor, { id: 'u-leo', name: 'Leo Marchetti', kind: 'jira' });
  assert.equal(edits[2].to, '5 files accepted');
});

test('the criteria field is "other" when it is not configured, and matches by name too', () => {
  const without = normaliseChangelog(issue, changes(), CATEGORIES, null);
  const item = without.find((e) => e.field === CRITERIA);
  assert.equal(item.kind, 'other');
  const byName = normaliseChangelog(issue, changes(), CATEGORIES, 'Acceptance criteria');
  assert.ok(byName.some((e) => e.kind === 'text' && e.field === 'Acceptance criteria'));
});

test('everything else is kept as "other"; app edits are flagged', () => {
  const others = events().filter((e) => e.kind === 'other');
  assert.deepEqual(others.map((e) => e.field), ['fixVersions', 'resolution']);
  assert.equal(others[0].byApp, true);
  assert.equal(others[0].to, '10020');
  assert.equal(others[0].toText, '2.4');
  assert.equal(others[1].byApp, false);
});

test('events come out oldest first even when the changelog is not', () => {
  const shuffled = normaliseChangelog(issue, changes().reverse(), CATEGORIES, CRITERIA);
  const times = shuffled.map((e) => e.at);
  assert.deepEqual(times, [...times].sort());
  assert.equal(shuffled.length, events().length);
  assert.equal(shuffled[0].to, 'todo'); // the baseline still comes from the OLDEST status change
});

test('statusCategoryOf: map by id, then by name, then by reading the name', () => {
  assert.equal(statusCategoryOf('10002', 'Whatever', CATEGORIES), 'done');
  assert.equal(statusCategoryOf('999', 'In Progress', CATEGORIES), 'in_progress');
  assert.equal(statusCategoryOf(null, 'Closed', {}), 'done');
  assert.equal(statusCategoryOf(null, 'In review', {}), 'in_progress');
  assert.equal(statusCategoryOf(null, 'Backlog', {}), 'todo');
  assert.equal(statusCategoryOf(null, null, {}), 'todo');
});

const sample = (over) => ({
  issueKey: 'CLM-9',
  kind: 'status',
  field: 'status',
  from: 'todo',
  to: 'in_progress',
  at: '2026-11-20T09:00:00Z',
  actor: { id: 'sample:P3', name: 'Leo Marchetti', kind: 'sample' },
  source: 'sample',
  ...over,
});

test('mergeHistory: sorted, every event tagged with its source', () => {
  const ledger = [
    sample({ from: null, to: 'todo', at: '2026-11-18T08:00:00Z', baseline: true }),
    sample({}),
    sample({ from: 'in_progress', to: 'done', at: '2026-11-25T17:00:00Z' }),
  ];
  const merged = mergeHistory(events(), ledger);
  const times = merged.map((e) => e.at);
  assert.deepEqual(times, [...times].sort());
  assert.ok(merged.every((e) => e.source === 'jira' || e.source === 'sample'));
  assert.equal(merged.filter((e) => e.source === 'sample').length, 3);
  assert.equal(merged[0].source, 'sample');
});

test('mergeHistory: the ledger replaces the Jira baseline of the kinds it tells', () => {
  const merged = mergeHistory(events(), [sample({})]);
  const baselines = merged.filter((e) => e.baseline);
  // status story comes from the ledger → Jira's status baseline is gone; the assignee baseline stays
  assert.deepEqual(baselines.map((e) => [e.kind, e.source]), [['assignee', 'jira']]);
  // nothing else is lost
  assert.equal(merged.length, events().length - 1 + 1);
});

test('mergeHistory: the same fact from both sources is kept once, as the ledger copy', () => {
  const jira = events();
  const twin = jira.find((e) => e.kind === 'status' && !e.baseline);
  const merged = mergeHistory(jira, [{ ...twin, source: 'sample' }]);
  const same = merged.filter((e) => e.kind === 'status' && e.at === twin.at && e.to === twin.to);
  assert.equal(same.length, 1);
  assert.equal(same[0].source, 'sample');
});

test('mergeHistory: ties are baseline, then ledger, then Jira', () => {
  const at = '2026-12-01T10:15:00Z';
  const jira = [
    { ...sample({ at, source: 'jira', kind: 'other', field: 'labels', from: null, to: 'x' }) },
    { ...sample({ at, source: 'jira', kind: 'assignee', field: 'assignee', from: null, to: null, baseline: true }) },
  ];
  const ledger = [sample({ at, kind: 'text', field: 'summary', from: 'a', to: 'b' })];
  const merged = mergeHistory(jira, ledger);
  assert.deepEqual(merged.map((e) => [Boolean(e.baseline), e.source]), [
    [true, 'jira'],
    [false, 'sample'],
    [false, 'jira'],
  ]);
});

test('mergeHistory with nothing', () => {
  assert.deepEqual(mergeHistory([], []), []);
});

test('ADF ↔ plain text', () => {
  const text = 'Given a claim\nWhen I upload 5 files\n\nThen all are accepted';
  assert.equal(adfToText(textToAdf(text)), text);
  assert.equal(adfToText(null), '');
  assert.equal(adfToText('plain string field'), 'plain string field');
  const doc = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'heading', content: [{ type: 'text', text: 'Steps' }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open ' }, { type: 'text', text: 'the form' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Submit' }, { type: 'hardBreak' }, { type: 'text', text: 'twice' }] }] },
        ],
      },
    ],
  };
  assert.equal(adfToText(doc), 'Steps\n- Open the form\n- Submit\ntwice');
});

test('toIssue flattens a Jira issue', () => {
  const mapped = toIssue(
    {
      id: '10009',
      key: 'CLM-9',
      fields: {
        summary: 'Upload supporting documents',
        description: textToAdf('Line one\nLine two'),
        customfield_10050: 'Plain criteria',
        issuetype: { name: 'Story' },
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        priority: { name: 'High' },
        assignee: { accountId: 'u-leo', displayName: 'Leo Marchetti' },
        reporter: null,
        fixVersions: [{ id: '10020', name: '2.4' }],
        labels: ['acceptance-case'],
        issuelinks: [
          { type: { name: 'Relates' }, outwardIssue: { key: 'CLM-20' } },
          { type: { name: 'Blocks' }, inwardIssue: { key: 'CLM-21' } },
        ],
        attachment: [{ id: '10300', filename: 'proof.txt', size: 42, created: '2026-12-02T10:00:00.000+0000' }],
        created: '2026-12-01T09:00:00.000+0000',
        updated: '2026-12-02T10:00:00.000+0000',
        project: { key: 'CLM' },
      },
    },
    'customfield_10050',
  );
  assert.equal(mapped.description, 'Line one\nLine two');
  assert.equal(mapped.criteria, 'Plain criteria');
  assert.deepEqual(mapped.status, { name: 'In Progress', category: 'in_progress' });
  assert.deepEqual(mapped.assignee, { id: 'u-leo', name: 'Leo Marchetti', kind: 'jira' });
  assert.equal(mapped.reporter, null);
  assert.deepEqual(mapped.links, [
    { type: 'Relates', direction: 'outward', key: 'CLM-20' },
    { type: 'Blocks', direction: 'inward', key: 'CLM-21' },
  ]);
  assert.deepEqual(mapped.attachments, [{ id: '10300', filename: 'proof.txt', size: 42, created: '2026-12-02T10:00:00Z' }]);
  assert.equal(mapped.created, '2026-12-01T09:00:00Z');
  assert.equal(mapped.projectKey, 'CLM');
});
