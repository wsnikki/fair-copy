// [B] Table `waivers`: written exceptions, valid for one decision. A draft while record_id IS NULL.
// Contract: typedef `DataWaivers` in src/contract.js.
import { execute, query } from './db.js';
import { resolvePeople } from './people.js';
import { bool, flag, idOf } from './rows.js';

/** @typedef {import('../contract.js').DataWaivers} Api */
/** @typedef {import('../contract.js').Waiver} Waiver */

const COLUMNS =
  'id, project_key, request_id, record_id, covers, covers_label, reason, authorised_by, authorised_by_name, reference, recorded_by, recorded_at, self_recorded';

const hydrate = async (rows) => {
  if (!rows.length) return [];
  const people = await resolvePeople(rows.flatMap((r) => [r.authorised_by, r.recorded_by]));
  return rows.map(
    /** @returns {Waiver} */ (r) => ({
      id: String(r.id),
      projectKey: r.project_key,
      requestId: idOf(r.request_id),
      recordId: idOf(r.record_id),
      covers: r.covers,
      coversLabel: r.covers_label,
      reason: r.reason,
      authorisedBy: r.authorised_by ? people[r.authorised_by] : null,
      authorisedByName: r.authorised_by_name ?? null,
      reference: r.reference ?? '',
      recordedBy: people[r.recorded_by],
      recordedAt: r.recorded_at,
      selfRecorded: bool(r.self_recorded),
    }),
  );
};

const list = async (where, params) =>
  hydrate(await query(`SELECT ${COLUMNS} FROM waivers WHERE ${where} ORDER BY id`, params));

/** @type {Api['saveWaiver']} */
export const saveWaiver = async (w) => {
  if (w.id) {
    // Only a draft can be edited; once sealed the row is part of a record.
    await execute(
      `UPDATE waivers SET covers = ?, covers_label = ?, reason = ?, authorised_by = ?, authorised_by_name = ?,
         reference = ?, recorded_by = ?, recorded_at = ?, self_recorded = ?
        WHERE id = ? AND record_id IS NULL`,
      [
        w.covers,
        w.coversLabel,
        w.reason,
        w.authorisedBy ?? null,
        w.authorisedByName ?? null,
        w.reference ?? '',
        w.recordedBy,
        w.recordedAt,
        flag(w.selfRecorded),
        w.id,
      ],
    );
    return String(w.id);
  }
  const res = await execute(
    `INSERT INTO waivers (project_key, request_id, record_id, covers, covers_label, reason, authorised_by,
       authorised_by_name, reference, recorded_by, recorded_at, self_recorded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      w.projectKey,
      w.requestId ?? null,
      w.recordId ?? null,
      w.covers,
      w.coversLabel,
      w.reason,
      w.authorisedBy ?? null,
      w.authorisedByName ?? null,
      w.reference ?? '',
      w.recordedBy,
      w.recordedAt,
      flag(w.selfRecorded),
    ],
  );
  return res.insertId;
};

/** @type {Api['getWaiver']} */
export const getWaiver = async (id) => {
  const [waiver] = await list('id = ?', [id]);
  return waiver ?? null;
};

/** @type {Api['listDraftWaivers']} */
export const listDraftWaivers = (requestId) => list('request_id = ? AND record_id IS NULL', [requestId]);

/** @type {Api['deleteDraftWaiver']} */
export const deleteDraftWaiver = async (id) => {
  await execute('DELETE FROM waivers WHERE id = ? AND record_id IS NULL', [id]);
};

/** @type {Api['attachWaiversToRecord']} */
export const attachWaiversToRecord = async (requestId, recordId) => {
  await execute('UPDATE waivers SET record_id = ? WHERE request_id = ? AND record_id IS NULL', [recordId, requestId]);
};

/** @type {Api['listWaiversOfRecord']} */
export const listWaiversOfRecord = (recordId) => list('record_id = ?', [recordId]);

/** @type {Api['deleteWaiversOfProject']} */
export const deleteWaiversOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM waivers WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};
