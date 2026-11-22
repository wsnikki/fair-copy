// PRODUCT §3.5: canonical JSON, the seal, the chain Record 1 → Record 2, and Verify V1–V5.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECORD_SCHEMA } from '../../src/contract.js';
import { canonicalize } from '../../src/domain/canonicalJson.js';
import { countStates } from '../../src/domain/caseState.js';
import { ZERO_SEAL, buildPayload, sealPayload, sha256Hex, textHash } from '../../src/domain/seal.js';
import { applyCoverage, openItems } from '../../src/domain/signingRules.js';
import {
  anchorText, comparePage, evidenceNextStart, evidenceReadOrder, evidenceWords, overallResult, resultTitle, sealedValues, verifyAnchor, verifyChain, verifyEvidence, verifySnapshot,
} from '../../src/domain/verify.js';
import { CARRIED, P, RELEASE_24, RULES, assemble, at, evidence, request } from './fixtures.js';

// ── canonical JSON ──────────────────────────────────────────────────────────────────────────────────────────

test('canonical JSON: sorted keys, no whitespace, nested', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, { z: 'x', y: -3 }], '': 0 }), '{"":0,"a":[true,null,{"y":-3,"z":"x"}],"b":1}');
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(canonicalize([]), '[]');
  assert.equal(canonicalize({}), '{}');
  assert.equal(canonicalize(-0), '0');
});

test('canonical JSON: RFC 8785 string escaping and key order by UTF-16 code units', () => {
  // RFC 8785 §3.2.2.2: the sample string serialises with \u000f, \n, \\ and \" escaped, everything else literal.
  assert.equal(canonicalize('\u20ac$\u000f\nA\'B"\\\\"/'), '"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"');
  // RFC 8785 §3.2.3 test vector: expected order of the property names.
  const input = { '\u20ac': 'Euro Sign', '\r': 'Carriage Return', '\ufb33': 'Hebrew Letter Dalet With Dagesh', '1': 'One', '\ud83d\ude00': 'Emoji: Grinning Face', '\u0080': 'Control', '\u00f6': 'Latin Small Letter O With Diaeresis' };
  const order = [...canonicalize(input).matchAll(/:"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['Carriage Return', 'One', 'Control', 'Latin Small Letter O With Diaeresis', 'Euro Sign', 'Emoji: Grinning Face', 'Hebrew Letter Dalet With Dagesh']);
});

test('canonical JSON refuses what cannot be sealed, and says where', () => {
  for (const bad of [1.5, NaN, Infinity, 2 ** 53, undefined, () => 1, Symbol('x'), 10n, new Date(0), new Map()]) {
    assert.throws(() => canonicalize({ a: [bad] }), TypeError);
  }
  assert.throws(() => canonicalize({ run: { size: 0.5 } }), /\$\.run\.size/);
});

test('hashes: SHA-256 of UTF-8; text hash ignores line-ending style and trailing space', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(new TextEncoder().encode('abc')), sha256Hex('abc'));
  assert.equal(textHash('one\r\ntwo  \n'), textHash('one\ntwo'));
  assert.notEqual(textHash('one\ntwo'), textHash('one\ntwo.'));
  assert.equal(ZERO_SEAL, '0'.repeat(64));
});

// ── the two records of DOMAIN §4.6 ──────────────────────────────────────────────────────────────────────────

const RULES_COPY = { ...RULES };

