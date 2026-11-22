// [C] "Remove sample data".
// Contract: typedef `SampleRemover` in src/contract.js.
// Removes what the loader created and only that. EVERYTHING — the Jira project, the app's rows, the record pages, the
// settings — is deleted only when the project recorded in SampleStatus still exists with the same key AND the same
// id. If someone deleted the sample project by hand and a real project now has its key, nothing of that project is
// touched: the app's rows are kept and only the sample flag is cleared.
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import { deleteBuildsOfProject } from '../data/builds.js';
import { deleteCasesOfProject } from '../data/cases.js';
import { deleteConditionsOfProject } from '../data/conditions.js';
import { deleteLedgerOfProject } from '../data/ledger.js';
import { deleteSamplePeople } from '../data/people.js';
import { deleteRecordsOfProject, listRecords } from '../data/records.js';
import { deleteRequestsOfProject } from '../data/requests.js';
import { deleteRunsOfProject } from '../data/runs.js';
import { deleteSettings, getRecordsSpace, getSampleStatus, setRecordsSpace, setSampleStatus } from '../data/settings.js';
import { deleteWaiversOfProject } from '../data/waivers.js';
import { plural } from '../lib/format.js';
import { cleanKey } from '../services/access.js';
import { recordsSpaceKey } from '../services/recordPage.js';

/** @typedef {import('../contract.js').SampleRemover} Api */

/** @type {import('../contract.js').SampleStatus} */
export const EMPTY_SAMPLE_STATUS = Object.freeze({
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

const removedFlag = (issues, releases, records) =>
  `Sample data removed. ${plural(issues, 'issue')}, ${plural(releases, 'release')} and ${plural(records, 'record')} deleted.`;
const NOT_OURS = (key) =>
  `The sample project is no longer there, and the project that now has the key ${key} was not created by the sample loader, so nothing in it was deleted. The sample marker has been cleared.`;

/**
 * The key the app stored for its sample, through the same guard as every key that comes from a screen: only a key
 * shaped as Jira writes one reaches JQL, a Jira path or the app's own deletes. null when there is none or it is not one.
 */
const storedKey = (status) => {
  try {
    return cleanKey(status.projectKey);
  } catch {
    if (status.projectKey) console.warn('sample remover: the stored project key is not a Jira key; nothing was deleted');
    return null;
  }
};

/** How many issues the project holds right now (the sample's and any added since). 0 when it cannot be counted. */
const countIssues = async (projectKey, fallback) => {
  try {
    return (await jira.searchIssues(`project = "${projectKey}"`)).length;
  } catch {
    return fallback;
  }
};

/** @type {Api['removeSample']} The caller is a Jira administrator (the resolver checks) and has confirmed. */
export const removeSample = async () => {
  const status = await getSampleStatus();
  const projectKey = storedKey(status);
  if (!projectKey || !status.projectId) {
    await setSampleStatus({ ...EMPTY_SAMPLE_STATUS });
    return { issues: 0, releases: 0, records: 0, flag: removedFlag(0, 0, 0) };
  }

  // The identity check comes FIRST and gates every delete below.
  const project = await jira.getProject(projectKey);
  const gone = project === null;
  const ours = Boolean(project) && String(project.id) === String(status.projectId);
  if (!ours && !gone) {
    await setSampleStatus({ ...EMPTY_SAMPLE_STATUS });
    return { issues: 0, releases: 0, records: 0, flag: NOT_OURS(projectKey) };
  }
  // `gone`: the sample project was deleted by hand and no project has its key: only the app's own rows are left to clear.

  // Pages first, while the records that name them still exist. Only pages of records flagged as this sample's project
  // and the pages the loader itself listed. A page that cannot be deleted is skipped.
  const pageIds = new Set(status.pageIds ?? []);
  try {
    for (const record of await listRecords(projectKey)) if (record.pageId) pageIds.add(record.pageId);
  } catch (err) {
    console.warn('sample remover: records could not be listed', err);
  }
  // The space the app made for this project ("CLMACC") also holds the parent page "Acceptance records". The parent goes
  // too and the space is forgotten, so a real project gets its own. The empty space stays: the app may not delete spaces.
  const place = await getRecordsSpace(projectKey);
  const ownSpace = Boolean(place) && place.spaceKey === recordsSpaceKey(projectKey);
  if (ownSpace && place.parentPageId) pageIds.add(place.parentPageId);
  for (const pageId of pageIds) {
    try {
      await confluence.deletePage(pageId);
    } catch (err) {
      console.warn(`sample remover: page ${pageId} was not deleted`, err);
    }
  }
  if (ownSpace) await setRecordsSpace(null, projectKey);

  let issues = 0;
  let releases = 0;
  if (ours) {
    issues = await countIssues(projectKey, (status.issueKeys ?? []).length);
    releases = (await jira.listVersions(projectKey).catch(() => [])).length || (status.versionIds ?? []).length;
    await jira.deleteProject(projectKey);
  }

  await deleteRunsOfProject(projectKey);
  await deleteCasesOfProject(projectKey);
  await deleteBuildsOfProject(projectKey);
  await deleteWaiversOfProject(projectKey);
  await deleteConditionsOfProject(projectKey);
  await deleteRequestsOfProject(projectKey);
  const records = await deleteRecordsOfProject(projectKey);
  await deleteLedgerOfProject(projectKey);
  await deleteSamplePeople();
  // The next sample must start from the defaults, not from rules someone tried out on this one.
  await deleteSettings(projectKey);
  await setSampleStatus({ ...EMPTY_SAMPLE_STATUS });

  return { issues, releases, records, flag: removedFlag(issues, releases, records) };
};
