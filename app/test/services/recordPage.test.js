// Page renderer → page reader round trip (PRODUCT §3.5 V2, §4.4). Pure: no @forge/* is loaded.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECORD_SCHEMA, DEFAULT_SETTINGS } from '../../src/contract.js';
import { comparePage, sealedValues, verifySnapshot } from '../../src/domain/verify.js';
import { sealPayload, ZERO_SEAL } from '../../src/domain/seal.js';
import {
  PAGE_FORMAT,
  restPair,
  extractPageValues,
  normaliseCellText,
  pageRest,
  pageValue,
  recordPageTitle,
  renderRecordPage,
} from '../../src/services/recordPage.js';

const HASH = (c) => c.repeat(64);

const run = (id, result, executedBy, evidence) => ({
  id,
  result,
  executedAt: '2026-12-03T10:20:00Z',
  executedBy,
  build: '2.4.0-rc2',
  environment: 'UAT',
  notesHash: HASH('a'),
  evidence,
  snapshot: { requirementTextHash: HASH('b'), caseTextHash: HASH('c') },
});

/** @type {import('../../src/contract.js').RecordPayload} */
const payload = {
  schema: RECORD_SCHEMA,
  site: 'cloud-1',
  project: { id: '10000', key: 'CLM' },
  release: { id: '10002', name: '2.4' },
  build: '2.4.0-rc2',
  recordNumber: 2,
  request: { id: '7', requestedBy: 'sample:P1', requestedAt: '2026-12-08T09:00:00Z', approver: 'acc-1', dueDate: '2026-12-18' },
  decision: {
    outcome: 'accepted_with_conditions',
    statement: 'Accepted for go-live on 14 Dec, provided "CLM-24" is fixed & CLM-18 is re-run.\nSecond line <b>not bold</b>.',
    decidedBy: 'acc-1',
    decidedAt: '2026-12-09T11:42:00Z',
  },
  counts: { proven: 1, stale: 1, failing: 0, unproven: 2 },
  items: [
    {
      requirement: { id: '1', key: 'CLM-9', summary: 'Pay by phone number', textHash: HASH('d'), status: 'Done' },
      cases: [
        {
          id: '2',
          key: 'CLM-17',
          summary: 'Valid number is accepted',
          state: 'passed',
          staleReasons: [],
          run: run('11', 'passed', 'sample:P6', [
            { attachmentId: '501', filename: 'clm-17-run.txt', size: 120, sha256: HASH('e') },
            { attachmentId: '502', filename: 'screen & shot.png', size: 9000, sha256: null },
          ]),
        },
        {
          id: '3',
          key: 'CLM-18',
          summary: 'Number with spaces',
          state: 'passed_then_changed',
          staleReasons: [{ code: 'S4', at: '2026-12-04T08:00:00Z', by: 'sample:P1' }],
          run: run('13', 'passed', 'sample:P6', [{ attachmentId: '503', filename: 'clm-18-run.txt', size: 80, sha256: HASH('f') }]),
        },
        { id: '4', key: 'CLM-22', summary: 'Hardship claimant', state: 'not_run', staleReasons: [], run: null },
      ],
    },
    { requirement: { id: '5', key: 'CLM-10', summary: 'Export', textHash: HASH('1'), status: 'In Progress' }, cases: [] },
  ],
  defects: [{ key: 'CLM-24', summary: 'Numbers with spaces are refused', status: 'In Progress', priority: 'Medium' }],
  duties: {
    builders: [{ person: 'acc-1', requirementKey: 'CLM-9', fact: 'Assignee while In Progress, 1 Dec–4 Dec' }],
    testers: [{ person: 'sample:P6', requirementKey: 'CLM-9', fact: 'Recorded 2 runs, latest 3 Dec' }],
    conflicts: [{ code: 'D1', person: 'acc-1', item: 'CLM-9', fact: 'Assignee of CLM-24 while In Progress' }],
  },
  conditions: [
    { id: '41', text: 'Fix CLM-24 and re-run CLM-18.', owner: 'sample:P4', dueDate: '2026-12-18', covers: ['case:CLM-18:stale', 'defect:CLM-24'], linkedIssue: 'CLM-24' },
    { id: '42', text: 'Run CLM-22 with a hardship test claimant.', owner: 'sample:P6', dueDate: '2026-12-18', covers: ['case:CLM-22:not_run', 'req:CLM-10:no_case'], linkedIssue: null },
  ],
  waivers: [
    {
      id: '9',
      covers: 'conflict:D1:acc-1:CLM-9',
      coversLabel: 'Conflict: Sangnan Wu was the assignee of CLM-24',
      reason: 'No other approver is available before go-live.',
      authorisedBy: null,
      authorisedByName: 'Ingrid Solberg, Quality officer',
      reference: 'QA-2026-112',
      recordedBy: 'acc-1',
      recordedAt: '2026-12-09T11:30:00Z',
      selfRecorded: true,
    },
  ],
  carriedConditions: [{ id: '2', fromRecord: 1, text: 'Deliver CLM-6, the override audit export.', state: 'overdue' }],
  rules: { ...DEFAULT_SETTINGS.rules },
  prevSeal: HASH('7'),
};

