// [D] The Confluence acceptance record page (PRODUCT §4.4): render to storage format, read back. PURE: no @forge/*
// import, so app/test/services can load it. services/records.js re-exports the contract functions.
//
// How the page is checked (V2):
//  1. Every value from the sealed record is printed directly after an invisible Confluence anchor macro named
//     `cs:<path>` and closed by an anchor named `cs-end`. extractPageValues walks the anchors and returns
//     path → the text now in that place. The renderer prints NOTHING from the record outside such a pair.
//  2. Everything else on the page — headings, labels, and anything a person types anywhere — is `pageRest`: the page's
//     visible text with the sealed places cut out. It is compared with the rest of a fresh render of the same record.
// Anchors are ordinary page content: they survive the editor, and a reader needs no app.
import { COUNT_LABEL, OUTCOME_LOZENGE, RECORD_SCHEMA, SAMPLE_PERSON_PREFIX } from '../contract.js';
import { BRAND } from '../lib/brand.js';
import { decodeEntities } from '../lib/htmlEntities.js';
import { issuePath } from '../lib/links.js';

/** @typedef {import('../contract.js').SealedValue} SealedValue */

export const PARENT_PAGE_TITLE = 'Acceptance records';
/**
 * Version of the page layout below. Stored in the page property. A page written with another layout is not compared
 * (the fixed text would differ everywhere): Verify says so and offers to write the page again from the sealed record.
 * Raise it whenever this file changes what a page says.
 */
export const PAGE_FORMAT = 4;
/** Key of the Confluence space the app makes for a project's records when no space is chosen: CLM → CLMACC. */
export const recordsSpaceKey = (projectKey) => `${projectKey}ACC`.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export const SEAL_MACRO_KEY = 'countersign-seal';
const ANCHOR_PREFIX = 'cs:';
const ANCHOR_END = 'cs-end';
const DASH = '—';

/** The text of a page cell as it is compared: white space collapsed, ends trimmed. Apply to both sides of V2. */
export const normaliseCellText = (text) =>
  String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const esc = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br />');

const anchor = (name) =>
  `<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">${esc(name)}</ac:parameter></ac:structured-macro>`;

const isSample = (id) => String(id).startsWith(SAMPLE_PERSON_PREFIX);
const sampleLabel = (id, people) => `${people[id]?.name ?? id} (Sample)`;
/** A Confluence mention: it shows the person's current name and keeps the account id in the page. */
const mention = (accountId) => `<ac:link><ri:user ri:account-id="${esc(accountId)}" /></ac:link>`;
const MENTION_RE = /<ac:link\b[^>]*>\s*<ri:user\b[^>]*\bri:account-id="([^"]*)"[^>]*?\/?>(?:\s*<\/ri:user>)?\s*<\/ac:link>/g;

const isPerson = (sv) => sv.kind === 'person';

/**
 * What the page says in the place of a sealed value, and so what V2 compares the page with. A person id is never
 * printed: a sample person reads "Name (Sample)", a Jira person is a mention, which is read back as the account id.
 * Every other value is printed as it was sealed.
 * @param {SealedValue} sv
 * @param {Record<string, import('../contract.js').Person>} people
 * @returns {string}
 */
export const pageValue = (sv, people) => (isPerson(sv) && isSample(sv.value) ? sampleLabel(sv.value, people) : sv.value);

/** One sealed value as page content; `href` makes its text a link (the text stays the sealed value). */
const sealedHtml = (sv, people, href = null) => {
  const text = isPerson(sv) && !isSample(sv.value) ? mention(sv.value) : esc(pageValue(sv, people));
  const inner = href ? `<a href="${esc(href)}">${text}</a>` : text;
  return `${anchor(ANCHOR_PREFIX + sv.path)}${inner}${anchor(ANCHOR_END)}`;
};