/** Record 1: release 2.3, accepted with conditions by Grace Whitlock on 18 Sep 2026, 2 cases: 1 pass, 1 fail. */
const record1 = () => {
  const aRun = (id, caseKey, requirementKey, when, tester, result, filename) => ({
    id, caseKey, requirementKey, result, notes: '', build: '2.3.0', environment: 'UAT', executedAt: when, executedBy: tester,
    evidence: [evidence(caseKey, filename, 8000 + Number(id))],
    snapshot: { requirementTextHash: textHash(requirementKey), caseTextHash: textHash(caseKey) },
  });
  const aCase = (key, summary, requirementKey, state, latestRun) => ({ id: `2${key.slice(4)}`, key, summary, requirementKey, state, latestRun, staleReasons: [] });
  const requirements = [
    { id: '101', key: 'CLM-1', summary: 'Claimant can track the status of a claim online', textHash: textHash('CLM-1'), status: { name: 'Done', category: 'done' },
      cases: [aCase('CLM-3', 'Claimant sees the correct status and date for a submitted claim', 'CLM-1', 'failed', aRun('101', 'CLM-3', 'CLM-1', at('2026-09-08', '10:00'), P.daniel, 'failed', 'CLM-3-wrong-date.png'))] },
    { id: '102', key: 'CLM-2', summary: 'Caseworker can override a weekly award and must give a reason', textHash: textHash('CLM-2'), status: { name: 'Done', category: 'done' },
      cases: [aCase('CLM-4', 'Override is refused without a reason and saved with one', 'CLM-2', 'passed', aRun('102', 'CLM-4', 'CLM-2', at('2026-09-09', '10:00'), P.meiling, 'passed', 'CLM-4-override.png'))] },
  ];
  const payload = buildPayload({
    site: 'cloud-1', project: { id: '10000', key: 'CLM' },
    release: { ...RELEASE_24, id: '10001', name: '2.3' }, recordNumber: 1,
    request: request(P.grace, { id: '1', requestedAt: at('2026-09-17', '10:00'), dueDate: '2026-09-18' }),
    decision: { outcome: 'accepted_with_conditions', statement: 'Accepted for go-live on 21 Sep with two conditions.', decidedBy: P.grace, decidedAt: at('2026-09-18', '16:10') },
    counts: countStates(requirements), requirements,
    defects: [{ key: 'CLM-5', summary: 'Status tracker shows the wrong date format for claims older than 12 months', status: { name: 'In Progress', category: 'in_progress' }, priority: 'Medium', open: true }],
    duties: { builders: [], testers: [], conflicts: [] },
    conditions: CARRIED, waivers: [], carried: [], rules: RULES_COPY, prevSeal: ZERO_SEAL,
  });
  return { number: 1, payload, ...sealPayload(payload), prevSeal: ZERO_SEAL };
};

/** Record 2: release 2.4 on day zero, Samuel Ortega accepts with two conditions and Ingrid Solberg's waiver. */
const record2 = (prevSeal, o = {}) => {
  const release = assemble({ approver: P.samuel, requester: P.priya });
  const open = openItems({ ...release, conflicts: release.duties.conflicts });
  const conflict = open.find((i) => i.kind === 'conflict');
  const condition = (id, text, owner, covers, linkedIssue) => ({ id, text, owner, dueDate: '2026-12-18', covers, linkedIssue });
  const conditions = [
    condition('11', 'Fix CLM-24 for numbers with spaces and re-run CLM-18 by 18 Dec 2026.', P.aisha, ['case:CLM-18:stale', 'case:CLM-16:stale', 'case:CLM-15:stale'], 'CLM-24'),
    condition('12', 'Run CLM-22 with a hardship test claimant by 18 Dec 2026.', P.meiling, ['case:CLM-22:not_run'], null),
  ];
  const waivers = [{
    id: '5', covers: conflict.id, coversLabel: conflict.label,
    reason: 'No other technical approver is available before go-live. The CLM-24 fix was peer-reviewed by Tomasz Wrobel. Waiver applies to release 2.4 only.',
    authorisedBy: P.ingrid, authorisedByName: null, reference: 'QC-2026-118', recordedBy: P.ingrid, recordedAt: at('2026-12-09', '09:20'), selfRecorded: false,
  }];
  assert.ok(applyCoverage(open, conditions, waivers).every((i) => i.coveredBy !== null));
  const payload = buildPayload({
    site: 'cloud-1', project: { id: '10000', key: 'CLM' }, release: RELEASE_24, recordNumber: 2, request: request(P.samuel),
    decision: { outcome: 'accepted_with_conditions', statement: 'Accepted for go-live on 14 Dec with conditions.', decidedBy: P.samuel, decidedAt: at('2026-12-09', '10:30') },
    counts: release.counts, requirements: o.requirements ?? release.requirements, defects: release.defects, duties: release.duties,
    conditions, waivers, carried: release.carried, rules: RULES_COPY, prevSeal,
  });
  return { number: 2, payload, ...sealPayload(payload), prevSeal };
};

