// Teamwork Graph (src/clients/graph.js): answer body -> rows -> what the brief says. No network: the request is passed in.
import test from 'node:test';
import assert from 'node:assert/strict';

import { dataOf, graphContext, linkedWork, rowsOf } from '../../src/clients/graph.js';
import { issuePath } from '../../src/lib/links.js';

const edges = (...list) => ({ edges: list.map((node) => ({ node })) });
const item = (key, summary = `Summary of ${key}`) => ({
  __typename: 'JiraWorkItem',
  id: `ari:cloud:jira:site:issue/${key}`,
  key,
  summary,
  webUrl: `https://example.atlassian.net/browse/${key}`,
});
const body = (related = [], artifacts = [], deployments = []) => ({
  data: { related: edges(...related), deployments: edges(...deployments), artifacts: edges(...artifacts) },
});

// Release 2.4 of the sample: 4 requirements, each linked to its cases and defects.
const LINKS = {
  'CLM-7': ['CLM-11', 'CLM-12', 'CLM-13'],
  'CLM-8': ['CLM-14', 'CLM-15', 'CLM-16', 'CLM-23'],
  'CLM-9': ['CLM-17', 'CLM-18', 'CLM-19', 'CLM-24'],
  'CLM-10': ['CLM-20', 'CLM-21', 'CLM-22'],
};
const REQUIREMENTS = Object.keys(LINKS);
const RELEASE = { requirementKeys: REQUIREMENTS, releaseKeys: [...REQUIREMENTS, ...Object.values(LINKS).flat()] };
const ISSUES = RELEASE.releaseKeys.map((key) => ({ id: key.slice(4), key }));
const keyOf = (variables) => `CLM-${variables.id.split('/')[1]}`;
const sample = (extra = {}) => async (_query, variables) => {
  const key = keyOf(variables);
  return body([...(LINKS[key] ?? []), ...(extra[key] ?? [])].map((k) => item(k)));
};

test('a body with errors and no data is a failure; partial data is kept', () => {
  assert.equal(dataOf({ errors: [{ message: 'You must set an operation name' }] }), null);
  assert.equal(dataOf({ errors: [{ message: 'x' }], data: null }), null);
  assert.equal(dataOf({ errors: [{ message: 'x' }], data: { related: null, deployments: null, artifacts: null } }), null);
  assert.equal(dataOf(null), null);
  const partial = { errors: [{ message: 'x' }], data: { related: edges(item('CLM-11')), deployments: null, artifacts: null } };
  assert.equal(dataOf(partial), partial.data);
  const empty = body();
  assert.equal(dataOf(empty), empty.data);
});

test('a linked work item becomes a row with the address from lib/links.js, not webUrl', () => {
  const rows = rowsOf({ key: 'CLM-7' }, body([item('CLM-11', 'Upload accepts a PDF\nsecond line')]).data);
  assert.deepEqual(rows, [
    {
      issueKey: 'CLM-7',
      issueUrl: issuePath('CLM-7'),
      kind: 'work_item',
      title: 'Upload accepts a PDF',
      url: issuePath('CLM-11'),
      at: null,
      relatedKey: 'CLM-11',
    },
  ]);
});

test('rows: the item itself, repeats and unknown node types are left out; development work keeps its kind', () => {
  const pr = { __typename: 'ExternalPullRequest', id: 'pr-1', title: 'Fix rounding', url: 'https://git.example/pr/1', lastUpdatedAt: '2026-11-02T10:00:00.000Z' };
  const data = body(
    [item('CLM-8'), item('CLM-14'), item('CLM-14'), { __typename: 'JiraProject', id: 'p' }],
    [pr, pr, { __typename: 'ExternalRepository', id: 'r' }],
    [{ __typename: 'ExternalDeployment', id: 'd-1', displayName: 'Production 41', url: null, createdAt: 'not a date' }],
  ).data;
  const rows = rowsOf({ key: 'CLM-8' }, data);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.relatedKey, r.title, r.url, r.at]),
    [
      ['work_item', 'CLM-14', 'Summary of CLM-14', issuePath('CLM-14'), null],
      ['deployment', null, 'Production 41', null, null],
      ['pull_request', null, 'Fix rounding', 'https://git.example/pr/1', '2026-11-02T10:00:00Z'],
    ],
  );
  assert.deepEqual(rowsOf({ key: 'CLM-8' }, {}), []);
});

