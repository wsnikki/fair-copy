// [C] What the sample loader does when a phase fails. Pure: no Forge import, so it is tested in test/sample.
//
// On a site created a few minutes ago Jira now and then answers HTTP 500 (a cluster lock) to a write. A phase of the
// loader may always be run twice, so such a failure is not the end of the load: the loader answers `pending`, the
// frontend calls again and the phase carries on. Only when the same phase was refused MAX_PHASE_TRIES times, or the
// failure is not Jira refusing, is the load given up and everything removed.
import { AppError, GENERIC_ERROR } from '../lib/result.js';

/** The same phase is tried this many times before the load is given up. */
export const MAX_PHASE_TRIES = 3;

/** Before answering `pending` after a refusal, so the next call does not hit Jira in the same second. */
export const REFUSAL_PAUSE_MS = 1500;

export const JIRA_REFUSED =
  'Jira refused a change. It does this now and then on a site that was created a few minutes ago.';

/** Jira answered 5xx or 429 (clients/jira puts the HTTP status in `details.status`): worth trying again. */
export const isJiraRefusal = (err) => {
  const status = Number(err?.details?.status);
  return status >= 500 || status === 429;
};

/**
 * The give-up rule.
 * @param {{phase: number, count: number}|null|undefined} tries   what the checkpoint holds from earlier failures
 * @param {number} phase                                          the phase that just failed
 * @param {unknown} err
 * @returns {{tries: {phase: number, count: number}, giveUp: boolean}}
 *   tries: to be written to the checkpoint · giveUp: false = answer `pending` and let the phase run again
 */
export const afterPhaseFailure = (tries, phase, err) => {
  const count = (tries && tries.phase === phase ? tries.count : 0) + 1;
  return { tries: { phase, count }, giveUp: !isJiraRefusal(err) || count >= MAX_PHASE_TRIES };
};

/**
 * For a step the sample can do without (the sign-off task, the proposed drafts, the person's own move): true while a
 * refusal by Jira should make the phase run again; false on the last try, when the step is left out instead of the
 * whole load being given up.
 */
export const worthAnotherTry = (tries, phase, err) => isJiraRefusal(err) && !afterPhaseFailure(tries, phase, err).giveUp;

/**
 * The sentence a person reads when the load was given up. Never Jira's own answer (it can be raw JSON with an SQL
 * statement): that goes to the log only.
 * @param {unknown} err
 * @param {boolean} removed   everything created was removed again
 */
export const failureSentence = (err, removed) => {
  if (isJiraRefusal(err)) {
    return `${JIRA_REFUSED} ${removed ? 'Nothing was left behind. Try again.' : 'Load the sample again to carry on.'}`;
  }
  // Only the app's own sentences are shown; anything else thrown is "something went wrong".
  const own = err instanceof AppError && err.message && err.message !== GENERIC_ERROR ? err.message : 'something went wrong';
  const reason = own.replace(/[.\s]+$/, '');
  return `The sample could not be loaded: ${reason}. ${removed ? 'Anything created has been removed.' : 'Load it again to carry on.'}`;
};
