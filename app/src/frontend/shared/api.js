// [E] The one way the frontend talks to the backend: `call(INVOKE.x, payload)` → always a Result, never a rejection.
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, showFlag, view } from '@forge/bridge';
import { ERROR } from '../../contract.js';

/** PRODUCT §8.6, generic. Used only when the resolver could not be reached at all. */
export const GENERIC_ERROR = 'That did not work, and nothing was changed.';

/**
 * @param {string} name     a value of contract.INVOKE
 * @param {object} [payload]
 * @returns {Promise<{ok: true, data: any} | {ok: false, code: string, error: string, details?: any}>}
 */
export const call = async (name, payload = {}) => {
  try {
    const res = await invoke(name, payload);
    if (res && res.ok === true) return res;
    if (res && res.ok === false) {
      return { ok: false, code: res.code || ERROR.FAILED, error: res.error || GENERIC_ERROR, details: res.details };
    }
    return { ok: false, code: ERROR.FAILED, error: GENERIC_ERROR };
  } catch (err) {
    return { ok: false, code: ERROR.FAILED, error: GENERIC_ERROR };
  }
};

/**
 * Load one resolver answer and keep it. `payload` null = do not load yet.
 * @returns {{loading: boolean, data: any, error: string|null, code: string|null, details: any, reload: () => Promise<void>, setData: (d: any) => void}}
 */
export const useLoad = (name, payload) => {
  const key = payload === null ? null : JSON.stringify(payload);
  const [state, setState] = useState({ loading: payload !== null, data: null, error: null, code: null, details: null });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (key === null) return;
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const res = await call(name, JSON.parse(key));
    if (mine !== seq.current) return;
    setState(
      res.ok
        ? { loading: false, data: res.data, error: null, code: null, details: null }
        : { loading: false, data: null, error: res.error, code: res.code, details: res.details ?? null }
    );
  }, [name, key]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setData = useCallback((data) => {
    seq.current += 1;
    setState({ loading: false, data, error: null, code: null, details: null });
  }, []);

  return { ...state, reload, setData };
};

/** Extension context of the module (project, issue, Confluence content). Null until known. */
export const useExtension = () => {
  const [ext, setExt] = useState(null);
  useEffect(() => {
    let live = true;
    view
      .getContext()
      .then((ctx) => live && setExt(ctx?.extension ?? {}))
      .catch(() => live && setExt({}));
    return () => {
      live = false;
    };
  }, []);
  return ext;
};

let flagSeq = 0;
/** Short confirmation (PRODUCT §8.5 "Flags"). Silent when the host has no flags. */
export const flag = (title, type = 'success') => {
  if (!title) return;
  try {
    flagSeq += 1;
    showFlag({ id: `countersign-${Date.now()}-${flagSeq}`, title, type, isAutoDismiss: true });
  } catch (err) {
    // The same sentence is always shown inline by the caller where it matters.
  }
};
