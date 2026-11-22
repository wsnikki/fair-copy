// [B] When a request is sent again, the same way for Jira and Confluence. Pure: no @forge/* import.
//
//   429 "too many requests"   always: the product took nothing. Twice at most, after the time it asks for.
//   500, 502, 503, 504        only when the caller says the call is safe to repeat (`serverErrors`): a read, a field
//                             update, a delete. Three times at most, after 0.5 s, 1 s and 2 s. A just-created site
//                             answers 500 to its first writes ("cluster lock"), and the same request works a moment later.
//                             A create is NOT sent again by this rule: the first one may have been carried out.

const RETRIES = 2;
/** Never wait longer than this for one retry: a resolver is stopped at 25 s. */
const MAX_WAIT_MS = 4000;

/** Retries after a 5xx, and the pause before each: 3.5 s in all, well inside one phase of the sample loader (about 9 s). */
export const SERVER_RETRIES = 3;
const SERVER_WAIT_MS = [500, 1000, 2000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A status that says "Jira itself had trouble", worth another try when the call is safe to repeat. */
export const isServerError = (status) => status === 500 || status === 502 || status === 503 || status === 504;

/** The pause before retry number `attempt` (0-based) after a 5xx. */
export const serverWaitMs = (attempt) => SERVER_WAIT_MS[Math.min(Math.max(0, attempt), SERVER_WAIT_MS.length - 1)];

/** How long to wait after a 429: the time the product asks for (`Retry-After`, seconds), else 1 s, then 2 s. Capped. */
export const waitMs = (res, attempt) => {
  const asked = Number(res?.headers?.get?.('retry-after'));
  return Math.min(MAX_WAIT_MS, Number.isFinite(asked) && asked > 0 ? asked * 1000 : 1000 * (attempt + 1));
};

/**
 * Sends a request; a 429 is sent again, twice at most, after the wait above. With `serverErrors`, a 500/502/503/504 is
 * sent again too, three times at most, and each retry writes one line: `jira <call>: 500, retry 1`. Returns the last
 * response whatever its status — the caller decides what a status means. Whatever `send` throws is thrown on.
 * @template {{status: number}} R
 * @param {() => Promise<R>} send
 * @param {(ms: number) => Promise<void>} [pause]   for tests
 * @param {{serverErrors?: boolean, what?: string, log?: (line: string) => void}} [policy]
 * @returns {Promise<R>}
 */
export const withRetry = async (send, pause = sleep, policy = {}) => {
  const log = policy.log ?? ((line) => console.warn(line));
  let limited = 0;
  let failed = 0;
  for (;;) {
    const res = await send();
    if (res.status === 429 && limited < RETRIES) {
      await pause(waitMs(res, limited));
      limited += 1;
    } else if (policy.serverErrors && isServerError(res.status) && failed < SERVER_RETRIES) {
      log(`${policy.what ?? 'request'}: ${res.status}, retry ${failed + 1}`);
      await pause(serverWaitMs(failed));
      failed += 1;
    } else return res;
  }
};

/**
 * Runs `fn` over `items` in order, at most `atOnce` at a time, and starts nothing at or after `deadline` (epoch ms).
 * What was started is always waited for: when this returns, nothing is still running. `fn` answering `false` also
 * stops new starts (the product said "too many requests"). Returns how many items were started.
 * @template T
 * @param {T[]} items
 * @param {number} atOnce
 * @param {number} deadline
 * @param {(item: T) => Promise<boolean|void>} fn   must not throw
 * @param {() => number} [now]   for tests
 */
export const untilDeadline = async (items, atOnce, deadline, fn, now = Date.now) => {
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < items.length && now() < deadline) {
      const item = items[next];
      next += 1;
      if ((await fn(item)) === false) stopped = true;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(atOnce, items.length)) }, worker));
  return next;
};