const { seal, json } = sealPayload(payload);
/** @type {import('../../src/contract.js').AcceptanceRecord} */
const record = {
  id: '2',
  projectKey: 'CLM',
  number: 2,
  releaseId: '10002',
  releaseName: '2.4',
  outcome: 'accepted_with_conditions',
  decidedBy: { id: 'acc-1', name: 'Sangnan Wu', kind: 'jira' },
  decidedAt: payload.decision.decidedAt,
  seal,
  prevSeal: payload.prevSeal,
  payload,
  payloadJson: json,
  pageId: null,
  pageUrl: null,
  pageStatus: 'none',
  pageError: null,
  sample: false,
};
const people = {
  'acc-1': { id: 'acc-1', name: 'Sangnan Wu', kind: 'jira' },
  'sample:P1': { id: 'sample:P1', name: 'Priya Raman', kind: 'sample' },
  'sample:P4': { id: 'sample:P4', name: 'Aisha Bello', kind: 'sample' },
  'sample:P6': { id: 'sample:P6', name: 'Mei-Ling Chow', kind: 'sample' },
};
const OPTS = {
  macro: { appId: 'app-id', environmentId: 'env-id' },
  projectName: 'ClaimPoint',
  siteUrl: 'https://example.atlassian.net',
};

const sealed = sealedValues(payload, seal);
/** What V2 compares the page with: the sealed values as the page prints them (a person id is never printed). */
const expected = sealed.map((sv) => ({ ...sv, value: pageValue(sv, people) }));
const storage = renderRecordPage(record, people, sealed, OPTS);
const PAGE = { editedBy: { id: 'acc-2', name: 'Someone Else', kind: 'jira' }, editedAt: '2026-12-12T09:14:00Z', version: 3 };

/** Replaces the text printed for one path, leaving every tag in place. */
const tamper = (body, path, from, to) => {
  const mark = `cs:${path}</ac:parameter></ac:structured-macro>`;
  const at = body.indexOf(mark);
  assert.ok(at >= 0, `path ${path} is on the page`);
  const start = at + mark.length;
  assert.equal(body.slice(start, start + from.length), from);
  return body.slice(0, start) + to + body.slice(start + from.length);
};

test('title follows PRODUCT 4.4', () => {
  assert.equal(recordPageTitle(record, 'ClaimPoint'), 'Acceptance record 2 — ClaimPoint 2.4 — Accepted with conditions');
});

test('every sealed value is printed once and read back unchanged', () => {
  assert.ok(expected.length > 20);
  assert.equal(new Set(expected.map((v) => v.path)).size, expected.length);
  const { values, hasSealPanel } = extractPageValues(storage);
  assert.equal(hasSealPanel, true);
  assert.deepEqual(Object.keys(values).sort(), expected.map((v) => v.path).sort());
  for (const v of expected) assert.equal(values[v.path], normaliseCellText(v.value), v.path);
  assert.equal(values['case.CLM-17.executedBy'], 'Mei-Ling Chow (Sample)');
  const { check, differences } = comparePage(expected, values, PAGE);
  assert.equal(check.ok, true);
  assert.equal(check.compared, expected.length);
  assert.deepEqual(differences, []);
});