test('everything linked is in the release: one line and one sentence, no rows, nothing for the agent', async () => {
  const answer = await linkedWork('site', ISSUES, sample());
  assert.equal(answer.state, 'ok');
  assert.equal(answer.asked, 18);
  assert.equal(answer.answered, 18);
  assert.equal(answer.items.length, 14);
  const g = graphContext(answer, RELEASE);
  assert.equal(g.state, 'ok');
  assert.equal(g.line, 'The Teamwork Graph links 14 work items to the 4 requirements of this release.');
  assert.equal(g.note, 'Nothing outside the release is linked to them.');
  assert.equal(g.linkedCount, 14);
  assert.equal(g.sentence, null);
  assert.deepEqual(g.items, []);
});

test('a case that is also linked to a defect of the release adds nothing: the sentence still names the requirements', async () => {
  const answer = await linkedWork('site', ISSUES, sample({ 'CLM-15': ['CLM-23'], 'CLM-11': ['CLM-7'] }));
  const g = graphContext(answer, RELEASE);
  assert.equal(g.line, 'The Teamwork Graph links 14 work items to the 4 requirements of this release.');
  assert.equal(g.note, 'Nothing outside the release is linked to them.');
  assert.equal((`${g.line} ${g.note}`.match(/work items/g) || []).length, 1);
  assert.deepEqual(g.items, []);
});

test('links that do not start at a requirement are said without naming requirements, and "work items" once', () => {
  const row = (issueKey, relatedKey) => rowsOf({ key: issueKey }, body([item(relatedKey)]).data)[0];
  const answer = { state: 'ok', items: [row('CLM-11', 'CLM-12'), row('CLM-14', 'CLM-23')], asked: 18, answered: 18 };
  const g = graphContext(answer, RELEASE);
  assert.equal(g.line, 'The Teamwork Graph links 2 work items to this release.');
  assert.equal(g.note, 'Nothing outside the release is linked to them.');
});

test('a work item linked from outside the release is the only row, once, with every item it is linked to', async () => {
  const answer = await linkedWork('site', ISSUES, sample({ 'CLM-8': ['CLM-31'], 'CLM-9': ['CLM-31'] }));
  const g = graphContext(answer, RELEASE);
  assert.equal(g.line, 'The Teamwork Graph links 15 work items to the 4 requirements of this release.');
  assert.equal(g.note, 'CLM-31 is not in this release.');
  assert.equal(g.items.length, 1);
  assert.equal(g.items[0].relatedKey, 'CLM-31');
  assert.equal(g.items[0].url, issuePath('CLM-31'));
  assert.deepEqual(g.items[0].linkedTo, ['CLM-8', 'CLM-9']);
  assert.equal(g.sentence, 'The Teamwork Graph links 1 work item from outside this release to it: CLM-31 (linked to CLM-8, CLM-9).');
});

test('several outside items are counted and sorted by key; fewer requirements with links are said as such', () => {
  const row = (issueKey, relatedKey) => rowsOf({ key: issueKey }, body([item(relatedKey)]).data)[0];
  const answer = { state: 'ok', items: [row('CLM-7', 'CLM-40'), row('CLM-7', 'CLM-11'), row('CLM-8', 'CLM-9')], asked: 18, answered: 18 };
  const g = graphContext(answer, { ...RELEASE, releaseKeys: RELEASE.releaseKeys.filter((k) => k !== 'CLM-9') });
  assert.equal(g.line, 'The Teamwork Graph links 3 work items to 2 of the 4 requirements of this release.');
  assert.equal(g.note, '2 of them are not in this release.');
  assert.deepEqual(g.items.map((w) => w.relatedKey), ['CLM-9', 'CLM-40']);
});

