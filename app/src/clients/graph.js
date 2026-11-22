// [B] Teamwork Graph: one curated read query, always as the user (TECH §3(9)). NEVER throws.
// Contract: typedef `ClientGraph` in src/contract.js.
// The answer always says what happened: 'ok' (something is linked), 'empty' (the graph answered, nothing is linked),
// 'failed' (the graph did not answer). A missing or switched-off scope also answers 'empty', so 'empty' never means
// "this site has none".
import api from '@forge/api';
import { compareKeys, plural, toIso } from '../lib/format.js';
import { issuePath } from '../lib/links.js';

/** @typedef {import('../contract.js').LinkedWork} LinkedWork */
/** @typedef {import('../contract.js').GraphAnswer} GraphAnswer */

const MAX_ISSUES = 20;
/** The graph is context, never a blocker: the brief does not wait longer than this for it. */
const GRAPH_MS = 6000;
/** How many keys one sentence names before it says "and N more". */
const MAX_NAMED = 5;

// Operation names must look like `company_operation` (TECH §3(9)).
// `related` is the issue links of a work item, outward only: asked from a requirement it returns its cases and
// defects; asked from a case it returns nothing. `status` is NOT selected: it has its own scope.
const LINKED_WORK = `query faircopy_linkedwork($id: ID!) {
  related: jiraWorkItemHierarchy(id: $id, first: 25) {
    edges { node { __typename ... on JiraWorkItem { id key summary webUrl } } }
  }
  deployments: jiraWorkItemLinkedExternalDeployments(id: $id, first: 10) {
    edges { node { __typename ... on ExternalDeployment { id displayName url createdAt lastUpdatedAt } } }
  }
  artifacts: jiraWorkItemDevelopmentArtifacts(id: $id, first: 25) {
    edges { node { __typename
      ... on ExternalDeployment { id displayName url createdAt lastUpdatedAt }
      ... on ExternalPullRequest { id title displayName url createdAt lastUpdatedAt }
      ... on ExternalBranch { id name displayName url createdAt lastUpdatedAt }
      ... on ExternalCommit { id message displayName url createdAt }
      ... on ExternalBuild { id displayName url createdAt lastUpdatedAt }
    } }
  }
}`;

const KIND = {
  ExternalDeployment: 'deployment',
  ExternalPullRequest: 'pull_request',
  ExternalBranch: 'branch',
  ExternalCommit: 'commit',
  ExternalBuild: 'build',
};

/**
 * What one answer body is worth: its `data`, or null when the graph did not really answer. Partial data is kept when
 * the answer also has errors; errors with no data at all (a refused operation arrives as HTTP 200) is a failure.
 * @param {any} body
 * @returns {Record<string, any>|null}
 */
export const dataOf = (body) => {
  const data = body?.data;
  if (!data || typeof data !== 'object') return null;
  const hasErrors = Array.isArray(body.errors) && body.errors.length > 0;
  if (hasErrors && !Object.values(data).some((v) => v !== null && v !== undefined)) return null;
  return data;
};

/** One query as the user. Returns the answer body, or null. */
const send = async (query, variables) => {
  const res = await api.asUser().requestTeamworkGraph(query, variables);
  if (!res || !res.ok) {
    console.warn(`teamwork graph: ${res ? res.status : 'no answer'}`); // the screens say it did not answer; the log says why
    return null;
  }
  return res.json();
};

const time = (value) => {
  try {
    return value ? toIso(value) : null;
  } catch {
    return null;
  }
};

const nodes = (connection) => (connection?.edges ?? []).map((e) => e?.node).filter(Boolean);

/**
 * The rows of one work item's answer. Pure.
 * @param {{key: string}} issue
 * @param {Record<string, any>} data
 * @returns {LinkedWork[]}
 */
export const rowsOf = (issue, data) => {
  /** @type {LinkedWork[]} */
  const rows = [];
  const seen = new Set();
  const add = (id, row) => {
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ issueKey: issue.key, issueUrl: issuePath(issue.key), ...row });
  };
  for (const node of nodes(data?.related)) {
    if (node.__typename !== 'JiraWorkItem' || !node.key || node.key === issue.key) continue;
    // Not `webUrl`: every Jira address comes from lib/links.js.
    add(`work_item:${node.key}`, {
      kind: 'work_item',
      title: String(node.summary ?? '').split('\n')[0],
      url: issuePath(node.key),
      at: null,
      relatedKey: node.key,
    });
  }
  for (const node of [...nodes(data?.deployments), ...nodes(data?.artifacts)]) {
    const kind = KIND[node.__typename];
    if (!kind) continue; // repositories and designs are not "work that changed the release"
    add(`${kind}:${node.id ?? node.url ?? node.displayName}`, {
      kind,
      title: String(node.title ?? node.displayName ?? node.name ?? node.message ?? '').split('\n')[0],
      url: node.url ?? null,
      at: time(node.lastUpdatedAt ?? node.createdAt),
      relatedKey: null,
    });
  }
  return rows;
};

/**
 * What the Teamwork Graph links to these work items: other work items (issue links), deployments, pull requests,
 * branches, commits and builds.
 * @param {string} cloudId
 * @param {{id: string, key: string}[]} issues   the first 20 are asked about
 * @param {(query: string, variables: {id: string}) => Promise<any>} [request]   for tests; default: the Forge call as the user
 * @returns {Promise<GraphAnswer>}
 */
