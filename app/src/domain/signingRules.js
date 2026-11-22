// [A] Open items, coverage, outcome bars, B1–B3 and form validation (PRODUCT §3.4, §8.6). Pure.
// Contract: typedef `DomainSigningRules` in src/contract.js.
import { CASE_STATE, CONDITION_STATE, ERROR, OUTCOME, REQUEST_STATE, RUN_RESULT } from '../contract.js';
import { dayOf, plural } from '../lib/format.js';
import { GENERIC_ERROR, fail } from '../lib/result.js';
import { conflictStem } from './duties.js';

/** @typedef {import('../contract.js').DomainSigningRules} Api */
/** @typedef {import('../contract.js').OpenItem} OpenItem */

const OK = Object.freeze({ ok: true });
const blank = (text) => typeof text !== 'string' || text.trim() === '';
const sentenceBody = (text) => text.trim().replace(/\.$/, '');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @type {Api['conditionState']} Overdue from the day after the due date (UTC). */
export const conditionState = (condition, now) => {
  if (condition.status === CONDITION_STATE.MET) return CONDITION_STATE.MET;
  return condition.dueDate < dayOf(now) ? CONDITION_STATE.OVERDUE : CONDITION_STATE.OPEN;
};

/**
 * Does this sealed condition still wait for its Jira issue? Only one that has no issue and is not met: a condition
 * confirmed met never gets an issue, so it must not keep "create the condition issues" on the list of things to finish.
 * @param {{linkedIssue?: string|null, status: string}} condition
 */
export const needsIssue = (condition) => !condition.linkedIssue && condition.status !== CONDITION_STATE.MET;

/** @returns {OpenItem} */
const item = (id, kind, key, label, needs) => ({ id, kind, item: key, label, needs, coveredBy: null });

const CASE_KINDS = [
  { state: CASE_STATE.PASSED_THEN_CHANGED, kind: 'stale', words: 'passed, then changed', rule: 'staleBlocks' },
  { state: CASE_STATE.FAILED, kind: 'failed', words: 'failed', rule: 'unprovenBlocks' },
  { state: CASE_STATE.BLOCKED, kind: 'blocked', words: 'blocked', rule: 'unprovenBlocks' },
  { state: CASE_STATE.NOT_RUN, kind: 'not_run', words: 'not run', rule: 'unprovenBlocks' },
];

/** @type {Api['openItems']} A rule switched off removes the item from this list, never from the facts. */
export const openItems = ({ requirements, defects, conflicts, carried, rules }) => {
  const cases = requirements.flatMap((r) => r.cases);
  return [
    ...CASE_KINDS.filter(({ rule }) => rules[rule]).flatMap(({ state, kind, words }) =>
      cases.filter((c) => c.state === state).map((c) => item(`case:${c.key}:${kind}`, kind, c.key, `${c.key} ${words}`, 'condition'))),
    ...(rules.unprovenBlocks ? requirements.filter((r) => r.cases.length === 0) : []).map((r) =>
      item(`req:${r.key}:no_case`, 'no_case', r.key, `${r.key} no case`, 'condition')),
    ...defects.filter((d) => d.blocking).map((d) =>
      item(`defect:${d.key}`, 'defect', d.key, `Defect ${d.key}${d.priority ? ` (${d.priority})` : ''}`, 'condition')),
    ...conflicts.filter((c) => c.blocking).map((c) => item(c.id, 'conflict', c.item, `Conflict: ${sentenceBody(c.sentence)}`, 'waiver')),
    ...(rules.overdueConditionBlocks ? carried.filter((c) => c.state === CONDITION_STATE.OVERDUE) : []).map((c) =>
      item(`overdue:${c.id}`, 'overdue_condition', '', `Overdue: ${sentenceBody(c.text)} (Record ${c.recordNumber})`, 'waiver')),
  ];
};

