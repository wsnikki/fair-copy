// Slice C: what the sample loader does when a phase fails (src/sample/retry.js). Pure.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ERROR } from '../../src/contract.js';
import { AppError, GENERIC_ERROR } from '../../src/lib/result.js';
import {
  JIRA_REFUSED,
  MAX_PHASE_TRIES,
  afterPhaseFailure,
  failureSentence,
  isJiraRefusal,
  worthAnotherTry,
} from '../../src/sample/retry.js';

// What clients/jira throws for a non-2xx answer: the generic sentence, with Jira's own text in details.reason.
const RAW = '{"errorMessages":["Caught PSQLException for select CLUSTER_LOCK_STATUS from clusterlockstatus"]}';
const refused = (status = 500) => new AppError(ERROR.FAILED, GENERIC_ERROR, { status, reason: RAW });

test('a Jira refusal is a 5xx or a 429, nothing else', () => {
  assert.equal(isJiraRefusal(refused(500)), true);
  assert.equal(isJiraRefusal(refused(503)), true);
  assert.equal(isJiraRefusal(refused(429)), true);
  assert.equal(isJiraRefusal(refused(400)), false);
  assert.equal(isJiraRefusal(new AppError(ERROR.FORBIDDEN, 'no', { status: 403 })), false);
  assert.equal(isJiraRefusal(new AppError(ERROR.FAILED, 'the sample project has gaps in its issues')), false);
  assert.equal(isJiraRefusal(new Error('boom')), false);
  assert.equal(isJiraRefusal(null), false);
});

test('give-up rule: the same phase is tried three times, then the load is given up', () => {
  assert.equal(MAX_PHASE_TRIES, 3);
  const first = afterPhaseFailure(undefined, 3, refused());
  assert.deepEqual(first, { tries: { phase: 3, count: 1 }, giveUp: false });
  const second = afterPhaseFailure(first.tries, 3, refused());
  assert.deepEqual(second, { tries: { phase: 3, count: 2 }, giveUp: false });
  const third = afterPhaseFailure(second.tries, 3, refused());
  assert.deepEqual(third, { tries: { phase: 3, count: 3 }, giveUp: true });
});

test('give-up rule: a refusal in another phase starts counting again', () => {
  const later = afterPhaseFailure({ phase: 3, count: 2 }, 5, refused());
  assert.deepEqual(later, { tries: { phase: 5, count: 1 }, giveUp: false });
});

test('give-up rule: anything that is not Jira refusing ends the load at once', () => {
  assert.equal(afterPhaseFailure(null, 2, new AppError(ERROR.FAILED, 'the sample project has gaps in its issues')).giveUp, true);
  assert.equal(afterPhaseFailure(null, 2, new Error('boom')).giveUp, true);
  assert.equal(afterPhaseFailure(null, 2, refused(400)).giveUp, true);
});

test('a step the sample can do without runs again twice, then is left out', () => {
  assert.equal(worthAnotherTry(undefined, 7, refused()), true);
  assert.equal(worthAnotherTry({ phase: 7, count: 1 }, 7, refused()), true);
  assert.equal(worthAnotherTry({ phase: 7, count: 2 }, 7, refused()), false);
  assert.equal(worthAnotherTry(undefined, 7, new AppError(ERROR.FORBIDDEN, 'no', { status: 403 })), false);
});

test('the sentence after a Jira refusal is plain and never carries the answer of Jira', () => {
  assert.equal(
    failureSentence(refused(), true),
    'Jira refused a change. It does this now and then on a site that was created a few minutes ago. Nothing was left behind. Try again.',
  );
  assert.equal(failureSentence(refused(), false), `${JIRA_REFUSED} Load the sample again to carry on.`);
  for (const removed of [true, false]) {
    assert.doesNotMatch(failureSentence(refused(), removed), /[{}"]|PSQL|select|CLUSTER/i);
  }
});

test('the sentence after any other failure: the app\'s own words, or "something went wrong"', () => {
  assert.equal(
    failureSentence(new AppError(ERROR.FAILED, 'the sample project has gaps in its issues'), true),
    'The sample could not be loaded: the sample project has gaps in its issues. Anything created has been removed.',
  );
  // A failed call that carries a raw reason (a 400 with JSON, a bulk create with errors) shows none of it.
  const bulk = new AppError(ERROR.FAILED, GENERIC_ERROR, { reason: '[{"status":400,"elementErrors":{"errors":{"priority":"x"}}}]' });
  assert.equal(failureSentence(bulk, true), 'The sample could not be loaded: something went wrong. Anything created has been removed.');
  assert.equal(failureSentence(refused(400), true), 'The sample could not be loaded: something went wrong. Anything created has been removed.');
  assert.equal(failureSentence(new Error('{"raw":"json"}'), false), 'The sample could not be loaded: something went wrong. Load it again to carry on.');
});
