// [B] Thin Jira REST wrapper (TECH §3(4)). asApp unless opts.asUser.
// Contract: typedef `ClientJira` in src/contract.js. Pure mapping lives in ./jiraMap.js.
import { createHash } from 'node:crypto';
import api, { route } from '@forge/api';
import { ERROR, EVIDENCE_HASH_MAX_BYTES, ISSUE_PROPERTY_KEY } from '../contract.js';
import { AppError, GENERIC_ERROR } from '../lib/result.js';
import {
  adfToText,
  categoryOf,
  chunk,
  issueFields,
  jiraTime,
  jqlQuote,
  sortChanges,
  textToAdf,
  toAttachment,
  toIssue,
  toPerson,
  toRawChange,
} from './jiraMap.js';
import { SERVER_RETRIES, isServerError, serverWaitMs, untilDeadline, withRetry } from './retry.js';

/** @typedef {import('../contract.js').ClientJira} Api */

const FORBIDDEN_SENTENCE = 'You do not have permission to do this in this project. Ask a project administrator.';
const historySentence = (key) =>
  `We could not read the history of ${key}, so we cannot say who built it or whether it changed. Signing is blocked until this is fixed.`;

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

const client = (opts) => (opts?.asUser ? api.asUser() : api.asApp());

/**
 * One request. Never throws for an HTTP status; the caller decides what a status means. A 429 is tried again (twice at
 * most) after the time Jira asks for, capped at 4 s so a resolver never spends its 25 s waiting (./retry.js).
 * A 500/502/503/504 is tried again (three times at most, 3.5 s of pauses in all) when the call is safe to repeat:
 * every GET, PUT and DELETE, and a POST only where the caller says so (`how.repeat`: a search or a bulk read).
 * A POST that creates something is never sent again after a 5xx: Jira may have created it before it failed.
 * @param {{repeat?: boolean, what?: string}} [how]
 */