/** @type {Api['applyCoverage']} A condition can only cover what needs a condition; a waiver only what needs a waiver. */
export const applyCoverage = (items, conditions, waivers) =>
  items.map((open) => {
    const cover = open.needs === 'condition'
      ? conditions.find((c) => c.covers.includes(open.id))
      : waivers.find((w) => w.covers === open.id);
    return { ...open, coveredBy: cover ? { by: open.needs, id: String(cover.id) } : null };
  });

/**
 * Draft waivers as they stand against today's open items. A waiver for a person's conflict follows that conflict: its
 * id ends in the first requirement the conflict rests on, which changes when the work behind it changes, and ids written
 * when there was one conflict per requirement name any of them. Such a waiver takes the id and the label the conflict
 * has now, so that what is signed says what was waived. Every other waiver is returned as it is.
 * @template {{covers: string, coversLabel: string}} W
 * @param {W[]} waivers
 * @param {OpenItem[]} items
 * @returns {W[]}
 */
export const fitWaivers = (waivers, items) =>
  waivers.map((w) => {
    if (items.some((i) => i.id === w.covers)) return w;
    const stem = conflictStem(w.covers);
    const now = stem === null ? null : items.find((i) => i.kind === 'conflict' && conflictStem(i.id) === stem);
    return now ? { ...w, covers: now.id, coversLabel: now.label } : w;
  });

const CASE_WORDS = Object.fromEntries(CASE_KINDS.map(({ kind, words }) => [kind, words]));

/**
 * The decision table of the brief, short: the open cases of one requirement that have the same answer (the same
 * condition, or none yet) are one row with a count; every other open item is its own row. Order of first appearance.
 * A row of one item keeps that item's label, so a release with few open items reads as it always did.
 * @param {OpenItem[]} items                                          with coveredBy filled (applyCoverage)
 * @param {{key: string, summary?: string, cases: {key: string}[]}[]} requirements
 * @returns {{id: string, needs: 'condition'|'waiver', coveredBy: OpenItem['coveredBy'], requirementKey: string|null,
 *            label: string, detail: string|null, items: OpenItem[]}[]}
 */
export const groupOpenItems = (items, requirements) => {
  const requirementOf = new Map(requirements.flatMap((r) => r.cases.map((c) => [c.key, r.key])));
  const groups = new Map();
  for (const open of items) {
    const requirementKey = open.kind in CASE_WORDS ? requirementOf.get(open.item) ?? null : null;
    const id = requirementKey === null ? open.id : `cases:${requirementKey}:${open.coveredBy ? open.coveredBy.id : ''}`;
    if (!groups.has(id)) groups.set(id, { id, needs: open.needs, coveredBy: open.coveredBy, requirementKey, items: [] });
    groups.get(id).items.push(open);
  }
  return [...groups.values()].map((g) => {
    if (g.items.length === 1) return { ...g, label: g.items[0].label, detail: null };
    const kinds = Object.keys(CASE_WORDS).filter((kind) => g.items.some((i) => i.kind === kind));
    const count = (kind) => g.items.filter((i) => i.kind === kind).length;
    return kinds.length === 1
      ? { ...g, label: `${g.requirementKey}: ${g.items.length} cases ${CASE_WORDS[kinds[0]]}`, detail: null }
      : { ...g, label: `${g.requirementKey}: ${g.items.length} cases`, detail: kinds.map((kind) => `${count(kind)} ${CASE_WORDS[kind]}`).join(' · ') };
  });
};

/**
 * Why an account cannot be given a duty (approver, owner of a condition, authoriser of a waiver), in one sentence;
 * null for a person who is active on the site.
 * @param {{name: string, accountType: string|null, active: boolean}} account   as Jira describes it
 * @returns {string|null}
 */
export const notAPerson = ({ name, accountType, active }) => {
  if (accountType === 'app') return `${name} is an app, not a person. Choose a person.`;
  if (accountType === 'customer') return `${name} is a customer account, not a member of this site. Choose a person.`;
  if (active === false) return `${name} is no longer active on this site. Choose a person.`;
  return null;
};

