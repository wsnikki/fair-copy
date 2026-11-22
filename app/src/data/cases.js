// [B] Table `cases`: which issue is an acceptance case, and of which requirement.
// Contract: typedef `DataCases` in src/contract.js.
import { execute, query } from './db.js';
import { chunk, flag, marks, unique } from './rows.js';

/** @typedef {import('../contract.js').DataCases} Api */

const COLUMNS = 'case_key, case_id, project_key, requirement_key';
const toCase = (row) => ({
  caseKey: row.case_key,
  caseId: String(row.case_id),
  projectKey: row.project_key,
  requirementKey: row.requirement_key,
});

/** @type {Api['upsertCase']} */
export const upsertCase = async (c) => {
  await execute(
    `INSERT INTO cases (case_key, case_id, project_key, requirement_key, marked_by, marked_at, sample)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE case_id = VALUES(case_id), project_key = VALUES(project_key),
       requirement_key = VALUES(requirement_key), marked_by = VALUES(marked_by), marked_at = VALUES(marked_at),
       sample = VALUES(sample)`,
    [c.caseKey, String(c.caseId), c.projectKey, c.requirementKey, c.markedBy, c.markedAt, flag(c.sample)],
  );
};

/** @type {Api['getCase']} */
export const getCase = async (caseKey) => {
  const rows = await query(`SELECT ${COLUMNS} FROM cases WHERE case_key = ?`, [caseKey]);
  return rows.length ? toCase(rows[0]) : null;
};

/** @type {Api['listCases']} */
export const listCases = async (projectKey) => {
  const rows = await query(`SELECT ${COLUMNS} FROM cases WHERE project_key = ? ORDER BY case_key`, [projectKey]);
  return rows.map(toCase);
};

/** @type {Api['listCasesForRequirements']} */
export const listCasesForRequirements = async (requirementKeys) => {
  const out = [];
  for (const part of chunk(unique(requirementKeys), 200)) {
    const rows = await query(
      `SELECT ${COLUMNS} FROM cases WHERE requirement_key IN (${marks(part.length)}) ORDER BY case_key`,
      part,
    );
    out.push(...rows.map(toCase));
  }
  return out;
};

/** @type {Api['deleteCasesOfProject']} */
export const deleteCasesOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM cases WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};
