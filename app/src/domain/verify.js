// [A] Verify checks V1–V5 and the overall result (PRODUCT §3.5, §4.5). Pure.
// Contract: typedefs `SealedValue`, `DomainVerify` in src/contract.js.
import {
  ANCHOR_MARK,
  CASE_STATE_LOZENGE,
  COUNT_LABEL,
  EVIDENCE_HASH_MAX_BYTES,
  OUTCOME_LOZENGE,
  VERIFY_RESULT,
  VERIFY_RESULT_TEXT,
  WAIVER_NOT_INDEPENDENT,
} from '../contract.js';
import { formatDay, formatDayTime, plural, staleReasonNote } from '../lib/format.js';
import { ZERO_SEAL, sha256Hex } from './seal.js';
import { buildsOfPayload, buildsTested } from './buildWords.js';

/** @typedef {import('../contract.js').DomainVerify} Api */
/** @typedef {import('../contract.js').SealedValue} SealedValue */
/** @typedef {import('../contract.js').Difference} Difference */

const RESULT_TEXT = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked' };
const CONDITION_STATE_TEXT = { open: 'Open', met: 'Met', overdue: 'Overdue' };
const NOT_CAPTURED = 'not captured';
const NONE = '—';
/** "Found now" for a sealed file whose attachment is gone while another upload carries its name. */
export const EVIDENCE_REPLACED_FOUND = 'another file with the same name';

/** @type {Api['verifySnapshot']} V1: hashes the stored string exactly as sealed. */
export const verifySnapshot = (payloadJson, seal) =>
  sha256Hex(payloadJson) === seal
    ? { ok: true, message: 'The stored record matches its seal' }
    : { ok: false, message: 'The stored record does not match its seal.' };

/** @returns {SealedValue} */
const value = (path, where, text) => ({ path, where, value: String(text) });
/** A value that is a person id: the page prints a mention (or the sample name), never the id. @returns {SealedValue} */
const person = (path, where, id) => ({ path, where, value: String(id), kind: 'person' });

/** Open item id → the issue key or short words a reader recognises. */
export const coverLabel = (id) => {
  const [kind, a, b] = String(id).split(':');
  if (kind === 'case' || kind === 'req' || kind === 'defect') return a;
  if (kind === 'conflict') return `conflict ${b ?? ''}`.trim();
  if (kind === 'overdue') return 'overdue condition';
  return String(id);
};

const caseValues = (c) => {
  const at = (column) => `Evidence · Case ${c.key} · ${column}`;
  const base = `case.${c.key}`;
  const head = [
    value(`${base}.summary`, at('Case'), `${c.key} ${c.summary}`),
    value(`${base}.state`, at('State at signing'), CASE_STATE_LOZENGE[c.state]?.text ?? c.state),
    ...c.staleReasons.flatMap((r, i) => [
      value(`${base}.reason.${i}`, at(`Reason ${i + 1}`), staleReasonNote(r.code, r.at, null)),
      ...(r.by ? [person(`${base}.reason.${i}.by`, at(`Reason ${i + 1}, by`), r.by)] : []),
    ]),
  ];
  if (c.run === null) return head;
  return [
    ...head,
    value(`${base}.result`, at('Result'), RESULT_TEXT[c.run.result] ?? c.run.result),
    value(`${base}.executedAt`, at('Tested'), formatDayTime(c.run.executedAt, null, true)),
    value(`${base}.build`, at('Build'), c.run.build),
    person(`${base}.executedBy`, at('By'), c.run.executedBy),
    ...c.run.evidence.flatMap((e, i) => [
      value(`${base}.evidence.${i}.filename`, at(`Evidence file ${i + 1}`), e.filename),
      value(`${base}.evidence.${i}.sha256`, at(`Evidence file ${i + 1} SHA-256`), e.sha256 ?? NOT_CAPTURED),
    ]),
  ];
};

const unique = (list) => [...new Set(list)];

/**
 * The build line of the record. A build set on the release is printed as sealed. With none set the page says which
 * builds the sealed runs were made on ("Build tested" / "Builds tested"), and nothing when no run names a build.
 * The payload is only read: `payload.build` stays null.
 */
const buildValues = (p) => {
  if (p.build) return [value('build', 'Decision · Build', p.build)];
  const tested = buildsTested(buildsOfPayload(p));
  if (!tested) return [];
  return [value(tested.label === 'Build tested' ? 'buildTested' : 'buildsTested', `Decision · ${tested.label}`, tested.list)];
};

