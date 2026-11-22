// [A] Builders, testers and conflicts D1–D4, computed from history (PRODUCT §3.3). Pure.
// A person has ONE conflict per duty (built part of the release, tested part of it, tested their own work, asked and
// approves), however many requirements are behind it: one sentence, one waiver.
// Contract: typedefs `DutiesInput`, `DomainDuties` in src/contract.js.
import { DUTY_CODE, HISTORY_KIND, SAMPLE_PERSON_PREFIX, STATUS_CATEGORY } from '../contract.js';
import { formatDay, plural } from '../lib/format.js';
import { issuePath } from '../lib/links.js';

/** @typedef {import('../contract.js').DomainDuties} Api */
/** @typedef {import('../contract.js').Person} Person */
/** @typedef {import('../contract.js').DutyFact} DutyFact */

const ASSIGNEE = 'assignee_in_progress';
const MOVED = 'moved_to_done';
const RAN = 'recorded_run';

const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
const minTime = (a, b) => (a < b ? a : b);
const maxTime = (a, b) => (a > b ? a : b);

/** @returns {Person} A person known only by id (the provider normally supplies `toPerson`). */
const personOf = (id) => ({ id, name: id, kind: id.startsWith(SAMPLE_PERSON_PREFIX) ? 'sample' : 'jira' });

const span = (from, to, now) => {
  if (to === null) return `since ${formatDay(from, now)}`;
  const [a, b] = [formatDay(from, now), formatDay(to, now)];
  return a === b ? a : `${a}–${b}`;
};

/** Replays one issue's events into (assignee, status category) and applies the next event. */
const apply = (state, e) => {
  if (e.kind === HISTORY_KIND.STATUS) return { ...state, category: e.to };
  if (e.kind === HISTORY_KIND.ASSIGNEE) return { ...state, assignee: e.to === null ? null : (e.toPerson ?? personOf(e.to)) };
  return state;
};
const working = (state) => (state.category === STATUS_CATEGORY.IN_PROGRESS && state.assignee !== null ? state.assignee.id : null);

/** @type {Api['buildersOfIssue']} */
export const buildersOfIssue = (issueKey, events, now) => {
  const assignees = new Map(); // person id → { person, from, to }  (to null = still in progress)
  const closers = new Map(); //   person id → { person, from, to, text }
  const addSpan = (person, from, to) => {
    const seen = assignees.get(person.id);
    assignees.set(person.id, seen
      ? { person, from: minTime(seen.from, from), to: seen.to === null || to === null ? null : maxTime(seen.to, to) }
      : { person, from, to });
  };

  let state = { category: null, assignee: null };
  let since = null;
  for (const e of [...events].sort(byAt)) {
    const next = apply(state, e);
    const [was, is] = [working(state), working(next)];
    if (was !== null && was !== is) addSpan(state.assignee, since, e.at);
    if (is !== null && was !== is) since = e.at;
    const closes = e.kind === HISTORY_KIND.STATUS && e.to === STATUS_CATEGORY.DONE && e.from !== STATUS_CATEGORY.DONE;
    if (closes && !e.baseline && !e.byApp) {
      const seen = closers.get(e.actor.id);
      closers.set(e.actor.id, { person: e.actor, from: seen ? seen.from : e.at, to: e.at, text: e.toText ?? 'Done' });
    }
    state = next;
  }
  if (working(state) !== null) addSpan(state.assignee, since, null);

  return [
    ...[...assignees.values()].map(({ person, from, to }) => ({
      person, issueKey, basis: ASSIGNEE, fact: `Assignee while In Progress, ${span(from, to, now)}`, from, to,
    })),
    ...[...closers.values()].map(({ person, from, to, text }) => ({
      person, issueKey, basis: MOVED, fact: `Moved to ${text} on ${formatDay(to, now)}`, from, to,
    })),
  ];
};

/** One tester fact per person for a requirement: everyone who recorded a run on one of its cases. */
const testersOf = (requirement, runs, now) => {
  const mine = runs.filter((run) => requirement.caseKeys.includes(run.caseKey));
  const people = new Map();
  for (const run of mine) people.set(run.executedBy.id, [...(people.get(run.executedBy.id) ?? []), run]);
  return [...people.values()].map((theirs) => {
    const sorted = [...theirs].sort((a, b) => (a.executedAt < b.executedAt ? -1 : a.executedAt > b.executedAt ? 1 : 0));
    const [first, last] = [sorted[0], sorted[sorted.length - 1]];
    const day = formatDay(last.executedAt, now);
    return {
      person: last.executedBy,
      requirementKey: requirement.key,
      issueKey: last.caseKey,
      basis: RAN,
      fact: sorted.length === 1 ? `Recorded 1 run, ${day}` : `Recorded ${plural(sorted.length, 'run')}, latest ${day}`,
      from: first.executedAt,
      to: last.executedAt,
    };
  });
};

