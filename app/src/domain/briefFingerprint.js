// [A] Fingerprint of the facts an approver read, compared again at signing (B2, PRODUCT §3.4). Pure.
// Contract: typedef `DomainBriefFingerprint` in src/contract.js.
import { compareKeys } from '../lib/format.js';
import { canonicalize } from './canonicalJson.js';
import { sha256Hex } from './seal.js';

/** @typedef {import('../contract.js').DomainBriefFingerprint} Api */

const byKey = (a, b) => compareKeys(a.key, b.key);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const personId = (p) => (p && typeof p === 'object' ? p.id : p) ?? null;

/**
 * @type {Api['briefFingerprint']} Everything that decides or fills the record: the facts, the draft conditions and
 * waivers attached to the request, and the rules in force. Nothing that depends on when the brief was assembled.
 * A draft added or removed, or a rule switched, by anyone while the approver reads → the fingerprint differs → B2.
 */
export const briefFingerprint = (facts) =>
  sha256Hex(
    canonicalize({
      release: { id: String(facts.release.id), build: facts.release.build ?? null },
      requestId: facts.requestId === null || facts.requestId === undefined ? null : String(facts.requestId),
      approverId: facts.approverId ?? null,
      counts: {
        proven: facts.counts.proven,
        stale: facts.counts.stale,
        failing: facts.counts.failing,
        unproven: facts.counts.unproven,
      },
      requirements: [...facts.requirements].sort(byKey).map((r) => ({
        key: r.key,
        textHash: r.textHash,
        cases: [...r.cases].sort(byKey).map((c) => ({
          key: c.key,
          state: c.state,
          runId: c.latestRun ? String(c.latestRun.id) : null,
          staleCodes: c.staleReasons.map((s) => `${s.code}:${s.issueKey}`).sort(),
        })),
      })),
      defects: facts.defects
        .filter((d) => d.open)
        .sort(byKey)
        .map((d) => ({ key: d.key, status: d.status.name, priority: d.priority ?? null })),
      // One conflict per person and duty: the work items behind it are part of what was read.
      conflicts: facts.conflicts.map((c) => [c.id, ...(c.issues ?? [])].join('|')).sort(),
      carried: [...facts.carried].map((c) => ({ id: String(c.id), state: c.state })).sort(byId),
      drafts: {
        conditions: [...(facts.drafts?.conditions ?? [])]
          .map((c) => ({
            id: String(c.id),
            text: c.text,
            owner: personId(c.owner),
            dueDate: c.dueDate,
            covers: [...(c.covers ?? [])].sort(),
            linkedIssue: c.linkedIssue ?? null,
          }))
          .sort(byId),
        waivers: [...(facts.drafts?.waivers ?? [])]
          .map((w) => ({
            id: String(w.id),
            covers: w.covers,
            reason: w.reason,
            authorisedBy: personId(w.authorisedBy),
            authorisedByName: w.authorisedByName ?? null,
            reference: w.reference ?? '',
            recordedBy: personId(w.recordedBy),
          }))
          .sort(byId),
      },
      rules: Object.fromEntries(Object.entries(facts.rules ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    }),
  );
