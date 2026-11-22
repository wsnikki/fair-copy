// [A] What was promised in earlier records, said in one line, and the release a promise comes back in. Pure.
//
// The line opens Readiness and stands at the top of a brief. The NEWEST earlier record comes first: after somebody
// signs Release 2.4 with a condition, Release 2.5 opens with that condition, in the words it was signed with. Older
// records that still have a condition not met follow it and stay there until it is met.
import { CONDITION_STATE, OUTCOME, REQUEST_STATE } from '../contract.js';
import { daysBetween, formatDay, plural } from '../lib/format.js';

const QUOTE_MAX = 160;
const quoted = (text) => {
  const t = String(text ?? '').trim();
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX - 1).trimEnd()}…` : t;
};

const lateDays = (c, now) => Math.max(daysBetween(c.dueDate, now), 0);

/**
 * Whole days after its due date that a condition was confirmed met; 0 when it was met in time, is not met, or the day
 * of the confirmation is not known.
 * @param {{status?: string, state?: string, dueDate: string, metAt?: string|null}} c
 */
export const metLateDays = (c) =>
  (c.state ?? c.status) === CONDITION_STATE.MET && c.metAt ? Math.max(daysBetween(c.dueDate, c.metAt), 0) : 0;

/** "met 9 days late" for a condition that was met after its due date; null otherwise. */
export const metLateText = (c) => {
  const days = metLateDays(c);
  return days > 0 ? `met ${plural(days, 'day')} late` : null;
};

/**
 * A carried condition as a screen shows it. One that is met says so in full: how late it was met, and, when its Jira
 * issue is not done, that fact in words after the issue key ("CLM-6" + "is still In Progress in Jira") instead of the
 * bare status, which next to "Met" reads as a contradiction. Every other condition is returned as it is.
 * @template {{state: string, dueDate: string, line: string, linkedIssue?: string|null, linkedIssueStatus?: string|null, linkedIssueDone?: boolean|null}} C
 * @param {C} c
 * @param {string} now   IsoTime
 * @returns {C & {metLateDays: number}}
 */
export const shownCondition = (c, now) => {
  const days = metLateDays(c);
  if (c.state !== CONDITION_STATE.MET) return { ...c, metLateDays: 0 };
  return {
    ...c,
    metLateDays: days,
    line: days > 0 ? `${c.line}, met ${plural(days, 'day')} late (was due ${formatDay(c.dueDate, now)})` : c.line,
    linkedIssueStatus:
      c.linkedIssue && c.linkedIssueDone === false ? `is still ${c.linkedIssueStatus || 'not done'} in Jira` : null,
  };
};
/** " (1 late)" after a count of met conditions when some of them were met after the due date. */
const metLate = (met) => {
  const late = met.filter((c) => metLateDays(c) > 0).length;
  return late > 0 ? ` (${late} late)` : '';
};
const split = (conditions) => ({
  late: conditions.filter((c) => c.state === CONDITION_STATE.OVERDUE),
  met: conditions.filter((c) => c.state === CONDITION_STATE.MET),
  open: conditions.filter((c) => c.state !== CONDITION_STATE.OVERDUE && c.state !== CONDITION_STATE.MET),
});
const worst = (late, now) => plural(Math.max(...late.map((c) => lateDays(c, now))), 'day');

/** "1 condition, due 18 Nov, open" — one promise is said whole; several are counted. */
const lastPart = (conditions, now) => {
  if (conditions.length === 1) {
    const [c] = conditions;
    const where =
      c.state === CONDITION_STATE.MET
        ? metLateText(c) ?? 'met'
        : c.state === CONDITION_STATE.OVERDUE
          ? `was due ${formatDay(c.dueDate, now)}, ${plural(lateDays(c, now), 'day')} overdue`
          : `due ${formatDay(c.dueDate, now)}, open`;
    return `1 condition, ${where}: "${quoted(c.text)}"`;
  }
  const { late, met, open } = split(conditions);
  const parts = [
    late.length > 0 ? `${late.length} ${late.length === 1 ? 'is' : 'are'} ${worst(late, now)} overdue` : null,
    open.length > 0 ? `${open.length} still open` : null,
    met.length > 0 ? `${met.length} met${metLate(met)}` : null,
  ].filter(Boolean);
  return `${plural(conditions.length, 'condition')}. ${parts.join(', ')}.`;
};

/** "Record 1 (Release 2.3) still has 1 condition 9 days overdue." — null when everything in it was met. */
const olderPart = (group, now) => {
  const { late, open } = split(group.conditions);
  const parts = [
    late.length > 0 ? `${plural(late.length, 'condition')} ${worst(late, now)} overdue` : null,
    open.length > 0 ? `${plural(open.length, 'condition')} open` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `Record ${group.record.number} (Release ${group.record.releaseName}) still has ${parts.join(' and ')}.`;
};

/**
 * @param {import('../contract.js').CarriedGroup[]} groups   earlier records that have conditions, newest first
 * @param {string} now                                       IsoTime
 * @param {string|null} [viewerId]
 * @returns {{line: string|null, overdue: number, own: boolean}}
 *   line: "Last time (Release 2.4, Record 2): 1 condition, due 18 Nov, open: "…" Record 1 (Release 2.3) still has 1 condition 9 days overdue."
 *   overdue: conditions overdue in all groups · own: the newest of these records was signed by the viewer
 */
export const carriedHeadline = (groups, now, viewerId = null) => {
  const [last, ...older] = groups;
  if (!last) return { line: null, overdue: 0, own: false };
  const first = `Last time (Release ${last.record.releaseName}, Record ${last.record.number}): ${lastPart(last.conditions, now)}`;
  const rest = older.map((g) => olderPart(g, now)).filter(Boolean);
  return {
    line: [first, ...rest].join(' '),
    overdue: groups.flatMap((g) => g.conditions).filter((c) => c.state === CONDITION_STATE.OVERDUE).length,
    own: Boolean(viewerId) && last.record.decidedBy?.id === viewerId,
  };
};

/**
 * The release that follows `releaseId` among the unreleased ones (in Jira's own order), where a condition's issue is
 * put and where the condition is seen again. When `releaseId` is not unreleased any more: the first unreleased one.
 * @param {{id: string, name: string, released: boolean}[]} releases
 * @param {string} releaseId
 * @returns {{id: string, name: string, released: boolean}|null}
 */
export const nextRelease = (releases, releaseId) => {
  const unreleased = releases.filter((r) => !r.released);
  const at = unreleased.findIndex((r) => String(r.id) === String(releaseId));
  return (at >= 0 ? unreleased[at + 1] : unreleased[0]) ?? null;
};

/**
 * The release a page, the agent or an MCP tool opens when none is named: where the next action is. Among the
 * unreleased versions in Jira's own order: the first that has cases and still waits for a decision; when every one
 * with cases is decided, the first with cases; when none has cases, the first.
 * @param {{id: string, released: boolean}[]} releases
 * @param {{withCases: {has: (id: string) => boolean}, decided: {has: (id: string) => boolean}}} facts
 * @returns {string|null}
 */
export const defaultReleaseId = (releases, { withCases, decided }) => {
  const unreleased = releases.filter((r) => !r.released);
  const tested = unreleased.filter((r) => withCases.has(String(r.id)));
  const hit = tested.find((r) => !decided.has(String(r.id))) ?? tested[0] ?? unreleased[0];
  return hit ? String(hit.id) : null;
};

/**
 * Releases that are decided: the newest record of the release accepted it (with or without conditions) and nobody has
 * asked for a decision again since. A rejected release still waits: the next action is there.
 * @param {{releaseId: string, number: number, outcome: string}[]} records
 * @param {{releaseId: string, state: string}[]} requests
 * @returns {Set<string>}
 */
export const decidedReleases = (records, requests) => {
  /** @type {Map<string, {number: number, outcome: string}>} */
  const newest = new Map();
  for (const r of records) {
    const id = String(r.releaseId);
    if (!newest.has(id) || newest.get(id).number < r.number) newest.set(id, r);
  }
  const asked = new Set(requests.filter((r) => r.state === REQUEST_STATE.OPEN).map((r) => String(r.releaseId)));
  return new Set([...newest].filter(([id, r]) => r.outcome !== OUTCOME.REJECTED && !asked.has(id)).map(([id]) => id));
};