/**
 * The PRODUCT §8.5 "Who did what" line for a conflict. `you` switches D1/D2 to the second person for the viewer's own
 * conflict; `key` is the issue the fact rests on (D1), the case (D2) or the requirement (D3).
 * @param {'D1'|'D2'|'D3'|'D4'} code
 * @param {{name: string, key: string, basis?: string, you?: boolean}} about
 */
export const conflictSentence = (code, { name, key, basis, you = false }) => {
  if (code === DUTY_CODE.D1) {
    if (basis === MOVED) return you ? `You moved ${key} to Done.` : `${name} moved ${key} to Done.`;
    return you ? `You were the assignee of ${key} while it was in progress.` : `${name} was the assignee of ${key} while it was in progress.`;
  }
  if (code === DUTY_CODE.D2) {
    return you
      ? `You recorded a run on ${key}. You cannot also approve this release.`
      : `${name} recorded a run on ${key}. They cannot also approve this release.`;
  }
  if (code === DUTY_CODE.D3) return `${name} built and tested ${key}.`;
  return you ? 'You asked for this sign-off and are also the approver.' : `${name} asked for this sign-off and is also the approver.`;
};

const SHOWN_KEYS = 3;
/** "CLM-9" · "CLM-9 and CLM-12" · "CLM-9, CLM-12, CLM-14 and CLM-15" · "CLM-9, CLM-12, CLM-14 and 46 more". */
export const keyList = (keys) => {
  if (keys.length <= 1) return keys.join('');
  if (keys.length <= SHOWN_KEYS + 1) return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
  return `${keys.slice(0, SHOWN_KEYS).join(', ')} and ${keys.length - SHOWN_KEYS} more`;
};
const distinct = (values) => [...new Set(values)];

/**
 * The stem `conflict:<code>:<personId>` of a conflict id. One person has at most one conflict per duty, so the stem
 * names the conflict; the last part of the id (the first requirement it rests on) may differ between two readings of
 * the same release, and differs in ids written when there was one conflict per requirement. null for another id.
 * @param {string} id
 */
export const conflictStem = (id) => {
  const text = String(id ?? '');
  const cut = text.lastIndexOf(':');
  return text.startsWith('conflict:') && cut > 'conflict:'.length ? text.slice(0, cut) : null;
};

/**
 * ONE conflict per person and duty. `items` are the requirements it rests on and `issues` the work items or cases the
 * history names; `item` (the first requirement) keeps the id and the sealed payload in the shape they always had.
 */
const conflict = (code, person, items, issues, fact, sentence, blocking, youSentence = null) => ({
  id: `conflict:${code}:${person.id}:${items[0] ?? ''}`,
  code,
  person,
  item: items[0] ?? '',
  items,
  issues,
  fact,
  sentence,
  youSentence,
  blocking,
  historyUrl: issues.length > 0 ? issuePath(issues[0]) : null,
});

