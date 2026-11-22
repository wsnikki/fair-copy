// [B] KVS: per-project settings and small flags. The only module that touches @forge/kvs.
// Contract: typedef `DataSettings` in src/contract.js. The pure merge lives in ./settingsMerge.js.
import { kvs } from '@forge/kvs';
import { KVS_KEY } from '../contract.js';
import { nowIso } from '../lib/format.js';
import { mergeSettings, ruleChanges } from './settingsMerge.js';

/** @typedef {import('../contract.js').DataSettings} Api */
/** @typedef {import('../contract.js').SampleStatus} SampleStatus */

const LOG_LIMIT = 200;
const logKey = (projectKey) => `settings-log:${projectKey}`;

/** @returns {SampleStatus} */
const noSample = () => ({
  loaded: false,
  projectKey: null,
  projectId: null,
  loadedAt: null,
  loadedBy: null,
  d0: null,
  issueKeys: [],
  versionIds: [],
  recordIds: [],
  pageIds: [],
});

const read = async (key) => {
  const value = await kvs.get(key);
  return value === undefined ? null : value;
};

/** @type {Api['getSettings']} */
export const getSettings = async (projectKey) => mergeSettings(await read(KVS_KEY.settings(projectKey)));

/** @type {Api['saveSettings']} */
export const saveSettings = async (projectKey, settings, by) => {
  const before = await getSettings(projectKey);
  const after = mergeSettings(settings);
  await kvs.set(KVS_KEY.settings(projectKey), after);
  const changes = ruleChanges(before, after, by, nowIso());
  if (changes.length) {
    const log = (await read(logKey(projectKey))) ?? [];
    await kvs.set(logKey(projectKey), [...(Array.isArray(log) ? log : []), ...changes].slice(-LOG_LIMIT));
  }
  return after;
};

/** @type {Api['getSampleStatus']} The stored object is returned whole (it may carry `progress` while a load runs). */
export const getSampleStatus = async () => {
  const stored = await read(KVS_KEY.sample);
  return stored && typeof stored === 'object' ? { ...noSample(), ...stored } : noSample();
};

/** @type {Api['setSampleStatus']} */
export const setSampleStatus = async (status) => {
  await kvs.set(KVS_KEY.sample, status);
};

// One records space per PROJECT. It used to be one per installation, so the page of a second project was written
// into the first project's space (a judge who signs the sample and then their own project). The old single entry is
// still read for the project whose own space it is.
const spaceSlot = (projectKey) => (projectKey ? `${KVS_KEY.recordsSpace}:${projectKey}` : KVS_KEY.recordsSpace);
const ownSpaceKey = (projectKey) => `${projectKey}ACC`.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** @type {Api['getRecordsSpace']} */
export const getRecordsSpace = async (projectKey) => {
  let stored = await read(spaceSlot(projectKey));
  if ((!stored || !stored.spaceId) && projectKey) {
    const old = await read(KVS_KEY.recordsSpace);
    if (old && old.spaceId && old.spaceKey === ownSpaceKey(projectKey)) stored = old;
  }
  if (!stored || !stored.spaceId) return null;
  return {
    spaceId: String(stored.spaceId),
    spaceKey: stored.spaceKey,
    parentPageId: stored.parentPageId ? String(stored.parentPageId) : null,
  };
};

/** @type {Api['setRecordsSpace']} */
export const setRecordsSpace = async (space, projectKey) => {
  if (space === null) {
    await kvs.delete(spaceSlot(projectKey));
    const old = projectKey ? await read(KVS_KEY.recordsSpace) : null;
    if (old && old.spaceKey === ownSpaceKey(projectKey)) await kvs.delete(KVS_KEY.recordsSpace);
  } else await kvs.set(spaceSlot(projectKey), space);
};

/** Forgets a project's settings and their change log (the sample remover: the next sample starts from the defaults). */
export const deleteSettings = async (projectKey) => {
  await kvs.delete(KVS_KEY.settings(projectKey));
  await kvs.delete(logKey(projectKey));
};