/**
 * @type {Api['sealedValues']} EVERY value the record page prints from the sealed payload, in page order. The page
 * prints nothing else from the record: services/recordPage.js renders from this list alone, and a test proves that
 * the text left outside these values is the same for any two records of the same shape.
 */
export const sealedValues = (payload, seal) => {
  const p = payload;
  const itemKeys = p.items.map((item) => item.requirement.key);
  return [
    // Decision
    value('decision.outcome', 'Decision · Decision', OUTCOME_LOZENGE[p.decision.outcome]?.text ?? p.decision.outcome),
    value('decision.statement', 'Decision · Statement', p.decision.statement),
    person('decision.decidedBy', 'Decision · Decided by', p.decision.decidedBy),
    value('decision.decidedAt', 'Decision · Decided on', formatDayTime(p.decision.decidedAt, null, true)),
    value('release', 'Decision · Release', `${p.release.name} of ${p.project.key}`),
    ...buildValues(p),
    person('request.requestedBy', 'Decision · Requested by', p.request.requestedBy),
    value('request.requestedAt', 'Decision · Requested on', formatDay(p.request.requestedAt, null, true)),
    value('recordNumber', 'Decision · Record', `Record ${p.recordNumber}`),
    // Counts
    ...['proven', 'stale', 'failing', 'unproven'].map((k) =>
      value(`counts.${k}`, `At the moment of signing · ${COUNT_LABEL[k].label}`, p.counts[k])),
    // Conditions
    ...p.conditions.flatMap((c, i) => {
      const at = (column) => `Conditions · Condition ${i + 1} · ${column}`;
      return [
        value(`condition.${i + 1}.text`, at('What must be done'), c.text),
        person(`condition.${i + 1}.owner`, at('Owner'), c.owner),
        value(`condition.${i + 1}.dueDate`, at('Due'), formatDay(c.dueDate, null, true)),
        value(`condition.${i + 1}.covers`, at('Covers'), c.covers.map(coverLabel).join(', ') || NONE),
      ];
    }),
    // Waivers
    ...p.waivers.flatMap((w, i) => {
      const at = (column) => `Waivers · Waiver ${i + 1} · ${column}`;
      return [
        value(`waiver.${i + 1}.coversLabel`, at('What was waived'), w.coversLabel),
        value(`waiver.${i + 1}.reason`, at('Reason'), w.reason),
        w.authorisedBy
          ? person(`waiver.${i + 1}.authorisedBy`, at('Authorised by'), w.authorisedBy)
          : value(`waiver.${i + 1}.authorisedBy`, at('Authorised by'), w.authorisedByName ?? NONE),
        value(`waiver.${i + 1}.reference`, at('Reference'), w.reference || NONE),
        person(`waiver.${i + 1}.recordedBy`, at('Recorded by'), w.recordedBy),
        value(`waiver.${i + 1}.recordedAt`, at('Recorded on'), formatDay(w.recordedAt, null, true)),
        value(`waiver.${i + 1}.independence`, at('Independence'), w.selfRecorded ? WAIVER_NOT_INDEPENDENT : 'Independent'),
      ];
    }),
    // Evidence
    ...p.items.flatMap((item) => [
      value(`req.${item.requirement.key}.summary`, `Evidence · Requirement ${item.requirement.key}`, `${item.requirement.key} ${item.requirement.summary}`),
      ...(item.cases.length === 0
        ? [value(`req.${item.requirement.key}.state`, `Evidence · Requirement ${item.requirement.key} · State at signing`, CASE_STATE_LOZENGE.no_case.text)]
        : item.cases.flatMap(caseValues)),
    ]),
    // Open defects
    ...p.defects.flatMap((d) => {
      const at = (column) => `Open defects · ${d.key} · ${column}`;
      return [
        value(`defect.${d.key}.key`, at('Defect'), d.key),
        value(`defect.${d.key}.priority`, at('Priority'), d.priority ?? NONE),
        value(`defect.${d.key}.summary`, at('Summary'), d.summary),
        value(`defect.${d.key}.status`, at('Status'), d.status),
      ];
    }),
    // Who did what
    ...itemKeys.flatMap((key) => [
      value(`duty.${key}.requirement`, `Who did what · ${key}`, key),
      ...unique(p.duties.builders.filter((f) => f.requirementKey === key).map((f) => f.person)).map((id, i) =>
        person(`duty.${key}.builder.${i}`, `Who did what · ${key} · Built by`, id)),
      ...unique(p.duties.testers.filter((f) => f.requirementKey === key).map((f) => f.person)).map((id, i) =>
        person(`duty.${key}.tester.${i}`, `Who did what · ${key} · Tested by`, id)),
    ]),
    ...p.duties.conflicts.flatMap((c, i) => [
      person(`conflict.${i}.person`, `Who did what · Conflict ${i + 1} · Person`, c.person),
      value(`conflict.${i}.fact`, `Who did what · Conflict ${i + 1}`, c.fact),
    ]),
    // Carried over
    ...p.carriedConditions.flatMap((c, i) => {
      const at = (column) => `Carried over · Condition ${i + 1} · ${column}`;
      return [
        value(`carried.${i}.from`, at('From'), `Record ${c.fromRecord}`),
        value(`carried.${i}.text`, at('Condition'), c.text),
        value(`carried.${i}.state`, at('State at signing'), CONDITION_STATE_TEXT[c.state] ?? c.state),
      ];
    }),
    // Seal
    value('seal', 'Seal · Seal', seal),
    value('prevSeal', 'Seal · Previous', p.prevSeal),
  ];
};

