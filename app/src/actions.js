// [F] Rovo / MCP actions. Contract: typedef `Actions` (Part 6) in src/contract.js.
// Read-only. Call services, return compact JSON with citations. Never throw, never invent data: on error `{ error }`.
//
// The three outputs carry every field of the contract. Extra fields are added (never renamed, never removed; approved by
// Main) so that the agent can answer "what am I signing", "who tested their own work" and "what did we promise last time"
// from these three tools alone.
//
// Fields added beyond contract.js Part 6
//   every action, on error   code                      the ERROR code next to `error`
//   get-acceptance-status    project {key, name} · totals {requirements, cases} · usualSheet · historyError · sampleData
//                            buildsTested[] (no build set: the builds of the latest runs) · buildInWords ("The build
//                              being accepted is X." / "Builds tested: X, Y." / null when no run names a build)
//                            coveredCount · canAcceptWithConditions (every open item has a condition or a waiver
//                              proposed, so the approver may accept with conditions now)
//                            openDefects[] {key, priority, status, blocking}
//                            request.requestedBy · request.requestedAt
//                            lastDecision.release · .decidedBy · .forThisRelease   (when this release is undecided,
//                              lastDecision is the newest earlier record that carries conditions and forThisRelease is
//                              false; `accepted` and `verdict: 'signed'` only ever speak about THIS release)
//                            earlierConditions[] {recordNumber, release, text, owner, dueDate, state, daysLate,
//                              linkedIssue, linkedIssueStatus, sentence, citation}
//   list-blockers            per blocker: by, and by kind requirementKey, summary, tested {result, at, by, build,
//                              environment}, notes, changes[] {code, issueKey, at, by, sentence, before, after, url},
//                              fact, linkedTo
//                            count · notListed (beyond the first 40) · coveredCount · canAcceptWithConditions · sentence ·
//                              historyError · sampleData
//                              (`blockers` and `count` are EVERY open item. One that has a condition or a waiver
//                              proposed is still a blocker until the approver signs: `coveredBy` says what is
//                              proposed for it, in words, and `coveredCount` how many have something proposed)
//                            dutiesCheckedFor {approver, named} · conflicts[] {code, person, item, sentence, fact,
//                              blocking, url}   (every conflict, blocking or not)
//                            openDefectsNotBlocking[] · earlierConditions[] (not met only) · citations[]
//                            teamworkGraph {state, sentence, linked[]}: `sentence` is null and `linked` is empty unless the
//                              graph links a work item from outside the release, or development work
//   both release tools       releaseChosenLine: null when the caller named the release; else one ready sentence that
//                              says which release the tool chose and, when an earlier unreleased release is already
//                              decided, that it is (so nobody takes the numbers of 2.5 for those of 2.4)
//   verify-seal              release · sealShort · sealedAt · checkedAt · sentence · sealedRecordUnchanged ·
//                            checkMessages {snapshot, page, chain, evidence} · canRestorePage · changedSinceSigning[].url
//                            per difference: check, pageVersion, recordNumber
//
// Ready words, so that no prompt has to translate a code or an ISO date (another agent printed
// `accepted_with_conditions` and `2026-11-11T07:56:34Z`). Every one sits beside the raw field it says in words:
//   get-acceptance-status    decidedLine (the whole first line when `verdict` is 'signed', else null)
//                            openLine ("5 things are open; a condition or a waiver is proposed for each; it can be
//                              accepted with conditions by …, or rejected."; null when nothing is open or once decided;
//                              `sentence` is the Readiness verdict followed by it)
//                            lastDecisionLine (the direct answer to "what did we promise last time")
//                            lastDecision.outcomeInWords · .decidedAtInWords · request.dueDateInWords ·
//                            .requestedAtInWords · earlierConditions[].dueDateInWords · .stateInWords
//   list-blockers            countLine ("5 things block sign-off.", the direct answer to "what is blocking") · openLine
//                            per blocker sinceInWords · tested.atInWords · changes[].atInWords
//   verify-seal              firstLine (the whole first line, with the record and the short seal) · resultInWords ·
//                            sealedAtInWords · checkedAtInWords ·
//                            pageDiffersLine and restoreLine (both null unless the seal is broken by the page) ·
//                            per difference editedAtInWords, and `sealed` / `found` with every link written as
//                            "link to CLM-5" (a run of URLs became smart-link cards in Rovo) ·
//                            changedSinceSigning[].atInWords · chain[].resultInWords, .release, .sealShort
import { COUNT_LABEL, ERROR, OUTCOME_LOZENGE, VERIFY_RESULT_TEXT } from './contract.js';
import { AppError, GENERIC_ERROR } from './lib/result.js';
import { formatDay, formatDayTime, nowIso, plural, shortSeal } from './lib/format.js';
import { absolute, issuePath, projectPath, releasePath } from './lib/links.js';
import { blockerWords, brokenSealLines, changedLine, conditionSentence, lastDecisionLine, proposalWords } from './actionWords.js';
import { buildSentence, buildsOfRequirements } from './domain/buildWords.js';
import { getReadiness } from './services/readiness.js';
import { getBrief } from './services/brief.js';
import { verifyAll, verifyRecord } from './services/verify.js';
import { listRecords } from './services/records.js';
import { assertProject, cleanKey } from './services/access.js';
import * as jira from './clients/jira.js';

