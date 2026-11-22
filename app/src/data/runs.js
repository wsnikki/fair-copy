// [B] Tables `runs` + `evidence`. Runs are never edited or deleted (the sample remover aside).
// Contract: typedef `DataRuns` in src/contract.js.
import { execute, query } from './db.js';
import { resolvePeople } from './people.js';
import { bool, chunk, flag, marks, parseJson, rowMarks, unique } from './rows.js';

/** @typedef {import('../contract.js').DataRuns} Api */
/** @typedef {import('../contract.js').Run} Run */

const COLUMNS =
  'id, project_key, release_id, case_key, requirement_key, result, notes, build, environment, executed_at, executed_by, snapshot, sample';

const EMPTY_SNAPSHOT = { requirementText: '', requirementTextHash: '', caseText: '', caseTextHash: '' };

/** Rows → Runs, with evidence and people. Keeps the order of `rows`. */
const hydrate = async (rows) => {
  if (!rows.length) return [];
  const evidence = {};
  for (const part of chunk(rows.map((r) => r.id), 200)) {
    const found = await query(
      `SELECT run_id, attachment_id, filename, size, sha256 FROM evidence WHERE run_id IN (${marks(part.length)}) ORDER BY id`,
      part,
    );
    for (const e of found) {
      (evidence[String(e.run_id)] ??= []).push({
        attachmentId: String(e.attachment_id),
        filename: e.filename,
        size: Number(e.size),
        sha256: e.sha256 ?? null,
      });
    }
  }
  const people = await resolvePeople(rows.map((r) => r.executed_by));
  return rows.map(
    /** @returns {Run} */ (r) => ({
      id: String(r.id),
      projectKey: r.project_key,
      releaseId: String(r.release_id),
      caseKey: r.case_key,
      requirementKey: r.requirement_key,
      result: r.result,
      notes: r.notes ?? '',
      build: r.build,
      environment: r.environment,
      executedAt: r.executed_at,
      executedBy: people[r.executed_by],
      evidence: evidence[String(r.id)] ?? [],
      snapshot: { ...EMPTY_SNAPSHOT, ...parseJson(r.snapshot, {}) },
      sample: bool(r.sample),
    }),
  );
};

/** @type {Api['insertRun']} */
export const insertRun = async (run) => {
  const res = await execute(
    `INSERT INTO runs (project_key, release_id, case_key, requirement_key, result, notes, build, environment,
       executed_at, executed_by, snapshot, sample)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.projectKey,
      String(run.releaseId),
      run.caseKey,
      run.requirementKey,
      run.result,
      run.notes ?? '',
      run.build,
      run.environment,
      run.executedAt,
      run.executedBy,
      JSON.stringify(run.snapshot),
      flag(run.sample),
    ],
  );
  const runId = res.insertId;
  const files = run.evidence ?? [];
  if (files.length) {
    await execute(
      `INSERT INTO evidence (run_id, attachment_id, filename, size, sha256) VALUES ${rowMarks(files.length, 5)}`,
      files.flatMap((e) => [runId, String(e.attachmentId), e.filename, Math.trunc(Number(e.size) || 0), e.sha256 ?? null]),
    );
  }
  return runId;
};

/** @type {Api['listRunsForCases']} */
export const listRunsForCases = async (caseKeys) => {
  const rows = [];
  for (const part of chunk(unique(caseKeys), 200)) {
    rows.push(...(await query(`SELECT ${COLUMNS} FROM runs WHERE case_key IN (${marks(part.length)})`, part)));
  }
  rows.sort((a, b) =>
    a.executed_at === b.executed_at ? Number(a.id) - Number(b.id) : a.executed_at < b.executed_at ? -1 : 1,
  );
  return hydrate(rows);
};

/** @type {Api['getRun']} */
export const getRun = async (runId) => {
  const rows = await query(`SELECT ${COLUMNS} FROM runs WHERE id = ?`, [runId]);
  const [run] = await hydrate(rows);
  return run ?? null;
};

/** @type {Api['deleteRunsOfProject']} */
export const deleteRunsOfProject = async (projectKey) => {
  await execute('DELETE FROM evidence WHERE run_id IN (SELECT id FROM runs WHERE project_key = ?)', [projectKey]);
  const res = await execute('DELETE FROM runs WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};