/** Confluence may re-wrap text; runs of whitespace are not a difference. */
const tidy = (text) => String(text).replace(/\s+/g, ' ').trim();
/** For "is the rest of the page the same": white space is ignored altogether. */
const squeeze = (text) => String(text ?? '').replace(/\s+/g, '');
const clip = (text, max = 300) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** What differs between two texts, by whole words: `{was, now}` are the two middles (may be ''). */
const changed = (before, after) => {
  const a = tidy(before).split(' ');
  const b = tidy(after).split(' ');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  const context = a.slice(Math.max(0, start - 4), start).join(' ');
  return {
    was: clip(a.slice(start, a.length - end).join(' ')),
    now: clip(b.slice(start, b.length - end).join(' ')),
    after: context,
  };
};

/**
 * @type {Api['comparePage']} V2, both halves:
 *  1. every sealed value against what the page says in its place;
 *  2. ALL OTHER text of the page (`rest`: headings, labels, anything typed anywhere) against the text the app wrote.
 * `rest` is optional so that callers that only have the values still work: `{expected: string, found: string}`.
 */
export const comparePage = (expected, found, page, rest = null) => {
  if (found === null) return { check: { ok: null, message: 'There is no Confluence page to compare' }, differences: [] };
  const edit = { editedBy: page?.editedBy ?? null, editedAt: page?.editedAt ?? null, version: page?.version ?? null };
  /** @type {Difference[]} */
  const differences = expected
    .filter((e) => found[e.path] === undefined || found[e.path] === null || tidy(found[e.path]) !== tidy(e.value))
    .map((e) => ({ check: 'page', where: e.where, sealed: e.value, found: found[e.path] ?? null, ...edit }));
  if (rest && squeeze(rest.expected) !== squeeze(rest.found)) {
    const part = changed(rest.expected, rest.found);
    differences.push({
      check: 'page',
      where: 'Page text outside the sealed values',
      sealed: part.was || (part.after ? `(nothing after "${part.after}")` : '(nothing)'),
      found: part.now || '(text removed)',
      ...edit,
    });
  }
  const compared = expected.length;
  const check =
    differences.length === 0
      ? {
          ok: true,
          message: rest
            ? `Every value and all other text on the Confluence page match the record (${plural(compared, 'value')})`
            : `Every value on the Confluence page matches the record (${plural(compared, 'value')})`,
          compared,
        }
      : { ok: false, message: `The Confluence page differs from the record in ${plural(differences.length, 'place')}`, compared };
  return { check, differences };
};

/** @returns {Difference} */
const chainDifference = (where, sealed, found) => ({ check: 'chain', where, sealed, found, editedBy: null, editedAt: null, version: null });

/**
 * @type {Api['verifyChain']} V3: this record points at the one before it, and the one after points at this.
 * What it cannot show: that no NEWER record was removed (nothing points forward to a record that is gone).
 */