/** @typedef {import('./contract.js').Actions} Api */
/** @typedef {import('./contract.js').Ctx} Ctx */
/** @typedef {import('./contract.js').Readiness} Readiness */
/** @typedef {import('./contract.js').Citation} Citation */

const MAX_BLOCKERS = 40;
const MAX_TEXT = 280;
const MAX_CITATIONS = 12;

// ───────────────────────────── context, inputs, errors ─────────────────────────────

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * Action invocation → Ctx. The caller's account comes from the function context, never from an input.
 * @returns {Ctx}
 */
const ctxOf = (payload, context) => {
  const pc = payload?.context ?? {};
  const jira = pc.jira ?? {};
  const confluence = pc.confluence ?? {};
  const installCloudId = typeof context?.installContext === 'string' ? context.installContext.split('/').pop() : null;
  return {
    accountId: context?.principal?.accountId ?? context?.accountId ?? null,
    cloudId: pc.cloudId ?? context?.cloudId ?? installCloudId ?? '',
    siteUrl: originOf(jira.url) || originOf(confluence.url) || originOf(context?.siteUrl) || '',
    surface: 'rovo',
    projectKey: typeof jira.projectKey === 'string' ? jira.projectKey : null,
    projectId: jira.projectId ? String(jira.projectId) : null,
    issueKey: typeof jira.issueKey === 'string' ? jira.issueKey : null,
    contentId: confluence.contentId ? String(confluence.contentId) : null,
  };
};

// The site's address per site, for as long as this function instance lives: it is asked for at most once per site.
/** @type {Map<string, string>} */
const knownSites = new Map();

/**
 * The Ctx of an action, always with the site's address when Jira can give it. Rovo Chat passes the address in the
 * context; the MCP endpoint passes none. Without it every citation would be site-relative (useless to an outside
 * client) and the record page could not be fully checked, so it is read from Jira once, before any service runs.
 * @returns {Promise<Ctx>}
 */
const ctxFor = async (payload, context) => {
  const ctx = ctxOf(payload, context);
  if (ctx.siteUrl) return ctx;
  const known = knownSites.get(ctx.cloudId);
  if (known) return { ...ctx, siteUrl: known };
  const siteUrl = await jira.getSiteUrl();
  if (siteUrl && ctx.cloudId) knownSites.set(ctx.cloudId, siteUrl);
  return { ...ctx, siteUrl };
};

const invalid = (field, sentence) => new AppError(ERROR.INVALID, sentence, { field });

/** A string input, trimmed; '' when absent. Anything that is not text or a number is refused. */
const textInput = (value, field, max) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(field, `The ${field} must be text.`);
  const text = String(value).trim();
  if (text.length > max) throw invalid(field, `The ${field} is too long.`);
  return text;
};

const boolInput = (value) => value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');

/** 1, "1", "record 1", "#1" → 1. Empty or "latest" → null. Anything else is refused. */
const recordNumberInput = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (text === '' || text === 'latest' || text === 'last') return null;
  const match = /^(?:record\s*)?#?\s*(\d{1,6})$/.exec(text);
  const number = match ? Number(match[1]) : 0;
  if (number < 1) throw invalid('recordNumber', 'The record number must be a whole number, 1 or higher.');
  return number;
};

/** Anything thrown → `{ error }` with a sentence a person can read. Unknown errors go to the log, not to the caller. */
const errorOut = (err) => {
  if (err instanceof AppError && err.code !== ERROR.NOT_IMPLEMENTED) return { error: err.message, code: err.code };
  console.error(err);
  return { error: GENERIC_ERROR, code: ERROR.FAILED };
};

const isNotFound = (err) => err instanceof AppError && err.code === ERROR.NOT_FOUND;

// ───────────────────────────── project and release, resolved leniently ─────────────────────────────

/** The text as a project key, by the one guard every screen uses (services/access.cleanKey); null when it is not one. */
const keyOrNull = (text) => {
  try {
    return cleanKey(text);
  } catch {
    return null;
  }
};

/** Project keys worth trying for what the caller typed: "clm", "CLM-18", "ClaimPoint (CLM)", or the project the chat is on. */
const keyCandidates = (raw, ctx) => {
  const out = [];
  const add = (text) => {
    const key = keyOrNull(text);
    if (key && !out.includes(key)) out.push(key);
  };
  if (raw) {
    const issue = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(raw);
    add(issue ? issue[1] : raw);
    for (const token of raw.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? []) add(token);
  } else {
    if (ctx.projectKey) add(ctx.projectKey);
    if (ctx.issueKey?.includes('-')) add(ctx.issueKey.split('-')[0]);
  }
  return out;
};

/** Project name → keys, as the caller (so only projects they can see). Never throws. */
const keysByName = async (name) => {
  try {
    const projects = await jira.findProjects(name);
    const wanted = name.toLowerCase();
    const exact = projects.filter((p) => p.name.toLowerCase() === wanted);
    const hits = exact.length ? exact : projects.length === 1 ? projects : [];
    return hits.map((p) => p.key);
  } catch (err) {
    console.error(err);
    return [];
  }
};

/**
 * Runs `attempt(projectKey)` for each key the input could mean, then for projects found by name.
 * `attempt` answers `undefined` (or throws not_found) when that key leads nowhere.
 */