test('the page reads without the app: names, links and the plain sections are there', () => {
  assert.match(storage, /<h2>Decision<\/h2>/);
  assert.match(storage, /<h2>Evidence<\/h2>/);
  assert.match(storage, /Mei-Ling Chow \(Sample\)/);
  assert.match(storage, /href="https:\/\/example\.atlassian\.net\/browse\/CLM-18"/);
  assert.match(storage, />Not independent</);
  assert.match(storage, /"Not independent" means the waiver was recorded by the person who signed\./);
  assert.match(storage, /\(the seal of Record 1\)/);
  assert.match(storage, /tamper-evident, not tamper-proof/);
  assert.ok(!/\bsafe\b|cannot be edited|tamper-proof(?!:)|immutable/i.test(storage.replace('not tamper-proof', '')), 'no promise the seal cannot keep');
  assert.ok(!storage.includes('<b>not bold</b>'), 'text is escaped');
});

// ── The build line (SPEC decision 11: the sample sets no build) ─────────────────────────────────────────────────

/** The same record sealed with no build set; `builds` gives each run its build in case order. */
const withoutBuild = (builds) => {
  let n = 0;
  const p = {
    ...payload,
    build: null,
    items: payload.items.map((item) => ({
      ...item,
      cases: item.cases.map((c) => {
        if (!c.run) return c;
        const build = builds[Math.min(n, builds.length - 1)];
        n += 1;
        return build === undefined ? { ...c, run: null } : { ...c, run: { ...c.run, build } };
      }),
    })),
  };
  const sealedNow = sealPayload(p);
  const values = sealedValues(p, sealedNow.seal);
  const body = renderRecordPage({ ...record, payload: p, seal: sealedNow.seal, payloadJson: sealedNow.json }, people, values, OPTS);
  return { p, values, body, row: /<th>(Builds? tested|Build)<\/th><td>([\s\S]*?)<\/td>/.exec(body), ...sealedNow };
};
const plainText = (html) => html.replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/g, '').replace(/<[^>]+>/g, '');

test('page format 4: a page written in an older format is not compared (services/verify offers Restore)', () => {
  assert.equal(PAGE_FORMAT, 4);
});

test('a build set on the release is printed as before: "Build", the build', () => {
  const row = /<th>(Builds? tested|Build)<\/th><td>([\s\S]*?)<\/td>/.exec(storage);
  assert.equal(row[1], 'Build');
  assert.equal(plainText(row[2]), '2.4.0-rc2');
  assert.equal(extractPageValues(storage).values.build, '2.4.0-rc2');
});

test('no build set: the page says which builds were tested and never "Not set"', () => {
  const two = withoutBuild(['2.4.0-rc2', '2.4.0-rc1']);
  assert.equal(two.row[1], 'Builds tested');
  assert.equal(plainText(two.row[2]), '2.4.0-rc1, 2.4.0-rc2');
  assert.ok(!/Not set|No build|latest runs were made/.test(two.body));
  const read = extractPageValues(two.body).values;
  assert.equal(read.buildsTested, '2.4.0-rc1, 2.4.0-rc2');
  assert.equal(read.build, undefined);
  // Whole-page check of the new layout: untouched passes, a changed build list is named.
  const want = two.values.map((sv) => ({ ...sv, value: pageValue(sv, people) }));
  assert.equal(check(two.body, two.body, want).check.ok, true);
  const edited = check(tamper(two.body, 'buildsTested', '2.4.0-rc1, 2.4.0-rc2', '2.4.0-rc2'), two.body, want);
  assert.equal(edited.check.ok, false);
  assert.deepEqual(edited.differences.map((d) => d.where), ['Decision · Builds tested']);

  const one = withoutBuild(['2.4.0-rc2']);
  assert.equal(one.row[1], 'Build tested');
  assert.equal(plainText(one.row[2]), '2.4.0-rc2');
  assert.equal(extractPageValues(one.body).values.buildTested, '2.4.0-rc2');
});

