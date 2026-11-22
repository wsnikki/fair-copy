// N10: one retry behaviour for the Jira and the Confluence client (src/clients/retry.js): 429 always, 5xx when the
// call is safe to repeat.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SERVER_RETRIES, isServerError, serverWaitMs, untilDeadline, waitMs, withRetry } from '../../src/clients/retry.js';

const res = (status, retryAfter) => ({
  status,
  headers: { get: (name) => (name === 'retry-after' && retryAfter !== undefined ? String(retryAfter) : null) },
});

/** Answers the given responses in turn and records every wait. */
const harness = (responses) => {
  const waits = [];
  let sent = 0;
  const send = async () => responses[Math.min(sent++, responses.length - 1)];
  const pause = async (ms) => {
    waits.push(ms);
  };
  return { send, pause, waits, sent: () => sent };
};

test('without the 5xx policy, anything but 429 is returned at once, whatever the status', async () => {
  for (const status of [200, 204, 400, 403, 404, 500, 503]) {
    const h = harness([res(status)]);
    assert.equal((await withRetry(h.send, h.pause)).status, status);
    assert.equal(h.sent(), 1);
    assert.deepEqual(h.waits, []);
  }
});

test('a 429 is sent again after the time asked for', async () => {
  const h = harness([res(429, 2), res(200)]);
  assert.equal((await withRetry(h.send, h.pause)).status, 200);
  assert.equal(h.sent(), 2);
  assert.deepEqual(h.waits, [2000]);
});

test('without Retry-After: 1 s, then 2 s', async () => {
  const h = harness([res(429), res(429), res(201)]);
  assert.equal((await withRetry(h.send, h.pause)).status, 201);
  assert.deepEqual(h.waits, [1000, 2000]);
});

test('three sends at most; the last 429 is returned without another wait', async () => {
  const h = harness([res(429, 1)]);
  assert.equal((await withRetry(h.send, h.pause)).status, 429);
  assert.equal(h.sent(), 3);
  assert.deepEqual(h.waits, [1000, 1000]);
});

test('the wait is capped at 4 s and a useless Retry-After is ignored', () => {
  assert.equal(waitMs(res(429, 60), 0), 4000);
  assert.equal(waitMs(res(429, 0), 0), 1000);
  assert.equal(waitMs(res(429, -5), 1), 2000);
  assert.equal(waitMs(res(429, 'soon'), 1), 2000);
  assert.equal(waitMs({ status: 429 }, 0), 1000, 'a response without headers');
  assert.equal(waitMs(res(429, 0.5), 0), 500);
});

test('what send throws is thrown on (the Confluence client reads that as "not there")', async () => {
  await assert.rejects(
    withRetry(async () => {
      throw new Error('no Confluence on this site');
    }),
    /no Confluence/,
  );
});

test('5xx policy: 500, 502, 503 and 504 are sent again after 0.5 s, 1 s and 2 s, one log line each', async () => {
  assert.deepEqual([500, 502, 503, 504, 501, 429, 400, 404, 200].map(isServerError), [true, true, true, true, false, false, false, false, false]);
  assert.deepEqual([0, 1, 2, 7].map(serverWaitMs), [500, 1000, 2000, 2000]);
  for (const status of [500, 502, 503, 504]) {
    const h = harness([res(status), res(status), res(204)]);
    const lines = [];
    const out = await withRetry(h.send, h.pause, { serverErrors: true, what: 'jira PUT /rest/api/3/issue/CLM-1', log: (line) => lines.push(line) });
    assert.equal(out.status, 204);
    assert.equal(h.sent(), 3);
    assert.deepEqual(h.waits, [500, 1000]);
    assert.deepEqual(lines, [`jira PUT /rest/api/3/issue/CLM-1: ${status}, retry 1`, `jira PUT /rest/api/3/issue/CLM-1: ${status}, retry 2`]);
  }
});

test('5xx policy: four sends at most, 3.5 s of pauses in all; the last answer is returned', async () => {
  const h = harness([res(500)]);
  const lines = [];
  assert.equal((await withRetry(h.send, h.pause, { serverErrors: true, log: (line) => lines.push(line) })).status, 500);
  assert.equal(h.sent(), SERVER_RETRIES + 1);
  assert.deepEqual(h.waits, [500, 1000, 2000]);
  assert.equal(h.waits.reduce((a, b) => a + b, 0), 3500);
  assert.deepEqual(lines, ['request: 500, retry 1', 'request: 500, retry 2', 'request: 500, retry 3']);
});

test('5xx policy: a 4xx is never sent again, and 429 keeps its own count', async () => {
  for (const status of [400, 401, 403, 404, 409, 501]) {
    const h = harness([res(status)]);
    assert.equal((await withRetry(h.send, h.pause, { serverErrors: true, log: () => {} })).status, status);
    assert.equal(h.sent(), 1);
  }
  const h = harness([res(429), res(500), res(429), res(503), res(200)]);
  assert.equal((await withRetry(h.send, h.pause, { serverErrors: true, log: () => {} })).status, 200);
  assert.deepEqual(h.waits, [1000, 500, 2000, 1000]);
});

test('untilDeadline: in order, so many at once, nothing started at or after the deadline, everything started is finished', async () => {
  let clock = 0;
  let running = 0;
  let most = 0;
  const started = [];
  const finished = [];
  const fn = async (item) => {
    started.push(item);
    running += 1;
    most = Math.max(most, running);
    await Promise.resolve();
    clock += 10; // each download "takes" 10 ms of the clock
    running -= 1;
    finished.push(item);
  };
  const items = Array.from({ length: 140 }, (_, i) => i);
  const count = await untilDeadline(items, 8, 245, fn, () => clock);
  assert.equal(count, started.length);
  assert.deepEqual(started, items.slice(0, count), 'a front part of the list, in order');
  assert.ok(count >= 25 && count < 40, `stopped near the deadline (${count})`);
  assert.equal(finished.length, count, 'nothing is left running');
  assert.equal(most, 8);

  // Enough time: every item. No time: none. An empty list is fine.
  clock = 0;
  assert.equal(await untilDeadline(items, 8, Infinity, async () => {}, () => clock), 140);
  assert.equal(await untilDeadline(items, 8, 0, fn, () => 1), 0);
  assert.equal(await untilDeadline([], 8, Infinity, fn, () => 0), 0);
});

test('untilDeadline: an answer of false ("too many requests") stops new starts', async () => {
  const started = [];
  const count = await untilDeadline([1, 2, 3, 4, 5, 6], 1, Infinity, async (item) => {
    started.push(item);
    return item !== 3;
  });
  assert.deepEqual(started, [1, 2, 3]);
  assert.equal(count, 3);
});