const forProject = async (ctx, raw, attempt, notFoundSentence) => {
  const tried = keyCandidates(raw, ctx);
  if (!raw && tried.length === 0) throw invalid('projectKey', 'Give the Jira project key, for example CLM.');
  const run = async (key) => {
    try {
      // The same guard as every screen: Jira is asked, as the caller, whether they may browse this project. A project
      // they cannot see answers exactly like one that does not exist.
      const allowed = await assertProject(ctx, key);
      return await attempt(allowed);
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  };
  for (const key of tried) {
    const found = await run(key);
    if (found !== undefined) return found;
  }
  if (raw) {
    for (const key of await keysByName(raw)) {
      if (tried.includes(key.toUpperCase())) continue;
      const found = await run(key);
      if (found !== undefined) return found;
    }
    // The key of the space the app makes for a project's records (CLM → CLMACC) was given: try its project.
    const fromSpace = keyOrNull(/^(.+)ACC$/i.exec(raw)?.[1] ?? '');
    if (fromSpace && !tried.includes(fromSpace)) {
      const found = await run(fromSpace);
      if (found !== undefined) return found;
    }
  }
  // Asked from a Confluence page, an agent takes the space key for the project key.
  const hint = raw && (ctx.contentId || /ACC$/i.test(raw)) ? ` ${SPACE_KEY_HINT}` : '';
  throw new AppError(ERROR.NOT_FOUND, `${notFoundSentence}${hint}`);
};

const SPACE_KEY_HINT =
  'A Confluence space key is not a Jira project key. The project key is the first part of the issue keys on the record page: CLM-5 belongs to project CLM.';

/** "Release 2.4", "v2.4", "2.4 of ClaimPoint" → "2.4". "latest", "current", "next" → '' (the default release). */
const cleanRelease = (raw) => {
  const text = raw
    .replace(/^(the\s+)?(fix\s+version|release|version)\s*[:#]?\s*/i, '')
    .replace(/\s+(of|for|in)\s+.*$/i, '')
    .trim();
  return /^(latest|current|next|default|this)$/i.test(text) ? '' : text;
};

const normRelease = (name) => String(name).toLowerCase().replace(/^v(?=\d)/, '').replace(/\s+/g, ' ').trim();

/** The one release of the project that the typed name can mean, or null. */
const matchRelease = (releases, wanted) => {
  const target = normRelease(wanted);
  const exact = releases.filter((r) => normRelease(r.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact.find((r) => !r.released) ?? exact[0];
  const partial = releases.filter((r) => normRelease(r.name).startsWith(target) || normRelease(r.name).endsWith(target));
  return partial.length === 1 ? partial[0] : null;
};

/**
 * Loads a Readiness or Brief for what the caller typed.
 * @template T
 * @param {Ctx} ctx
 * @param {(ctx: Ctx, q: {projectKey: string, releaseId?: string|null, releaseName?: string|null}) => Promise<T>} load
 * @returns {Promise<T>}
 */
const loadRelease = (ctx, load, projectRaw, releaseRaw) => {
  const wanted = cleanRelease(releaseRaw);
  return forProject(
    ctx,
    projectRaw,
    async (projectKey) => {
      if (!wanted) return load(ctx, { projectKey });
      try {
        return await load(ctx, { projectKey, releaseName: wanted });
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      // The project or the release was not found. Ask for the default release to learn which, and to see the names.
      const base = await getReadiness(ctx, { projectKey });
      const match = matchRelease(base.releases ?? [], wanted);
      if (!match) {
        const names = (base.releases ?? []).map((r) => r.name).join(', ');
        throw invalid('release', `Release ${wanted} was not found in ${projectKey}. Its releases are: ${names || 'none'}.`);
      }
      return load(ctx, { projectKey, releaseId: match.id });
    },
    `No release to check was found for project ${projectRaw || ctx.projectKey}. Check the project key, for example CLM.`,
  );
};

// ───────────────────────────── shared output pieces ─────────────────────────────

const abs = (ctx, path) => absolute(ctx.siteUrl, path);
const issueUrl = (ctx, key) => abs(ctx, issuePath(key));
const releaseUrl = (ctx, projectKey, releaseId) => abs(ctx, releasePath(projectKey, releaseId));
const clip = (text) =>
  typeof text !== 'string' ? null : text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
const nameOf = (person) => person?.name ?? null;

/** Dates as people read them, always with the year: "11 Nov 2026" and "11 Nov 2026, 09:19 UTC". Null stays null. */
const dayWords = (iso) => (iso ? formatDay(iso, null, true) : null);
const timeWords = (iso) => (iso ? formatDayTime(iso, null, true) : null);
const outcomeWords = (outcome) => OUTCOME_LOZENGE[outcome]?.text ?? null;
const CONDITION_WORDS = { open: 'Open', met: 'Met', overdue: 'Overdue' };

/** Citations, without repeats and without entries that have no URL. */
const citationList = (items) => {
  const seen = new Set();
  const out = [];
  for (const c of items) {
    if (!c?.url || seen.has(`${c.label}|${c.url}`)) continue;
    seen.add(`${c.label}|${c.url}`);
    out.push(c);
  }
  return out.slice(0, MAX_CITATIONS);
};

const releaseCitation = (ctx, r, now) => ({
  label: `Release ${r.release.name} readiness · assembled ${formatDayTime(r.assembledAt, now)}`,
  url: releaseUrl(ctx, r.project.key, r.release.id),
});

/** A record is cited by its Confluence page; when no page was published, by the Jira release it decided. */
const recordCitation = (ctx, projectKey, record) => ({
  label: `Record ${record.number} · release ${record.releaseName} · seal ${shortSeal(record.seal)}`,
  url: abs(ctx, record.pageUrl) || releaseUrl(ctx, projectKey, record.releaseId),
});

/** Conditions of earlier records ("what did we promise last time"), newest record first. */
const carriedConditions = (ctx, r) =>
  (r.carried ?? []).flatMap((group) =>
    group.conditions.map((c) => ({
      recordNumber: group.record.number,
      release: group.record.releaseName,
      text: clip(c.text),
      owner: nameOf(c.owner),
      dueDate: c.dueDate,
      dueDateInWords: dayWords(c.dueDate),
      state: c.state,
      stateInWords: CONDITION_WORDS[c.state] ?? null,
      daysLate: c.daysLate ?? null,
      linkedIssue: c.linkedIssue ?? null,
      linkedIssueStatus: c.linkedIssueStatus ?? null,
      sentence: conditionSentence(c.line, c.state, nameOf(c.owner)),
      citation: c.linkedIssue
        ? { label: `${c.linkedIssue} · condition from Record ${group.record.number}`, url: issueUrl(ctx, c.linkedIssue) }
        : recordCitation(ctx, r.project.key, group.record),
    })),
  );

const uncovered = (r) => (r.openItems ?? []).filter((item) => !item.coveredBy);

/**
 * The ready sentences about the open items of a release. Every open item counts, also one that has a condition or a
 * waiver proposed for it: a proposal is not a decision.
 * @param {Readiness} r
 */
const openWords = (r) => {
  const count = (r.openItems ?? []).length;
  return {
    count,
    covered: count - uncovered(r).length,
    ...blockerWords({
      count,
      covered: count - uncovered(r).length,
      approver: r.request?.approver?.name ?? null,
      decided: Boolean(r.decided),
      historyUnreadable: Boolean(r.historyError),
    }),
  };
};

/**
 * One sentence for an answer about a release nobody named: which release the tool chose (services/readiness picks
 * the earliest unreleased one that has cases and still waits for a decision) and, when it passed over an earlier
 * release because that one is decided, that it is. Null when the caller named the release.
 * @param {Ctx} ctx @param {Readiness} r @param {string} releaseRaw   what the caller typed for the release
 * @returns {Promise<string|null>}
 */
const releaseChosenLine = async (ctx, r, releaseRaw) => {
  if (cleanRelease(releaseRaw)) return null;
  const plain = `No release was named: this answer is about Release ${r.release.name}.`;
  const unreleased = (r.releases ?? []).filter((one) => !one.released);
  const at = unreleased.findIndex((one) => String(one.id) === String(r.release.id));
  if (at < 1) return plain;
  let records;
  try {
    records = (await listRecords(ctx, { projectKey: r.project.key })).records;
  } catch (err) {
    console.error(err);
    return plain;
  }
  // The nearest earlier release whose newest record accepted it.
  for (const earlier of unreleased.slice(0, at).reverse()) {
    const last = records.filter((rec) => String(rec.releaseId) === String(earlier.id)).sort((a, b) => b.number - a.number)[0];
    if (!last || last.outcome === 'rejected') continue;
    return `No release was named: this answer is about Release ${r.release.name}, because Release ${earlier.name} is already decided (${(
      outcomeWords(last.outcome) ?? 'decided'
    ).toLowerCase()} by ${last.decidedBy.name} on ${dayWords(last.decidedAt)}, Record ${last.number}).`;
  }
  return plain;
};

// ───────────────────────────── get-acceptance-status ─────────────────────────────

/** @param {Ctx} ctx @param {Readiness} r */
const statusOutput = (ctx, r, chosenLine = null) => {
  const now = nowIso();
  const decided = r.decided ?? null;
  const open = openWords(r);
  const signable = !decided && !r.historyError && open.count === 0;
  // The decision on THIS release when there is one; otherwise the newest earlier record that still carries conditions.
  const last = decided ?? r.carried?.[0]?.record ?? null;
  const carried = carriedConditions(ctx, r);
  const openDefects = (r.defects ?? []).filter((d) => d.open);
  const stillOpen = decided ? decided.conditions.open + decided.conditions.overdue : 0;
  return {
    project: { key: r.project.key, name: r.project.name },
    release: r.release.name,
    releaseChosenLine: chosenLine,
    build: r.release.build ?? null,
    // With no build set on the release: the builds of the latest runs (what was tested). Never "the build accepted".
    buildsTested: r.release.build ? [] : buildsOfRequirements(r.requirements),
    // Said as written: an agent given `null` named ONE build from the runs as the build being accepted. Null when
    // there is nothing to say about builds (no build set and no run yet).
    buildInWords: buildSentence(r.release.build, buildsOfRequirements(r.requirements)),
    verdict: decided ? 'signed' : signable ? 'ready' : 'not_ready',
    accepted: Boolean(decided) && decided.outcome !== 'rejected',
    signable,
    counts: r.counts,
    // The words to use for the four counts (the keys above are internal names).
    countsInWords: Object.fromEntries(Object.entries(COUNT_LABEL).map(([k, v]) => [v.label, r.counts[k]])),
    headline: r.headline ?? r.verdict,
    // The whole first line of an answer about a release that is already decided; null otherwise.
    decidedLine: decided
      ? `Already decided. Release ${decided.releaseName} was ${(outcomeWords(decided.outcome) ?? 'decided').toLowerCase()} by ${decided.decidedBy.name} on ${dayWords(decided.decidedAt)} (Record ${decided.number}).${
          stillOpen ? ` ${plural(stillOpen, 'condition is', 'conditions are')} still open.` : ''
        }`
      : null,
    earlierConditionsLine: r.carriedLine ?? null,
    totals: r.totals,
    // Every open item, also one with a condition or a waiver proposed for it: it blocks until the approver signs.
    blockerCount: open.count,
    coveredCount: open.covered,
    canAcceptWithConditions: open.canAcceptWithConditions,
    openLine: open.openLine,
    sentence: [r.verdict, open.openLine].filter(Boolean).join(' '),
    usualSheet: r.usualSheet ?? null,
    openDefects: openDefects.map((d) => ({ key: d.key, priority: d.priority, status: d.status.name, blocking: d.blocking })),
    request: r.request
      ? {
          state: r.request.state,
          approver: r.request.approver.name,
          dueDate: r.request.dueDate,
          dueDateInWords: dayWords(r.request.dueDate),
          requestedBy: r.request.requestedBy.name,
          requestedAt: r.request.requestedAt,
          requestedAtInWords: dayWords(r.request.requestedAt),
        }
      : null,
    // The whole first line of an answer to "what did we promise last time"; null when no record carries a decision.
    lastDecisionLine: last
      ? lastDecisionLine({
          release: last.releaseName,
          recordNumber: last.number,
          outcomeInWords: outcomeWords(last.outcome),
          decidedBy: last.decidedBy.name,
          decidedAtInWords: dayWords(last.decidedAt),
          conditions: last.conditions,
        })
      : null,
    lastDecision: last
      ? {
          outcome: last.outcome,
          outcomeInWords: outcomeWords(last.outcome),
          decidedAt: last.decidedAt,
          decidedAtInWords: dayWords(last.decidedAt),
          recordNumber: last.number,
          seal: last.seal,
          openConditions: last.conditions.open + last.conditions.overdue,
          release: last.releaseName,
          decidedBy: last.decidedBy.name,
          forThisRelease: Boolean(decided),
        }
      : null,
    earlierConditions: carried,
    historyError: r.historyError ?? null,
    sampleData: Boolean(r.sample),
    citations: citationList([
      releaseCitation(ctx, r, now),
      r.request?.taskKey
        ? { label: `${r.request.taskKey} · sign-off request ${formatDay(r.request.requestedAt, now)}`, url: issueUrl(ctx, r.request.taskKey) }
        : null,
      last ? recordCitation(ctx, r.project.key, last) : null,
      ...carried.filter((c) => c.state !== 'met').map((c) => c.citation),
    ]),
  };
};

/** @type {Api['status']} action `get-acceptance-status` */
export const status = async (payload, context) => {
  try {
    const ctx = await ctxFor(payload, context);
    const projectRaw = textInput(payload?.projectKey, 'project key', 80);
    const releaseRaw = textInput(payload?.release, 'release', 80);
    const r = await loadRelease(ctx, getReadiness, projectRaw, releaseRaw);
    return statusOutput(ctx, r, await releaseChosenLine(ctx, r, releaseRaw));
  } catch (err) {
    return errorOut(err);
  }
};

// ───────────────────────────── list-blockers ─────────────────────────────

/** One OpenItem → one blocker the agent can quote: issue key, reason, date, person and a URL. */
const blockerOf = (ctx, r, item, now) => {
  const base = {
    code: item.kind.toUpperCase(),
    kind: item.kind,
    item: item.item,
    sentence: item.label,
    since: null,
    by: null,
    // What is proposed for it in the brief, in words; null when nothing is. Proposed or not, it is a blocker.
    coveredBy: proposalWords(item.coveredBy, r.draft),
    citation: item.item ? { label: item.item, url: issueUrl(ctx, item.item) } : releaseCitation(ctx, r, now),
  };
  const cases = r.requirements.flatMap((req) => req.cases);

  if (item.kind === 'stale' || item.kind === 'failed' || item.kind === 'blocked' || item.kind === 'not_run') {
    const view = cases.find((c) => c.key === item.item);
    if (!view) return base;
    const run = view.latestRun;
    const tested = run
      ? {
          result: run.result,
          at: run.executedAt,
          atInWords: dayWords(run.executedAt),
          by: run.executedBy.name,
          build: run.build,
          environment: run.environment,
        }
      : null;
    const more = { requirementKey: view.requirementKey, summary: clip(view.summary), tested };
    if (run) base.citation = { label: `${view.key} · run ${formatDayTime(run.executedAt, now)}`, url: issueUrl(ctx, view.key) };
    if (item.kind === 'not_run') return { ...base, ...more, sentence: `${view.key} has not been run.` };
    if (item.kind !== 'stale') {
      return {
        ...base,
        ...more,
        sentence: `${view.key} ${item.kind === 'failed' ? 'failed' : 'was blocked'} on ${formatDay(run.executedAt, now)}.`,
        since: run.executedAt,
        sinceInWords: dayWords(run.executedAt),
        by: run.executedBy.name,
        notes: clip(run.notes) || null,
      };
    }
    const reasons = view.staleReasons ?? [];
    const first = reasons[0] ?? null;
    return {
      ...base,
      ...more,
      code: first?.code ?? base.code,
      sentence: `${view.key} passed on ${formatDay(run.executedAt, now)}, then changed. ${reasons.map((s) => s.sentence).join(' ')}`.trim(),
      since: first?.at ?? null,
      sinceInWords: dayWords(first?.at),
      by: nameOf(first?.by),
      changes: reasons.map((s) => ({
        code: s.code,
        issueKey: s.issueKey,
        at: s.at,
        atInWords: dayWords(s.at),
        by: nameOf(s.by),
        sentence: s.sentence,
        before: clip(s.before),
        after: clip(s.after),
        url: issueUrl(ctx, s.issueKey),
      })),
    };
  }

  if (item.kind === 'no_case') return { ...base, sentence: `${item.item} has no acceptance case.` };

  if (item.kind === 'defect') {
    const defect = (r.defects ?? []).find((d) => d.key === item.item);
    if (!defect) return base;
    return {
      ...base,
      sentence: `Defect ${defect.key} is open (priority ${defect.priority ?? 'not set'}, status ${defect.status.name}).`,
      summary: clip(defect.summary),
      linkedTo: defect.linkedTo,
    };
  }

  if (item.kind === 'conflict') {
    const conflict = (r.duties?.conflicts ?? []).find((c) => c.id === item.id);
    if (!conflict) return base;
    return {
      ...base,
      code: conflict.code,
      sentence: conflict.sentence,
      by: conflict.person.name,
      fact: conflict.fact,
      citation: conflict.item
        ? { label: `${conflict.item} history`, url: abs(ctx, conflict.historyUrl) || issueUrl(ctx, conflict.item) }
        : base.citation,
    };
  }

  if (item.kind === 'overdue_condition') {
    const conditionId = item.id.slice('overdue:'.length);
    for (const group of r.carried ?? []) {
      const condition = group.conditions.find((c) => String(c.id) === conditionId);
      if (!condition) continue;
      return {
        ...base,
        item: condition.linkedIssue ?? '',
        sentence: condition.line,
        since: `${condition.dueDate}T00:00:00Z`,
        by: condition.owner.name,
        citation: recordCitation(ctx, r.project.key, group.record),
      };
    }
  }
  return base;
};

/** @param {Ctx} ctx @param {Readiness} r */
const blockersOutput = (ctx, r, chosenLine = null) => {
  const now = nowIso();
  // Every open item. A condition or a waiver proposed for one does not take it off the list: only a signature does.
  const items = r.openItems ?? [];
  const open = openWords(r);
  const approver = r.request?.approver ?? r.viewer;
  return {
    release: r.release.name,
    releaseChosenLine: chosenLine,
    blockers: items.slice(0, MAX_BLOCKERS).map((item) => blockerOf(ctx, r, item, now)),
    count: items.length,
    notListed: Math.max(0, items.length - MAX_BLOCKERS),
    coveredCount: open.covered,
    canAcceptWithConditions: open.canAcceptWithConditions,
    countLine: open.countLine,
    openLine: open.openLine,
    // The direct answer to "what changed since the last test run": counted from the cases, whatever the rules list.
    changedLine: changedLine(r.requirements.flatMap((req) => req.cases).map((c) => c.staleReasons ?? [])),
    sentence: [r.verdict, open.openLine].filter(Boolean).join(' '),
    // Every duty conflict found, blocking or not, so "who tested their own work" (code D3) has a complete answer.
    dutiesCheckedFor: { approver: approver?.name ?? null, named: Boolean(r.request) },
    conflicts: (r.duties?.conflicts ?? []).map((c) => ({
      code: c.code,
      person: c.person.name,
      item: c.item,
      sentence: c.sentence,
      fact: c.fact,
      blocking: c.blocking,
      url: abs(ctx, c.historyUrl) || (c.item ? issueUrl(ctx, c.item) : ''),
    })),
    // Open defects below the blocking priority and earlier conditions are facts for the approver, not blockers.
    openDefectsNotBlocking: (r.defects ?? [])
      .filter((d) => d.open && !d.blocking)
      .map((d) => ({ key: d.key, priority: d.priority, status: d.status.name, summary: clip(d.summary), url: issueUrl(ctx, d.key) })),
    earlierConditions: carriedConditions(ctx, r).filter((c) => c.state !== 'met'),
    historyError: r.historyError ?? null,
    sampleData: Boolean(r.sample),
    // Context only, never a blocker. `sentence` is ready to quote and is null unless the Teamwork Graph links a work
    // item from outside this release, or development work: then the answer says nothing about the graph.
    teamworkGraph: {
      state: r.graph?.state ?? 'failed',
      sentence: r.graph?.sentence ?? null,
      linked: r.graph?.sentence
        ? r.graph.items.slice(0, 10).map((g) => ({
            issueKey: g.issueKey,
            kind: g.kind,
            relatedKey: g.relatedKey ?? null,
            title: clip(g.title),
            url: g.kind === 'work_item' ? issueUrl(ctx, g.relatedKey) : abs(ctx, g.url) || null,
            at: g.at,
          }))
        : [],
    },
    citations: citationList([releaseCitation(ctx, r, now)]),
  };
};

/** The brief knows which blockers a draft condition or waiver already covers. If it cannot be built, readiness still can. */
const briefOrReadiness = async (ctx, q) => {
  try {
    return await getBrief(ctx, q);
  } catch (err) {
    const pass = [ERROR.NOT_FOUND, ERROR.FORBIDDEN, ERROR.INVALID, ERROR.HISTORY_UNREADABLE];
    if (err instanceof AppError && pass.includes(err.code)) throw err;
    console.error(err);
    return getReadiness(ctx, q);
  }
};

/** @type {Api['blockers']} action `list-blockers` */
export const blockers = async (payload, context) => {
  try {
    const ctx = await ctxFor(payload, context);
    const projectRaw = textInput(payload?.projectKey, 'project key', 80);
    const releaseRaw = textInput(payload?.release, 'release', 80);
    const r = await loadRelease(ctx, briefOrReadiness, projectRaw, releaseRaw);
    return blockersOutput(ctx, r, await releaseChosenLine(ctx, r, releaseRaw));
  } catch (err) {
    return errorOut(err);
  }
};

// ───────────────────────────── verify-seal ─────────────────────────────

const SEVERITY = { intact: 0, not_fully_checked: 1, intact_evidence_missing: 2, broken: 3 };

// A run of URLs in an answer becomes a row of smart-link cards in Rovo, in place of the value that differs. So a
// link inside a difference is written in words, at most three of them, and the text is kept short.
const MAX_DIFFERENCE = 200;
const MAX_LINKS = 3;
const LINK = /https?:\/\/[^\s<>"']+|(?<![\w/.])\/(?:browse|wiki|jira|projects)\/[^\s<>"']*/g;

/** "https://<this site>/browse/CLM-5" and "/browse/CLM-5" → "link to CLM-5"; another site is named: "… on other.example". */
const linkWords = (ctx, raw) => {
  const tail = /[.,;:)]+$/.exec(raw)?.[0] ?? '';
  const href = tail ? raw.slice(0, -tail.length) : raw;
  let host = '';
  let path = href;
  if (!href.startsWith('/')) {
    try {
      const url = new URL(href);
      host = url.origin === ctx.siteUrl ? '' : url.host;
      path = url.pathname;
    } catch {
      return `a link${tail}`;
    }
  }
  const issue = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(path)?.[1];
  const target = issue ?? (path.length > 60 ? `${path.slice(0, 59)}…` : path);
  if (!issue && path === '/') return `link to ${host}${tail}`;
  return `link to ${target}${host ? ` on ${host}` : ''}${tail}`;
};

/** One side of a difference as an agent may print it: links in words, the first three only, clipped. */
const differenceText = (ctx, text) => {
  if (typeof text !== 'string') return null;
  let links = 0;
  const worded = text
    .replace(LINK, (raw) => {
      links += 1;
      if (links > MAX_LINKS) return '';
      const words = linkWords(ctx, raw);
      return /[.,;:)]$/.test(words) ? words : `${words},`;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/,$/, '');
  const more = links > MAX_LINKS ? ` (and ${plural(links - MAX_LINKS, 'more link')})` : '';
  const short = worded.length > MAX_DIFFERENCE ? `${worded.slice(0, MAX_DIFFERENCE - 1)}…` : worded;
  return `${short}${more}`;
};

const SEAL_LEAD = { intact: 'Yes.', broken: 'No.', intact_evidence_missing: 'Yes, but:', not_fully_checked: 'Not yet.' };

/** The whole first line of an answer about a seal: the verdict, the result in its fixed words, the record and its short seal. */
const sealFirstLine = (worst, chain) => {
  if (chain && chain.length > 1 && worst.result === 'intact') return `Yes. Seals intact. ${chain.length} records checked.`;
  return `${SEAL_LEAD[worst.result]} ${VERIFY_RESULT_TEXT[worst.result]}. Record ${worst.recordNumber} · release ${worst.releaseName} · seal ${shortSeal(worst.seal)}`;
};

/** PRODUCT §8.5 seal lines. */
const sealSentence = (v) => {
  if (v.result === 'intact') return `Seal intact · Record ${v.recordNumber} · ${shortSeal(v.seal)}`;
  if (v.result === 'not_fully_checked') {
    const notRun = Object.values(v.checks)
      .filter((c) => c.ok === null && !c.notApplicable)
      .map((c) => c.message);
    return `Not fully checked · Record ${v.recordNumber}. Nothing differs in what was checked, but: ${notRun.join('. ')}.`.replace(/\.\.$/, '.');
  }
  if (v.result === 'intact_evidence_missing') {
    const missing = v.differences.filter((d) => d.check === 'evidence').length;
    return `Seal intact, but ${plural(missing, 'evidence file is', 'evidence files are')} missing.`;
  }
  const failed = Object.values(v.checks)
    .filter((c) => c.ok === false)
    .map((c) => c.message);
  return v.checks.page.ok === false && failed.length === 1
    ? 'Seal broken. This page no longer matches the sealed record.'
    : `Seal broken. ${failed.join('. ')}.`.replace(/\.\.$/, '.');
};

/**
 * @param {Ctx} ctx
 * @param {import('./contract.js').VerifyResult} v                 the record reported on
 * @param {import('./contract.js').VerifyResult[]|null} chain      every record, ascending, with wholeChain
 */
const verifyOutput = (ctx, projectKey, v, chain) => {
  const now = nowIso();
  const all = chain ?? [v];
  const worst = all.reduce((a, b) => (SEVERITY[b.result] > SEVERITY[a.result] ? b : a), v);
  const recordUrl = (one) => abs(ctx, one.pageUrl);
  const out = {
    result: worst.result,
    recordNumber: v.recordNumber,
    release: v.releaseName,
    seal: v.seal,
    sealShort: shortSeal(v.seal),
    firstLine: sealFirstLine(worst, chain),
    resultInWords: VERIFY_RESULT_TEXT[worst.result],
    sealedAt: v.sealedAt,
    sealedAtInWords: timeWords(v.sealedAt),
    checkedAt: v.checkedAt,
    checkedAtInWords: timeWords(v.checkedAt),
    sentence: sealSentence(v),
    // True when the stored record still matches its seal (the record is unchanged even if the page was edited).
    sealedRecordUnchanged: v.checks.snapshot.ok,
    checks: {
      snapshot: v.checks.snapshot.ok,
      page: v.checks.page.ok,
      chain: v.checks.chain.ok,
      evidence: v.checks.evidence.ok,
      signerComment: v.checks.anchor?.ok ?? null,
    },
    checkMessages: {
      snapshot: v.checks.snapshot.message,
      page: v.checks.page.message,
      chain: v.checks.chain.message,
      evidence: v.checks.evidence.message,
      signerComment: v.checks.anchor?.message ?? null,
    },
    differences: all.flatMap((one) =>
      one.differences.map((d) => ({
        where: d.where,
        sealed: differenceText(ctx, d.sealed),
        found: differenceText(ctx, d.found),
        editedBy: nameOf(d.editedBy),
        editedAt: d.editedAt ?? null,
        editedAtInWords: timeWords(d.editedAt),
        check: d.check,
        pageVersion: d.version ?? null,
        recordNumber: one.recordNumber,
      })),
    ),
    changedSinceSigning: v.changedSinceSigning
      .slice(0, 20)
      .map((c) => ({ ...c, url: issueUrl(ctx, c.issueKey), atInWords: dayWords(c.at) })),
    canRestorePage: v.canRestore,
    // Both belong to a seal broken by the page only; for an intact record they are null.
    ...brokenSealLines({ result: v.result, snapshotOk: v.checks.snapshot.ok, pageOk: v.checks.page.ok, canRestore: v.canRestore }),
    citations: citationList([
      ...all
        .filter((one) => one === v || one.result !== 'intact')
        .map((one) => ({
          label: `Record ${one.recordNumber} · release ${one.releaseName} · seal ${shortSeal(one.seal)}`,
          url: recordUrl(one) || abs(ctx, projectPath(projectKey)),
        })),
      ...all.flatMap((one) =>
        one.differences
          .filter((d) => d.check === 'page' && d.version && recordUrl(one))
          .slice(0, 1)
          .map((d) => ({ label: `Confluence page history, version ${d.version}`, url: recordUrl(one) })),
      ),
      ...v.changedSinceSigning.slice(0, 5).map((c) => ({
        label: `${c.issueKey} · changed ${formatDay(c.at, now)}`,
        url: issueUrl(ctx, c.issueKey),
      })),
    ]),
  };
  if (chain) {
    out.chain = chain.map((one) => ({
      recordNumber: one.recordNumber,
      release: one.releaseName,
      sealShort: shortSeal(one.seal),
      result: one.result,
      resultInWords: VERIFY_RESULT_TEXT[one.result],
    }));
  }
  return out;
};

/** @type {Api['verify']} action `verify-seal` */
export const verify = async (payload, context) => {
  try {
    const ctx = await ctxFor(payload, context);
    const projectRaw = textInput(payload?.projectKey, 'project key', 80);
    const recordNumber = recordNumberInput(payload?.recordNumber);
    const wholeChain = boolInput(payload?.wholeChain);
    const which = recordNumber ? `record ${recordNumber}` : 'an acceptance record';
    return await forProject(
      ctx,
      projectRaw,
      async (projectKey) => {
        if (!wholeChain) return verifyOutput(ctx, projectKey, await verifyRecord(ctx, { projectKey, recordNumber }), null);
        const chain = await verifyAll(ctx, { projectKey });
        if (!chain.length) return undefined;
        // Report on the record asked for; else the first one that is not intact; else the latest.
        const asked = recordNumber ? chain.find((one) => one.recordNumber === recordNumber) : null;
        if (recordNumber && !asked) return undefined;
        const subject = asked ?? chain.find((one) => one.result !== 'intact') ?? chain[chain.length - 1];
        return verifyOutput(ctx, projectKey, subject, chain);
      },
      `We could not find ${which} for project ${projectRaw || ctx.projectKey}. Check the project key and the record number.`,
    );
  } catch (err) {
    return errorOut(err);
  }
};