export const verifyChain = (record, previous, next) => {
  const differences = [];
  const broken = [];
  if (previous === null) {
    if (record.number !== 1 || record.prevSeal !== ZERO_SEAL) {
      const missing = Math.max(record.number - 1, 1);
      broken.push(missing);
      differences.push(chainDifference(`Chain · Record ${record.number} · Previous seal`, record.prevSeal, record.number === 1 ? ZERO_SEAL : null));
    }
  } else if (record.prevSeal !== previous.seal || previous.number !== record.number - 1) {
    broken.push(previous.number);
    differences.push(chainDifference(`Chain · Record ${record.number} · Previous seal`, record.prevSeal, previous.seal));
  }
  if (next !== null && next.prevSeal !== record.seal) {
    broken.push(next.number);
    differences.push(chainDifference(`Chain · Record ${next.number} · Previous seal`, record.seal, next.prevSeal));
  }
  if (broken.length > 0) return { check: { ok: false, message: `The link to Record ${broken[0]} is broken.` }, differences };
  const before = previous === null ? 'This is the first record of the project' : `This record carries the seal of Record ${previous.number}`;
  const after = next === null ? 'no later record exists' : `Record ${next.number} carries the seal of this one`;
  return { check: { ok: true, message: `${before}; ${after}` }, differences };
};

/** Every sealed evidence file with its case, in the record's own order. */
const sealedFiles = (payload) =>
  payload.items.flatMap((item) =>
    item.cases.flatMap((c) => (c.run ? c.run.evidence.map((file) => ({ caseKey: c.key, passed: c.run.result === 'passed', file })) : [])));

/**
 * V4, which bytes to read again and in what order: the attachment ids of the sealed files that have a hash and are
 * small enough to download. Files of PASSED runs come first (a pass is what the decision rested on), then the rest,
 * each in the record's order. `start` turns the list, so that a check that ran out of time carries on where the last
 * one stopped instead of reading the same first files again.
 * @param {import('../contract.js').RecordPayload} payload
 * @param {number} [start]   how many files of the list earlier checks already read
 * @returns {string[]}
 */
export const evidenceReadOrder = (payload, start = 0) => {
  const readable = sealedFiles(payload).filter((f) => f.file.sha256 !== null && !(f.file.size > EVIDENCE_HASH_MAX_BYTES));
  const ids = unique([...readable.filter((f) => f.passed), ...readable.filter((f) => !f.passed)].map((f) => String(f.file.attachmentId)));
  const from = ids.length > 0 && Number.isInteger(start) ? ((start % ids.length) + ids.length) % ids.length : 0;
  return [...ids.slice(from), ...ids.slice(0, from)];
};

/**
 * Where the next check starts: after the files that were read without a gap from the front of `order`. A file that
 * could not be read is where the next check begins.
 * @param {string[]} order   as given by evidenceReadOrder(payload, start)
 * @param {Record<string, {attachmentId: string, sha256?: string|null}[]>} live
 * @param {number} [start]
 */
export const evidenceNextStart = (order, live, start = 0) => {
  if (order.length === 0) return 0;
  const read = new Set(Object.values(live ?? {}).flat().filter((f) => typeof f.sha256 === 'string').map((f) => String(f.attachmentId)));
  let done = 0;
  while (done < order.length && read.has(order[done])) done += 1;
  return ((Number.isInteger(start) ? start : 0) + done) % order.length;
};

/**
 * @type {Api['verifyEvidence']} V4, two checks and a sentence that says how far each went:
 *  1. EVERY sealed file: its attachment id is still on the case, with the same name and size. Jira cannot change an
 *     attachment in place (a changed file is a deleted one plus a new upload with a new id), so this is a sound check
 *     that needs no download.
 *  2. As many files as the caller had time for: the bytes read again and hashed (`sha256` a string in `live`).
 * A file that was not read again is never called "unchanged": the sentence says how many were read. `unread: true`
 * marks a file whose download was tried and failed; then the check did not run for it (ok null).
 * A failed check carries `files`: how many sealed files are missing, were replaced (gone, another upload has the
 * name) or have changed, so that the heading and the sentence under it (evidenceWords) agree with the check line.
 */