const r1 = record1();
const r2 = record2(r1.seal);
const pageOf = (record) => Object.fromEntries(sealedValues(record.payload, record.seal).map((v) => [v.path, v.value]));
const liveEvidenceOf = (record) =>
  Object.fromEntries(record.payload.items.flatMap((i) => i.cases).map((c) => [c.key, c.run ? c.run.evidence.map((e) => ({ ...e })) : []]));
const EDITOR = { editedBy: P.hannah, editedAt: at('2026-12-10', '09:14'), version: 3 };

test('payload: people as ids, texts as hashes, natural key order, nulls, no floats', () => {
  const p = r2.payload;
  assert.equal(p.schema, RECORD_SCHEMA);
  assert.deepEqual(p.items.map((i) => i.requirement.key), ['CLM-7', 'CLM-8', 'CLM-9', 'CLM-10']);
  assert.deepEqual(p.counts, { proven: 8, stale: 3, failing: 0, unproven: 1 });
  assert.deepEqual(p.request, { id: '2', requestedBy: 'sample:P1', requestedAt: '2026-12-08T16:00:00Z', approver: 'sample:P8', dueDate: '2026-12-18' });
  assert.equal(p.decision.decidedBy, 'sample:P8');
  const clm18 = p.items[2].cases[1];
  assert.deepEqual([clm18.key, clm18.state, clm18.run.id, clm18.run.executedBy], ['CLM-18', 'passed_then_changed', '13', 'sample:P6']);
  assert.deepEqual(clm18.staleReasons, [{ code: 'S4', at: '2026-12-04T11:20:00Z', by: 'sample:P6' }]);
  assert.equal(clm18.run.notesHash, textHash('Retest of CLM-24 fix, +prefix number only'));
  assert.deepEqual(Object.keys(clm18.run.snapshot).sort(), ['caseTextHash', 'requirementTextHash']);
  assert.equal(p.items[3].cases[2].run, null); // CLM-22, not run
  assert.equal(p.build, null);
  assert.deepEqual(p.defects.map((d) => d.key), ['CLM-24']);
  assert.deepEqual(p.duties.conflicts, [{ code: 'D1', person: 'sample:P8', item: 'CLM-9', fact: 'Assignee while In Progress, since 30 Nov' }]);
  assert.deepEqual(p.conditions[0].covers, ['case:CLM-15:stale', 'case:CLM-16:stale', 'case:CLM-18:stale']);
  assert.deepEqual([p.waivers[0].authorisedBy, p.waivers[0].recordedBy, p.waivers[0].selfRecorded], ['sample:P9', 'sample:P9', false]);
  assert.deepEqual(p.carriedConditions.map((c) => [c.id, c.fromRecord, c.state]), [['1', 1, 'met'], ['2', 1, 'overdue']]);
  // People are ids wherever the payload names a person. (A waiver's label and reason are sealed as written.)
  assert.ok(!r2.json.includes('Mei-Ling Chow') && !r2.json.includes('Daniel Okafor') && !r2.json.includes('Priya Raman'), 'testers and requester are ids');
  assert.deepEqual(JSON.parse(r2.json), p, 'the sealed string holds exactly the payload');
});

test('seal: deterministic, 64 hex characters, changes with any single character', () => {
  assert.match(r2.seal, /^[0-9a-f]{64}$/);
  assert.equal(r2.seal, sha256Hex(r2.json));
  assert.equal(record2(r1.seal).seal, r2.seal, 'same facts, same seal');
  const reordered = assemble({ approver: P.samuel, requester: P.priya }).requirements.reverse();
  assert.equal(record2(r1.seal, { requirements: reordered }).seal, r2.seal, 'input order does not matter');
  const touched = structuredClone(r2.payload);
  touched.decision.statement += ' ';
  assert.notEqual(sealPayload(touched).seal, r2.seal);
});

test('chain: Record 1 starts at 64 zeros, Record 2 carries the seal of Record 1', () => {
  assert.equal(r1.payload.prevSeal, ZERO_SEAL);
  assert.equal(r2.payload.prevSeal, r1.seal);
  assert.deepEqual(verifyChain(r1, null, r2), {
    check: { ok: true, message: 'This is the first record of the project; Record 2 carries the seal of this one' },
    differences: [],
  });
  assert.deepEqual(verifyChain(r2, r1, null), {
    check: { ok: true, message: 'This record carries the seal of Record 1; no later record exists' },
    differences: [],
  });
});

