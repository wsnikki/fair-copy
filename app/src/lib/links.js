// Every Jira address the app builds, in one place. Pure: no @forge/* import.
// All paths are site-relative ("/browse/CLM-1"); `absolute` puts the site in front where a full address is needed
// (the Confluence record page, the agent's citations, issue descriptions).
//
// To send issue links somewhere else than Jira's `/browse/KEY-1`, change `issuePath` and nothing else. One thing
// follows from that: the record page prints issue links, and Verify compares the links of a published page with a
// fresh render. So when `issuePath` changes, raise PAGE_FORMAT in services/recordPage.js in the same commit — pages
// written before then read "not fully checked, restore the page" instead of "broken".

/** An issue. */
export const issuePath = (issueKey) => `/browse/${issueKey}`;

/** One comment of an issue, opened and highlighted. */
export const commentPath = (issueKey, commentId) => `${issuePath(issueKey)}?focusedCommentId=${commentId}`;

/** A project, as Jira opens it by its key. */
export const projectPath = (projectKey) => `/browse/${projectKey}`;

/**
 * The app's own page inside a project (the Acceptance tab); the project itself when the app's ids are not known.
 * @param {string} projectKey
 * @param {{appId: string, environmentId: string}|null} ids
 */
export const projectAppPath = (projectKey, ids) =>
  ids ? `/jira/software/projects/${projectKey}/apps/${ids.appId}/${ids.environmentId}` : projectPath(projectKey);

/** One release (fix version) of a project. */
export const releasePath = (projectKey, releaseId) => `/projects/${projectKey}/versions/${releaseId}`;

/**
 * Where a release is created in this project. A team-managed project (`style` other than 'classic') must switch
 * Releases on first, so it gets the features page.
 * @param {{key: string, style?: string|null}} project
 */
export const releasesSetupPath = (project) =>
  project.style === 'classic'
    ? `/projects/${project.key}?selectedItem=com.atlassian.jira.jira-projects-plugin:release-page`
    : `/jira/software/projects/${project.key}/settings/features`;

/**
 * A site-relative path as a full address. A path that already is a full address is returned as it is; no path gives ''.
 * With an unknown site ('' ) the path stays relative.
 * @param {string|null|undefined} siteUrl   'https://<site>.atlassian.net' or ''
 * @param {string|null|undefined} path
 */
export const absolute = (siteUrl, path) => (!path ? '' : /^https?:\/\//.test(path) ? path : `${siteUrl ?? ''}${path}`);