export const verifyEvidence = (payload, live) => {
  if (live === null) return { check: { ok: null, message: 'The evidence files could not be read' }, differences: [] };
  const sealed = sealedFiles(payload);
  let reread = 0;
  let failed = 0;
  let noHash = 0;
  let notRead = 0;
  let large = 0;
  const files = { missing: 0, replaced: 0, changed: 0 };
  const problems = sealed.flatMap(({ caseKey, file }) => {
    const onCase = live[caseKey] ?? [];
    const now = onCase.find((f) => String(f.attachmentId) === String(file.attachmentId));
    const where = `Evidence · Case ${caseKey} · ${file.filename}`;
    const base = { check: 'evidence', where, sealed: file.sha256 ?? file.filename, editedBy: null, editedAt: null, version: null };
    if (!now) {
      const sameName = onCase.some((f) => f.filename === file.filename);
      files[sameName ? 'replaced' : 'missing'] += 1;
      return [{
        difference: { ...base, found: sameName ? EVIDENCE_REPLACED_FOUND : null },
        sentence: sameName
          ? `Evidence file ${file.filename} on ${caseKey} was replaced: the file that was sealed is gone and another file with the same name is there now.`
          : `Evidence file ${file.filename} is missing from ${caseKey}.`,
      }];
    }
    const otherName = now.filename !== undefined && now.filename !== file.filename;
    const otherSize = Number.isFinite(now.size) && Number.isFinite(file.size) && now.size !== file.size;
    const otherBytes = typeof now.sha256 === 'string' && file.sha256 !== null && now.sha256 !== file.sha256;
    if (otherName || otherSize || otherBytes) {
      files.changed += 1;
      return [{
        difference: { ...base, found: otherBytes ? now.sha256 : `${now.filename}, ${now.size} bytes` },
        sentence: `Evidence file ${file.filename} on ${caseKey} has changed.`,
      }];
    }
    if (file.sha256 === null) noHash += 1;
    else if (typeof now.sha256 === 'string') reread += 1;
    else if (now.unread) failed += 1;
    else if (file.size > EVIDENCE_HASH_MAX_BYTES) large += 1;
    else notRead += 1;
    return [];
  });
  const total = sealed.length;
  const present = total - problems.length;
  const hashless = noHash > 0 ? `${plural(noHash, 'file')} had no hash at signing and can only be shown to exist` : null;
  let summary;
  if (total === 0) summary = 'Evidence: no evidence files were sealed with this record';
  else if (failed === 0 && notRead === 0 && large === 0) {
    // Every file that has a hash was read again in full: the sentence of a small record.
    summary = `Evidence: ${reread} of ${plural(total, 'file')} present and unchanged${hashless ? `; ${hashless}` : ''}`;
  } else {
    summary = [
      `Evidence: ${present} of ${plural(total, 'file')} present with the same name and size`,
      reread > 0 ? `the bytes of ${reread} were read again and match` : 'no bytes were read again in this check',
      failed > 0 ? `${plural(failed, 'file')} could not be read now (Jira did not answer)` : null,
      large > 0 ? `${plural(large, 'file')} too large to read again` : null,
      hashless,
      failed === 0 && notRead > 0 && problems.length === 0 ? 'Verify again reads the next ones' : null,
    ].filter(Boolean).join('; ');
  }
  if (problems.length > 0) {
    return {
      check: { ok: false, message: problems.length === 1 ? problems[0].sentence : summary, compared: total, files },
      differences: problems.map((p) => p.difference),
    };
  }
  return { check: { ok: failed > 0 ? null : true, message: summary, compared: total }, differences: [] };
};

/** The text of the Jira comment that anchors a seal (check V5). One line, easy to read back. */
export const anchorText = ({ recordNumber, releaseName, outcome, seal, prevSeal }) =>
  `${ANCHOR_MARK} · Record ${recordNumber} · Release ${releaseName} · ${OUTCOME_LOZENGE[outcome]?.text ?? outcome}\n` +
  `Seal (SHA-256): ${seal}\nPrevious seal: ${prevSeal}\n` +
  'I signed this decision. This comment was posted under my own account at the moment of signing; Jira, not the app, keeps its author and time. An edit to it shows as edited.';

/**
 * V5: the seal as the signer posted it in a Jira comment, against the stored record. The comment's author and time
 * belong to Jira, so a record rewritten later (even by the app's own storage) no longer agrees with it.
 * @param {{seal: string, decidedById: string, decidedAt: string, anchorIssue: string|null}} record
 * @param {{text: string, authorId: string|null, updateAuthorId?: string|null, created: string|null, updated: string|null}|null|undefined} comment
 *   null = the comment is gone; undefined = it could not be read
 */