const REASON_GROUPS = [
  { kinds: ['stale'], phrase: (n) => `${n} changed after passing` },
  { kinds: ['failed', 'blocked'], phrase: (n) => `${n} failed` },
  { kinds: ['not_run', 'no_case'], phrase: (n) => `${n} not tested` },
  { kinds: ['defect'], phrase: (n) => plural(n, 'open defect') },
  { kinds: ['conflict'], phrase: (n) => plural(n, 'conflict') },
  { kinds: ['overdue_condition'], phrase: (n) => plural(n, 'overdue condition') },
];

/** Short phrases for what stops plain acceptance: "3 stale", "1 unproven", "1 conflict". */
const reasonsOf = (items) =>
  REASON_GROUPS.map(({ kinds, phrase }) => ({ n: items.filter((i) => kinds.includes(i.kind)).length, phrase }))
    .filter(({ n }) => n > 0)
    .map(({ n, phrase }) => phrase(n));

const uncoveredOf = (items) => items.filter((i) => i.coveredBy === null);
const uncoveredSentence = (n) => `${plural(n, 'open item')} ${n === 1 ? 'has' : 'have'} no condition or waiver yet.`;

/** @type {Api['availability']} */
export const availability = (items) => {
  const uncovered = uncoveredOf(items).length;
  return {
    accepted: { allowed: items.length === 0, reasons: reasonsOf(items) },
    accepted_with_conditions: {
      allowed: uncovered === 0,
      reasons: uncovered === 0 ? [] : [`${plural(uncovered, 'open item')} not covered`],
      covered: items.length - uncovered,
      total: items.length,
    },
    rejected: { allowed: true, reasons: [] },
  };
};

/**
 * A statement the approver may take over with one click ("Use this wording"). Offered, never filled in: the statement
 * is printed on the record under their name.
 * @param {{outcome: string|null, releaseName: string, conditions: number, waivers: number}} q
 * @returns {string|null}
 */
export const suggestedStatement = ({ outcome, releaseName, conditions, waivers }) => {
  if (outcome === OUTCOME.ACCEPTED) return `I accept Release ${releaseName} as it was tested.`;
  if (outcome === OUTCOME.REJECTED) {
    return `I do not accept Release ${releaseName} as it stands. The open items in this brief must be dealt with first.`;
  }
  if (outcome !== OUTCOME.ACCEPTED_WITH_CONDITIONS) return null;
  const terms = [[conditions, 'condition'], [waivers, 'waiver']].filter(([n]) => n > 0).map(([n, word]) => plural(n, word));
  if (terms.length === 0) return null;
  return `I accept Release ${releaseName} with ${terms.join(' and ')}. I have read what changed after testing and what is still open, and I expect each condition to be met by its due date.`;
};

/** @type {Api['validateDecision']} Order: B1, B3, statement, B2, then the outcome's bar. */
export const validateDecision = ({ request, actorId, outcome, statement, affirmed, fingerprint, currentFingerprint, items }) => {
  if (!request || request.state !== REQUEST_STATE.OPEN) {
    return fail(ERROR.B1_NOT_APPROVER, 'There is no open sign-off request for this release.');
  }
  if (!actorId || actorId !== request.approver.id) {
    return fail(ERROR.B1_NOT_APPROVER, `Only ${request.approver.name} can decide on this release.`);
  }
  if (affirmed !== true) return fail(ERROR.B3_NOT_AFFIRMED, 'Tick the box to confirm you have read the brief.');
  if (blank(statement)) return fail(ERROR.INVALID, 'Write a short statement. It is printed on the record.', { field: 'statement' });
  if (!fingerprint || fingerprint !== currentFingerprint) {
    return fail(ERROR.B2_BRIEF_CHANGED, 'Something changed while you were reading. Nothing was signed. The brief has been refreshed and the changes are marked.');
  }
  if (outcome === OUTCOME.REJECTED) return OK;
  if (outcome === OUTCOME.ACCEPTED) {
    if (items.length === 0) return OK;
    return fail(
      ERROR.NOT_SIGNABLE,
      `This release cannot be accepted as it stands: ${reasonsOf(items).join(', ')}. Accept with conditions, or reject.`,
      { uncovered: items.map((i) => i.id) },
    );
  }
  if (outcome === OUTCOME.ACCEPTED_WITH_CONDITIONS) {
    const uncovered = uncoveredOf(items);
    if (uncovered.length === 0) return OK;
    return fail(ERROR.NOT_SIGNABLE, uncoveredSentence(uncovered.length), { uncovered: uncovered.map((i) => i.id) });
  }
  return fail(ERROR.INVALID, GENERIC_ERROR, { field: 'outcome' });
};

