// [A] SHA-256 seal over the canonical record payload, chained by prevSeal (PRODUCT §3.5). Pure.
// Contract: typedef `DomainSeal` in src/contract.js.
import { createHash } from 'node:crypto';
import { RECORD_SCHEMA } from '../contract.js';
import { compareKeys } from '../lib/format.js';
import { canonicalize } from './canonicalJson.js';

/** @typedef {import('../contract.js').DomainSeal} Api */

/** @type {Api['ZERO_SEAL']} */
export const ZERO_SEAL = '0'.repeat(64);

/** @type {Api['sha256Hex']} Strings are hashed as UTF-8. */
export const sha256Hex = (data) => createHash('sha256').update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data).digest('hex');

/** @type {Api['textHash']} */
export const textHash = (text) => sha256Hex(String(text ?? '').replace(/\r\n/g, '\n').trimEnd());

/** @type {Api['sealPayload']} */
export const sealPayload = (payload) => {
  const json = canonicalize(payload);
  return { seal: sha256Hex(json), json };
};

const byKey = (a, b) => compareKeys(a.key, b.key);
const byText = (pick) => (a, b) => (pick(a) < pick(b) ? -1 : pick(a) > pick(b) ? 1 : 0);
const idOf = (person) => (person ? person.id : null);

const payloadRun = (run) => ({
  id: String(run.id),
  result: run.result,
  executedAt: run.executedAt,
  executedBy: run.executedBy.id,
  build: run.build,
  environment: run.environment,
  notesHash: textHash(run.notes),
  evidence: run.evidence.map((e) => ({ attachmentId: String(e.attachmentId), filename: e.filename, size: e.size, sha256: e.sha256 ?? null })),
  snapshot: { requirementTextHash: run.snapshot.requirementTextHash, caseTextHash: run.snapshot.caseTextHash },
});

const payloadCase = (c) => ({
  id: String(c.id),
  key: c.key,
  summary: c.summary,
  state: c.state,
  staleReasons: c.staleReasons.map((r) => ({ code: r.code, at: r.at ?? null, by: idOf(r.by) })),
  run: c.latestRun ? payloadRun(c.latestRun) : null,
});

const payloadItem = (r) => ({
  requirement: { id: String(r.id), key: r.key, summary: r.summary, textHash: r.textHash, status: r.status.name },
  cases: [...r.cases].sort(byKey).map(payloadCase),
});

const dutyFact = (f) => ({ person: f.person.id, requirementKey: f.requirementKey, fact: f.fact });
const byRequirementThenPerson = (a, b) =>
  compareKeys(a.requirementKey, b.requirementKey) || byText((f) => f.person)(a, b) || byText((f) => f.fact)(a, b);

/** @type {Api['buildPayload']} People → ids, texts → hashes, arrays sorted, null for absent values. */
export const buildPayload = (input) => ({
  schema: RECORD_SCHEMA,
  site: input.site,
  project: { id: String(input.project.id), key: input.project.key },
  release: { id: String(input.release.id), name: input.release.name },
  build: input.release.build ?? null,
  recordNumber: input.recordNumber,
  request: {
    id: String(input.request.id),
    requestedBy: input.request.requestedBy.id,
    requestedAt: input.request.requestedAt,
    approver: input.request.approver.id,
    dueDate: input.request.dueDate,
  },
  decision: {
    outcome: input.decision.outcome,
    statement: input.decision.statement,
    decidedBy: input.decision.decidedBy.id,
    decidedAt: input.decision.decidedAt,
  },
  counts: {
    proven: input.counts.proven,
    stale: input.counts.stale,
    failing: input.counts.failing,
    unproven: input.counts.unproven,
  },
  items: [...input.requirements].sort(byKey).map(payloadItem),
  defects: input.defects
    .filter((d) => d.open)
    .sort(byKey)
    .map((d) => ({ key: d.key, summary: d.summary, status: d.status.name, priority: d.priority ?? null })),
  duties: {
    builders: input.duties.builders.map(dutyFact).sort(byRequirementThenPerson),
    testers: input.duties.testers.map(dutyFact).sort(byRequirementThenPerson),
    conflicts: [...input.duties.conflicts]
      .sort(byText((c) => c.id))
      .map((c) => ({ code: c.code, person: c.person.id, item: c.item, fact: c.fact })),
  },
  conditions: input.conditions.map((c) => ({
    id: String(c.id),
    text: c.text,
    owner: c.owner.id,
    dueDate: c.dueDate,
    covers: [...c.covers].sort(),
    linkedIssue: c.linkedIssue ?? null,
  })),
  waivers: input.waivers.map((w) => ({
    id: String(w.id),
    covers: w.covers,
    coversLabel: w.coversLabel,
    reason: w.reason,
    authorisedBy: idOf(w.authorisedBy),
    authorisedByName: w.authorisedByName ?? null,
    reference: w.reference ?? '',
    recordedBy: w.recordedBy.id,
    recordedAt: w.recordedAt,
    selfRecorded: w.selfRecorded === true,
  })),
  carriedConditions: input.carried.map((c) => ({ id: String(c.id), fromRecord: c.recordNumber ?? 0, text: c.text, state: c.state })),
  rules: { ...input.rules },
  prevSeal: input.prevSeal,
});