/** A cell is HTML, or `{html, rowspan}`; null leaves the place to a cell that spans down from an earlier row. */
const cellHtml = (c) =>
  c === null ? '' : typeof c === 'string' ? `<td>${c}</td>` : `<td rowspan="${c.rowspan}">${c.html}</td>`;
/** Column widths, in proportion: without them Confluence gives "#" as much room as a 64-character hash. */
const columns = (widths) =>
  widths ? `<colgroup>${widths.map((w) => `<col style="width: ${w}.0px;" />`).join('')}</colgroup>` : '';
const table = (head, rows, widths = null) =>
  `<table>${columns(widths)}<tbody>${head ? `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}${rows
    .map((cells) => `<tr>${cells.map(cellHtml).join('')}</tr>`)
    .join('')}</tbody></table>`;

const facts = (rows) =>
  `<table>${columns([220, 900])}<tbody>${rows.map(([label, html]) => `<tr><th>${esc(label)}</th><td>${html}</td></tr>`).join('')}</tbody></table>`;

/** Storage format of the Forge seal macro (the live panel at the top of the page). */
const sealMacro = (macro, recordNumber) => {
  const key = `${macro.appId}/${macro.environmentId}/static/${SEAL_MACRO_KEY}`;
  const localId = `${SEAL_MACRO_KEY}-${recordNumber}`;
  return (
    '<ac:adf-extension><ac:adf-node type="extension">' +
    '<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>' +
    `<ac:adf-attribute key="extension-key">${esc(key)}</ac:adf-attribute>` +
    '<ac:adf-attribute key="parameters">' +
    `<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>` +
    `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${esc(key)}</ac:adf-parameter>` +
    '<ac:adf-parameter key="extension-title">Acceptance seal</ac:adf-parameter>' +
    '</ac:adf-attribute>' +
    '<ac:adf-attribute key="text">Acceptance seal</ac:adf-attribute>' +
    '<ac:adf-attribute key="layout">default</ac:adf-attribute>' +
    `<ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>` +
    '</ac:adf-node></ac:adf-extension>'
  );
};

export const recordPageTitle = (record, projectName) =>
  `Acceptance record ${record.number} — ${projectName} ${record.releaseName} — ${OUTCOME_LOZENGE[record.outcome]?.text ?? record.outcome}`;

/**
 * The page is rendered from `sealedValues` alone (domain/verify.sealedValues — every printed value of the record), plus
 * the few live facts in `opts` that are NOT part of the seal and are printed outside the sealed places:
 * the Jira issue that carries each condition, and the Jira comment where the signer posted the seal.
 * @param {import('../contract.js').AcceptanceRecord} record
 * @param {Record<string, import('../contract.js').Person>} people
 * @param {SealedValue[]} sealedValues
 * @param {{macro?: {appId: string, environmentId: string}|null, siteUrl?: string, conditionIssues?: (string|null)[], anchorIssue?: string|null}} [opts]
 * @returns {string}
 */
export const renderRecordPage = (record, people, sealedValues, opts = {}) => {
  const siteUrl = opts.siteUrl ?? '';
  const byPath = new Map(sealedValues.map((sv) => [sv.path, sv]));
  const used = new Set();
  const browse = (key) => `${siteUrl}${issuePath(key)}`;
  /** The sealed value at `path` as page content; `fallback` when the record has no such value. */
  const v = (path, fallback = DASH, href = null) => {
    const sv = byPath.get(path);
    if (!sv) return fallback;
    used.add(path);
    return sealedHtml(sv, people, href);
  };
  /** Every sealed value whose path starts with `prefix` and continues with a number: prefix.0, prefix.1, … */
  const series = (prefix) => {
    const out = [];
    for (let i = 0; byPath.has(`${prefix}.${i}`); i += 1) out.push(`${prefix}.${i}`);
    return out;
  };
  /** Ids (the path part after `prefix.`) in the order the values come: condition.1, condition.2 → ['1', '2']. */
  const ids = (prefix) => {
    const seen = [];
    const re = new RegExp(`^${prefix}\\.([^.]+)\\.`);
    for (const sv of sealedValues) {
      const m = re.exec(sv.path);
      if (m && !seen.includes(m[1])) seen.push(m[1]);
    }
    return seen;
  };
  const issueKeyOf = (path) => String(byPath.get(path)?.value ?? '').split(' ')[0];
  const plainIssue = (key) => `<a href="${esc(browse(key))}">${esc(key)}</a>`;

  const out = [];
  if (opts.macro?.appId && opts.macro?.environmentId) out.push(sealMacro(opts.macro, record.number));

  // DECISION
  out.push('<h2>Decision</h2>');
  out.push(
    facts([
      ['Decision', v('decision.outcome')],
      ['Statement', v('decision.statement')],
      ['Decided by', v('decision.decidedBy')],
      ['Decided on', v('decision.decidedAt')],
      ['Release', v('release')],
      // One of three sealed values, or none (domain/verify.js buildValues): the build set on the release, or the
      // builds the sealed runs were made on. A record with no build and no run has no build row.
      ...(byPath.has('build')
        ? [['Build', v('build')]]
        : byPath.has('buildTested')
          ? [['Build tested', v('buildTested')]]
          : byPath.has('buildsTested')
            ? [['Builds tested', v('buildsTested')]]
            : []),
      ['Requested by', `${v('request.requestedBy')}, ${v('request.requestedAt')}`],
      ['Record', v('recordNumber')],
    ]),
  );

  // AT THE MOMENT OF SIGNING
  out.push('<h2>At the moment of signing</h2>');
  out.push(
    table(
      ['proven', 'stale', 'failing', 'unproven'].map((k) => COUNT_LABEL[k].label),
      [['proven', 'stale', 'failing', 'unproven'].map((k) => v(`counts.${k}`))],
    ),
  );
  out.push(
    `<p>${esc(`${COUNT_LABEL.stale.label}: a pass recorded before the tested thing changed. It is not counted as a pass.`)}</p>`,
  );

  // CONDITIONS
  out.push('<h2>Conditions</h2>');
  const conditionIds = ids('condition');
  if (conditionIds.length === 0) out.push('<p>No conditions.</p>');
  else {
    out.push(
      table(
        ['#', 'What must be done', 'Owner', 'Due', 'Covers', 'Jira issue (now)'],
        conditionIds.map((g, i) => {
          const live = opts.conditionIssues?.[i] ?? null;
          return [
            String(i + 1),
            v(`condition.${g}.text`),
            v(`condition.${g}.owner`),
            v(`condition.${g}.dueDate`),
            v(`condition.${g}.covers`),
            live ? plainIssue(live) : 'not created',
          ];
        }),
        [50, 420, 200, 130, 220, 130],
      ),
    );
  }

  // WAIVERS
  out.push('<h2>Waivers</h2>');
  const waiverIds = ids('waiver');
  if (waiverIds.length === 0) out.push('<p>No waivers.</p>');
  else {
    out.push(
      table(
        ['#', 'What was waived', 'Reason', 'Authorised by', 'Reference', 'Recorded by', 'Independence'],
        waiverIds.map((g, i) => [
          String(i + 1),
          v(`waiver.${g}.coversLabel`),
          v(`waiver.${g}.reason`),
          v(`waiver.${g}.authorisedBy`),
          v(`waiver.${g}.reference`),
          `${v(`waiver.${g}.recordedBy`)}, ${v(`waiver.${g}.recordedAt`)}`,
          v(`waiver.${g}.independence`),
        ]),
        [50, 250, 300, 170, 120, 170, 130],
      ),
    );
    out.push(
      '<p>"Not independent" means the waiver was recorded by the person who signed. The project\'s settings allow this, and it is printed so that a reader can judge it.</p>',
    );
  }

  // EVIDENCE — requirements in sealed order; each requirement's cases follow it in the list of sealed values.
  out.push('<h2>Evidence</h2>');
  const evidenceRows = [];
  let current = null;
  const groups = [];
  for (const sv of sealedValues) {
    let m = /^req\.([^.]+)\.summary$/.exec(sv.path);
    if (m) {
      current = { key: m[1], cases: [] };
      groups.push(current);
      continue;
    }
    m = /^case\.([^.]+)\.summary$/.exec(sv.path);
    if (m && current) current.cases.push(m[1]);
  }
  for (const group of groups) {
    const reqCell = v(`req.${group.key}.summary`, DASH, browse(group.key));
    if (group.cases.length === 0) {
      evidenceRows.push([reqCell, DASH, v(`req.${group.key}.state`), DASH, DASH, DASH]);
      continue;
    }
    group.cases.forEach((key, index) => {
      const base = `case.${key}`;
      const reasons = series(`${base}.reason`)
        .map((path) => `<br />${v(path)}${byPath.has(`${path}.by`) ? `, by ${v(`${path}.by`)}` : ''}`)
        .join('');
      const files = [];
      for (let n = 0; byPath.has(`${base}.evidence.${n}.filename`); n += 1) {
        files.push(`${v(`${base}.evidence.${n}.filename`)} ${v(`${base}.evidence.${n}.sha256`)}`);
      }
      const hasRun = byPath.has(`${base}.result`);
      evidenceRows.push([
        index === 0 ? { html: reqCell, rowspan: group.cases.length } : null,
        v(`${base}.summary`, DASH, browse(key)),
        `${v(`${base}.state`)}${reasons}`,
        hasRun ? `${v(`${base}.result`)}<br />${v(`${base}.executedAt`)}<br />Build ${v(`${base}.build`)}` : DASH,
        hasRun ? v(`${base}.executedBy`) : DASH,
        files.length ? files.join('<br />') : DASH,
      ]);
    });
  }
  out.push(
    table(['Requirement', 'Case', 'State at signing', 'Latest run', 'By', 'Evidence (SHA-256)'], evidenceRows, [220, 230, 200, 170, 170, 500]),
  );

  // OPEN DEFECTS AT SIGNING
  out.push('<h2>Open defects at signing</h2>');
  const defectIds = ids('defect');
  if (defectIds.length === 0) out.push('<p>No open defects.</p>');
  else {
    out.push(
      table(
        ['Defect', 'Priority', 'Summary', 'Status'],
        defectIds.map((key) => [
          v(`defect.${key}.key`, DASH, browse(key)),
          v(`defect.${key}.priority`),
          v(`defect.${key}.summary`),
          v(`defect.${key}.status`),
        ]),
        [110, 110, 600, 150],
      ),
    );
  }

  // WHO DID WHAT
  out.push('<h2>Who did what</h2>');
  const dutyIds = ids('duty');
  const conflictIds = ids('conflict');
  const list = (prefix) => series(prefix).map((path) => v(path)).join(', ') || DASH;
  if (dutyIds.length > 0) {
    out.push(
      table(
        ['Requirement', 'Built by', 'Tested by'],
        dutyIds.map((key) => [
          v(`duty.${key}.requirement`, DASH, browse(issueKeyOf(`duty.${key}.requirement`))),
          list(`duty.${key}.builder`),
          list(`duty.${key}.tester`),
        ]),
        [150, 500, 500],
      ),
    );
  }
  if (conflictIds.length === 0) out.push('<p>No conflicts.</p>');
  else {
    out.push(
      table(
        ['Conflict', 'Person', 'What the history shows'],
        conflictIds.map((i, n) => [String(n + 1), v(`conflict.${i}.person`), v(`conflict.${i}.fact`)]),
        [90, 300, 760],
      ),
    );
  }

  // CARRIED OVER
  out.push('<h2>Carried over from earlier records</h2>');
  const carriedIds = ids('carried');
  if (carriedIds.length === 0) out.push('<p>No earlier conditions.</p>');
  else {
    out.push(
      table(
        ['From', 'Condition', 'State at signing'],
        carriedIds.map((i) => [v(`carried.${i}.from`), v(`carried.${i}.text`), v(`carried.${i}.state`)]),
        [110, 700, 150],
      ),
    );
  }

  // SEAL
  out.push('<h2>Seal</h2>');
  const firstRecord = record.number <= 1;
  // Plain words, no link to the earlier page: the Confluence editor rewrites a link to another page into its own
  // form on the first save, and the whole-page check would then report a change nobody made.
  const previous = firstRecord ? '(first record of this project)' : `(the seal of Record ${record.number - 1})`;
  out.push(
    facts([
      ['Seal', v('seal')],
      ['Previous', `${v('prevSeal')} ${previous}`],
      ['Method', esc(`SHA-256 over canonical JSON (RFC 8785), schema ${RECORD_SCHEMA}`)],
      [
        'Posted in Jira',
        opts.anchorIssue
          ? `By the signer, as a comment on ${plainIssue(opts.anchorIssue)}. Jira keeps that comment's author and time; the app cannot change them.`
          : 'Not posted.',
      ],
    ]),
  );

  // Anything sealed that has no place above is still printed, so that the page carries every sealed value.
  const rest = sealedValues.filter((sv) => !used.has(sv.path));
  if (rest.length > 0) {
    out.push('<h3>Other sealed values</h3>');
    out.push(
      table(
        ['Where', 'Value'],
        rest.map((sv) => [esc(sv.where), sealedHtml(sv, people)]),
      ),
    );
  }

  out.push(
    `<p>This page is a copy for reading. The sealed record is kept by ${esc(BRAND)} in Jira. The record is tamper-evident, not tamper-proof: ` +
      'the panel at the top compares every value above, and all other text on this page, with the sealed record and names what differs.</p>',
  );
  return out.join('');
};

