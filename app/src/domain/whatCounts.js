// [A] Which issues are requirements and defects, and which defects block — by Jira id, not by English name. Pure.
// A site in another language shows "Fehler" and "Hoch"; the ids and the untranslated names stay the same.
import { PRIORITY_ORDER } from '../contract.js';

/** Ids Jira Cloud gives its five stock priorities on every site. */
export const STANDARD_PRIORITY_ID = Object.freeze({ Highest: '1', High: '2', Medium: '3', Low: '4', Lowest: '5' });

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * The site's priorities, most serious first; the stock five when the site's list could not be read.
 * @param {{id: string, name: string}[]|null|undefined} site
 * @returns {{id: string, name: string}[]}
 */
export const priorityList = (site) =>
  Array.isArray(site) && site.length > 0 ? site : PRIORITY_ORDER.map((name) => ({ id: STANDARD_PRIORITY_ID[name], name }));

/** Index of the blocking threshold in the list; -1 when the configured priority is not on this site. */
export const thresholdIndex = (rules, list) => {
  if (rules.defectBlockPriorityId) {
    const at = list.findIndex((p) => p.id === String(rules.defectBlockPriorityId));
    if (at >= 0) return at;
  }
  const byName = list.findIndex((p) => same(p.name, rules.defectBlockPriority));
  if (byName >= 0) return byName;
  const stock = STANDARD_PRIORITY_ID[rules.defectBlockPriority];
  return stock ? list.findIndex((p) => p.id === stock) : -1;
};

/**
 * Does an open defect of this priority block plain acceptance? It blocks when it ranks at or above the threshold.
 * A priority this site does not list, no priority at all, or a threshold that is not on the site: it blocks — the app
 * never decides that something it cannot rank is harmless.
 * @param {{priorityId?: string|null, priority?: string|null}} defect
 * @param {{defectBlockPriority: string, defectBlockPriorityId?: string|null}} rules
 * @param {{id: string, name: string}[]|null} [sitePriorities]
 */
export const defectBlocks = (defect, rules, sitePriorities = null) => {
  const list = priorityList(sitePriorities);
  const at = thresholdIndex(rules, list);
  const byId = defect.priorityId ? list.findIndex((p) => p.id === String(defect.priorityId)) : -1;
  const rank = byId >= 0 ? byId : defect.priority ? list.findIndex((p) => same(p.name, defect.priority)) : -1;
  if (rank < 0 || at < 0) return true;
  return rank <= at;
};

/**
 * Is this issue of one of the chosen types? Chosen ids win; without ids the names are compared with the issue's type
 * name and with the name Jira uses before translation.
 * @param {{type: string, typeId?: string|null}} issue
 * @param {string[]} names
 * @param {string[]} ids
 * @param {{id: string, untranslatedName: string}[]} [projectTypes]
 */
export const typeMatches = (issue, names, ids, projectTypes = []) => {
  if (Array.isArray(ids) && ids.length > 0) return Boolean(issue.typeId) && ids.includes(String(issue.typeId));
  if (names.some((n) => same(n, issue.type))) return true;
  const known = projectTypes.find((t) => t.id === String(issue.typeId ?? ''));
  return Boolean(known) && names.some((n) => same(n, known.untranslatedName));
};

/** The label the app puts on the Jira issue it creates for a sealed condition. */
export const CONDITION_LABEL = 'acceptance-condition';

/**
 * The Jira issues the app itself made, from what it stored when it made them.
 * `conditions`: issues linked to a sealed condition (created by the app, OR an existing issue the approver pointed at).
 * `signOff`: the task of a sign-off request and the issue that carries a record's seal comment (always created by the app).
 * @param {{conditions?: {linkedIssue: string|null}[], requests?: {taskKey: string|null}[], records?: {anchorIssue: string|null}[]}} stored
 * @returns {{conditions: Set<string>, signOff: Set<string>}}
 */
export const appIssueKeys = ({ conditions = [], requests = [], records = [] }) => ({
  conditions: new Set(conditions.map((c) => c.linkedIssue).filter(Boolean)),
  signOff: new Set([...requests.map((r) => r.taskKey), ...records.map((r) => r.anchorIssue)].filter(Boolean)),
});

/**
 * Is this one of the app's own issues? A sign-off issue: by its stored key. A condition issue: by its stored key AND
 * the app's label. Both are needed: a condition may point at an existing requirement or defect (stored, no label), and
 * that one must stay in acceptance; and a label alone must never take a requirement out of a release.
 * @param {{key: string, labels?: string[]}} issue
 * @param {{conditions: Set<string>, signOff: Set<string>}} own
 */
export const isAppIssue = (issue, own) =>
  own.signOff.has(issue.key) || (own.conditions.has(issue.key) && (issue.labels ?? []).includes(CONDITION_LABEL));

/**
 * THE requirements of a release: issues of a requirement type that are not marked as a case and are not the app's own
 * (a condition is a promise, shown under "What was promised last time"; it is not a requirement to be tested).
 * Readiness, the brief, the issue panel, the agent actions and the MCP tools all count through this.
 * @template {{key: string, labels?: string[]}} T
 * @param {T[]} issues                         the issues of the release
 * @param {{isRequirementType: (i: T) => boolean, caseKeys: {has: (key: string) => boolean}, own: {conditions: Set<string>, signOff: Set<string>}}} rule
 * @returns {T[]}
 */
export const requirementIssues = (issues, { isRequirementType, caseKeys, own }) =>
  issues.filter((i) => isRequirementType(i) && !caseKeys.has(i.key) && !isAppIssue(i, own));

/**
 * The issue type id to create an issue with: the first wanted (untranslated) name the project has, else its first
 * ordinary type (not a sub-task, not an epic). null when the project lists none.
 * @param {{id: string, name: string, untranslatedName: string, subtask: boolean, level: number}[]} projectTypes
 * @param {string[]} wanted
 */
export const pickIssueType = (projectTypes, wanted) => {
  for (const name of wanted) {
    const hit = projectTypes.find((t) => same(t.untranslatedName, name) || same(t.name, name));
    if (hit) return hit.id;
  }
  return projectTypes.find((t) => !t.subtask && t.level === 0)?.id ?? null;
};