test('chain: rewriting Record 1 breaks the link at the exact record', () => {
  const rewritten = structuredClone(r1.payload);
  rewritten.items[0].cases[0].state = 'passed'; // someone turns the 2.3 failure into a pass and reseals it
  const forged = { number: 1, prevSeal: ZERO_SEAL, ...sealPayload(rewritten) };
  assert.notEqual(forged.seal, r1.seal);

  const from2 = verifyChain(r2, forged, null);
  assert.equal(from2.check.ok, false);
  assert.equal(from2.check.message, 'The link to Record 1 is broken.');
  assert.deepEqual(from2.differences, [{
    check: 'chain', where: 'Chain · Record 2 · Previous seal', sealed: r1.seal, found: forged.seal, editedBy: null, editedAt: null, version: null,
  }]);
  assert.equal(verifyChain(forged, null, r2).check.message, 'The link to Record 2 is broken.');

  assert.equal(verifyChain(r2, null, null).check.ok, false, 'Record 2 with nothing before it');
  assert.equal(verifyChain({ ...r1, prevSeal: r2.seal }, null, null).check.ok, false, 'Record 1 must start at zeros');
  assert.equal(verifyChain({ ...r2, number: 3 }, r1, null).check.ok, false, 'a record is missing in between');
});

test('V1: the stored record against its seal', () => {
  assert.deepEqual(verifySnapshot(r2.json, r2.seal), { ok: true, message: 'The stored record matches its seal' });
  const edited = r2.json.replace('"result":"passed"', '"result":"failed"');
  assert.notEqual(edited, r2.json);
  assert.deepEqual(verifySnapshot(edited, r2.seal), { ok: false, message: 'The stored record does not match its seal.' });
});

test('V2: an untouched page matches, value by value', () => {
  const expected = sealedValues(r2.payload, r2.seal);
  assert.equal(new Set(expected.map((v) => v.path)).size, expected.length, 'paths are unique');
  assert.ok(expected.every((v) => typeof v.value === 'string'));
  const byPath = pageOf(r2);
  assert.equal(byPath['decision.outcome'], 'Accepted with conditions');
  assert.equal(byPath['counts.stale'], '3');
  assert.equal(byPath['case.CLM-18.state'], 'Passed, then changed');
  assert.equal(byPath['case.CLM-18.result'], 'Passed');
  assert.equal(byPath['case.CLM-18.executedAt'], '3 Dec 2026, 10:20 UTC');
  assert.equal(byPath['case.CLM-18.executedBy'], 'sample:P6');
  assert.equal(byPath['case.CLM-18.evidence.0.filename'], 'CLM-18-sms-retest.png');
  assert.equal(byPath['case.CLM-22.state'], 'Not run');
  assert.equal(byPath['case.CLM-22.result'], undefined);
  assert.equal(byPath['condition.2.dueDate'], '18 Dec 2026');
  assert.equal(byPath['waiver.1.reference'], 'QC-2026-118');
  assert.equal(byPath.seal, r2.seal);
  assert.equal(byPath.prevSeal, r1.seal);

  const { check, differences } = comparePage(expected, byPath, { editedBy: null, editedAt: null, version: 1 });
  assert.deepEqual(check, { ok: true, message: `Every value on the Confluence page matches the record (${expected.length} values)`, compared: expected.length });
  assert.deepEqual(differences, []);
  // Confluence re-wrapping a long cell is not an edit.
  const wrapped = { ...byPath, 'waiver.1.reason': byPath['waiver.1.reason'].replace('go-live. ', 'go-live.\n   ') };
  assert.equal(comparePage(expected, wrapped, null).check.ok, true);
});