const ANCHOR_RE = /<ac:structured-macro\b[^>]*\bac:name="anchor"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g;
const PARAM_RE = /<ac:parameter\b[^>]*>([\s\S]*?)<\/ac:parameter>/;
const CELL_END_RE = /<\/t[dh]>/g;
const SEAL_PANEL_RE = /<ac:adf-extension\b[\s\S]*?<\/ac:adf-extension>/g;

/** A mention reads as its account id; everything else as its text. Every HTML character entity is decoded. */
const toText = (html) =>
  normaliseCellText(
    decodeEntities(
      html
        .replace(MENTION_RE, ' $1 ')
        .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/t[dh]>|<\/tr>|<\/h[1-6]>/g, ' ')
        .replace(/<[^>]*>/g, ''),
    ),
  );

/** Our anchors on the page, in order, each with the place where its value stops. */
const marksOf = (body) => {
  const marks = [];
  for (const m of body.matchAll(ANCHOR_RE)) {
    const param = PARAM_RE.exec(m[1]);
    const name = param ? decodeEntities(param[1].replace(/<[^>]*>/g, '')).trim() : '';
    if (name === ANCHOR_END || name.startsWith(ANCHOR_PREFIX)) marks.push({ start: m.index, end: m.index + m[0].length, name });
  }
  marks.forEach((mark, i) => {
    let stop = i + 1 < marks.length ? marks[i + 1].start : body.length;
    CELL_END_RE.lastIndex = mark.end;
    const cellEnd = CELL_END_RE.exec(body);
    if (cellEnd && cellEnd.index < stop) stop = cellEnd.index;
    mark.stop = stop;
  });
  return marks;
};