test('development work is listed and gives the agent one sentence', () => {
  const data = body([item('CLM-11')], [{ __typename: 'ExternalBuild', id: 'b-1', displayName: 'Build 2.4.0-rc3', url: 'https://ci.example/3' }]).data;
  const answer = { state: 'ok', items: rowsOf({ key: 'CLM-7' }, data), asked: 1, answered: 1 };
  const g = graphContext(answer, RELEASE);
  assert.equal(g.line, 'The Teamwork Graph links 1 work item and 1 development item to 1 of the 4 requirements of this release.');
  assert.deepEqual(g.items.map((w) => w.kind), ['build']);
  assert.equal(
    g.sentence,
    'The Teamwork Graph links 1 development item (deployments, pull requests, branches, commits, builds) to the work items of this release.',
  );
});

test('no rows: a neutral sentence that does not say the site has none', async () => {
  const answer = await linkedWork('site', ISSUES, async () => body());
  assert.equal(answer.state, 'empty');
  const g = graphContext(answer, RELEASE);
  assert.equal(g.state, 'empty');
  assert.equal(g.line, 'The Teamwork Graph returned no links for the work items of this release yet.');
  assert.doesNotMatch(g.line, /has none|nothing is linked/i);
  assert.equal(g.note, null);
  assert.equal(g.sentence, null);
  assert.deepEqual(g.items, []);
});

test('errors only, a thrown call or no answer at all is failed, not empty', async () => {
  const errorsOnly = await linkedWork('site', ISSUES, async () => ({ errors: [{ message: 'restricted' }] }));
  assert.deepEqual(errorsOnly, { state: 'failed', items: [], asked: 18, answered: 0 });
  const thrown = await linkedWork('site', ISSUES, async () => {
    throw new Error('network');
  });
  assert.equal(thrown.state, 'failed');
  const notOk = await linkedWork('site', ISSUES, async () => null);
  assert.equal(notOk.state, 'failed');
  const g = graphContext(errorsOnly, RELEASE);
  assert.equal(g.state, 'failed');
  assert.match(g.line, /did not answer/);
  assert.equal(g.sentence, null);
  assert.deepEqual(g.items, []);
});

test('some work items fail, others answer: the rows that came are kept', async () => {
  const answer = await linkedWork('site', ISSUES, async (query, variables) =>
    keyOf(variables) === 'CLM-7' ? sample()(query, variables) : { errors: [{ message: 'x' }] },
  );
  assert.equal(answer.state, 'ok');
  assert.equal(answer.answered, 1);
  assert.equal(graphContext(answer, RELEASE).line, 'The Teamwork Graph links 3 work items to 1 of the 4 requirements of this release.');
});

test('only the first 20 work items are asked, each by its ARI; nothing to ask is empty; not asked is off', async () => {
  const ids = [];
  const many = Array.from({ length: 25 }, (_, i) => ({ id: String(100 + i), key: `CLM-${100 + i}` }));
  const answer = await linkedWork('cloud-1', many, async (query, variables) => {
    ids.push(variables.id);
    assert.match(query, /^query faircopy_linkedwork\(/);
    assert.match(query, /jiraWorkItemHierarchy\(id: \$id, first: 25\)/);
    assert.doesNotMatch(query, /status/);
    return body();
  });
  assert.equal(answer.asked, 20);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], 'ari:cloud:jira:cloud-1:issue/100');
  assert.equal((await linkedWork('cloud-1', [], sample())).state, 'empty');
  assert.deepEqual(graphContext(null, RELEASE), { state: 'off', line: '', linkedCount: 0, note: null, sentence: null, items: [] });
});