export const linkedWork = async (cloudId, issues, request = send) => {
  const failed = { state: /** @type {'failed'} */ ('failed'), items: [], asked: 0, answered: 0 };
  try {
    if (!cloudId || !Array.isArray(issues) || issues.length === 0) return { ...failed, state: 'empty' };
    const wanted = issues.slice(0, MAX_ISSUES);
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), GRAPH_MS);
    });
    const ask = async (issue) => {
      try {
        return dataOf(await request(LINKED_WORK, { id: `ari:cloud:jira:${cloudId}:issue/${issue.id}` }));
      } catch {
        return null;
      }
    };
    const answers = await Promise.all(wanted.map(async (issue) => ({ issue, data: await Promise.race([ask(issue), late]) })));
    clearTimeout(timer);
    const answered = answers.filter((a) => a.data);
    if (answered.length === 0) return { ...failed, asked: wanted.length };
    const items = answered.flatMap(({ issue, data }) => rowsOf(issue, data));
    return { state: items.length > 0 ? 'ok' : 'empty', items, asked: wanted.length, answered: answered.length };
  } catch {
    return failed;
  }
};

const named = (keys) =>
  keys.length > MAX_NAMED ? `${keys.slice(0, MAX_NAMED).join(', ')} and ${keys.length - MAX_NAMED} more` : keys.join(', ');

/**
 * What an approver should read about the graph's answer. Pure. The brief's tables already list every case and defect
 * of the release, so only two things are worth a row: a linked work item that is NOT in this release, and development
 * work (deployments, pull requests, branches, commits, builds). Everything else is one sentence.
 * @param {GraphAnswer|null} answer                  null = the graph was not asked
 * @param {{requirementKeys: string[], releaseKeys: string[]}} release
 *   requirementKeys: the requirements of the release; releaseKeys: every issue the brief already lists
 * @returns {import('../contract.js').GraphContext}
 */
export const graphContext = (answer, release) => {
  const none = { linkedCount: 0, note: null, sentence: null, items: [] };
  if (!answer) return { state: 'off', line: '', ...none };
  if (answer.state === 'failed') {
    return {
      state: 'failed',
      line: 'The Teamwork Graph did not answer just now, so what it links to this release is not shown. Nothing else in this brief depends on it.',
      ...none,
    };
  }
  const workItems = answer.items.filter((w) => w.kind === 'work_item');
  const development = answer.items.filter((w) => w.kind !== 'work_item');
  if (answer.state === 'empty' || workItems.length + development.length === 0) {
    return { state: 'empty', line: 'The Teamwork Graph returned no links for the work items of this release yet.', ...none };
  }

  const inRelease = new Set(release.releaseKeys);
  const requirements = new Set(release.requirementKeys);
  const linkedKeys = [...new Set(workItems.map((w) => w.relatedKey))];
  const sources = [...new Set(workItems.map((w) => w.issueKey))];
  // One row per outside work item, however many items of the release it is linked to.
  const outside = [];
  for (const w of workItems) {
    if (inRelease.has(w.relatedKey)) continue;
    const row = outside.find((o) => o.relatedKey === w.relatedKey);
    if (row) row.linkedTo.push(w.issueKey);
    else outside.push({ ...w, linkedTo: [w.issueKey] });
  }
  outside.sort((a, b) => compareKeys(a.relatedKey, b.relatedKey));

  // The sentence names the requirements when they carry the links. On a live site a case may also be linked to a defect
  // of its own requirement: that adds no work item, so the sentence stays the same. Anything else is said without a count
  // of requirements, and "work items" is said once.
  const requirementSources = sources.filter((k) => requirements.has(k));
  const viaRequirements = new Set(workItems.filter((w) => requirements.has(w.issueKey)).map((w) => w.relatedKey));
  const onlyRequirements =
    requirementSources.length > 0 && linkedKeys.every((k) => viaRequirements.has(k) || requirements.has(k));
  const counted = onlyRequirements ? linkedKeys.filter((k) => viaRequirements.has(k)) : linkedKeys;
  const target = !onlyRequirements
    ? 'this release'
    : requirementSources.length === requirements.size
      ? `the ${plural(requirements.size, 'requirement')} of this release`
      : `${requirementSources.length} of the ${plural(requirements.size, 'requirement')} of this release`;
  const things = [
    counted.length > 0 ? plural(counted.length, 'work item') : '',
    development.length > 0 ? plural(development.length, 'development item') : '',
  ].filter(Boolean);
  const line = `The Teamwork Graph links ${things.join(' and ')} to ${target}.`;

  const notes = [];
  if (outside.length > 0) {
    notes.push(
      outside.length === 1
        ? `${outside[0].relatedKey} is not in this release.`
        : `${outside.length} of them are not in this release.`,
    );
  } else if (linkedKeys.length > 0) {
    notes.push('Nothing outside the release is linked to them.');
  }
  if (development.length > 0) notes.push('Development work (deployments, pull requests, branches, commits, builds) is listed below.');

  const said = [];
  if (outside.length > 0) {
    said.push(
      `The Teamwork Graph links ${plural(outside.length, 'work item')} from outside this release to it: ${named(
        outside.map((o) => `${o.relatedKey} (linked to ${o.linkedTo.join(', ')})`),
      )}.`,
    );
  }
  if (development.length > 0) {
    said.push(
      `${outside.length > 0 ? 'It also links' : 'The Teamwork Graph links'} ${plural(development.length, 'development item')} (deployments, pull requests, branches, commits, builds) to the work items of this release.`,
    );
  }

  return {
    state: 'ok',
    line,
    linkedCount: linkedKeys.length,
    note: notes.join(' '),
    sentence: said.length > 0 ? said.join(' ') : null,
    items: [...outside, ...development],
  };
};
