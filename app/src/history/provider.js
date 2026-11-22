// [B] One history model, two sources (SPEC §2.3): the real Jira changelog and the sample ledger.
// Contract: typedef `HistoryProvider` in src/contract.js. The pure parts live in ./normalise.js.
import { getChangelogs, getStatusCategories } from '../clients/jira.js';
import { listLedgerEvents } from '../data/ledger.js';
import { mergeHistory, normaliseChangelog } from './normalise.js';

/** @typedef {import('../contract.js').HistoryProvider} Api */

export { normaliseChangelog };

/** @type {Api['getHistory']} */
export const getHistory = async (issues, opts = {}) => {
  /** @type {Record<string, import('../contract.js').HistoryEvent[]>} */
  const out = Object.fromEntries(issues.map((i) => [i.key, []]));
  if (!issues.length) return out;

  const keys = issues.map((i) => i.key);
  const knownIds = Object.fromEntries(issues.map((i) => [i.id, i.key]));
  const projectKeys = [...new Set(issues.map((i) => i.projectKey))];

  const [changelogs, ledger, categoryMaps] = await Promise.all([
    getChangelogs(keys, knownIds), // throws AppError(HISTORY_UNREADABLE) with the finished sentence
    listLedgerEvents(keys),
    // A status that is not in the map is read from its name, so a failed lookup costs accuracy, not the page.
    Promise.all(projectKeys.map((p) => getStatusCategories(p).catch(() => ({})))),
  ]);

  const categories = Object.fromEntries(projectKeys.map((p, i) => [p, categoryMaps[i]]));
  const ledgerByKey = {};
  for (const event of ledger) (ledgerByKey[event.issueKey] ??= []).push(event);

  for (const issue of issues) {
    const jiraEvents = normaliseChangelog(
      issue,
      changelogs[issue.key] ?? [],
      categories[issue.projectKey] ?? {},
      opts.criteriaField ?? null,
    );
    out[issue.key] = mergeHistory(jiraEvents, ledgerByKey[issue.key] ?? []);
  }
  return out;
};