/** @type {Api['validateWaiver']} */
export const validateWaiver = ({ covers, reason, authorisedById, authorisedByName, actorId, approverId, items, settings }) => {
  const { waiverAuthorities, approverMayRecordOwnWaiver } = settings.people;
  if (actorId === approverId) {
    if (!approverMayRecordOwnWaiver) {
      return fail(
        ERROR.FORBIDDEN,
        'A waiver must be recorded by someone other than the approver. Ask a waiver authority.',
        { waiverAuthorities: [...waiverAuthorities] },
      );
    }
  } else if (waiverAuthorities.length > 0 && !waiverAuthorities.includes(actorId)) {
    return fail(ERROR.FORBIDDEN, 'A waiver must be recorded by a waiver authority.', { waiverAuthorities: [...waiverAuthorities] });
  }
  if (!items.some((i) => i.id === covers && i.needs === 'waiver')) return fail(ERROR.INVALID, GENERIC_ERROR, { field: 'covers' });
  if (blank(reason) || reason.trim().length < 20) {
    return fail(ERROR.INVALID, 'Give a reason of at least 20 characters. It is printed on the record.', { field: 'reason' });
  }
  if (blank(authorisedById) === blank(authorisedByName)) {
    return fail(ERROR.INVALID, 'Say who authorised this waiver.', { field: 'authorisedBy' });
  }
  return OK;
};

/** @type {Api['validateCondition']} `covers` may be empty: a promise can stand on its own (a carried-forward condition). */
export const validateCondition = ({ text, ownerId, dueDate, covers, items }) => {
  if (blank(text)) return fail(ERROR.INVALID, 'Say what must be done.', { field: 'text' });
  if (blank(ownerId)) return fail(ERROR.INVALID, 'A condition needs an owner and a due date.', { field: 'owner' });
  if (blank(dueDate) || !ISO_DATE.test(dueDate)) {
    return fail(ERROR.INVALID, 'A condition needs an owner and a due date.', { field: 'dueDate' });
  }
  const coverable = new Set(items.filter((i) => i.needs === 'condition').map((i) => i.id));
  if (!Array.isArray(covers) || covers.some((id) => !coverable.has(id))) return fail(ERROR.INVALID, GENERIC_ERROR, { field: 'covers' });
  return OK;
};

/** @type {Api['validateRun']} */
export const validateRun = ({ result, build, notes, evidenceCount, rules }) => {
  if (!Object.values(RUN_RESULT).includes(result)) return fail(ERROR.INVALID, 'Choose a result.', { field: 'result' });
  if (result !== RUN_RESULT.PASSED && blank(notes)) {
    return fail(ERROR.INVALID, 'Say what happened. For a fail: what you did, what you expected, what you saw.', { field: 'notes' });
  }
  if (result === RUN_RESULT.PASSED && rules.passNeedsEvidence && !(evidenceCount > 0)) {
    return fail(ERROR.INVALID, 'A pass needs at least one evidence file. Attach it to this issue, then tick it here.', { field: 'evidence' });
  }
  if (blank(build)) return fail(ERROR.INVALID, 'Enter the build you tested.', { field: 'build' });
  return OK;
};