test('no build set and no run: the page has no build row at all', () => {
  const none = withoutBuild([undefined]);
  assert.equal(none.row, null);
  assert.ok(!none.values.some((sv) => /^build/.test(sv.path)));
  assert.ok(!/Other sealed values/.test(none.body));
});

test('the sealed payload is only read: rendering leaves it and its seal as they were', () => {
  const two = withoutBuild(['2.4.0-rc1', '2.4.0-rc2']);
  const before = JSON.stringify(two.p);
  sealedValues(two.p, two.seal);
  assert.equal(JSON.stringify(two.p), before);
  assert.equal(two.p.build, null);
  assert.equal(sealPayload(two.p).seal, two.seal);
  assert.equal(verifySnapshot(two.json, two.seal).ok, true);
});

test('no person id is printed: a sample person is a name, a Jira person is a mention read back as the account id', () => {
  const jiraOwner = { ...payload, conditions: [{ ...payload.conditions[0], owner: 'acc-1' }, payload.conditions[1]] };
  const values = sealedValues(jiraOwner, seal);
  const body = renderRecordPage({ ...record, payload: jiraOwner }, people, values, OPTS);
  assert.ok(!/sample:P\d/.test(body.replace(/<ac:parameter[^>]*>[^<]*<\/ac:parameter>/g, '')), 'no sample id in the text');
  assert.match(body, /<ac:link><ri:user ri:account-id="acc-1" \/><\/ac:link>/);
  const read = extractPageValues(body).values;
  assert.equal(read['condition.1.owner'], 'acc-1');
  assert.equal(read['condition.2.owner'], 'Mei-Ling Chow (Sample)');
  assert.equal(read['case.CLM-17.executedBy'], 'Mei-Ling Chow (Sample)');
  const want = values.map((sv) => ({ ...sv, value: pageValue(sv, people) }));
  assert.equal(comparePage(want, read, PAGE).check.ok, true);

  // The editor adds attributes to a mention; words typed next to it are a difference.
  const saved = body.replace('<ri:user ri:account-id="acc-1" />', '<ri:user ri:local-id="x" ri:account-id="acc-1" ri:userkey="k"></ri:user>');
  assert.equal(extractPageValues(saved).values['condition.1.owner'], 'acc-1');
  const padded = body.replace('<ac:link><ri:user ri:account-id="acc-1" /></ac:link>', '<ac:link><ri:user ri:account-id="acc-1" /></ac:link> and a friend');
  assert.deepEqual(comparePage(want, extractPageValues(padded).values, PAGE).differences.map((d) => d.where), ['Decision · Decided by']);
  const swapped = body.replace('Mei-Ling Chow (Sample)<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">cs-end', 'Priya Raman (Sample)<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">cs-end');
  assert.equal(comparePage(want, extractPageValues(swapped).values, PAGE).differences.length, 1);
});

test('a stale pass says why in words, never a rule code', () => {
  assert.match(storage, /A linked defect was reopened on 4 Dec 2026/);
  assert.ok(!/>S[1-6][,<]/.test(storage));
});

test('a value with no known place is still printed and found', () => {
  const extra = [...sealed, { path: 'future.field', where: 'Somewhere · New', value: 'kept' }];
  const { values } = extractPageValues(renderRecordPage(record, people, extra, OPTS));
  assert.equal(values['future.field'], 'kept');
  assert.equal(comparePage(extra.map((sv) => ({ ...sv, value: pageValue(sv, people) })), values, PAGE).check.ok, true);
});

test('no macro ids → no seal panel, values still found', () => {
  const { values, hasSealPanel } = extractPageValues(renderRecordPage(record, people, sealed));
  assert.equal(hasSealPanel, false);
  assert.equal(comparePage(expected, values, PAGE).check.ok, true);
});

test('tampering one cell names exactly that field', () => {
  const edited = tamper(storage, 'case.CLM-18.result', 'Passed', 'Failed');
  const { values } = extractPageValues(edited);
  const { check, differences } = comparePage(expected, values, PAGE);
  assert.equal(check.ok, false);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].where, 'Evidence · Case CLM-18 · Result');
  assert.equal(differences[0].sealed, 'Passed');
  assert.equal(differences[0].found, 'Failed');
  assert.equal(differences[0].editedBy.name, 'Someone Else');
  assert.equal(differences[0].version, 3);
});

