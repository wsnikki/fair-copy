// [B] Table `people`: names for Person ids (Jira account ids and `sample:P<n>`).
// Contract: typedef `DataPeople` in src/contract.js.
import { SAMPLE_PERSON_PREFIX } from '../contract.js';
import { getUsers } from '../clients/jira.js';
import { execute, query } from './db.js';
import { chunk, marks, rowMarks, unique } from './rows.js';

/** @typedef {import('../contract.js').DataPeople} Api */
/** @typedef {import('../contract.js').Person} Person */

const isSample = (id) => String(id).startsWith(SAMPLE_PERSON_PREFIX);
const toPerson = (row) => ({ id: row.id, name: row.name, kind: row.kind === 'sample' ? 'sample' : 'jira' });

/** @type {Api['upsertPeople']} */
export const upsertPeople = async (people) => {
  const byId = new Map(people.filter((p) => p && p.id).map((p) => [p.id, p]));
  for (const part of chunk([...byId.values()], 50)) {
    await execute(
      `INSERT INTO people (id, name, kind, title) VALUES ${rowMarks(part.length, 4)}
       ON DUPLICATE KEY UPDATE name = VALUES(name), kind = VALUES(kind), title = COALESCE(VALUES(title), title)`,
      part.flatMap((p) => [p.id, p.name || p.id, p.kind ?? (isSample(p.id) ? 'sample' : 'jira'), p.title ?? null]),
    );
  }
};

/** @type {Api['getPeople']} */
export const getPeople = async (ids) => {
  const wanted = unique(ids);
  /** @type {Record<string, Person>} */
  const out = {};
  for (const part of chunk(wanted, 200)) {
    const rows = await query(`SELECT id, name, kind FROM people WHERE id IN (${marks(part.length)})`, part);
    for (const row of rows) out[row.id] = toPerson(row);
  }
  for (const id of wanted) {
    if (!out[id] && isSample(id)) out[id] = { id, name: id, kind: 'sample' };
  }
  return out;
};

/** @type {Api['listPeople']} */
export const listPeople = async (kind) => {
  const rows = await query('SELECT id, name, kind FROM people WHERE kind = ? ORDER BY name, id', [kind]);
  return rows.map(toPerson);
};

/** @type {Api['deleteSamplePeople']} */
export const deleteSamplePeople = async () => {
  const res = await execute("DELETE FROM people WHERE kind = 'sample'");
  return res.affectedRows;
};

/**
 * Used by the other repos (beyond the contract's list): a Person for EVERY id asked for.
 * Ids the table does not know are looked up in Jira once and remembered; an account Jira no longer shows becomes
 * "Former user", so a stored row can always be read back.
 * @param {(string|null|undefined)[]} ids
 * @returns {Promise<Record<string, Person>>}
 */
export const resolvePeople = async (ids) => {
  const wanted = unique(ids);
  const out = await getPeople(wanted);
  const missing = wanted.filter((id) => !out[id]);
  if (missing.length) {
    let found = [];
    try {
      found = await getUsers(missing);
      if (found.length) await upsertPeople(found);
    } catch (err) {
      console.warn(`people lookup: ${err?.message ?? err}`);
    }
    for (const person of found) out[person.id] = person;
    for (const id of missing) {
      if (!out[id]) out[id] = { id, name: 'Former user', kind: 'jira' };
    }
  }
  return out;
};
