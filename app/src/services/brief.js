// [D] The approver's acceptance brief: Readiness plus the six sections, the fingerprint and the drafts.
// Contract: typedef `ServiceBrief` in src/contract.js.
import { CASE_STATE, NO_CASE, STATUS_CATEGORY } from '../contract.js';
import { formatDay, plural } from '../lib/format.js';
import * as graph from '../clients/graph.js';
import { availability } from '../domain/signingRules.js';
import { briefFingerprint } from '../domain/briefFingerprint.js';
import { conflictSentence } from '../domain/duties.js';
import { assembleRelease } from './readiness.js';

/** @typedef {import('../contract.js').ServiceBrief} Api */

const STILL_OPEN = [CASE_STATE.FAILED, CASE_STATE.BLOCKED, CASE_STATE.NOT_RUN];

const selfLineOf = (readiness) => {
  const me = readiness.viewer;
  const built = readiness.duties.builders.find((f) => f.person.id === me.id);
  if (built) return conflictSentence('D1', { name: me.name, key: built.issueKey, basis: built.basis, you: true });
  const tested = readiness.duties.testers.find((f) => f.person.id === me.id);
  if (tested) return conflictSentence('D2', { name: me.name, key: tested.issueKey, you: true });
  return 'You have not built or tested anything in this release.';
};

/**
 * @param {import('../contract.js').Ctx} ctx
 * @param {Awaited<ReturnType<typeof assembleRelease>>} assembled
 * @returns {Promise<import('../contract.js').Brief>}
 */
const briefFrom = async (ctx, assembled, opts = {}) => {
  const { readiness: r, settings, carried, draft, records } = assembled;
  const now = r.assembledAt;
  const request = r.request;
  const cases = r.requirements.flatMap((req) => req.cases);

  const changes = cases
    .filter((c) => c.state === CASE_STATE.PASSED_THEN_CHANGED)
    .map((c) => ({
      caseKey: c.key,
      caseSummary: c.summary,
      requirementKey: c.requirementKey,
      passedLine: `passed ${formatDay(c.latestRun.executedAt, now)} on ${c.latestRun.build}`,
      reasons: c.staleReasons,
      url: c.url,
    }));

  const open = [];
  for (const state of STILL_OPEN) {
    for (const c of cases.filter((x) => x.state === state)) {
      const run = c.latestRun;
      const line = run ? `${run.notes ? `"${run.notes}" ` : ''}${formatDay(run.executedAt, now)}` : '';
      open.push({ state, key: c.key, summary: c.summary, line, url: c.url });
    }
  }
  for (const req of r.requirements.filter((x) => x.cases.length === 0)) {
    open.push({
      state: NO_CASE,
      key: req.key,
      summary: req.summary,
      line: req.status.category === STATUS_CATEGORY.DONE ? '' : `still ${req.status.name}`,
      url: req.url,
    });
  }

  const viewerIsApprover = Boolean(request) && request.approver.id === r.viewer.id;
  const authorities = settings.people.waiverAuthorities;
  const viewerMayWaive =
    Boolean(request) &&
    (authorities.length === 0 || authorities.includes(r.viewer.id)) &&
    (!viewerIsApprover || settings.people.approverMayRecordOwnWaiver);

  // Drafts that came with a sample request were written by the sample's test lead, not by the approver.
  const proposedParts = [
    [draft.conditions.filter((c) => c.sample).length, 'condition'],
    [draft.waivers.filter((w) => w.recordedBy.kind === 'sample').length, 'waiver'],
  ].filter(([n]) => n > 0);
  const proposed =
    request && request.sample && proposedParts.length > 0
      ? {
          by: request.requestedBy,
          line: `${request.requestedBy.name}${request.requestedBy.kind === 'sample' ? ' (Sample)' : ''} proposed ${proposedParts
            .map(([n, word]) => plural(n, word))
            .join(' and ')} with this request. Keep, edit or remove each one: the decision is yours.`,
        }
      : null;

  // What the Teamwork Graph links to this release: context, never a blocker. Requirements are asked first (the
  // graph answers issue links outward only, and the client asks about the first 20 items).
  const asked = [...r.requirements, ...cases].map((x) => ({ id: x.id, key: x.key }));
  const linked = opts.withGraph === false ? null : await graph.linkedWork(ctx.cloudId, asked);
  const graphSection = graph.graphContext(linked, {
    requirementKeys: r.requirements.map((req) => req.key),
    releaseKeys: [
      ...asked.map((x) => x.key),
      ...r.defects.map((d) => d.key),
      ...r.requirements.flatMap((req) => req.defectKeys ?? []),
    ],
  });


  return {
    ...r,
    fingerprint: briefFingerprint({
      release: { id: r.release.id, build: r.release.build },
      requestId: request ? request.id : null,
      approverId: request ? request.approver.id : null,
      counts: r.counts,
      requirements: r.requirements,
      defects: r.defects,
      conflicts: r.duties.conflicts,
      carried,
      drafts: draft,
      rules: settings.rules,
    }),
    viewerIsApprover,
    intro: request
      ? `${request.approver.name.split(' ')[0]}, you are asked to accept Release ${r.release.name} of ${r.project.name} by ${formatDay(request.dueDate, null, true)}. Requested by ${request.requestedBy.name} on ${formatDay(request.requestedAt, now)}.`
      : '',
    changes,
    open,
    selfLine: selfLineOf(r),
    availability: availability(r.openItems),
    draft,
    proposed,
    viewerMayWaive,
    nextRecordNumber: records.length > 0 ? records[records.length - 1].number + 1 : 1,
    graph: graphSection,
  };
};

/** @type {Api['getBrief']} */
export const getBrief = async (ctx, q) => briefFrom(ctx, await assembleRelease(ctx, q));

/** The brief together with the settings in force, for signing and for drafts (no graph call: it decides nothing). */
export const getBriefWithSettings = async (ctx, q) => {
  const assembled = await assembleRelease(ctx, q);
  return { brief: await briefFrom(ctx, assembled, { withGraph: false }), settings: assembled.settings };
};
