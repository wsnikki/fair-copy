// [A] Stale triggers S1–S6 from normalised history events (PRODUCT §3.2, SPEC §2.3, §2.10, §2.11). Pure.
// Contract: typedefs `StaleInput`, `DomainStaleness` in src/contract.js.
import { HISTORY_KIND, STALE_CODE, STATUS_CATEGORY } from '../contract.js';
import { formatDay } from '../lib/format.js';

/** @typedef {import('../contract.js').DomainStaleness} Api */
/** @typedef {import('../contract.js').HistoryEvent} HistoryEvent */
/** @typedef {import('../contract.js').StaleReason} StaleReason */

const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
const lower = (s) => String(s ?? '').toLowerCase();

/**
 * The earliest event at or after T that a person (not the app, not a baseline) caused and that matches `test`.
 * "At": times are whole seconds, and an edit in the very second of the run cannot be shown to have come first.
 */
const firstAfter = (events, T, test) =>
  [...events].sort(byAt).find((e) => e.at >= T && !e.baseline && !e.byApp && test(e)) ?? null;

const isTextEdit = (fields) => (e) => e.kind === HISTORY_KIND.TEXT && fields.includes(lower(e.field));
const leavesDone = (e) =>
  e.kind === HISTORY_KIND.STATUS && e.from === STATUS_CATEGORY.DONE && e.to !== null && e.to !== STATUS_CATEGORY.DONE;

/** Status category of an issue at time T: the last status event at or before T (baselines included). */
const categoryAt = (events, T) => {
  const past = events.filter((e) => e.kind === HISTORY_KIND.STATUS && e.at <= T).sort(byAt);
  return past.length > 0 ? past[past.length - 1].to : null;
};

/** @returns {StaleReason} */
const reason = (code, issueKey, event, sentence, before = null, after = null) => ({
  code,
  issueKey,
  at: event ? event.at : null,
  by: event ? event.actor : null,
  sentence,
  before,
  after,
});

const s1 = ({ run, requirementEvents, criteriaField, live, now }) => {
  const fields = ['summary', 'description', ...(criteriaField ? [lower(criteriaField)] : [])];
  const e = firstAfter(requirementEvents, run.executedAt, isTextEdit(fields));
  if (!e) return [];
  const sentence = `Requirement edited by ${e.actor.name} on ${formatDay(e.at, now)}, after this test.`;
  return [reason(STALE_CODE.S1, run.requirementKey, e, sentence, run.snapshot.requirementText, live.requirementText)];
};

const s2 = ({ run, caseEvents, live, now }) => {
  const e = firstAfter(caseEvents, run.executedAt, isTextEdit(['summary', 'description']));
  if (!e) return [];
  const sentence = `The test steps were edited by ${e.actor.name} on ${formatDay(e.at, now)}, after this test.`;
  return [reason(STALE_CODE.S2, run.caseKey, e, sentence, run.snapshot.caseText, live.caseText)];
};

const s3 = ({ run, requirementEvents, now }) => {
  const e = firstAfter(requirementEvents, run.executedAt, leavesDone);
  if (!e) return [];
  return [reason(STALE_CODE.S3, run.requirementKey, e, `Requirement reopened by ${e.actor.name} on ${formatDay(e.at, now)}.`)];
};

const s4 = ({ run, defectEvents, now }) =>
  Object.keys(defectEvents)
    .sort()
    .flatMap((key) => {
      if (categoryAt(defectEvents[key], run.executedAt) !== STATUS_CATEGORY.DONE) return [];
      const e = firstAfter(defectEvents[key], run.executedAt, leavesDone);
      if (!e) return [];
      const sentence = `Defect ${key} was closed when this was tested. It was reopened on ${formatDay(e.at, now)}.`;
      return [reason(STALE_CODE.S4, key, e, sentence)];
    });

const s5 = ({ run, currentBuild, buildSetAt }) => {
  if (!currentBuild || lower(currentBuild).trim() === lower(run.build).trim()) return [];
  return [
    {
      ...reason(STALE_CODE.S5, run.caseKey, null, `Tested on ${run.build}. The release is now ${currentBuild}.`, run.build, currentBuild),
      at: buildSetAt ?? null,
    },
  ];
};

const s6 = ({ run, liveEvidence }) => {
  if (liveEvidence === null || liveEvidence === undefined) return [];
  const live = new Map(liveEvidence.map((file) => [file.attachmentId, file]));
  for (const file of run.evidence) {
    const now = live.get(file.attachmentId);
    if (!now) return [reason(STALE_CODE.S6, run.caseKey, null, `Evidence file ${file.filename} is missing.`)];
    if (file.sha256 !== null && now.sha256 !== null && now.sha256 !== file.sha256) {
      return [reason(STALE_CODE.S6, run.caseKey, null, `Evidence file ${file.filename} has changed.`)];
    }
  }
  return [];
};

const byCodeThenAt = (a, b) => {
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  if (a.at === b.at) return 0;
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return a.at < b.at ? -1 : 1;
};

/** @type {Api['staleReasons']} Returned whatever the run's result is: stale reasons for a pass, notes for a fail. */
export const staleReasons = (input) =>
  [s1, s2, s3, s4, s5, s6].flatMap((trigger) => trigger(input)).sort(byCodeThenAt);
