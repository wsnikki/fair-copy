// [D] Settings page.
// Contract: typedef `ServiceSettings` in src/contract.js.
import { DEFAULT_SETTINGS, ERROR } from '../contract.js';
import { AppError } from '../lib/result.js';
import { BRAND } from '../lib/brand.js';
import * as jira from '../clients/jira.js';
import * as confluence from '../clients/confluence.js';
import * as dataSettings from '../data/settings.js';
import { priorityList } from '../domain/whatCounts.js';
import { permissionsOf } from './access.js';
import { CONNECT_STEP } from './readiness.js';
import { need, requireAccount } from './support.js';

/** @typedef {import('../contract.js').ServiceSettings} Api */

const NO_CONFLUENCE = 'Confluence is not available on this site. Records are still sealed and kept here.';

const available = async () => {
  try {
    return await confluence.isAvailable();
  } catch {
    return false;
  }
};

/** What the pickers on the settings page offer: this project's issue types, the site's priorities, text fields. */
const optionsOf = async (projectKey) => {
  const [issueTypes, priorities, fields] = await Promise.all([
    jira.listIssueTypes(projectKey).catch(() => []),
    jira.listPriorities(),
    jira.listTextFields(),
  ]);
  return {
    issueTypes: issueTypes.filter((t) => !t.subtask).map((t) => ({ id: t.id, name: t.name })),
    priorities: priorityList(priorities),
    fields,
  };
};

/** @type {Api['getSettings']} */
export const getSettings = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  const [settings, sample, isAvailable, stored, options, permissions] = await Promise.all([
    dataSettings.getSettings(projectKey),
    dataSettings.getSampleStatus(),
    available(),
    dataSettings.getRecordsSpace(projectKey),
    optionsOf(projectKey),
    permissionsOf(ctx, projectKey),
  ]);
  return {
    settings,
    sample,
    confluence: { available: isAvailable, spaceKey: settings.records.spaceKey ?? stored?.spaceKey ?? null, connectStep: CONNECT_STEP },
    options,
    canEdit: permissions.projectAdmin,
  };
};

const strings = (value, fallback) =>
  Array.isArray(value) ? [...new Set(value.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => v.trim().slice(0, 100)))].slice(0, 50) : [...fallback];
const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const refuse = (field, sentence) => new AppError(ERROR.INVALID, sentence, { field });

/**
 * Only known keys, right types; anything missing falls back to the defaults. A type, priority or field that this
 * project or site does not have is refused, never stored.
 */
const clean = (input, options) => {
  const d = DEFAULT_SETTINGS;
  const s = input ?? {};
  const typeIds = new Set(options.issueTypes.map((t) => t.id));
  const typeName = (id) => options.issueTypes.find((t) => t.id === id)?.name ?? null;
  const idsOf = (value, field) => {
    const ids = strings(value, []);
    if (typeIds.size > 0 && ids.some((id) => !typeIds.has(id))) throw refuse(field, 'Choose issue types from the list for this project.');
    return ids;
  };
  const requirementTypeIds = idsOf(s.whatCounts?.requirementTypeIds, 'whatCounts.requirementTypeIds');
  const defectTypeIds = idsOf(s.whatCounts?.defectTypeIds, 'whatCounts.defectTypeIds');
  // Names are kept beside the ids for reading; with ids chosen they are simply those types' names.
  const namesFor = (ids, given, fallback) =>
    ids.length > 0 ? ids.map(typeName).filter(Boolean) : strings(given, fallback);
  const requirementTypes = namesFor(requirementTypeIds, s.whatCounts?.requirementTypes, d.whatCounts.requirementTypes);

  const priorityId = typeof s.rules?.defectBlockPriorityId === 'string' && s.rules.defectBlockPriorityId ? s.rules.defectBlockPriorityId : null;
  const byId = priorityId ? options.priorities.find((p) => p.id === priorityId) : null;
  if (priorityId && !byId) throw refuse('rules.defectBlockPriority', 'Choose a priority from this site\'s list.');
  const priorityName = byId?.name ?? (typeof s.rules?.defectBlockPriority === 'string' ? s.rules.defectBlockPriority.trim() : '');
  if (!byId && priorityName && !options.priorities.some((p) => p.name.toLowerCase() === priorityName.toLowerCase())) {
    throw refuse('rules.defectBlockPriority', 'Choose a priority from this site\'s list.');
  }

  const criteriaField = typeof s.whatCounts?.criteriaField === 'string' && s.whatCounts.criteriaField ? s.whatCounts.criteriaField.trim() : null;
  if (criteriaField && !options.fields.some((f) => f.id === criteriaField)) {
    throw refuse('whatCounts.criteriaField', 'Choose the acceptance criteria field from the list. Only text fields of this site can be used.');
  }

  const rules = Object.fromEntries(
    Object.keys(d.rules)
      .filter((k) => !k.startsWith('defectBlockPriority'))
      .map((k) => [k, flag(s.rules?.[k], d.rules[k])]),
  );
  const environments = strings(s.whatCounts?.environments, d.whatCounts.environments);
  return {
    people: {
      approvers: strings(s.people?.approvers, d.people.approvers),
      waiverAuthorities: strings(s.people?.waiverAuthorities, d.people.waiverAuthorities),
      approverMayRecordOwnWaiver: flag(s.people?.approverMayRecordOwnWaiver, d.people.approverMayRecordOwnWaiver),
    },
    rules: { ...rules, defectBlockPriority: priorityName || d.rules.defectBlockPriority, defectBlockPriorityId: priorityId },
    whatCounts: {
      requirementTypes: requirementTypes.length ? requirementTypes : [...d.whatCounts.requirementTypes],
      defectTypes: namesFor(defectTypeIds, s.whatCounts?.defectTypes, d.whatCounts.defectTypes),
      requirementTypeIds,
      defectTypeIds,
      criteriaField,
      environments: environments.length ? environments : [...d.whatCounts.environments],
    },
    records: {
      spaceKey: typeof s.records?.spaceKey === 'string' && /^[A-Za-z0-9~_-]{1,255}$/.test(s.records.spaceKey) ? s.records.spaceKey : null,
      createTask: flag(s.records?.createTask, d.records.createTask),
    },
  };
};

/** @type {Api['saveSettings']} Project administrators only (the resolver checks); every rule change is logged with who and when. */
export const saveSettings = async (ctx, q) => {
  const projectKey = need(q, 'projectKey');
  return dataSettings.saveSettings(projectKey, clean(q.settings, await optionsOf(projectKey)), requireAccount(ctx));
};


/** @type {Api['listSpaces']} */
export const listSpaces = async () => {
  try {
    return (await confluence.listSpaces()).map((s) => ({ key: s.key, name: s.name }));
  } catch (err) {
    console.warn('spaces could not be listed', err?.message);
    return [];
  }
};

/** @type {Api['testConnection']} */
export const testConnection = async (ctx, q) => {
  try {
    if (!(await confluence.isAvailable())) return { ok: false, message: NO_CONFLUENCE };
    if (!q?.spaceKey) {
      return { ok: true, message: `Connected. ${BRAND} will create its own space for records when the first one is published.` };
    }
    const space = await confluence.getSpaceByKey(q.spaceKey);
    return space
      ? { ok: true, message: `Connected. Records will be published in ${space.name}.` }
      : { ok: false, message: `The space ${q.spaceKey} could not be found. Choose another space.` };
  } catch (err) {
    return { ok: false, message: `The Confluence page could not be written: ${String(err?.message ?? err).replace(/\.$/, '')}.` };
  }
};