test('tampering the state, a hash, a due date or the statement is found each time', () => {
  const sealedOf = (path) => expected.find((v) => v.path === path).value;
  const cases = [
    ['case.CLM-18.state', 'Passed, then changed', 'Passed'],
    ['case.CLM-17.evidence.0.sha256', HASH('e'), HASH('0')],
    ['condition.1.dueDate', sealedOf('condition.1.dueDate'), '18 Jan 2027'],
    ['decision.statement', 'Accepted for go-live on 14 Dec', 'Accepted for go-live on 21 Dec'],
    ['seal', seal, HASH('9')],
  ];
  for (const [path, from, to] of cases) {
    const { values } = extractPageValues(tamper(storage, path, from, to));
    const { differences } = comparePage(expected, values, PAGE);
    assert.deepEqual(differences.map((d) => d.where), [expected.find((v) => v.path === path).where], path);
  }
});

test('what the Confluence editor does to a saved page is not a difference', () => {
  const saved = storage
    .replace(/<td>([\s\S]*?)<\/td>/g, '<td><p local-id="x">$1</p></td>')
    .replace(/<ac:structured-macro ac:name="anchor" ac:schema-version="1">/g, '<ac:structured-macro ac:name="anchor" ac:schema-version="1" ac:local-id="l-1" ac:macro-id="m-1">')
    .replace(/&quot;/g, '"')
    .replace(/<br \/>/g, '<br/>')
    .replace(/Accepted for go-live/g, 'Accepted&nbsp;for  go-live');
  const { values } = extractPageValues(saved);
  assert.equal(comparePage(expected, values, PAGE).check.ok, true);
});

test('a deleted row is reported as missing, and a removed panel is noticed', () => {
  const rowStart = storage.indexOf('<tr>', storage.lastIndexOf('<tr>', storage.indexOf('cs:case.CLM-22.state')));
  const rowEnd = storage.indexOf('</tr>', rowStart) + '</tr>'.length;
  const cut = storage.slice(0, rowStart) + storage.slice(rowEnd);
  const { values } = extractPageValues(cut);
  const { differences } = comparePage(expected, values, PAGE);
  assert.deepEqual(differences.map((d) => [d.where, d.found]), [
    ['Evidence · Case CLM-22 · Case', null],
    ['Evidence · Case CLM-22 · State at signing', null],
  ]);

  const noPanel = storage.replace(/<ac:adf-extension>[\s\S]*?<\/ac:adf-extension>/, '');
  assert.equal(extractPageValues(noPanel).hasSealPanel, false);
});

// ── The whole page is checked (REVIEW-1 B4, B5, B6) ────────────────────────────────────────────────────────────

/** V2 as services/verify runs it: the sealed values, and all other text of the page against a fresh render. */
const check = (body, fresh = storage, want = expected) =>
  comparePage(want, extractPageValues(body).values, PAGE, { expected: pageRest(fresh), found: pageRest(body) });
const OUTSIDE = 'Page text outside the sealed values';

test('an untouched page passes the whole-page check', () => {
  const { check: c, differences } = check(storage);
  assert.deepEqual(differences, []);
  assert.equal(c.message, `Every value and all other text on the Confluence page match the record (${expected.length} values)`);
});

test('B4: every piece of text printed on the page is covered — change any one of them and Verify reports it', () => {
  const tokens = storage.split(/(<[^>]*>)/);
  let inPanel = false;
  let inParameter = false;
  let texts = 0;
  tokens.forEach((token, i) => {
    if (token.startsWith('<')) {
      if (token.startsWith('<ac:adf-extension')) inPanel = true;
      if (token.startsWith('</ac:adf-extension')) inPanel = false;
      if (token.startsWith('<ac:parameter')) inParameter = true;
      if (token.startsWith('</ac:parameter')) inParameter = false;
      return;
    }
    // The live panel's own settings and the names of the invisible anchors are not printed text.
    if (inPanel || inParameter || token.trim() === '') return;
    texts += 1;
    const edited = [...tokens.slice(0, i), `${token}x`, ...tokens.slice(i + 1)].join('');
    assert.equal(check(edited).check.ok, false, `printed text not covered by verification: "${token}"`);
    if (token.trim().length > 1) {
      const shortened = [...tokens.slice(0, i), token.trim().slice(0, -1), ...tokens.slice(i + 1)].join('');
      assert.equal(check(shortened).check.ok, false, `printed text not covered by verification: "${token}"`);
    }
  });
  assert.ok(texts > expected.length, 'the page has more text than the sealed values alone');
});

