// [B] Small pure helpers shared by the repos (no @forge/* import).

/** `?, ?, ?` for an IN list or a VALUES row. */
export const marks = (n) => Array.from({ length: n }, () => '?').join(', ');

/** `(?, ?), (?, ?)` for a multi-row insert. */
export const rowMarks = (rows, columns) => Array.from({ length: rows }, () => `(${marks(columns)})`).join(', ');

export const flag = (value) => (value ? 1 : 0);
export const bool = (value) => Number(value) === 1 || value === true;
export const idOf = (value) => (value === null || value === undefined ? null : String(value));
export const intOf = (value) => (value === null || value === undefined ? null : Number(value));

export const parseJson = (text, fallback) => {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

export const unique = (list) => [...new Set(list.filter((x) => x !== null && x !== undefined && x !== ''))];

export const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