const request = (opts, path, method = 'GET', body, how = {}) =>
  withRetry(
    () =>
      client(opts).requestJira(path, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : JSON_HEADERS,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    undefined,
    { serverErrors: how.repeat ?? method !== 'POST', what: `jira ${how.what ?? `${method} ${path?.value ?? ''}`.trim()}` },
  );

/** For a POST that only reads. */
const READ = (what) => ({ repeat: true, what });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bodyText = async (res) => {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
};

/** Non-2xx → AppError with a sentence a person can read; the Jira answer goes to the log. */
const failure = async (res, what) => {
  const detail = await bodyText(res);
  console.error(`jira ${what}: ${res.status} ${detail}`);
  if (res.status === 401 || res.status === 403) return new AppError(ERROR.FORBIDDEN, FORBIDDEN_SENTENCE, { status: res.status });
  if (res.status === 404) return new AppError(ERROR.NOT_FOUND, GENERIC_ERROR, { status: 404 });
  return new AppError(ERROR.FAILED, GENERIC_ERROR, { status: res.status, reason: detail });
};

const json = async (res, what) => {
  if (!res.ok) throw await failure(res, what);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

/** Run `fn` over `items`, at most `size` at a time, keeping the order. */
const inBatches = async (items, size, fn) => {
  const out = [];
  for (const part of chunk(items, size)) out.push(...(await Promise.all(part.map(fn))));
  return out;
};

/**
 * The site's address, 'https://<site>.atlassian.net', as Jira itself gives it; '' when it cannot be read. For calls
 * whose context carries no site address (the MCP endpoint). Beyond the contract.
 * @returns {Promise<string>}
 */
export const getSiteUrl = async () => {
  try {
    const res = await request(null, route`/rest/api/3/serverInfo`);
    if (!res.ok) {
      console.warn(`jira serverInfo: ${res.status} ${await bodyText(res)}`);
      return '';
    }
    return new URL(String((await res.json())?.baseUrl ?? '')).origin;
  } catch (err) {
    console.warn(`jira serverInfo: ${err?.message ?? err}`);
    return '';
  }
};

/**
 * Projects whose name or key matches the text, AS THE CALLER (so only projects they can see). Beyond the contract.
 * @param {string} text
 * @returns {Promise<{key: string, name: string}[]>}
 */
export const findProjects = async (text) => {
  const res = await request({ asUser: true }, route`/rest/api/3/project/search?query=${text}&maxResults=10`);
  if (!res.ok) return [];
  return ((await res.json())?.values ?? []).map((p) => ({ key: String(p.key), name: String(p.name) }));
};

/** @type {Api['getMyself']} */
export const getMyself = async () => {
  const me = await json(await request({ asUser: true }, route`/rest/api/3/myself`), 'myself');
  return toPerson(me);
};

/** @type {Api['getUsers']} */
export const getUsers = async (accountIds) => {
  const ids = [...new Set(accountIds.filter(Boolean))];
  const people = await inBatches(ids, 10, async (id) => {
    try {
      const res = await request(null, route`/rest/api/3/user?accountId=${id}`);
      return res.ok ? toPerson(await res.json()) : null;
    } catch {
      return null;
    }
  });
  return people.filter(Boolean);
};

/** @type {Api['getProject']} */
export const getProject = async (keyOrId) => {
  const res = await request(null, route`/rest/api/3/project/${keyOrId}`);
  if (res.status === 404) return null;
  const p = await json(res, 'project');
  // style: 'next-gen' = team-managed, 'classic' = company-managed (beyond the contract; used for links only).
  return { id: String(p.id), key: p.key, name: p.name, style: p.style ?? null };
};

/** @type {Api['createProject']} */
export const createProject = async ({ key, name, leadAccountId }) => {
  const p = await json(
    await request(null, route`/rest/api/3/project`, 'POST', {
      key,
      name,
      projectTypeKey: 'software',
      projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-simplified-agility-kanban',
      leadAccountId,
      // Nothing is given to the project lead by default: who worked on what must come from history, not from a default.
      assigneeType: 'UNASSIGNED',
    }),
    'create project',
  );
  return { id: String(p.id), key: p.key ?? key };
};

/** @type {Api['deleteProject']} Permanent (no trash): a project in the trash keeps its key, and the sample could not be loaded again. */
export const deleteProject = async (keyOrId) => {
  const res = await request(null, route`/rest/api/3/project/${keyOrId}?enableUndo=false`, 'DELETE');
  if (res.status === 404) return;
  await json(res, 'delete project');
};

/** @type {Api['listVersions']} */
export const listVersions = async (projectKey) => {
  const versions = await json(await request(null, route`/rest/api/3/project/${projectKey}/versions`), 'versions');
  return (versions ?? []).map((v) => ({
    id: String(v.id),
    name: v.name,
    projectId: String(v.projectId),
    released: Boolean(v.released),
    releaseDate: v.releaseDate ?? null,
  }));
};

/** @type {Api['createVersion']} */
export const createVersion = async ({ projectId, name, released = false, releaseDate = null }) => {
  const v = await json(
    await request(null, route`/rest/api/3/version`, 'POST', {
      name,
      projectId: Number(projectId),
      released,
      ...(releaseDate ? { releaseDate } : {}),
    }),
    'create version',
  );
  return { id: String(v.id), name: v.name };
};

/** @type {Api['getStatusCategories']} */
export const getStatusCategories = async (projectKey) => {
  const types = await json(await request(null, route`/rest/api/3/project/${projectKey}/statuses`), 'statuses');
  const map = {};
  for (const type of types ?? []) {
    for (const status of type.statuses ?? []) {
      const category = categoryOf(status.statusCategory?.key);
      map[String(status.id)] = category;
      map[status.name] = category;
    }
  }
  return map;
};

/** @type {Api['searchIssues']} */
export const searchIssues = async (jql, opts = {}) => {
  const criteriaField = opts.criteriaField ?? null;
  const issues = [];
  let nextPageToken;
  do {
    const page = await json(
      await request(
        opts,
        route`/rest/api/3/search/jql`,
        'POST',
        { jql, fields: issueFields(criteriaField), maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
        READ('search'),
      ),
      'search',
    );
    for (const raw of page?.issues ?? []) issues.push(toIssue(raw, criteriaField));
    nextPageToken = page?.nextPageToken || null;
  } while (nextPageToken);
  return issues;
};

/** @type {Api['getIssue']} */
export const getIssue = async (key, opts = {}) => {
  const criteriaField = opts.criteriaField ?? null;
  const fields = issueFields(criteriaField).join(',');
  const res = await request(opts, route`/rest/api/3/issue/${key}?fields=${fields}`);
  if (res.status === 404) return null;
  return toIssue(await json(res, 'issue'), criteriaField);
};

/** @type {Api['getIssues']} */
export const getIssues = async (keys, opts = {}) => {
  const criteriaField = opts.criteriaField ?? null;
  const wanted = [...new Set(keys.filter(Boolean))];
  const found = [];
  for (const part of chunk(wanted, 100)) {
    const res = await request(
      opts,
      route`/rest/api/3/issue/bulkfetch`,
      'POST',
      { issueIdsOrKeys: part, fields: issueFields(criteriaField) },
      READ('bulkfetch'),
    );
    if (res.ok) {
      const data = await res.json();
      for (const raw of data?.issues ?? []) found.push(toIssue(raw, criteriaField));
    } else {
      // Bulk read refused: read one by one (a missing key is simply skipped).
      console.warn(`jira bulkfetch: ${res.status} ${await bodyText(res)}`);
      const single = await inBatches(part, 10, (key) => getIssue(key, opts));
      found.push(...single.filter(Boolean));
    }
  }
  const byKey = new Map(found.map((i) => [i.key, i]));
  const byId = new Map(found.map((i) => [i.id, i]));
  return wanted.map((k) => byKey.get(k) ?? byId.get(k)).filter(Boolean);
};

/** @type {Api['createIssues']} */
export const createIssues = async (issues, opts = {}) => {
  const created = [];
  // 50 per call is Jira's limit; calls run one after another so the keys follow the given order.
  for (const part of chunk(issues, 50)) {
    const res = await request(opts, route`/rest/api/3/issue/bulk`, 'POST', {
      issueUpdates: part.map((i) => ({
        fields: {
          project: { key: i.projectKey },
          issuetype: i.typeId ? { id: String(i.typeId) } : { name: i.type },
          summary: i.summary,
          ...(i.description ? { description: textToAdf(i.description) } : {}),
          ...(i.fixVersion ? { fixVersions: [{ name: i.fixVersion }] } : {}),
          ...(i.labels && i.labels.length ? { labels: i.labels } : {}),
          ...(i.priorityId ? { priority: { id: String(i.priorityId) } } : i.priority ? { priority: { name: i.priority } } : {}),
          ...(i.assigneeId ? { assignee: { accountId: i.assigneeId } } : {}),
          ...(i.dueDate ? { duedate: i.dueDate } : {}),
        },
      })),
    });
    const data = await json(res, 'create issues');
    if ((data?.errors ?? []).length || (data?.issues ?? []).length !== part.length) {
      const reason = JSON.stringify(data?.errors ?? []).slice(0, 500);
      console.error(`jira create issues: ${reason}`);
      throw new AppError(ERROR.FAILED, GENERIC_ERROR, { reason, created: [...created, ...(data?.issues ?? [])].map((x) => x.key) });
    }
    for (const x of data.issues) created.push({ id: String(x.id), key: x.key });
  }
  return created;
};

/** @type {Api['updateIssue']} */
export const updateIssue = async (key, fields, opts = {}) => {
  const body = {};
  if (fields.summary !== undefined) body.summary = fields.summary;
  if (fields.description !== undefined) body.description = textToAdf(fields.description);
  if (fields.assigneeId !== undefined) body.assignee = fields.assigneeId ? { accountId: fields.assigneeId } : null;
  if (fields.fixVersion !== undefined) body.fixVersions = fields.fixVersion ? [{ name: fields.fixVersion }] : [];
  if (fields.labels !== undefined) body.labels = fields.labels;
  await json(await request(opts, route`/rest/api/3/issue/${key}`, 'PUT', { fields: body }), 'update issue');
};

/**
 * @type {Api['transitionTo']}
 * When Jira answers the move with an error, the issue is read again first: if it IS in the status asked for, the move
 * happened (Jira can fail after doing the work, and a second identical move may be refused as "not valid from this
 * status"), and that is success. Only when it is not there is a 5xx sent again, three times at most.
 */
export const transitionTo = async (key, category, opts = {}) => {
  const data = await json(await request(opts, route`/rest/api/3/issue/${key}/transitions`), 'transitions');
  const transition = (data?.transitions ?? []).find((t) => categoryOf(t.to?.statusCategory?.key) === category);
  if (!transition) return false;
  for (let attempt = 0; ; attempt += 1) {
    const res = await request(opts, route`/rest/api/3/issue/${key}/transitions`, 'POST', { transition: { id: transition.id } });
    if (res.ok) return true;
    if (isServerError(res.status) && (await isInStatus(key, transition.to?.id, opts))) {
      console.warn(`jira transition ${key}: ${res.status}, but the issue is in the status asked for`);
      return true;
    }
    if (!isServerError(res.status) || attempt >= SERVER_RETRIES) throw await failure(res, 'transition');
    console.warn(`jira transition ${key}: ${res.status}, retry ${attempt + 1}`);
    await sleep(serverWaitMs(attempt));
  }
};

/** Is the issue in this status now? false when it cannot be read. */
const isInStatus = async (key, statusId, opts) => {
  if (!statusId) return false;
  try {
    const res = await request(opts, route`/rest/api/3/issue/${key}?fields=status`);
    if (!res.ok) return false;
    return String((await res.json())?.fields?.status?.id) === String(statusId);
  } catch {
    return false;
  }
};

/** @type {Api['linkIssues']} */
export const linkIssues = async ({ type, inwardKey, outwardKey }, opts = {}) => {
  await json(
    await request(opts, route`/rest/api/3/issueLink`, 'POST', {
      type: { name: type },
      inwardIssue: { key: inwardKey },
      outwardIssue: { key: outwardKey },
    }),
    'link issues',
  );
};

/** @type {Api['listLinkTypes']} */
export const listLinkTypes = async () => {
  const data = await json(await request(null, route`/rest/api/3/issueLinkType`), 'link types');
  return (data?.issueLinkTypes ?? []).map((t) => t.name);
};

/** One issue's whole changelog, page by page (fallback when the bulk call is refused). */
const changelogOf = async (key) => {
  const changes = [];
  let startAt = 0;
  for (;;) {
    const res = await request(null, route`/rest/api/3/issue/${key}/changelog?startAt=${startAt}&maxResults=100`);
    if (!res.ok) throw new Error(`changelog ${key}: ${res.status} ${await bodyText(res)}`);
    const page = await res.json();
    const values = page?.values ?? [];
    changes.push(...values.map(toRawChange));
    startAt += values.length;
    if (!values.length || page.isLast || startAt >= (page.total ?? 0)) break;
  }
  return changes;
};

/** Issue ids for keys (the bulk changelog answers by id only). */
const idsOfKeys = async (keys) => {
  const map = {};
  for (const part of chunk(keys, 100)) {
    let nextPageToken;
    do {
      const res = await request(null, route`/rest/api/3/search/jql`, 'POST', {
        jql: `key in (${part.map(jqlQuote).join(', ')})`,
        fields: ['summary'],
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }, READ('search'));
      if (!res.ok) throw new Error(`ids of keys: ${res.status} ${await bodyText(res)}`);
      const page = await res.json();
      for (const raw of page?.issues ?? []) map[String(raw.id)] = raw.key;
      nextPageToken = page?.nextPageToken || null;
    } while (nextPageToken);
  }
  return map;
};

/**
 * @type {Api['getChangelogs']}
 * Second argument (optional, beyond the contract): a known issue id → key map, which saves the id lookup.
 */
export const getChangelogs = async (keys, knownIds = {}) => {
  const wanted = [...new Set(keys.filter(Boolean))];
  /** @type {Record<string, import('../contract.js').RawChange[]>} */
  const out = Object.fromEntries(wanted.map((k) => [k, []]));
  if (!wanted.length) return out;
  let current = wanted[0];
  try {
    const idToKey = { ...knownIds };
    const known = new Set(Object.values(idToKey));
    const unknown = wanted.filter((k) => !known.has(k));
    if (unknown.length) Object.assign(idToKey, await idsOfKeys(unknown));

    for (const part of chunk(wanted, 500)) {
      [current] = part;
      let nextPageToken;
      let bulkOk = true;
      do {
        const res = await request(null, route`/rest/api/3/changelog/bulkfetch`, 'POST', {
          issueIdsOrKeys: part,
          maxResults: 1000,
          ...(nextPageToken ? { nextPageToken } : {}),
        }, READ('changelog bulkfetch'));
        if (!res.ok) {
          console.warn(`jira changelog bulkfetch: ${res.status} ${await bodyText(res)}`);
          bulkOk = false;
          break;
        }
        const page = await res.json();
        for (const entry of page?.issueChangeLogs ?? []) {
          const key = idToKey[String(entry.issueId)];
          if (key && out[key]) out[key].push(...(entry.changeHistories ?? []).map(toRawChange));
        }
        nextPageToken = page?.nextPageToken || null;
      } while (nextPageToken);

      if (!bulkOk) {
        await inBatches(part, 8, async (key) => {
          current = key;
          out[key] = await changelogOf(key);
        });
      }
    }
  } catch (err) {
    console.error(`jira history: ${err?.message ?? err}`);
    throw new AppError(ERROR.HISTORY_UNREADABLE, historySentence(current), { issueKey: current });
  }
  for (const key of wanted) out[key] = sortChanges(out[key]);
  return out;
};

/** @type {Api['getCaseProperty']} */
export const getCaseProperty = async (key) => {
  const res = await request(null, route`/rest/api/3/issue/${key}/properties/${ISSUE_PROPERTY_KEY}`);
  if (res.status === 404) return null;
  const data = await json(res, 'issue property');
  const value = data?.value;
  if (!value || typeof value !== 'object') return null;
  return { case: Boolean(value.case), requirementKey: String(value.requirementKey ?? '') };
};

/** @type {Api['setCaseProperty']} */
export const setCaseProperty = async (key, value) => {
  await json(
    await request(null, route`/rest/api/3/issue/${key}/properties/${ISSUE_PROPERTY_KEY}`, 'PUT', {
      case: Boolean(value.case),
      requirementKey: value.requirementKey,
    }),
    'set issue property',
  );
};

/** @type {Api['addAttachment']} */
export const addAttachment = async (issueKey, filename, content, mime) => {
  try {
    // Hand-built multipart body: the content is small text, and this needs nothing beyond a string.
    const boundary = `----countersign${createHash('sha256').update(`${issueKey}${filename}${content.length}`).digest('hex').slice(0, 24)}`;
    const safeName = String(filename).replace(/["\r\n]/g, '_');
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
      `Content-Type: ${mime || 'text/plain'}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--\r\n`;
    // A 429 means Jira took nothing, so sending the same body again cannot attach the file twice.
    const res = await withRetry(() =>
      api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/attachments`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Atlassian-Token': 'no-check',
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }),
    );
    if (!res.ok) {
      // A refusal (5xx, 429) is thrown so a caller that can run again does; anything else is "no attachment".
      if (res.status >= 500 || res.status === 429) throw await failure(res, 'add attachment');
      console.warn(`jira add attachment: ${res.status} ${await bodyText(res)}`);
      return null;
    }
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : data;
    return first ? toAttachment(first) : null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.warn(`jira add attachment: ${err?.message ?? err}`);
    return null;
  }
};

/**
 * The bytes of one attachment, hashed. `{sha256}` or `{sha256: null, status}` (status 0 = the request itself failed).
 * `patient` false: one request, no retry of any kind, for a caller that is working against a deadline.
 */
const readHash = async (attachmentId, patient = true) => {
  try {
    const send = () =>
      api.asApp().requestJira(route`/rest/api/3/attachment/content/${attachmentId}?redirect=false`, {
        headers: { Accept: '*/*' },
      });
    const res = patient ? await withRetry(send, undefined, { serverErrors: true, what: `jira attachment ${attachmentId}` }) : await send();
    if (!res.ok) {
      if (res.status !== 429) console.warn(`jira attachment ${attachmentId}: ${res.status}`);
      return { sha256: null, status: res.status };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return { sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch (err) {
    console.warn(`jira attachment ${attachmentId}: ${err?.message ?? err}`);
    return { sha256: null, status: 0 };
  }
};

/** @type {Api['hashAttachment']} Never invents a hash: any trouble reading the bytes → null (SPEC §2.10). */
export const hashAttachment = async (attachmentId) => (await readHash(attachmentId)).sha256;

/** The attachments of many issues in one bulk read per 100 (only that field is asked for). */
const attachmentsOf = async (keys) => {
  const out = [];
  for (const part of chunk(keys, 100)) {
    const res = await request(null, route`/rest/api/3/issue/bulkfetch`, 'POST', { issueIdsOrKeys: part, fields: ['attachment'] }, READ('bulkfetch'));
    if (res.ok) {
      for (const raw of (await res.json())?.issues ?? []) {
        out.push({ key: raw.key, attachments: (raw.fields?.attachment ?? []).map(toAttachment) });
      }
    } else {
      console.warn(`jira bulkfetch attachments: ${res.status} ${await bodyText(res)}`);
      out.push(...(await getIssues(part)));
    }
  }
  return out;
};

/**
 * @type {Api['liveEvidence']}
 * Every attachment now on the given issues (id, name, size: one bulk read, no download), and the SHA-256 of some.
 * Beyond the contract:
 *   hashIds   the attachment ids to download and hash, IN THE ORDER to do it; null = every file.
 *   limits    `deadline` (epoch ms): no download is started at or after it, and the ones already started are waited
 *             for, so nothing is left running when this returns. `atOnce`: downloads at the same time.
 * A file that was not read has sha256 null; `unread: true` when its download was tried and failed; `tooLarge: true`
 * when it is larger than EVIDENCE_HASH_MAX_BYTES and so was not tried. With a deadline a download is not retried, and
 * a 429 stops the reading there (those files count as not read, not as failed).
 */
export const liveEvidence = async (keys, hashIds = null, limits = {}) => {
  const deadline = limits.deadline ?? Infinity;
  const wanted = [...new Set(keys.filter(Boolean))];
  /** @type {Record<string, (import('../contract.js').Evidence & {tooLarge?: boolean, unread?: boolean})[]>} */
  const out = Object.fromEntries(wanted.map((k) => [k, []]));
  const byId = new Map();
  for (const issue of await attachmentsOf(wanted)) {
    if (!out[issue.key]) continue;
    for (const a of issue.attachments) {
      const file = { attachmentId: a.id, filename: a.filename, size: a.size, sha256: null };
      out[issue.key].push(file);
      byId.set(String(a.id), file);
    }
  }
  const queue = (hashIds ? [...new Set(hashIds.map(String))].map((id) => byId.get(id)).filter(Boolean) : [...byId.values()]).filter((file) => {
    if (file.size > EVIDENCE_HASH_MAX_BYTES) file.tooLarge = true;
    return !file.tooLarge;
  });
  await untilDeadline(queue, limits.atOnce ?? 4, deadline, async (file) => {
    const read = await readHash(file.attachmentId, deadline === Infinity);
    if (read.sha256) file.sha256 = read.sha256;
    else if (read.status === 429) return false;
    else file.unread = true;
    return true;
  });
  return out;
};

/**
 * What the signed-in person may do, asked of Jira AS THAT PERSON. null when Jira cannot be asked as the user at all
 * (no consent yet, or a surface where the user has no Jira session); every flag false for a project they cannot see.
 * @param {string|null} projectKey   null = global permissions only
 * @returns {Promise<{browse: boolean, write: boolean, create: boolean, projectAdmin: boolean, siteAdmin: boolean}|null>}
 */
export const myPermissions = async (projectKey) => {
  const none = { browse: false, write: false, create: false, projectAdmin: false, siteAdmin: false };
  try {
    const res = projectKey
      ? await request(
          { asUser: true },
          route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=BROWSE_PROJECTS,EDIT_ISSUES,CREATE_ISSUES,ADMINISTER_PROJECTS,ADMINISTER`,
        )
      : await request({ asUser: true }, route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
    if (res.status === 404 || res.status === 400) return none;
    if (!res.ok) {
      console.warn(`jira mypermissions: ${res.status} ${await bodyText(res)}`);
      return res.status === 403 ? none : null;
    }
    const p = (await res.json())?.permissions ?? {};
    const has = (name) => p[name]?.havePermission === true;
    return {
      browse: has('BROWSE_PROJECTS'),
      write: has('EDIT_ISSUES'),
      create: has('CREATE_ISSUES'),
      projectAdmin: has('ADMINISTER_PROJECTS') || has('ADMINISTER'),
      siteAdmin: has('ADMINISTER'),
    };
  } catch (err) {
    console.warn(`jira mypermissions: ${err?.message ?? err}`);
    return null;
  }
};

/** Issue types of a project, with the name Jira uses before translation (`Bug` on a site that shows "Fehler"). */
export const listIssueTypes = async (projectKey) => {
  const data = await json(await request(null, route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`), 'issue types');
  return (data?.issueTypes ?? data?.values ?? []).map((t) => ({
    id: String(t.id),
    name: t.name,
    untranslatedName: t.untranslatedName ?? t.name,
    subtask: Boolean(t.subtask),
    level: Number(t.hierarchyLevel ?? 0),
  }));
};

/** The site's priorities in the order the site ranks them, most serious first. [] when they cannot be read. */
export const listPriorities = async () => {
  try {
    const data = await json(await request(null, route`/rest/api/3/priority`), 'priorities');
    return (Array.isArray(data) ? data : []).map((p) => ({ id: String(p.id), name: p.name }));
  } catch {
    return [];
  }
};

/** Text fields that can hold acceptance criteria: custom fields of a text kind. [] when they cannot be read. */
export const listTextFields = async () => {
  try {
    const data = await json(await request(null, route`/rest/api/3/field`), 'fields');
    return (Array.isArray(data) ? data : [])
      .filter((f) => f.custom && ['string'].includes(f.schema?.type) && /text/i.test(String(f.schema?.custom ?? '')))
      .map((f) => ({ id: String(f.id), name: f.name }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return [];
  }
};

/**
 * A comment on an issue. As the user when asked: then Jira records that person as the author and its own time, and the
 * app can neither write as them later nor change the comment's `created`.
 * @returns {Promise<{id: string, created: string|null, authorId: string|null}>}
 */
export const addComment = async (issueKey, text, opts = {}) => {
  const c = await json(await request(opts, route`/rest/api/3/issue/${issueKey}/comment`, 'POST', { body: textToAdf(text) }), 'add comment');
  return { id: String(c.id), created: jiraTime(c.created), authorId: c.author?.accountId ?? null };
};

/** A comment as it is now; null when it is gone. */
export const getComment = async (issueKey, commentId) => {
  const res = await request(null, route`/rest/api/3/issue/${issueKey}/comment/${commentId}`);
  if (res.status === 404) return null;
  const c = await json(res, 'comment');
  return {
    id: String(c.id),
    text: adfToText(c.body),
    authorId: c.author?.accountId ?? null,
    updateAuthorId: c.updateAuthor?.accountId ?? null,
    created: jiraTime(c.created),
    updated: jiraTime(c.updated),
  };
};

/**
 * One account as Jira knows it now; null when it is not found or cannot be read. Never throws. Beyond the contract.
 * `accountType` is 'atlassian' for a person, 'app' for an app account, 'customer' for a service-desk customer.
 * @returns {Promise<{name: string, accountType: string|null, active: boolean}|null>}
 */
export const getAccount = async (accountId) => {
  try {
    const res = await request(null, route`/rest/api/3/user?accountId=${accountId}`);
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.accountId) return null;
    return { name: String(user.displayName ?? ''), accountType: user.accountType ?? null, active: user.active !== false };
  } catch {
    return null;
  }
};

/** Is this account id a person who can still act on this site? false for an unknown or deactivated ("Former user") account. */
export const isActiveUser = async (accountId) => {
  try {
    const res = await request(null, route`/rest/api/3/user?accountId=${accountId}`);
    if (!res.ok) return false;
    const user = await res.json();
    return Boolean(user?.accountId) && user.active !== false && user.accountType !== 'app';
  } catch {
    return false;
  }
};
