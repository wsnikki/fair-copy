// [A] Case state, counts and the verdict sentence (PRODUCT §3.1, §4.1, §8.4). Pure.
// Contract: typedef `DomainCaseState` in src/contract.js.
import { CASE_STATE, OUTCOME, RELEASE_STATUS, REQUEST_STATE, RUN_RESULT } from '../contract.js';
import { formatDay, plural } from '../lib/format.js';

/** @typedef {import('../contract.js').DomainCaseState} Api */

/** Run ids are numeric strings; anything else falls back to plain string order so the choice stays deterministic. */
const compareIds = (a, b) => {
  const [na, nb] = [Number(a), Number(b)];
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

const isLater = (a, b) => a.executedAt > b.executedAt || (a.executedAt === b.executedAt && compareIds(a.id, b.id) > 0);

/** @type {Api['latestRun']} */
export const latestRun = (runs) => runs.reduce((best, run) => (best === null || isLater(run, best) ? run : best), null);

/** @type {Api['caseState']} PRODUCT §3.1: first match wins. Only a pass can go stale. */
export const caseState = (latest, staleReasons) => {
  if (latest === null) return CASE_STATE.NOT_RUN;
  if (latest.result === RUN_RESULT.FAILED) return CASE_STATE.FAILED;
  if (latest.result === RUN_RESULT.BLOCKED) return CASE_STATE.BLOCKED;
  return staleReasons.length > 0 ? CASE_STATE.PASSED_THEN_CHANGED : CASE_STATE.PASSED;
};

/** @type {Api['countStates']} A requirement with no case counts as one unproven. */
export const countStates = (requirements) => {
  const counts = { proven: 0, stale: 0, failing: 0, unproven: 0 };
  for (const requirement of requirements) {
    if (requirement.cases.length === 0) counts.unproven += 1;
    for (const { state } of requirement.cases) {
      if (state === CASE_STATE.PASSED) counts.proven += 1;
      else if (state === CASE_STATE.PASSED_THEN_CHANGED) counts.stale += 1;
      else if (state === CASE_STATE.FAILED || state === CASE_STATE.BLOCKED) counts.failing += 1;
      else counts.unproven += 1;
    }
  }
  return counts;
};

/** @type {Api['requirementState']} */
export const requirementState = (cases) => {
  if (cases.length === 0) return 'no_case';
  return cases.every((c) => c.state === CASE_STATE.PASSED) ? 'all_passed' : 'attention';
};

/** "The usual sheet would show 11 passes. 3 are no longer true." Only when a pass changed afterwards. */
const usualSheet = ({ proven, stale }) =>
  stale === 0
    ? null
    : `The usual sheet would show ${plural(proven + stale, 'pass', 'passes')}. ${stale} ${stale === 1 ? 'is' : 'are'} no longer true.`;

/** The reasons a release is not ready, worded as in PRODUCT §8.4; zero counts are left out. */
const notReadyClauses = ({ counts, totalCases, blockingConflicts, overdueConditions }) => {
  const clauses = [];
  if (counts.stale > 0) clauses.push(`${plural(counts.stale, 'pass', 'passes')} ${counts.stale === 1 ? 'is' : 'are'} no longer true`);
  if (counts.failing > 0) clauses.push(`${plural(counts.failing, 'case')} failed`);
  if (counts.unproven > 0) clauses.push(`${counts.unproven} ${counts.unproven === 1 ? 'is' : 'are'} not tested`);
  if (blockingConflicts > 0) clauses.push(`${plural(blockingConflicts, 'conflict')} ${blockingConflicts === 1 ? 'is' : 'are'} open`);
  if (overdueConditions > 0) {
    clauses.push(`${plural(overdueConditions, 'earlier condition')} ${overdueConditions === 1 ? 'is' : 'are'} overdue`);
  }
  if (clauses.length === 0 && totalCases === 0) clauses.push('there are no acceptance cases yet');
  return clauses;
};

const decidedVerdict = (decided, now) => {
  const on = formatDay(decided.decidedAt, now);
  if (decided.outcome === OUTCOME.ACCEPTED_WITH_CONDITIONS) {
    return {
      status: RELEASE_STATUS.ACCEPTED_WITH_CONDITIONS,
      verdict: `Accepted with ${plural(decided.conditionCount, 'condition')} by ${decided.decidedByName} on ${on}. ${decided.openConditionCount} still open.`,
    };
  }
  return decided.outcome === OUTCOME.REJECTED
    ? { status: RELEASE_STATUS.REJECTED, verdict: `Rejected by ${decided.decidedByName} on ${on}. Record ${decided.number}.` }
    : { status: RELEASE_STATUS.ACCEPTED, verdict: `Accepted by ${decided.decidedByName} on ${on}. Record ${decided.number}.` };
};

/** @type {Api['verdict']} decided → open request → the numbers (PRODUCT §4.1). */
export const verdict = (input) => {
  const sheet = usualSheet(input.counts);
  if (input.decided) return { ...decidedVerdict(input.decided, input.now), usualSheet: sheet };
  if (input.request && input.request.state === REQUEST_STATE.OPEN) {
    return {
      status: RELEASE_STATUS.AWAITING_DECISION,
      verdict: `Awaiting a decision from ${input.request.approver.name}, due ${formatDay(input.request.dueDate, input.now)}.`,
      usualSheet: sheet,
    };
  }
  const clauses = notReadyClauses(input);
  if (clauses.length > 0) {
    return { status: RELEASE_STATUS.NOT_READY, verdict: `Not ready to sign: ${clauses.join(', ')}.`, usualSheet: sheet };
  }
  return {
    status: RELEASE_STATUS.READY,
    verdict: `Ready to sign. All ${plural(input.totalCases, 'case')} passed and nothing has changed since.`,
    usualSheet: sheet,
  };
};
