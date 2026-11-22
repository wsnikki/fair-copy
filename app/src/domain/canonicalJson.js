// [A] RFC 8785 canonical JSON (JSON Canonicalization Scheme), restricted to integers (PRODUCT §3.5). Pure.
// Contract: typedef `DomainCanonicalJson` in src/contract.js.  https://www.rfc-editor.org/rfc/rfc8785

/** @typedef {import('../contract.js').DomainCanonicalJson} Api */

const isPlainObject = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** UTF-16 code unit order (RFC 8785 §3.2.3) is what `<` on JavaScript strings already compares. */
const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const write = (value, path) => {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value); // ECMAScript escaping, as RFC 8785 §3.2.2.2 requires
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError(`canonical JSON takes whole numbers only: ${path} is ${value}`);
    return String(value === 0 ? 0 : value); // -0 → "0"
  }
  if (Array.isArray(value)) return `[${value.map((item, i) => write(item, `${path}[${i}]`)).join(',')}]`;
  if (typeof value === 'object' && isPlainObject(value)) {
    const members = Object.keys(value)
      .sort(byCodeUnits)
      .map((key) => `${JSON.stringify(key)}:${write(value[key], `${path}.${key}`)}`);
    return `{${members.join(',')}}`;
  }
  throw new TypeError(`canonical JSON cannot hold ${value === undefined ? 'undefined' : typeof value} at ${path}`);
};

/** @type {Api['canonicalize']} */
export const canonicalize = (value) => write(value, '$');
