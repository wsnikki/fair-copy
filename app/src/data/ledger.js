// [B] Tables `ledger` (sample history) and `issue_changes` (seen by the product-event trigger).
// Contract: typedef `DataLedger` in src/contract.js.
import { HISTORY_KIND } from '../contract.js';
import { execute, query } from './db.js';
import { resolvePeople } from './people.js';
import { bool, chunk, flag, marks, parseJson, rowMarks, unique } from './rows.js';

/** @typedef {import('../contract.js').DataLedger} Api */
/** @typedef {import('../contract.js').HistoryEvent} HistoryEvent */

/** @type {Api['insertLedgerEvents']} */
export const insertLedgerEvents = async (projectKey, events) => {
  for (const part of chunk(events, 40)) {
    await execute(
      `INSERT INTO ledger (project_key, issue_key, kind, field, from_value, to_value, from_text, to_text, at, actor, baseline)
       VALUES ${rowMarks(part.length, 11)}`,
      part.flatMap((e) => [
        projectKey,
        e.issueKey,
        e.kind,
        e.field,
        e.from ?? null,
        e.to ?? null,
        e.fromText ?? null,
        e.toText ?? null,
        e.at,
        e.actor.id,
        flag(e.baseline),
      ]),
    );
  }
};

/** @type {Api['listLedgerEvents']} */
export const listLedgerEvents = async (issueKeys) => {
  const rows = [];
  for (const part of chunk(unique(issueKeys), 200)) {
    rows.push(
      ...(await query(
        `SELECT id, issue_key, kind, field, from_value, to_value, from_text, to_text, at, actor, baseline
           FROM ledger WHERE issue_key IN (${marks(part.length)})`,
        part,
      )),
    );
  }
  if (!rows.length) return [];
  rows.sort((a, b) => (a.at === b.at ? Number(a.id) - Number(b.id) : a.at < b.at ? -1 : 1));

  const isAssignee = (r) => r.kind === HISTORY_KIND.ASSIGNEE;
  const people = await resolvePeople(
    rows.flatMap((r) => [r.actor, ...(isAssignee(r) ? [r.from_value, r.to_value] : [])]),
  );

  return rows.map(
    /** @returns {HistoryEvent} */ (r) => {
      const event = {
        issueKey: r.issue_key,
        kind: r.kind,
        field: r.field,
        from: r.from_value ?? null,
        to: r.to_value ?? null,
        fromText: r.from_text ?? null,
        toText: r.to_text ?? null,
        at: r.at,
        actor: people[r.actor],
        source: 'sample',
        byApp: false,
      };
      if (bool(r.baseline)) event.baseline = true;
      if (isAssignee(r)) {
        event.fromPerson = r.from_value ? people[r.from_value] : null;
        event.toPerson = r.to_value ? people[r.to_value] : null;
        event.fromText ??= event.fromPerson?.name ?? null;
        event.toText ??= event.toPerson?.name ?? null;
      }
      return event;
    },
  );
};

/** @type {Api['deleteLedgerOfProject']} Also clears what the trigger saw in that project. */
export const deleteLedgerOfProject = async (projectKey) => {
  const res = await execute('DELETE FROM ledger WHERE project_key = ?', [projectKey]);
  await execute('DELETE FROM issue_changes WHERE project_key = ?', [projectKey]);
  return res.affectedRows;
};

/** @type {Api['insertIssueChange']} */
export const insertIssueChange = async (c) => {
  await execute('INSERT INTO issue_changes (project_key, issue_key, changed_at, actor, fields) VALUES (?, ?, ?, ?, ?)', [
    c.projectKey,
    c.issueKey,
    c.changedAt,
    c.actor ?? null,
    JSON.stringify(c.fields ?? []),
  ]);
};

/** @type {Api['listIssueChanges']} */
export const listIssueChanges = async (issueKeys, since) => {
  const rows = [];
  for (const part of chunk(unique(issueKeys), 200)) {
    rows.push(
      ...(await query(
        `SELECT id, issue_key, changed_at, actor, fields FROM issue_changes
          WHERE issue_key IN (${marks(part.length)})${since ? ' AND changed_at >= ?' : ''}`,
        since ? [...part, since] : part,
      )),
    );
  }
  rows.sort((a, b) => (a.changed_at === b.changed_at ? Number(a.id) - Number(b.id) : a.changed_at < b.changed_at ? -1 : 1));
  return rows.map((r) => ({
    issueKey: r.issue_key,
    changedAt: r.changed_at,
    actor: r.actor ?? null,
    fields: parseJson(r.fields, []),
  }));
};

/** What the trigger saw is only needed until Jira's own history carries it: older rows of the project go. */
export const pruneIssueChanges = async (projectKey, before) => {
  const res = await execute('DELETE FROM issue_changes WHERE project_key = ? AND changed_at < ?', [projectKey, before]);
  return res.affectedRows;
};