/** D1 for a person who built more than one work item of the release: what they did, counted, with the keys. */
const builtParts = (facts) => {
  const held = facts.filter((f) => f.basis === ASSIGNEE).map((f) => f.issueKey);
  const moved = facts.filter((f) => f.basis === MOVED).map((f) => f.issueKey);
  const said = [
    held.length === 1 ? `assignee of ${held[0]} while it was in progress` : null,
    held.length > 1 ? `assignee of ${held.length} work items while they were in progress (${keyList(held)})` : null,
    moved.length === 1 ? `moved ${moved[0]} to Done` : null,
    moved.length > 1 ? `moved ${moved.length} work items to Done (${keyList(moved)})` : null,
  ].filter(Boolean).join(' and ');
  const fact = [
    held.length > 0 ? `Assignee while In Progress: ${held.join(', ')}` : null,
    moved.length > 0 ? `Moved to Done: ${moved.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
  return { said, fact };
};

/** D1: the approver built part of the release. One work item is said as it always was; several are counted. */
const builtConflict = (facts, blocking) => {
  const first = new Map(); // issue key → the first fact about it (assignee before "moved to Done")
  for (const f of facts) if (!first.has(f.issueKey)) first.set(f.issueKey, f);
  const shown = [...first.values()];
  const [one] = shown;
  const items = distinct(facts.map((f) => f.requirementKey));
  const issues = shown.map((f) => f.issueKey);
  if (shown.length === 1) {
    const about = { name: one.person.name, key: one.issueKey, basis: one.basis };
    return conflict(DUTY_CODE.D1, one.person, items, issues, one.fact, conflictSentence(DUTY_CODE.D1, about), blocking,
      conflictSentence(DUTY_CODE.D1, { ...about, you: true }));
  }
  const { said, fact } = builtParts(shown);
  return conflict(DUTY_CODE.D1, one.person, items, issues, fact, `${one.person.name} built part of this release: ${said}.`, blocking,
    `You built part of this release: ${said}.`);
};

/** D2: the approver tested part of the release. `facts` hold one fact per requirement. */
const testedConflict = (facts, blocking) => {
  const [one] = facts;
  const items = facts.map((f) => f.requirementKey);
  const issues = facts.map((f) => f.issueKey);
  if (facts.length === 1) {
    const about = { name: one.person.name, key: one.issueKey };
    return conflict(DUTY_CODE.D2, one.person, items, issues, one.fact, conflictSentence(DUTY_CODE.D2, about), blocking,
      conflictSentence(DUTY_CODE.D2, { ...about, you: true }));
  }
  const said = `recorded runs for ${items.length} requirements (${keyList(items)})`;
  return conflict(DUTY_CODE.D2, one.person, items, issues, `Recorded runs for: ${items.join(', ')}`,
    `${one.person.name} tested part of this release: ${said}. They cannot also approve this release.`, blocking,
    `You tested part of this release: ${said}. You cannot also approve this release.`);
};

/** D3: one person built and tested the same requirement. `pairs` hold one {b, t} per requirement. */
const selfTestConflict = (pairs, blocking, now) => {
  const [{ b, t }] = pairs;
  const items = pairs.map((p) => p.b.requirementKey);
  const issues = pairs.map((p) => p.b.issueKey);
  if (pairs.length === 1) {
    const fact = `${b.fact} · recorded a run on ${t.issueKey}, ${formatDay(t.to, now)}.`;
    return conflict(DUTY_CODE.D3, b.person, items, issues, fact, conflictSentence(DUTY_CODE.D3, { name: b.person.name, key: b.requirementKey }), blocking);
  }
  return conflict(DUTY_CODE.D3, b.person, items, issues, `Built and tested: ${items.join(', ')}`,
    `${b.person.name} built and tested ${items.length} requirements (${keyList(items)}).`, blocking);
};

/** @type {Api['computeDuties']} */
export const computeDuties = ({ requirements, history, runs, approver, requester, rules, now }) => {
  /** @type {DutyFact[]} */
  const builders = requirements.flatMap((requirement) =>
    [requirement.key, ...requirement.defectKeys].flatMap((issueKey) =>
      buildersOfIssue(issueKey, history[issueKey] ?? [], now).map((fact) => ({ ...fact, requirementKey: requirement.key }))));
  /** @type {DutyFact[]} */
  const testers = requirements.flatMap((requirement) => testersOf(requirement, runs, now));

  /** @type {import('../contract.js').DutyConflict[]} */
  const conflicts = [];

  if (approver) {
    const built = builders.filter((f) => f.person.id === approver.id);
    if (built.length > 0) conflicts.push(builtConflict(built, rules.approverMustNotBuild));
    const tested = testers.filter((f) => f.person.id === approver.id);
    if (tested.length > 0) conflicts.push(testedConflict(tested, rules.approverMustNotTest));
  }
  const selfTests = new Map(); // person id → Map(requirement key → {b, t}); the first builder fact of a requirement is the one shown
  for (const b of builders) {
    const t = testers.find((f) => f.person.id === b.person.id && f.requirementKey === b.requirementKey);
    if (!t) continue;
    const theirs = selfTests.get(b.person.id) ?? new Map();
    if (!theirs.has(b.requirementKey)) theirs.set(b.requirementKey, { b, t });
    selfTests.set(b.person.id, theirs);
  }
  for (const theirs of selfTests.values()) conflicts.push(selfTestConflict([...theirs.values()], rules.noSelfTest, now));
  if (approver && requester && approver.id === requester.id) {
    const sentence = conflictSentence(DUTY_CODE.D4, { name: approver.name, key: '' });
    const you = conflictSentence(DUTY_CODE.D4, { name: approver.name, key: '', you: true });
    conflicts.push(conflict(DUTY_CODE.D4, approver, [], [], 'Requested the sign-off and is named as approver', sentence, false, you));
  }

  return { builders, testers, conflicts };
};
