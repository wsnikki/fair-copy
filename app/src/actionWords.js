// [F] Ready sentences for the three actions (src/actions.js). Pure: no @forge/* import, so every line is tested.
// An agent quotes these word for word, so each one must be true on its own.
import { formatDay, plural } from './lib/format.js';

const MAX_PROPOSAL = 200;
const short = (text) => (text.length > MAX_PROPOSAL ? `${text.slice(0, MAX_PROPOSAL - 1)}…` : text);

/**
 * What is proposed for one open item, in words; null when nothing is. A proposal (a draft condition or waiver on the
 * open request) is not a decision: the item stays a blocker until the approver signs.
 * @param {{by: 'condition'|'waiver', id: string}|null} coveredBy       OpenItem.coveredBy
 * @param {{conditions?: any[], waivers?: any[]}|null|undefined} draft  Brief.draft; absent when only Readiness was read
 * @returns {string|null}
 */
export const proposalWords = (coveredBy, draft) => {
  if (!coveredBy) return null;
  if (coveredBy.by === 'condition') {
    const c = (draft?.conditions ?? []).find((one) => String(one.id) === coveredBy.id);
    if (!c?.text) return 'A condition is proposed for it.';
    const terms = [c.owner?.name ? `owner ${c.owner.name}` : null, c.dueDate ? `due ${formatDay(c.dueDate, null, true)}` : null].filter(Boolean);
    return `Condition proposed: "${short(c.text.trim())}"${terms.length ? ` (${terms.join(', ')})` : ''}`;
  }
  const w = (draft?.waivers ?? []).find((one) => String(one.id) === coveredBy.id);
  return w?.reason ? `Waiver proposed: "${short(w.reason.trim())}"` : 'A waiver is proposed for it.';
};

/**
 * The sentences about what stands against plain acceptance of a release that is not decided yet.
 * `count` is every open item, also one that has a condition or a waiver proposed for it.
 * @param {{count: number, covered: number, approver: string|null, decided: boolean, historyUnreadable: boolean}} q
 * @returns {{countLine: string|null, openLine: string|null, canAcceptWithConditions: boolean}}
 *   countLine  the direct answer to "what is blocking sign-off": "5 things block sign-off."; null once decided
 *   openLine   what is open, what is proposed and what the approver can do; null when nothing is open or once decided
 */
export const blockerWords = ({ count, covered, approver, decided, historyUnreadable }) => {
  if (decided) return { countLine: null, openLine: null, canAcceptWithConditions: false };
  if (count === 0) return { countLine: 'Nothing blocks sign-off.', openLine: null, canAcceptWithConditions: false };
  const countLine = `${plural(count, 'thing blocks', 'things block')} sign-off.`;
  const open = `${plural(count, 'thing is', 'things are')} open`;
  if (historyUnreadable) {
    return { countLine, openLine: `${open}. The Jira history could not be read, so nothing can be signed yet.`, canAcceptWithConditions: false };
  }
  const by = approver ? ` by ${approver}` : '';
  const nobody = approver ? '' : ' Nobody has been asked to decide yet.';
  const rest = count - covered;
  if (rest === 0) {
    return {
      countLine,
      openLine: `${open}; a condition or a waiver is proposed for ${count === 1 ? 'it' : 'each'}; it can be accepted with conditions${by}, or rejected.${nobody}`,
      canAcceptWithConditions: true,
    };
  }
  const proposed =
    covered === 0
      ? count === 1
        ? 'it has no condition or waiver yet'
        : 'none has a condition or a waiver yet'
      : `a condition or a waiver is proposed for ${covered} of them`;
  return {
    countLine,
    openLine: `${open}; ${proposed}; it can be rejected${by} now, and accepted with conditions once ${
      covered === 0 ? (count === 1 ? 'it has' : 'each has') : rest === 1 ? 'the last one has' : `the other ${rest} have`
    } a condition or a waiver.${nobody}`,
    canAcceptWithConditions: false,
  };
};

/**
 * The direct answer to "what changed since the last test run": how many changes, behind how many passes.
 * One change (a requirement edited once) can stand behind several cases, so it is counted once.
 * @param {{code: string, issueKey: string, at: string}[][]} reasonsPerCase   the stale reasons of each case that passed, then changed
 */
export const changedLine = (reasonsPerCase) => {
  const cases = reasonsPerCase.filter((reasons) => reasons.length > 0);
  if (cases.length === 0) return 'Nothing changed since testing.';
  const changes = new Set(cases.flatMap((reasons) => reasons.map((s) => `${s.code}|${s.issueKey}|${s.at}`)));
  return `${plural(changes.size, 'thing')} changed after testing; ${plural(cases.length, 'pass no longer counts', 'passes no longer count')}.`;
};

/**
 * The direct answer to "what did we promise last time": the decision and how its conditions stand.
 * "Release 2.3 was accepted with conditions by Grace Whitlock on 21 Aug 2026 (Record 1): 2 conditions, 1 met, 1 overdue."
 * @param {{release: string, recordNumber: number, outcomeInWords: string|null, decidedBy: string, decidedAtInWords: string,
 *          conditions: {open: number, met: number, overdue: number}}} q
 */
export const lastDecisionLine = ({ release, recordNumber, outcomeInWords, decidedBy, decidedAtInWords, conditions }) => {
  const total = conditions.open + conditions.met + conditions.overdue;
  const states = [[conditions.met, 'met'], [conditions.overdue, 'overdue'], [conditions.open, 'open']]
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`);
  const promised = total === 0 ? 'no conditions' : [plural(total, 'condition'), ...states].join(', ');
  return `Release ${release} was ${(outcomeInWords ?? 'decided').toLowerCase()} by ${decidedBy} on ${decidedAtInWords} (Record ${recordNumber}): ${promised}.`;
};

/** A carried condition's sentence, always with its owner: the line of a met condition does not name one. */
export const conditionSentence = (line, state, owner) =>
  state === 'met' && owner && !line.includes(owner) ? `${line}, owner ${owner}` : line;

export const PAGE_DIFFERS_LINE = 'The sealed record itself is unchanged; only the readable page differs.';
export const RESTORE_LINE =
  'The page can be restored from the sealed record: open the page and press "Restore the page from the sealed record" on the seal panel.';

/**
 * The two sentences that belong to a broken seal only. For an intact record (or one not fully checked, or one with
 * evidence missing) both are null: nothing on the page differs, so there is nothing to restore.
 * @param {{result: string, snapshotOk: boolean|null, pageOk: boolean|null, canRestore: boolean}} q
 * @returns {{pageDiffersLine: string|null, restoreLine: string|null}}
 */
export const brokenSealLines = ({ result, snapshotOk, pageOk, canRestore }) => {
  const pageDiffers = result === 'broken' && pageOk === false;
  return {
    pageDiffersLine: pageDiffers && snapshotOk === true ? PAGE_DIFFERS_LINE : null,
    restoreLine: pageDiffers && canRestore ? RESTORE_LINE : null,
  };
};
