// Pure time and text helpers shared by every slice (domain may import this). Owned by the skeleton; ask Main before changing.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** Any Date, epoch ms or date string → IsoTime: UTC, to the second, `YYYY-MM-DDTHH:MM:SSZ`. */
export const toIso = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError(`not a date: ${value}`);
  return `${d.toISOString().slice(0, 19)}Z`;
};

/** Now as IsoTime. The only place the clock is read; domain functions take `now` as a parameter. */
export const nowIso = () => toIso(new Date());

/** IsoTime or IsoDate → IsoDate. */
export const dayOf = (iso) => iso.slice(0, 10);

/** IsoDate + whole days → IsoDate. */
export const addDays = (isoDate, days) => {
  const d = new Date(`${dayOf(isoDate)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole days from IsoDate/IsoTime `a` to `b` (b − a), by UTC calendar day. */
export const daysBetween = (a, b) =>
  Math.round((Date.parse(`${dayOf(b)}T00:00:00Z`) - Date.parse(`${dayOf(a)}T00:00:00Z`)) / 86400000);

/** "5 Dec" inside the year of `now`, "5 Dec 2026" otherwise or when `withYear` (records always print the year). */
export const formatDay = (iso, now, withYear = false) => {
  const [y, m, d] = dayOf(iso).split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return withYear || !now || Number(dayOf(now).slice(0, 4)) !== y ? `${base} ${y}` : base;
};

/** "5 Dec 16:22" / "5 Dec 2026, 16:22 UTC" (withYear). Times are UTC. */
export const formatDayTime = (iso, now, withYear = false) =>
  withYear ? `${formatDay(iso, now, true)}, ${iso.slice(11, 16)} UTC` : `${formatDay(iso, now)} ${iso.slice(11, 16)}`;

/**
 * A stale reason as a record prints it. Only the rule, the time and the person were sealed, so this is all it can say.
 * @param {string} code      S1–S6 (PRODUCT §3.2)
 * @param {string|null} at   IsoTime
 * @param {string|null} byName
 */
export const staleReasonNote = (code, at, byName) => {
  const on = at ? ` on ${formatDay(at, null, true)}` : '';
  const by = byName ? ` by ${byName}` : '';
  if (code === 'S1') return `Requirement edited${by}${on}`;
  if (code === 'S2') return `Test steps edited${by}${on}`;
  if (code === 'S3') return `Requirement reopened${by}${on}`;
  if (code === 'S4') return `A linked defect was reopened${on}`;
  if (code === 'S5') return 'Tested on an earlier build';
  if (code === 'S6') return 'An evidence file is missing or has changed';
  return String(code);
};

/**
 * What differs between two texts, by whole words: the shared start, the two middles, the shared end.
 * `head + was + tail` is `before`; `head + now + tail` is `after`.
 * @returns {{head: string, was: string, now: string, tail: string}}
 */
export const changedPart = (before, after) => {
  const a = String(before ?? '').split(/(\s+)/);
  const b = String(after ?? '').split(/(\s+)/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  return {
    head: a.slice(0, start).join(''),
    was: a.slice(start, a.length - end).join(''),
    now: b.slice(start, b.length - end).join(''),
    tail: a.slice(a.length - end).join(''),
  };
};

/** Seal as shown to people: first 8 and last 4 characters, `3fa94c1e…b07d`. */
export const shortSeal = (seal) => `${seal.slice(0, 8)}…${seal.slice(-4)}`;

/** "1 case" / "2 cases". No text is built from fragments beyond this. */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Natural order for issue keys: CLM-7 before CLM-10. */
export const compareKeys = (a, b) => {
  const [pa, na] = a.split('-');
  const [pb, nb] = b.split('-');
  return pa === pb ? Number(na) - Number(nb) : pa < pb ? -1 : 1;
};
