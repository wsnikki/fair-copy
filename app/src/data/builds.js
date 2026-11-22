// [B] Table `builds`: one row per release — the build being accepted. Setting it replaces the row.
// (Forge SQL does not hand out ids in time order, so "the latest row" can never be found by MAX(id).)
// Contract: typedef `DataBuilds` in src/contract.js.
import { execute, query } from './db.js';
import { marks, unique } from './rows.js';

/** @typedef {import('../contract.js').DataBuilds} Api */

/** @type {Api['addBuild']} The new row is written first; older rows of the release go only after it exists. */
export const addBuild = async (b) => {
  const res = await execute('INSERT INTO builds (project_key, release_id, build, set_by, set_at) VALUES (?, ?, ?, ?, ?)', [
    b.projectKey,
    String(b.releaseId),
    b.build,
    b.setBy,
    b.setAt,
  ]);
  if (res.insertId) await execute('DELETE FROM builds WHERE release_id = ? AND id <> ?', [String(b.releaseId), res.insertId]);
};

/** The release has no build being accepted any more. */
export const clearBuild = async (releaseId) => {
  await execute('DELETE FROM builds WHERE release_id = ?', [String(releaseId)]);
};

/** @type {Api['currentBuilds']} By time, never by id; rows left by older versions are simply outvoted. */
export const currentBuilds = async (releaseIds) => {
  const ids = unique(releaseIds.map((id) => (id === null || id === undefined ? id : String(id))));
  const out = {};
  if (!ids.length) return out;
  const rows = await query(
    `SELECT release_id, build, set_by, set_at FROM builds WHERE release_id IN (${marks(ids.length)}) ORDER BY set_at ASC`,
    ids,
  );
  for (const row of rows) out[String(row.release_id)] = { build: row.build, setBy: row.set_by, setAt: row.set_at };
  return out;
};

/** @type {Api['deleteBuildsOfProject']} */
export const deleteBuildsOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM builds WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};