test('B4: the page prints nothing from the record outside a sealed place — another record leaves the same rest', () => {
  // The same shape with every value changed. Issue keys stay: they name the places and the link targets.
  const PERSON = { 'acc-1': 'acc-2', 'sample:P1': 'sample:P4', 'sample:P4': 'sample:P6', 'sample:P6': 'sample:P1' };
  const change = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => change(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, change(x, k)]));
    if (typeof v === 'number') return v + 7;
    if (typeof v === 'boolean') return !v;
    if (typeof v !== 'string' || ['key', 'code', 'schema', 'requirementKey', 'item'].includes(key)) return v;
    if (PERSON[v]) return PERSON[v];
    if (/^\d{4}-\d\d-\d\d/.test(v)) return v.replace('2026', '2025');
    if (/^[0-9a-f]{64}$/.test(v)) return HASH('9');
    return `Other ${v}`;
  };
  const other = change(payload, '');
  const otherSeal = sealPayload(other).seal;
  const otherValues = sealedValues(other, otherSeal);
  const otherPeople = { ...people, 'acc-2': { id: 'acc-2', name: 'Someone Else', kind: 'jira' } };
  const otherStorage = renderRecordPage({ ...record, number: other.recordNumber, payload: other, seal: otherSeal }, otherPeople, otherValues, OPTS);

  const mine = new Map(expected.map((sv) => [sv.path, sv.value]));
  const same = otherValues.filter((sv) => mine.get(sv.path) === pageValue(sv, otherPeople)).map((sv) => sv.path);
  // Left the same on purpose: the keys, a file with no hash ("not captured") and a requirement with no case.
  const KEPT = /^(duty\.[^.]+\.requirement|defect\.[^.]+\.key|case\.CLM-17\.evidence\.1\.sha256|req\.CLM-10\.state)$/;
  assert.deepEqual(same.filter((p) => !KEPT.test(p)), [], 'every other value differs');
  assert.equal(otherValues.length, sealed.length);
  // The one piece of fixed text that follows the record: which record came before (number − 1; compared with a fresh render).
  const rest = (body) => pageRest(body).replace(/\(the seal of Record \d+\)/, '(the seal of the record before)');
  assert.equal(rest(otherStorage), rest(storage));
});

test('B5: text added, changed or removed anywhere outside the sealed values is "page altered"', () => {
  const where = (body) => check(body).differences.map((d) => d.where);
  const added = `${storage}<p>Addendum: the conditions were waived by the steering group on 20 Dec.</p>`;
  const out = check(added);
  assert.deepEqual(out.differences.map((d) => d.where), [OUTSIDE]);
  assert.match(out.differences[0].found, /Addendum: the conditions were waived/);
  assert.equal(out.differences[0].editedBy.name, 'Someone Else');
  assert.equal(out.check.ok, false);

  assert.deepEqual(where(storage.replace('<h2>Conditions</h2>', '<h2>Conditions (all met)</h2>')), [OUTSIDE], 'a heading');
  assert.deepEqual(where(storage.replace('<th>Due</th>', '<th>Due (extended)</th>')), [OUTSIDE], 'a column header');
  assert.deepEqual(where(storage.replace(/<p>This page is a copy for reading[\s\S]*?<\/p>/, '')), [OUTSIDE], 'the footer removed');
  assert.deepEqual(where(storage.replace('<h2>Waivers</h2>', '<h2>Waivers</h2><p>&nbsp;</p><p>Approved by QA.</p>')), [OUTSIDE], 'a paragraph between sections');
  // In the same cell, after the end of a sealed value.
  const endOfStatement = storage.indexOf('</td>', storage.indexOf('cs:decision.statement'));
  assert.deepEqual(where(`${storage.slice(0, endOfStatement)} (amended)${storage.slice(endOfStatement)}`), [OUTSIDE]);
});

