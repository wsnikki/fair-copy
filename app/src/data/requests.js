// [B] Table `requests`: "Please decide on Release 2.4". At most one open request per release (the service checks).
// Contract: typedef `DataRequests` in src/contract.js.
import { REQUEST_STATE } from '../contract.js';
import { execute, query } from './db.js';
import { resolvePeople } from './people.js';
import { flag, idOf } from './rows.js';

/** @typedef {import('../contract.js').DataRequests} Api */
/** @typedef {import('../contract.js').Request} Request */

const COLUMNS =
  'id, project_key, release_id, release_name, requested_by, requested_at, approver, due_date, note, state, task_key, record_id, sample, closed_at';

/** Internal state between "claimed for sealing" and "decided". Outside this file such a request still reads as open. */
const SIGNING = 'signing';
/** A claim older than this was cut off (a resolver lives 25 s) and may be taken again. */
const CLAIM_STALE_SECONDS = 40;

const hydrate = async (rows) => {
  if (!rows.length) return [];
  const people = await resolvePeople(rows.flatMap((r) => [r.requested_by, r.approver]));
  return rows.map(
    /** @returns {Request} */ (r) => ({
      id: String(r.id),
      projectKey: r.project_key,
      releaseId: String(r.release_id),
      releaseName: r.release_name,
      requestedBy: people[r.requested_by],
      requestedAt: r.requested_at,
      approver: people[r.approver],
      dueDate: r.due_date,
      note: r.note ?? '',
      state: r.state === SIGNING ? REQUEST_STATE.OPEN : r.state,
      taskKey: r.task_key ?? null,
      recordId: idOf(r.record_id),
      sample: Number(r.sample) === 1,
      signing: r.state === SIGNING,
    }),
  );
};

/** @type {Api['insertRequest']} */
export const insertRequest = async (r) => {
  const res = await execute(
    `INSERT INTO requests (project_key, release_id, release_name, requested_by, requested_at, approver, due_date,
       note, state, task_key, sample)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.projectKey,
      String(r.releaseId),
      r.releaseName,
      r.requestedBy,
      r.requestedAt,
      r.approver,
      r.dueDate,
      r.note ?? '',
      REQUEST_STATE.OPEN,
      r.taskKey ?? null,
      flag(r.sample),
    ],
  );
  return res.insertId;
};

/** @type {Api['getRequest']} */
export const getRequest = async (id) => {
  const [request] = await hydrate(await query(`SELECT ${COLUMNS} FROM requests WHERE id = ?`, [id]));
  return request ?? null;
};

/** @type {Api['getOpenRequest']} */
export const getOpenRequest = async (projectKey, releaseId) => {
  const rows = await query(
    `SELECT ${COLUMNS} FROM requests WHERE project_key = ? AND release_id = ? AND state IN (?, ?)
      ORDER BY requested_at DESC, id DESC LIMIT 1`,
    [projectKey, String(releaseId), REQUEST_STATE.OPEN, SIGNING],
  );
  const [request] = await hydrate(rows);
  return request ?? null;
};

/** @type {Api['listRequests']} */
export const listRequests = async (projectKey) =>
  hydrate(await query(`SELECT ${COLUMNS} FROM requests WHERE project_key = ? ORDER BY requested_at, id`, [projectKey]));

/**
 * Takes the request for sealing. Exactly one caller gets `true`: the UPDATE only matches an open request, or a claim
 * that was cut off long enough ago. Everything that writes a record happens after a successful claim.
 * @param {string} id
 * @param {string} now       IsoTime
 * @param {string} staleAt   IsoTime: claims made before this moment count as cut off
 * @returns {Promise<boolean>}
 */
export const claimRequest = async (id, now, staleAt) => {
  const res = await execute(
    `UPDATE requests SET state = ?, closed_at = ? WHERE id = ? AND (state = ? OR (state = ? AND closed_at < ?))`,
    [SIGNING, now, id, REQUEST_STATE.OPEN, SIGNING, staleAt],
  );
  return res.affectedRows === 1;
};
export { CLAIM_STALE_SECONDS };

/** Gives a claimed request back (the seal could not be written). */
export const releaseRequest = async (id) => {
  await execute('UPDATE requests SET state = ?, closed_at = NULL WHERE id = ? AND state = ?', [REQUEST_STATE.OPEN, id, SIGNING]);
};

/**
 * @type {Api['closeRequest']} A decision closes an open or claimed request; a withdrawal only an open one (a request
 * that is being sealed can no longer be withdrawn). A second close changes nothing. Returns whether it closed.
 */
export const closeRequest = async (id, patch) => {
  const from = patch.state === REQUEST_STATE.DECIDED ? [REQUEST_STATE.OPEN, SIGNING] : [REQUEST_STATE.OPEN, REQUEST_STATE.OPEN];
  const res = await execute('UPDATE requests SET state = ?, record_id = ?, closed_at = ? WHERE id = ? AND state IN (?, ?)', [
    patch.state,
    patch.recordId ?? null,
    patch.closedAt,
    id,
    ...from,
  ]);
  return res.affectedRows === 1;
};

/** @type {Api['deleteRequestsOfProject']} */
export const deleteRequestsOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM requests WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};