/**
 * The inverse of renderRecordPage: path → the text now on the page. Tolerates what the Confluence editor does to a
 * page it saves (paragraphs inside cells, extra attributes on macros, entities, non-breaking spaces).
 * @param {string} storage
 * @returns {{values: Record<string, string>, hasSealPanel: boolean}}
 */
export const extractPageValues = (storage) => {
  const body = String(storage ?? '');
  /** @type {Record<string, string>} */
  const values = {};
  for (const mark of marksOf(body)) {
    if (mark.name === ANCHOR_END) continue;
    const path = mark.name.slice(ANCHOR_PREFIX.length);
    if (path in values) continue;
    values[path] = toText(body.slice(mark.end, mark.stop));
  }
  const hasSealPanel = new RegExp(`key="extension-key">[^<]*${SEAL_MACRO_KEY}`).test(body);
  return { values, hasSealPanel };
};

/**
 * All visible text of the page EXCEPT the sealed values: what is left when every place between a `cs:` anchor and its
 * end is cut out, the seal panel and the anchors themselves are removed, and tags are dropped. Headings, labels, table
 * headers, the footer — and anything anybody typed anywhere on the page. Compared (white space ignored) with the same
 * text of a fresh render, so a sentence added below the record, a renamed column or a duplicated value is reported.
 * A second copy of an anchor does not hide text: only the first place of each path is cut out.
 * Things that show without being text are named too, so that they cannot be slipped in or changed unseen: where each
 * link goes (also the links inside sealed places), every image and every macro other than our anchors and the panel.
 *
 * Link targets and the site's address (`opts`, both optional; without them every target is compared as written):
 *   siteUrl     a link to the site itself counts the same with or without the site in front. On a Confluence page
 *               "/browse/CLM-5" and "https://<site>/browse/CLM-5" open the same issue, so this hides nothing.
 *   anyOrigin   the site is NOT known: the site part of every full address is dropped, so only the path is compared.
 *               That cannot tell the site's own link from a link to another site with the same path, so a caller
 *               that uses it must not report the page as fully checked (see `restPair`).
 * @param {string} storage
 * @param {{siteUrl?: string, anyOrigin?: boolean}} [opts]
 * @returns {string}
 */
