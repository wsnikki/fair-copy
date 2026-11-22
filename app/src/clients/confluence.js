// [B] Thin Confluence REST v2 wrapper, as the app (TECH §3(2)).
// Contract: typedef `ClientConfluence` in src/contract.js.
// Confluence absent, or 401/403/404 → null / false / []. Any other failure → AppError(ERROR.CONFLUENCE, reason).
import api, { route } from '@forge/api';
import { ERROR, PAGE_PROPERTY_KEY } from '../contract.js';
import { AppError } from '../lib/result.js';
import { toIso } from '../lib/format.js';
import { withRetry } from './retry.js';

/** @typedef {import('../contract.js').ClientConfluence} Api */
/** @typedef {import('../contract.js').ConfluencePage} ConfluencePage */

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
const ABSENT = new Set([401, 403, 404]);

/**
 * One request. Returns the parsed body ({} for an empty one), or null when Confluence is not there or says
 * 401/403/404. A request that cannot even be sent (no Confluence on the site) also counts as "not there".
 * A 429 is tried again like a Jira request (./retry.js); one that stays 429 is an AppError like any other failure.
 */
const call = async (path, method = 'GET', body) => {
  let res;
  try {
    res = await withRetry(() =>
      api.asApp().requestConfluence(path, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : JSON_HEADERS,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  } catch (err) {
    console.warn(`confluence ${method}: ${err?.message ?? err}`);
    return null;
  }
  if (ABSENT.has(res.status)) return null;
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`confluence ${method}: ${res.status} ${text.slice(0, 500)}`);
    let reason = `Confluence answered ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      const title = parsed?.errors?.[0]?.title ?? parsed?.message;
      if (title) reason = String(title);
    } catch {
      // keep the status line
    }
    throw new AppError(ERROR.CONFLUENCE, reason, { status: res.status });
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const time = (value) => {
  try {
    return value ? toIso(value) : null;
  } catch {
    return null;
  }
};

/** @returns {ConfluencePage} */
const toPage = (p, fallback = {}) => {
  const webui = p._links?.webui ?? null;
  return {
    id: String(p.id),
    title: p.title ?? fallback.title ?? '',
    spaceId: String(p.spaceId ?? fallback.spaceId ?? ''),
    storage: p.body?.storage?.value ?? fallback.storage ?? '',
    version: Number(p.version?.number ?? fallback.version ?? 1),
    versionAuthorId: p.version?.authorId ?? null,
    versionAt: time(p.version?.createdAt),
    url: webui ? `/wiki${webui}` : `/wiki/pages/viewpage.action?pageId=${p.id}`,
  };
};

const toSpace = (s) => ({
  id: String(s.id),
  key: s.key,
  name: s.name,
  homepageId: s.homepageId ? String(s.homepageId) : null,
});

/** @type {Api['isAvailable']} */
export const isAvailable = async () => {
  try {
    return (await call(route`/wiki/api/v2/spaces?limit=1`)) !== null;
  } catch {
    return false;
  }
};

/** @type {Api['listSpaces']} */
export const listSpaces = async () => {
  const spaces = [];
  let cursor = null;
  // 4 pages of 250 is plenty for a picker; the loop follows Confluence's cursor.
  for (let page = 0; page < 4; page += 1) {
    const data = cursor
      ? await call(route`/wiki/api/v2/spaces?limit=250&status=current&cursor=${cursor}`)
      : await call(route`/wiki/api/v2/spaces?limit=250&status=current`);
    if (!data) break;
    for (const s of data.results ?? []) spaces.push({ id: String(s.id), key: s.key, name: s.name });
    const next = data._links?.next;
    cursor = next ? new URLSearchParams(String(next).split('?')[1] ?? '').get('cursor') : null;
    if (!cursor) break;
  }
  return spaces;
};

/** @type {Api['getSpaceByKey']} */
export const getSpaceByKey = async (key) => {
  const data = await call(route`/wiki/api/v2/spaces?keys=${key}&limit=1`);
  const space = data?.results?.[0];
  return space ? toSpace(space) : null;
};

/** @type {Api['createSpace']} */
export const createSpace = async ({ key, name }) => {
  const data = await call(route`/wiki/api/v2/spaces`, 'POST', { key, name });
  if (!data || !data.id) return null;
  return toSpace(data);
};

/** @type {Api['findPageByTitle']} */
export const findPageByTitle = async (spaceId, title) => {
  const data = await call(
    route`/wiki/api/v2/pages?space-id=${spaceId}&title=${title}&status=current&body-format=storage&limit=1`,
  );
  const page = data?.results?.[0];
  return page ? toPage(page) : null;
};

/** @type {Api['createPage']} */
export const createPage = async ({ spaceId, parentId = null, title, storage }) => {
  const data = await call(route`/wiki/api/v2/pages`, 'POST', {
    spaceId,
    status: 'current',
    title,
    ...(parentId ? { parentId } : {}),
    body: { representation: 'storage', value: storage },
  });
  if (!data || !data.id) return null;
  return toPage(data, { title, spaceId, storage, version: 1 });
};

/** @type {Api['getPage']} */
export const getPage = async (pageId) => {
  const data = await call(route`/wiki/api/v2/pages/${pageId}?body-format=storage`);
  return data && data.id ? toPage(data) : null;
};

/** @type {Api['updatePage']} */
export const updatePage = async (pageId, { title, storage, version, message }) => {
  const data = await call(route`/wiki/api/v2/pages/${pageId}`, 'PUT', {
    id: String(pageId),
    status: 'current',
    title,
    body: { representation: 'storage', value: storage },
    version: { number: version, ...(message ? { message } : {}) },
  });
  if (!data || !data.id) return null;
  return toPage(data, { title, storage, version });
};

/** A stored page property with its own id and version (needed to update it). */
const findProperty = async (pageId, key) => {
  const data = await call(route`/wiki/api/v2/pages/${pageId}/properties?key=${key}`);
  return data?.results?.[0] ?? null;
};

const setProperty = async (pageId, key, value) => {
  const existing = await findProperty(pageId, key);
  const data = existing
    ? await call(route`/wiki/api/v2/pages/${pageId}/properties/${existing.id}`, 'PUT', {
        key,
        value,
        version: { number: Number(existing.version?.number ?? 1) + 1 },
      })
    : await call(route`/wiki/api/v2/pages/${pageId}/properties`, 'POST', { key, value });
  return data !== null;
};

/** @type {Api['getSealProperty']} */
export const getSealProperty = async (pageId) => {
  const property = await findProperty(pageId, PAGE_PROPERTY_KEY);
  const value = property?.value;
  return value && typeof value === 'object' ? value : null;
};

/** @type {Api['setSealProperty']} */
export const setSealProperty = (pageId, value) => setProperty(pageId, PAGE_PROPERTY_KEY, value);

/**
 * @type {Api['setFullWidth']} The record's tables need the room: shows the page full width, in view and in the editor.
 * Never throws; a page left at the default width is still a correct record.
 */
export const setFullWidth = async (pageId) => {
  try {
    const published = await setProperty(pageId, 'content-appearance-published', 'full-width');
    const draft = await setProperty(pageId, 'content-appearance-draft', 'full-width');
    return published && draft;
  } catch (err) {
    console.warn(`confluence page width: ${err?.message ?? err}`);
    return false;
  }
};

/**
 * Versions of a page, newest first (TECH §3(2): "edited after sealing" is detectable). Beyond the contract's list;
 * getPage already carries the latest version's author and time.
 * @param {string} pageId
 * @returns {Promise<{number: number, authorId: string|null, at: string|null, message: string}[]>}
 */
export const listPageVersions = async (pageId) => {
  const data = await call(route`/wiki/api/v2/pages/${pageId}/versions?limit=50`);
  return (data?.results ?? []).map((v) => ({
    number: Number(v.number),
    authorId: v.authorId ?? null,
    at: time(v.createdAt),
    message: v.message ?? '',
  }));
};

/** @type {Api['deletePage']} */
export const deletePage = async (pageId) => {
  try {
    return (await call(route`/wiki/api/v2/pages/${pageId}`, 'DELETE')) !== null;
  } catch {
    return false;
  }
};