test('tamper: change run R-13 from Passed to Failed on the page → Broken, naming that field', () => {
  const expected = sealedValues(r2.payload, r2.seal);
  const page = { ...pageOf(r2), 'case.CLM-18.result': 'Failed' };
  const v2 = comparePage(expected, page, EDITOR);
  assert.deepEqual(v2.check, { ok: false, message: 'The Confluence page differs from the record in 1 place', compared: expected.length });
  assert.deepEqual(v2.differences, [{
    check: 'page', where: 'Evidence · Case CLM-18 · Result', sealed: 'Passed', found: 'Failed',
    editedBy: P.hannah, editedAt: '2026-12-10T09:14:00Z', version: 3,
  }]);
  const checks = {
    snapshot: verifySnapshot(r2.json, r2.seal), page: v2.check,
    chain: verifyChain(r2, r1, null).check, evidence: verifyEvidence(r2.payload, liveEvidenceOf(r2)).check,
  };
  assert.equal(overallResult(checks), 'broken');
  assert.equal(checks.snapshot.ok, true, 'the stored record is unchanged: only the copy on the page differs');
});

test('tamper: every single sealed value on the page is caught and named', () => {
  const expected = sealedValues(r2.payload, r2.seal);
  const page = pageOf(r2);
  for (const target of expected) {
    const { check, differences } = comparePage(expected, { ...page, [target.path]: `${target.value}x` }, EDITOR);
    assert.equal(check.ok, false, target.path);
    assert.deepEqual(differences.map((d) => [d.where, d.sealed]), [[target.where, target.value]]);
  }
  const { [expected[0].path]: removed, ...rest } = page;
  const missing = comparePage(expected, rest, EDITOR);
  assert.deepEqual([missing.differences[0].where, missing.differences[0].found], ['Decision · Decision', null]);
  const two = comparePage(expected, { ...rest, seal: ZERO_SEAL }, EDITOR);
  assert.equal(two.check.message, 'The Confluence page differs from the record in 2 places');
});

test('V4 and the overall word: evidence missing → "Intact, evidence missing"', () => {
  const live = liveEvidenceOf(r2);
  const whole = verifyEvidence(r2.payload, live);
  assert.deepEqual(whole, { check: { ok: true, message: 'Evidence: 11 of 11 files present and unchanged', compared: 11 }, differences: [] });

  const gone = verifyEvidence(r2.payload, { ...live, 'CLM-11': [] });
  assert.deepEqual(gone.check, { ok: false, message: 'Evidence file CLM-11-upload-pdf.png is missing from CLM-11.', compared: 11, files: { missing: 1, replaced: 0, changed: 0 } });
  assert.deepEqual(gone.differences.map((d) => [d.check, d.where, d.found]), [['evidence', 'Evidence · Case CLM-11 · CLM-11-upload-pdf.png', null]]);

  const intact = { snapshot: verifySnapshot(r2.json, r2.seal), page: comparePage(sealedValues(r2.payload, r2.seal), pageOf(r2), null).check, chain: verifyChain(r2, r1, null).check };
  assert.equal(overallResult({ ...intact, evidence: whole.check }), 'intact');
  assert.equal(overallResult({ ...intact, evidence: gone.check }), 'intact_evidence_missing');

  const swapped = verifyEvidence(r2.payload, { ...live, 'CLM-11': [{ ...live['CLM-11'][0], sha256: 'a'.repeat(64) }], 'CLM-12': [] });
  assert.equal(swapped.check.message, 'Evidence: 9 of 11 files present and unchanged');
  assert.equal(swapped.differences.length, 2);
  // A file whose download was tried and failed is neither a change nor "unchanged": the check did not run for it.
  const unread = verifyEvidence(r2.payload, { ...live, 'CLM-11': [{ ...live['CLM-11'][0], sha256: null, unread: true }] });
  assert.deepEqual(unread.differences, []);
  assert.equal(unread.check.ok, null);
  assert.equal(
    unread.check.message,
    'Evidence: 11 of 11 files present with the same name and size; the bytes of 10 were read again and match; 1 file could not be read now (Jira did not answer)',
  );
  assert.equal(overallResult({ ...intact, evidence: unread.check }), 'not_fully_checked');
});