test('B5: a second copy of a sealed place, a picture, a macro or a link that goes elsewhere is reported', () => {
  const where = (body) => check(body).differences.map((d) => d.where);
  const fake = '<p><ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">cs:decision.outcome</ac:parameter></ac:structured-macro>Accepted<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">cs-end</ac:parameter></ac:structured-macro></p>';
  assert.deepEqual(where(storage.replace('<h2>Decision</h2>', `<h2>Decision</h2>${fake}`)), ['Decision · Decision', OUTSIDE], 'a copy placed before the real one');
  assert.deepEqual(where(`${storage}${fake}`), [OUTSIDE], 'a copy placed after the real one');
  assert.deepEqual(where(`${storage}<ac:image><ri:attachment ri:filename="signed.png" /></ac:image>`), [OUTSIDE]);
  assert.deepEqual(where(`${storage}<ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">APPROVED</ac:parameter></ac:structured-macro>`), [OUTSIDE]);
  assert.deepEqual(where(storage.replace('/browse/CLM-18"', '/browse/CLM-99"')), [OUTSIDE], 'the text says CLM-18, the link goes to CLM-99');
});

test('B5: what the Confluence editor does to a saved page does not alter it', () => {
  const saved = storage
    .replace(/<td>([\s\S]*?)<\/td>/g, '<td><p local-id="x">$1</p></td>')
    .replace(/<th>([\s\S]*?)<\/th>/g, '<th><p><strong>$1</strong></p></th>')
    .replace(/<table>/g, '<table data-table-width="1200" data-layout="default" ac:local-id="t">')
    .replace(/<ac:structured-macro ac:name="anchor" ac:schema-version="1">/g, '<ac:structured-macro ac:name="anchor" ac:schema-version="1" ac:local-id="l-1" ac:macro-id="m-1">')
    .replace(/<a href="/g, '<a data-card-appearance="inline" href="')
    .replace(/<br \/>/g, '<br/>')
    .replace(/<\/h2>/g, '</h2>\n')
    .replace(/ of Record 1\)/g, '&nbsp;of  Record 1)');
  assert.notEqual(saved, storage);
  assert.ok(saved.includes('&nbsp;of  Record 1)'));
  assert.deepEqual(check(saved).differences, []);
});

test('B6: typographic characters and every kind of character reference read back as the characters that were sealed', () => {
  const statement = 'Don’t ship “as is” – wait — or… © 2026 × 3 → café <ok> & "done" ’tis 5 > 3';
  const typed = { ...payload, decision: { ...payload.decision, statement } };
  const typedSeal = sealPayload(typed).seal;
  const values = sealedValues(typed, typedSeal);
  const want = values.map((sv) => ({ ...sv, value: pageValue(sv, people) }));
  const body = renderRecordPage({ ...record, payload: typed, seal: typedSeal }, people, values, OPTS);
  assert.equal(extractPageValues(body).values['decision.statement'], statement);
  assert.deepEqual(check(body, body, want).differences, []);

  // Confluence stores these as named references; some editors write numbers.
  const named = { '’': '&rsquo;', '“': '&ldquo;', '”': '&rdquo;', '–': '&ndash;', '—': '&mdash;', '…': '&hellip;', '©': '&copy;', '×': '&times;', '→': '&rarr;', 'é': '&eacute;' };
  const at = body.indexOf('cs:decision.statement');
  const end = body.indexOf('cs-end', at);
  const recode = (table) => body.slice(0, at) + body.slice(at, end).replace(/[’“”–—…©×→é]/g, (ch) => table(ch)) + body.slice(end);
  const asNamed = recode((ch) => named[ch]);
  assert.ok(asNamed.includes('Don&rsquo;t ship &ldquo;as is&rdquo; &ndash; wait &mdash; or&hellip; &copy; 2026 &times; 3 &rarr; caf&eacute;'));
  for (const stored of [asNamed, recode((ch) => `&#${ch.codePointAt(0)};`), recode((ch) => `&#x${ch.codePointAt(0).toString(16)};`)]) {
    assert.equal(extractPageValues(stored).values['decision.statement'], statement);
    assert.deepEqual(check(stored, body, want).differences, []);
  }
  // A real change next to them is still found.
  assert.deepEqual(check(asNamed.replace('caf&eacute;', 'caf&egrave;'), body, want).differences.map((d) => d.where), ['Decision · Statement']);
});

