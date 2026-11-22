// [B] Table `locks`: a named mutex across invocations. The primary key makes INSERT the atomic "take".
import { execute, query } from './db.js';
import { toIso } from '../lib/format.js';

/**
 * Takes the lock, or says who holds it. A lock older than `staleSeconds` was left by an invocation that was cut off and
 * is taken over (the UPDATE matches the old time, so only one taker wins).
 * @param {string} name
 * @param {string} holder
 * @param {number} staleSeconds
 * @returns {Promise<boolean>}
 */
export const takeLock = async (name, holder, staleSeconds) => {
  const now = Date.now();
  const at = toIso(now);
  try {
    await execute('INSERT INTO locks (name, holder, at) VALUES (?, ?, ?)', [name, holder, at]);
    return true;
  } catch {
    // held: fall through
  }
  const [row] = await query('SELECT holder, at FROM locks WHERE name = ?', [name]);
  if (!row) return takeLockOnce(name, holder, at);
  if (row.at >= toIso(now - staleSeconds * 1000)) return false;
  const res = await execute('UPDATE locks SET holder = ?, at = ? WHERE name = ? AND at = ? AND holder = ?', [holder, at, name, row.at, row.holder]);
  return res.affectedRows === 1;
};

const takeLockOnce = async (name, holder, at) => {
  try {
    await execute('INSERT INTO locks (name, holder, at) VALUES (?, ?, ?)', [name, holder, at]);
    return true;
  } catch {
    return false;
  }
};

/** Gives the lock back. Only the holder's own row goes. Never throws. */
export const releaseLock = async (name, holder) => {
  try {
    await execute('DELETE FROM locks WHERE name = ? AND holder = ?', [name, holder]);
  } catch (err) {
    console.warn(`lock ${name} could not be released`, err?.message);
  }
};
