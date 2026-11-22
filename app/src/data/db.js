// [B] Forge SQL access: migrations and the two query helpers. Contract: DataDb in src/contract.js.
// Working as delivered by the skeleton (pattern verified in TECH §3(3)); slice B owns it from here.
import { sql, migrationRunner } from '@forge/sql';
import { MIGRATIONS } from './schema.js';

/** @typedef {import('../contract.js').DataDb} Api */

let migrated = null;

/** @type {Api['migrate']} Scheduled-trigger handler (hourly) and direct call. Already-applied ids are skipped by the runner. */
export const migrate = async () => {
  let runner = migrationRunner;
  for (const m of MIGRATIONS) runner = runner.enqueue(m.id, m.sql);
  const applied = await runner.run();
  console.log(`migrations applied: ${JSON.stringify(applied)}`);
  return applied;
};

/** @type {Api['ensureMigrated']} Once per warm container. A failed run is retried on the next call. */
export const ensureMigrated = async () => {
  if (!migrated) {
    migrated = migrate().catch((err) => {
      migrated = null;
      throw err;
    });
  }
  await migrated;
};

/** @type {Api['query']} */
export const query = async (statement, params = []) => {
  await ensureMigrated();
  const prepared = sql.prepare(statement);
  const res = await (params.length ? prepared.bindParams(...params) : prepared).execute();
  return res.rows ?? [];
};

/** @type {Api['execute']} */
export const execute = async (statement, params = []) => {
  await ensureMigrated();
  const prepared = sql.prepare(statement);
  const res = await (params.length ? prepared.bindParams(...params) : prepared).execute();
  const rows = res.rows ?? {};
  return {
    insertId: rows.insertId === undefined || rows.insertId === null ? null : String(rows.insertId),
    affectedRows: Number(rows.affectedRows ?? 0),
  };
};