export const verifyAnchor = (record, comment) => {
  const none = { editedBy: null, editedAt: null, version: null };
  if (!record.anchorIssue) {
    return record.sample
      ? {
          check: {
            ok: null,
            notApplicable: true,
            message: 'Sample record: it was written by the sample loader, not signed by a person, so no signer posted its seal',
          },
          differences: [],
        }
      : { check: { ok: null, message: 'The seal has not been posted as a Jira comment by the signer yet' }, differences: [] };
  }
  if (comment === undefined) {
    return { check: { ok: null, message: `The Jira comment on ${record.anchorIssue} could not be read` }, differences: [] };
  }
  const where = `Jira comment on ${record.anchorIssue}`;
  if (comment === null) {
    return {
      check: { ok: false, message: `The signer's Jira comment on ${record.anchorIssue} has been deleted.` },
      differences: [{ check: 'anchor', where, sealed: record.seal, found: null, ...none }],
    };
  }
  const differences = [];
  const posted = /Seal \(SHA-256\):\s*([0-9a-f]{64})/.exec(comment.text)?.[1] ?? null;
  if (posted !== record.seal) differences.push({ check: 'anchor', where: `${where} · Seal`, sealed: record.seal, found: posted, ...none });
  if (comment.authorId !== record.decidedById) {
    differences.push({ check: 'anchor', where: `${where} · Author`, sealed: record.decidedById, found: comment.authorId, ...none });
  }
  if (comment.created && comment.updated && comment.updated !== comment.created) {
    differences.push({ check: 'anchor', where: `${where} · Edited after posting`, sealed: comment.created, found: comment.updated, ...none });
  }
  if (differences.length > 0) {
    return { check: { ok: false, message: `The signer's Jira comment on ${record.anchorIssue} does not agree with the record.` }, differences };
  }
  return {
    check: {
      ok: true,
      message: `The seal matches the comment the signer posted on ${record.anchorIssue} on ${formatDayTime(comment.created ?? record.decidedAt, null, true)}`,
    },
    differences: [],
  };
};

/**
 * @type {Api['overallResult']} Broken when a check found a difference. When nothing differs but a check could not run
 * the answer is "not fully checked" — never "intact". `anchor` is optional for callers of the first contract.
 */
export const overallResult = ({ snapshot, page, chain, evidence, anchor }) => {
  const sealChecks = [snapshot, page, chain, ...(anchor ? [anchor] : [])];
  if (sealChecks.some((check) => check.ok === false)) return VERIFY_RESULT.BROKEN;
  if (evidence.ok === false) return VERIFY_RESULT.INTACT_EVIDENCE_MISSING;
  // `notApplicable`: there is nothing to check (no page was ever written; a sample record has no signer).
  if ([...sealChecks, evidence].some((check) => check.ok === null && !check.notApplicable)) return VERIFY_RESULT.NOT_FULLY_CHECKED;
  return VERIFY_RESULT.INTACT;
};

/**
 * The heading and the one sentence under it for a record whose seal holds while its evidence does not, from the
 * counts of the evidence check. "missing" in the heading only when a file is simply gone; a file that was replaced
 * or has changed is "changed". Both happening: the heading says the worse, the sentence says both.
 * @param {{ok: boolean|null, files?: {missing: number, replaced: number, changed: number}}} evidence
 * @returns {{title: string, line: string}|null}  null when the evidence check found no difference
 */
export const evidenceWords = (evidence) => {
  if (!evidence || evidence.ok !== false) return null;
  const { missing = 0, replaced = 0, changed = 0 } = evidence.files ?? {};
  if (missing + replaced + changed === 0) {
    return { title: 'Seal intact, evidence missing', line: 'The record matches its seal, but its evidence files do not all match.' };
  }
  const parts = [
    [missing, 'is missing', 'are missing'],
    [replaced, 'was replaced by another file with the same name', 'were replaced by other files with the same names'],
    [changed, 'has changed', 'have changed'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, one, many], i) => `${i === 0 ? plural(n, 'evidence file') : n} ${n === 1 ? one : many}`);
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return {
    title: missing > 0 ? 'Seal intact, evidence missing' : 'Seal intact, evidence changed',
    line: `The record matches its seal, but ${said}.`,
  };
};

/** The words of a verify result as every screen heads it. Only "evidence missing" depends on what the check found. */
export const resultTitle = (result, evidence) =>
  (result === VERIFY_RESULT.INTACT_EVIDENCE_MISSING ? evidenceWords(evidence)?.title : null) ?? VERIFY_RESULT_TEXT[result] ?? String(result);