test('V4 at any size: every file by id, name and size; the bytes of as many as there was time for', () => {
  const live = liveEvidenceOf(r2);
  const order = evidenceReadOrder(r2.payload);
  assert.equal(order.length, 11);
  // Files of passed runs are read first, then the rest; each id once.
  const runOf = Object.fromEntries(r2.payload.items.flatMap((i) => i.cases).filter((c) => c.run).flatMap((c) => c.run.evidence.map((e) => [e.attachmentId, c.run.result])));
  const results = order.map((id) => runOf[id]);
  assert.equal(results.lastIndexOf('passed') < results.findIndex((r) => r !== 'passed') || results.every((r) => r === 'passed'), true);
  assert.equal(new Set(order).size, 11);
  // The list turns: a check that starts at 4 reads the 5th file first and ends with the first four.
  assert.deepEqual(evidenceReadOrder(r2.payload, 4), [...order.slice(4), ...order.slice(0, 4)]);
  assert.deepEqual(evidenceReadOrder(r2.payload, 15), evidenceReadOrder(r2.payload, 4));
  assert.deepEqual(evidenceReadOrder(r2.payload, 'x'), order);

  /** Jira as it answers when only the first `n` files of `list` were downloaded in time. */
  const readOnly = (list, n) => {
    const read = new Set(list.slice(0, n));
    return Object.fromEntries(Object.entries(live).map(([key, files]) => [key, files.map((f) => (read.has(f.attachmentId) ? f : { ...f, sha256: null }))]));
  };
  const intact = { snapshot: verifySnapshot(r2.json, r2.seal), page: comparePage(sealedValues(r2.payload, r2.seal), pageOf(r2), null).check, chain: verifyChain(r2, r1, null).check };

  // All present, some read again: said exactly, and it is a finished check (not "not fully checked" for ever).
  const some = verifyEvidence(r2.payload, readOnly(order, 4));
  assert.deepEqual(some, {
    check: {
      ok: true,
      message: 'Evidence: 11 of 11 files present with the same name and size; the bytes of 4 were read again and match; Verify again reads the next ones',
      compared: 11,
    },
    differences: [],
  });
  assert.equal(overallResult({ ...intact, evidence: some.check }), 'intact');
  assert.equal(evidenceNextStart(order, readOnly(order, 4), 0), 4);

  // The next check carries on after the fourth file, and the one after that has gone round.
  const second = evidenceReadOrder(r2.payload, 4);
  assert.equal(evidenceNextStart(second, readOnly(second, 5), 4), 9);
  const third = evidenceReadOrder(r2.payload, 9);
  assert.equal(evidenceNextStart(third, readOnly(third, 11), 9), 9, 'every file read: the place does not move');
  assert.equal(verifyEvidence(r2.payload, readOnly(third, 11)).check.message, 'Evidence: 11 of 11 files present and unchanged');
  // A file that failed is where the next check starts; files read after the gap are not counted.
  const gap = readOnly(order, 6);
  const holed = Object.fromEntries(Object.entries(gap).map(([key, files]) => [key, files.map((f) => (f.attachmentId === order[2] ? { ...f, sha256: null, unread: true } : f))]));
  assert.equal(evidenceNextStart(order, holed, 0), 2);
  assert.equal(evidenceNextStart([], {}, 3), 0);

  // No time for any download (a long list of records): still every file by id, name and size.
  const none = verifyEvidence(r2.payload, readOnly(order, 0));
  assert.equal(none.check.ok, true);
  assert.equal(none.check.message, 'Evidence: 11 of 11 files present with the same name and size; no bytes were read again in this check; Verify again reads the next ones');

  // One missing among files that were not all read: named, and the result is "evidence missing".
  const partial = readOnly(order, 4);
  const gone = verifyEvidence(r2.payload, { ...partial, 'CLM-11': [] });
  assert.deepEqual(gone.check, { ok: false, message: 'Evidence file CLM-11-upload-pdf.png is missing from CLM-11.', compared: 11, files: { missing: 1, replaced: 0, changed: 0 } });
  assert.equal(overallResult({ ...intact, evidence: gone.check }), 'intact_evidence_missing');

  // One replaced: Jira gives the new upload a new id, so the sealed id is gone and the name is still there.
  const old = live['CLM-11'][0];
  const replaced = verifyEvidence(r2.payload, { ...partial, 'CLM-11': [{ ...old, attachmentId: '99999', sha256: null }] });
  assert.deepEqual(replaced.check, {
    ok: false,
    message: 'Evidence file CLM-11-upload-pdf.png on CLM-11 was replaced: the file that was sealed is gone and another file with the same name is there now.',
    compared: 11,
    files: { missing: 0, replaced: 1, changed: 0 },
  });
  assert.deepEqual(replaced.differences.map((d) => [d.where, d.sealed, d.found]), [['Evidence · Case CLM-11 · CLM-11-upload-pdf.png', old.sha256, 'another file with the same name']]);
  assert.equal(overallResult({ ...intact, evidence: replaced.check }), 'intact_evidence_missing');

  // Same id with another size or name cannot happen in Jira; if it is ever seen it is a change, without a download.
  const resized = verifyEvidence(r2.payload, { ...partial, 'CLM-11': [{ ...old, size: old.size + 1, sha256: null }] });
  assert.deepEqual([resized.check.ok, resized.check.message], [false, 'Evidence file CLM-11-upload-pdf.png on CLM-11 has changed.']);
  assert.equal(resized.differences[0].found, `CLM-11-upload-pdf.png, ${old.size + 1} bytes`);

  // Two problems: the count sentence, in the words that fit what was read.
  const two = verifyEvidence(r2.payload, { ...partial, 'CLM-11': [], 'CLM-12': [] });
  assert.equal(two.differences.length, 2);
  assert.match(two.check.message, /^Evidence: 9 of 11 files present with the same name and size; the bytes of \d were read again and match$/);
});