export const pageRest = (storage, opts = {}) => {
  const site = String(opts.siteUrl ?? '').replace(/\/+$/, '');
  const target = (href) => {
    if (opts.anyOrigin) return href.replace(/^https?:\/\/[^/?#]+(?=[/?#]|$)/i, '');
    if (site && href.toLowerCase().startsWith(`${site.toLowerCase()}/`)) return href.slice(site.length);
    return href;
  };
  const body = String(storage ?? '');
  const seen = new Set();
  let out = '';
  let from = 0;
  for (const mark of marksOf(body)) {
    if (mark.name === ANCHOR_END) continue;
    if (seen.has(mark.name) || mark.end < from) continue;
    seen.add(mark.name);
    out += `${body.slice(from, mark.end)} `;
    from = mark.stop;
  }
  out += body.slice(from);
  const text = toText(
    out
      .replace(SEAL_PANEL_RE, ' ')
      .replace(ANCHOR_RE, ' ')
      .replace(/<ac:image\b/g, ' [image] <')
      .replace(/<ac:structured-macro\b[^>]*\bac:name="([^"]*)"/g, ' [macro $1] <'),
  );
  const links = [...body.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => target(decodeEntities(m[1]).trim()));
  return links.length > 0 ? `${text} [links: ${links.join(' ')}]` : text;
};

/**
 * The two texts V2 compares outside the sealed values: a fresh render of the record and the page as it is now.
 * `linksChecked` is false when the site's address is not known. Then the links are compared by path only, and the
 * page check may say "differs" (a real difference) or "not fully checked", never "matches".
 * @param {string} freshStorage
 * @param {string} pageStorage
 * @param {string|null|undefined} siteUrl   'https://<site>.atlassian.net', or '' when unknown
 * @returns {{expected: string, found: string, linksChecked: boolean}}
 */
export const restPair = (freshStorage, pageStorage, siteUrl) => {
  const opts = siteUrl ? { siteUrl } : { anyOrigin: true };
  return { expected: pageRest(freshStorage, opts), found: pageRest(pageStorage, opts), linksChecked: Boolean(siteUrl) };
};