// ── Links and the site's address (the MCP endpoint gives the app no site address) ───────────────────────────────

const SITE = OPTS.siteUrl;
/** The same record as a call WITHOUT a site address renders it: every issue link is site-relative. */
const noSite = renderRecordPage(record, people, sealed, { ...OPTS, siteUrl: '' });
const restOf = (fresh, page, siteUrl) => comparePage(expected, extractPageValues(page).values, PAGE, restPair(fresh, page, siteUrl));

test('the fault seen through MCP: a render without the site address differs from the published page in its links only', () => {
  assert.ok(storage.includes(`href="${SITE}/browse/CLM-9"`));
  assert.ok(noSite.includes('href="/browse/CLM-9"'));
  assert.notEqual(pageRest(noSite), pageRest(storage));
  assert.equal(pageRest(noSite).split(' [links: ')[0], pageRest(storage).split(' [links: ')[0]);
});

test('site address known: the site\'s own links count the same with or without the site in front', () => {
  for (const [fresh, page] of [[storage, storage], [storage, noSite], [noSite, storage]]) {
    const pair = restPair(fresh, page, SITE);
    assert.equal(pair.linksChecked, true);
    assert.equal(pair.expected, pair.found);
    assert.deepEqual(restOf(fresh, page, SITE).differences, []);
  }
  assert.equal(pageRest(storage, { siteUrl: `${SITE}/` }), pageRest(noSite));
});

test('site address known: a link sent to another site, or to another issue, is a difference', () => {
  const elsewhere = storage.replace(`href="${SITE}/browse/CLM-9"`, 'href="https://example.invalid/browse/CLM-9"');
  const lookalike = storage.replace(`href="${SITE}/browse/CLM-9"`, `href="${SITE}.example.invalid/browse/CLM-9"`);
  const otherIssue = storage.replace(`href="${SITE}/browse/CLM-9"`, `href="${SITE}/browse/CLM-1"`);
  for (const page of [elsewhere, lookalike, otherIssue]) {
    assert.notEqual(page, storage);
    assert.deepEqual(restOf(storage, page, SITE).differences.map((d) => d.where), [OUTSIDE]);
    assert.deepEqual(restOf(noSite, page, SITE).differences.map((d) => d.where), [OUTSIDE]);
  }
});

test('site address NOT known: an intact page is never a difference, and is not reported as fully checked', () => {
  const pair = restPair(noSite, storage, '');
  assert.equal(pair.linksChecked, false);
  assert.equal(pair.expected, pair.found);
  assert.deepEqual(restOf(noSite, storage, '').differences, []);
  // Why it is not a full check: a link to another site with the same path cannot be told apart.
  const elsewhere = storage.replace(`href="${SITE}/browse/CLM-9"`, 'href="https://example.invalid/browse/CLM-9"');
  assert.deepEqual(restOf(noSite, elsewhere, '').differences, []);
  assert.deepEqual(restOf(noSite, elsewhere, SITE).differences.map((d) => d.where), [OUTSIDE]);
});

test('site address NOT known: a link to another issue, added text and a changed value are still found', () => {
  const otherIssue = storage.replace(`href="${SITE}/browse/CLM-9"`, `href="${SITE}/browse/CLM-1"`);
  assert.deepEqual(restOf(noSite, otherIssue, '').differences.map((d) => d.where), [OUTSIDE]);
  const typed = storage.replace('<h2>Conditions</h2>', '<h2>Conditions</h2><p>All conditions were lifted.</p>');
  assert.deepEqual(restOf(noSite, typed, '').differences.map((d) => d.where), [OUTSIDE]);
  const edited = tamper(storage, 'case.CLM-18.result', 'Passed', 'Failed');
  assert.deepEqual(restOf(noSite, edited, '').differences.map((d) => d.where), ['Evidence · Case CLM-18 · Result']);
});