test('V4 in words: heading, sentence and "Found now" say the same as the check line (missing, replaced, changed)', () => {
  const live = liveEvidenceOf(r2);
  const old = live['CLM-11'][0];
  const newUpload = { ...old, attachmentId: '99999', sha256: 'b'.repeat(64) };
  const words = (l) => {
    const { check } = verifyEvidence(r2.payload, l);
    return { ...evidenceWords(check), heading: resultTitle('intact_evidence_missing', check) };
  };

  // Deleted: missing everywhere.
  assert.deepEqual(words({ ...live, 'CLM-11': [] }), {
    title: 'Seal intact, evidence missing',
    line: 'The record matches its seal, but 1 evidence file is missing.',
    heading: 'Seal intact, evidence missing',
  });
  // Deleted, then another file uploaded under the same name: "changed", never "missing".
  const replaced = verifyEvidence(r2.payload, { ...live, 'CLM-11': [newUpload] });
  assert.match(replaced.check.message, /was replaced/);
  assert.equal(replaced.differences[0].found, 'another file with the same name');
  assert.deepEqual(words({ ...live, 'CLM-11': [newUpload] }), {
    title: 'Seal intact, evidence changed',
    line: 'The record matches its seal, but 1 evidence file was replaced by another file with the same name.',
    heading: 'Seal intact, evidence changed',
  });
  // Other bytes under the same id: changed.
  assert.deepEqual(evidenceWords(verifyEvidence(r2.payload, { ...live, 'CLM-11': [{ ...old, sha256: 'a'.repeat(64) }] }).check), {
    title: 'Seal intact, evidence changed',
    line: 'The record matches its seal, but 1 evidence file has changed.',
  });
  // Both at once: the heading says missing, the sentence counts each.
  assert.deepEqual(evidenceWords(verifyEvidence(r2.payload, { ...live, 'CLM-11': [newUpload], 'CLM-12': [] }).check), {
    title: 'Seal intact, evidence missing',
    line: 'The record matches its seal, but 1 evidence file is missing and 1 was replaced by another file with the same name.',
  });
  assert.deepEqual(
    evidenceWords({ ok: false, files: { missing: 2, replaced: 2, changed: 1 } }),
    {
      title: 'Seal intact, evidence missing',
      line: 'The record matches its seal, but 2 evidence files are missing, 2 were replaced by other files with the same names and 1 has changed.',
    },
  );
  // Nothing wrong with the evidence: no sentence, and every other result keeps its own heading.
  assert.equal(evidenceWords(verifyEvidence(r2.payload, live).check), null);
  assert.equal(resultTitle('intact', verifyEvidence(r2.payload, live).check), 'Seal intact');
  assert.equal(resultTitle('broken', replaced.check), 'Seal broken');
  assert.equal(resultTitle('not_fully_checked', { ok: null }), 'Not fully checked');
});

