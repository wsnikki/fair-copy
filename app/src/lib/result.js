// Shared by every slice. Owned by the skeleton; ask Main before changing.
import { ERROR } from '../contract.js';

export const GENERIC_ERROR = 'That did not work, and nothing was changed.';

/** An error a person can read. Services throw it; the resolver wrapper turns it into `fail(code, message, details)`. */
export class AppError extends Error {
  /**
   * @param {string} code      one of contract.js ERROR
   * @param {string} message   a finished sentence from PRODUCT §8.6
   * @param {any} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

/** @template T @param {T} data @returns {{ok: true, data: T}} */
export const ok = (data) => ({ ok: true, data });

/** @returns {{ok: false, code: string, error: string, details?: any}} */
export const fail = (code, error, details) =>
  details === undefined ? { ok: false, code, error } : { ok: false, code, error, details };

/** Turns anything thrown into a `fail` result. Unknown errors get the generic sentence; the real one goes to the log. */
export const failFrom = (err) => {
  if (err instanceof AppError) return fail(err.code, err.message, err.details);
  console.error(err);
  return fail(ERROR.FAILED, GENERIC_ERROR);
};

/** Stub helper: `throw notImplemented('services/brief.getBrief')`. */
export const notImplemented = (name) => new AppError(ERROR.NOT_IMPLEMENTED, `not implemented: ${name}`);
