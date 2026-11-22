// [B] Table `conditions`: promises attached to a decision. A draft while record_id IS NULL.
// Contract: typedef `DataConditions` in src/contract.js.
import { conditionState } from '../domain/signingRules.js';
import { nowIso } from '../lib/format.js';
import { execute, query } from './db.js';
import { resolvePeople } from './people.js';
import { bool, flag, idOf, intOf, parseJson } from './rows.js';

/** @typedef {import('../contract.js').DataConditions} Api */
/** @typedef {import('../contract.js').Condition} Condition */

const COLUMNS =
  'id, project_key, request_id, record_id, record_number, release_name, text, owner, due_date, covers, linked_issue, status, met_at, met_by, sample, met_note';

const hydrate = async (rows) => {
  if (!rows.length) return [];
  const people = await resolvePeople(rows.flatMap((r) => [r.owner, r.met_by]));
  const now = nowIso();
  return rows.map(
    /** @returns {Condition} */ (r) => {
      const status = r.status === 'met' ? 'met' : 'open';
      return {
        id: String(r.id),
        projectKey: r.project_key,
        requestId: idOf(r.request_id),
        recordId: idOf(r.record_id),
        recordNumber: intOf(r.record_number),
        releaseName: r.release_name ?? null,
        text: r.text,
        owner: people[r.owner],
        dueDate: r.due_date,
        covers: parseJson(r.covers, []),
        linkedIssue: r.linked_issue ?? null,
        status,
        state: conditionState({ status, dueDate: r.due_date }, now),
        metAt: r.met_at ?? null,
        metBy: r.met_by ? people[r.met_by] : null,
        sample: bool(r.sample),
        metNote: r.met_note ?? null,
      };
    },
  );
};

// Ids are not in the order things were written, so the default order is by record, then by due date: the same list
// reads the same on every load.
const list = async (where, params, order = 'record_number, due_date, id') =>
  hydrate(await query(`SELECT ${COLUMNS} FROM conditions WHERE ${where} ORDER BY ${order}`, params));

/** @type {Api['saveCondition']} */
export const saveCondition = async (c) => {
  if (c.id) {
    // Only a draft can be edited; once sealed the row is part of a record.
    await execute(
      `UPDATE conditions SET text = ?, owner = ?, due_date = ?, covers = ?, linked_issue = ?
        WHERE id = ? AND record_id IS NULL`,
      [c.text, c.owner, c.dueDate, JSON.stringify(c.covers ?? []), c.linkedIssue ?? null, c.id],
    );
    return String(c.id);
  }
  const res = await execute(
    `INSERT INTO conditions (project_key, request_id, record_id, record_number, release_name, text, owner, due_date,
       covers, linked_issue, status, met_at, met_by, sample)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.projectKey,
      c.requestId ?? null,
      c.recordId ?? null,
      c.recordNumber ?? null,
      c.releaseName ?? null,
      c.text,
      c.owner,
      c.dueDate,
      JSON.stringify(c.covers ?? []),
      c.linkedIssue ?? null,
      c.status ?? 'open',
      c.metAt ?? null,
      c.metBy ?? null,
      flag(c.sample),
    ],
  );
  return res.insertId;
};

/** @type {Api['getCondition']} */
export const getCondition = async (id) => {
  const [condition] = await list('id = ?', [id]);
  return condition ?? null;
};

/** @type {Api['listDraftConditions']} */
export const listDraftConditions = (requestId) => list('request_id = ? AND record_id IS NULL', [requestId]);

/** @type {Api['deleteDraftCondition']} */
export const deleteDraftCondition = async (id) => {
  await execute('DELETE FROM conditions WHERE id = ? AND record_id IS NULL', [id]);
};

/** @type {Api['attachConditionsToRecord']} */
export const attachConditionsToRecord = async (requestId, record) => {
  await execute(
    'UPDATE conditions SET record_id = ?, record_number = ?, release_name = ? WHERE request_id = ? AND record_id IS NULL',
    [record.recordId, record.recordNumber, record.releaseName, requestId],
  );
};

/** @type {Api['listConditionsOfRecord']} */
export const listConditionsOfRecord = (recordId) => list('record_id = ?', [recordId]);

/** @type {Api['listSealedConditions']} */
export const listSealedConditions = (projectKey) =>
  list('project_key = ? AND record_id IS NOT NULL', [projectKey], 'record_number, id');

/** @type {Api['markConditionMet']} Only a sealed, still open condition can be met; the first confirmation stands. */
export const markConditionMet = async (id, met) => {
  await execute(
    "UPDATE conditions SET status = 'met', met_at = ?, met_by = ?, met_note = ? WHERE id = ? AND status = 'open' AND record_id IS NOT NULL",
    [met.metAt, met.metBy, met.note ?? null, id],
  );
};

/** @type {Api['setConditionIssue']} */
export const setConditionIssue = async (id, linkedIssue) => {
  await execute('UPDATE conditions SET linked_issue = ? WHERE id = ?', [linkedIssue, id]);
};

/** @type {Api['deleteConditionsOfProject']} */
export const deleteConditionsOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM conditions WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};