test('overall: a check that could not run is "not fully checked", never intact; a difference is broken', () => {
  const yes = { ok: true, message: '' };
  const no = { ok: false, message: '' };
  const unknown = { ok: null, message: '' };
  const nothingToCheck = { ok: null, notApplicable: true, message: '' };
  assert.equal(comparePage(sealedValues(r2.payload, r2.seal), null, null).check.ok, null);
  assert.equal(verifyEvidence(r2.payload, null).check.ok, null);
  assert.equal(overallResult({ snapshot: yes, page: yes, chain: yes, evidence: yes, anchor: yes }), 'intact');
  assert.equal(overallResult({ snapshot: yes, page: unknown, chain: yes, evidence: yes }), 'not_fully_checked');
  assert.equal(overallResult({ snapshot: yes, page: yes, chain: yes, evidence: unknown }), 'not_fully_checked');
  assert.equal(overallResult({ snapshot: yes, page: yes, chain: yes, evidence: yes, anchor: unknown }), 'not_fully_checked');
  assert.equal(overallResult({ snapshot: yes, page: nothingToCheck, chain: yes, evidence: yes, anchor: nothingToCheck }), 'intact', 'no page was ever written');
  assert.equal(overallResult({ snapshot: no, page: yes, chain: yes, evidence: yes }), 'broken');
  assert.equal(overallResult({ snapshot: yes, page: yes, chain: no, evidence: no }), 'broken');
  assert.equal(overallResult({ snapshot: yes, page: yes, chain: yes, evidence: yes, anchor: no }), 'broken');
  assert.equal(overallResult({ snapshot: yes, page: unknown, chain: yes, evidence: no }), 'intact_evidence_missing');
});

test('V5: the seal the signer posted as a Jira comment', () => {
  const record = { seal: r2.seal, decidedById: 'acc-1', decidedAt: at('2026-12-09', '10:30'), anchorIssue: 'CLM-25' };
  const text = anchorText({ recordNumber: 2, releaseName: '2.4', outcome: 'accepted_with_conditions', seal: r2.seal, prevSeal: r1.seal });
  assert.ok(text.includes(r2.seal) && text.includes(r1.seal) && text.includes('Record 2'));
  const comment = { text, authorId: 'acc-1', created: at('2026-12-09', '10:30'), updated: at('2026-12-09', '10:30') };
  assert.equal(verifyAnchor(record, comment).check.ok, true);

  const where = (c) => verifyAnchor(record, c).differences.map((d) => d.where);
  assert.deepEqual(where({ ...comment, text: text.replace(r2.seal, 'a'.repeat(64)) }), ['Jira comment on CLM-25 · Seal']);
  assert.deepEqual(where({ ...comment, text: 'no seal here' }), ['Jira comment on CLM-25 · Seal']);
  assert.deepEqual(where({ ...comment, authorId: 'acc-2' }), ['Jira comment on CLM-25 · Author']);
  assert.deepEqual(where({ ...comment, updated: at('2026-12-10', '08:00') }), ['Jira comment on CLM-25 · Edited after posting']);
  const gone = verifyAnchor(record, null);
  assert.equal(gone.check.ok, false);
  assert.equal(gone.check.message, "The signer's Jira comment on CLM-25 has been deleted.");

  // Not read, not posted yet, and a sample record: none is "matches".
  assert.equal(verifyAnchor(record, undefined).check.ok, null);
  const notPosted = verifyAnchor({ ...record, anchorIssue: null }, undefined).check;
  assert.deepEqual([notPosted.ok, notPosted.notApplicable], [null, undefined]);
  const sample = verifyAnchor({ ...record, anchorIssue: null, sample: true }, undefined).check;
  assert.deepEqual([sample.ok, sample.notApplicable], [null, true]);
});

test('record 1 seals too, and its carried conditions are in it by id', () => {
  assert.equal(verifySnapshot(r1.json, r1.seal).ok, true);
  assert.deepEqual(r1.payload.counts, { proven: 1, stale: 0, failing: 1, unproven: 0 });
  assert.deepEqual(r1.payload.conditions.map((c) => [c.id, c.owner, c.dueDate]), [['1', 'sample:P3', '2026-10-16'], ['2', 'sample:P4', '2026-11-30']]);
  assert.deepEqual(r1.payload.defects.map((d) => d.key), ['CLM-5']);
});
