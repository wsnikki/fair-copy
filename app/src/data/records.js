// [B] Table `records`: the sealed acceptance records. payload_json, seal and prev_seal are written once, never updated.
// Contract: typedef `DataRecords` in src/contract.js.
import { execute, query } from './db.js';
import { resolvePeople } from './people.js';
import { bool, flag, parseJson } from './rows.js';

/** @typedef {import('../contract.js').DataRecords} Api */
/** @typedef {import('../contract.js').AcceptanceRecord} AcceptanceRecord */

const COLUMNS =
  'id, project_key, number, release_id, release_name, outcome, decided_by, decided_at, seal, prev_seal, payload_json, page_id, page_url, page_status, page_error, sample, request_id, anchor_issue, anchor_comment, followups';

const hydrate = async (rows) => {
  if (!rows.length) return [];
  const people = await resolvePeople(rows.map((r) => r.decided_by));
  return rows.map(
    /** @returns {AcceptanceRecord} */ (r) => ({
      id: String(r.id),
      projectKey: r.project_key,
      number: Number(r.number),
      releaseId: String(r.release_id),
      releaseName: r.release_name,
      outcome: r.outcome,
      decidedBy: people[r.decided_by],
      decidedAt: r.decided_at,
      seal: r.seal,
      prevSeal: r.prev_seal,
      payload: parseJson(r.payload_json, null),
      payloadJson: r.payload_json,
      pageId: r.page_id ?? null,
      pageUrl: r.page_url ?? null,
      pageStatus: r.page_status ?? 'none',
      pageError: r.page_error ?? null,
      sample: bool(r.sample),
      requestId: r.request_id === null || r.request_id === undefined ? null : String(r.request_id),
      anchorIssue: r.anchor_issue ?? null,
      anchorComment: r.anchor_comment ?? null,
      followups: String(r.followups ?? '').split(',').filter(Boolean),
    }),
  );
};

const one = async (sql, params) => {
  const [record] = await hydrate(await query(sql, params));
  return record ?? null;
};

/**
 * @type {Api['insertRecord']} Two unique keys make a second sealer fail here: (project_key, number) and request_id.
 * `requestId` and `followups` are beyond the first contract: the request this record decides, and the steps still to
 * run after sealing (services/signing.finishSigning).
 */
export const insertRecord = async (r) => {
  const res = await execute(
    `INSERT INTO records (project_key, number, release_id, release_name, outcome, decided_by, decided_at, seal,
       prev_seal, payload_json, sample, request_id, followups)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.projectKey,
      r.number,
      String(r.releaseId),
      r.releaseName,
      r.outcome,
      r.decidedBy,
      r.decidedAt,
      r.seal,
      r.prevSeal,
      r.payloadJson,
      flag(r.sample),
      r.requestId ?? null,
      (r.followups ?? []).join(','),
    ],
  );
  return res.insertId;
};

/** The record that decided this request, or null. */
export const getRecordByRequest = (requestId) => one(`SELECT ${COLUMNS} FROM records WHERE request_id = ?`, [requestId]);

/** What is still to be done after sealing. Never touches the sealed columns. */
export const setFollowups = async (id, followups) => {
  await execute('UPDATE records SET followups = ? WHERE id = ?', [[...new Set(followups)].join(','), id]);
};

/** Where the seal was posted as a Jira comment by the signer. Written once. */
export const setRecordAnchor = async (id, anchor) => {
  await execute('UPDATE records SET anchor_issue = ?, anchor_comment = ? WHERE id = ? AND anchor_comment IS NULL', [
    anchor.issueKey,
    anchor.commentId,
    id,
  ]);
};


/** @type {Api['getRecord']} */
export const getRecord = (id) => one(`SELECT ${COLUMNS} FROM records WHERE id = ?`, [id]);

/** @type {Api['getRecordByNumber']} */
export const getRecordByNumber = (projectKey, number) =>
  one(`SELECT ${COLUMNS} FROM records WHERE project_key = ? AND number = ?`, [projectKey, number]);

/** @type {Api['getRecordByPage']} */
export const getRecordByPage = (pageId) =>
  one(`SELECT ${COLUMNS} FROM records WHERE page_id = ? ORDER BY decided_at DESC, number DESC LIMIT 1`, [String(pageId)]);

/** @type {Api['listRecords']} */
export const listRecords = async (projectKey) =>
  hydrate(await query(`SELECT ${COLUMNS} FROM records WHERE project_key = ? ORDER BY number`, [projectKey]));

/** @type {Api['latestRecord']} */
export const latestRecord = (projectKey) =>
  one(`SELECT ${COLUMNS} FROM records WHERE project_key = ? ORDER BY number DESC LIMIT 1`, [projectKey]);

/** @type {Api['setRecordPage']} */
export const setRecordPage = async (id, page) => {
  await execute('UPDATE records SET page_id = ?, page_url = ?, page_status = ?, page_error = ? WHERE id = ?', [
    page.pageId ?? null,
    page.pageUrl ?? null,
    page.pageStatus,
    page.pageError ?? null,
    id,
  ]);
};

/** @type {Api['deleteRecordsOfProject']} */
export const deleteRecordsOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM records WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};

/** Keys of every project that has acceptance data (cases or records), for the page outside any project. */
export const listProjectKeys = async () => {
  const rows = await query('SELECT DISTINCT project_key FROM cases UNION SELECT DISTINCT project_key FROM records');
  return rows.map((r) => r.project_key).filter(Boolean).sort();
};
