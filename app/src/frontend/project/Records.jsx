// [E] Acceptance → Records (PRODUCT §4.5) and one open record (the same account as the Confluence page, §4.4).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Code,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Link,
  LinkButton,
  LoadingButton,
  Stack,
} from '@forge/react';
import { INVOKE, VERIFY_RESULT, WAIVER_SELF_LINE } from '../../contract.js';
import { buildPhrase, buildsOfPayload } from '../../domain/buildWords.js';
import { staleReasonNote } from '../../lib/format.js';
import { call, useLoad } from '../shared/api.js';
import { VerifyDetails } from '../shared/Verify.jsx';
import {
  ConditionLozenge,
  ConfluenceWarning,
  CountTiles,
  ErrorBox,
  InlineError,
  IssueLink,
  Loading,
  NotIndependent,
  Notes,
  OutcomeLozenge,
  PersonName,
  SampleData,
  SealLozenge,
  Section,
  SectionMessage,
  StateLozenge,
  SealValue,
  Subtle,
  UNKNOWN_PERSON,
  Text,
  confirmedLine,
  day,
  dayTime,
  plural,
  seal8,
} from '../shared/ui.jsx';

const conditionsText = (c) => {
  const parts = [];
  if (c.open) parts.push(`${c.open} open`);
  if (c.met) parts.push(`${c.met} met`);
  if (c.overdue) parts.push(`${c.overdue} overdue`);
  return parts.length ? parts.join(', ') : 'None';
};

const anyPending = (summary) => Boolean(summary.pending && (summary.pending.page || summary.pending.issues || summary.pending.anchor));

/** What a condition covers, as issue keys: the open-item ids are `case:<key>:…`, `req:<key>:…`, `defect:<key>`. */
const coveredKey = (id) => String(id).split(':')[1] || String(id);

/** `widths`: per cent per column, so that issue keys, dates and statuses keep to one line. */
const table = (label, columns, rows, widths = []) => (
  <DynamicTable
    label={label}
    head={{ cells: columns.map((c, j) => ({ key: c, content: c, width: widths[j] })) }}
    rows={rows.map((cells, i) => ({
      key: `row-${i}`,
      cells: cells.map((content, j) => ({ key: `cell-${j}`, content: typeof content === 'string' ? <Text>{content}</Text> : content })),
    }))}
  />
);

// ── after signing: the page, the condition issues, the Jira comment ─────────────────────────────────────────────

/** `sign` answers at once; the rest is done in short calls, at most this many in one go. */
const MAX_FINISH_CALLS = 6;

/**
 * Calls `finishSigning` until nothing is pending. `notes` are the server's sentences for what could not be done
 * (Confluence not connected, …): a warning, never an error.
 * @param {string} recordId
 * @param {(state: {record: any, pending: boolean}) => void} [onDone]
 */
export const useFinishSigning = (recordId, onDone) => {
  const [state, setState] = useState({ running: false, ran: false, step: null, notes: [], pending: false, error: null });
  const live = useRef(true);
  const running = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, running: true, step: null, error: null }));
    let last = null;
    let error = null;
    for (let i = 0; i < MAX_FINISH_CALLS && live.current; i += 1) {
      const res = await call(INVOKE.finishSigning, { recordId });
      if (!res.ok) {
        error = res.error;
        break;
      }
      last = res.data;
      if (!last.pending) break;
      const step = last.step;
      if (live.current) setState((s) => ({ ...s, step }));
    }
    running.current = false;
    if (!live.current) return;
    const pending = last ? Boolean(last.pending) : true;
    setState({ running: false, ran: true, step: null, notes: last ? last.notes : [], pending, error });
    if (done.current) done.current({ record: last ? last.record : null, pending });
  }, [recordId]);

  return { ...state, run };
};

/**
 * Progress, notes and the "Finish publishing" button for one record.
 * @param {{recordId: string, pending: boolean, auto?: boolean, onDone?: (state: any) => void}} props
 *   pending = the record still has something to publish; auto = start at once (right after signing).
 */
export const FinishPublishing = ({ recordId, pending, auto = false, onDone }) => {
  const fin = useFinishSigning(recordId, onDone);
  const { run } = fin;
  useEffect(() => {
    if (auto) run();
  }, [auto, run]);
  const still = fin.ran ? fin.pending || Boolean(fin.error) : pending;
  if (!fin.running && !fin.ran && !pending) return null;
  return (
    <Stack space="space.100">
      {fin.running ? <Loading text={fin.step || 'Publishing the record…'} /> : null}
      <InlineError error={fin.error} />
      <Notes notes={fin.notes} />
      {!fin.running && still ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Text>Publishing this record is not finished.</Text>
          <Button onClick={run}>Finish publishing</Button>
        </Inline>
      ) : null}
    </Stack>
  );
};

// ── one record ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One sealed record, read from the stored payload. `compact` is the summary shown right after signing: the decision,
 * the counts, conditions, waivers and the seal, with "Open the record" as the way on.
 * @param {{recordId: string, boot: import('../../contract.js').Bootstrap, compact?: boolean, autoFinish?: boolean,
 *          onClose?: () => void, onOpenFull?: (id: string) => void, onVerify: (id: string) => void, onChanged: () => void}} props
 */
export const RecordView = ({ recordId, boot, compact = false, autoFinish = false, onClose, onOpenFull, onVerify, onChanged }) => {
  const q = useLoad(INVOKE.getRecord, { recordId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tried, setTried] = useState(false);
  const { reload } = q;
  const finished = useCallback(() => {
    reload();
    onChanged();
  }, [reload, onChanged]);

  if (q.loading && !q.data) return <Loading text="Opening the record…" />;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading text="Opening the record…" />;

  const { record, summary, people, conditions, waivers, issueUrls } = q.data;
  const p = record.payload;
  // A record sealed with no build set says which builds its runs were made on; the payload is only read.
  const buildText = buildPhrase(p.build, buildsOfPayload(p));
  // A person the record names but `people` does not: a Jira account is still drawn by Jira from its id; the name
  // used in sentences is never the id.
  const person = (id) => (id ? people[id] || { id, name: UNKNOWN_PERSON, kind: id.startsWith('sample:') ? 'sample' : 'jira' } : null);
  const live = (id) => conditions.find((x) => x.id === id) || null;
  const urlOf = (key) => (issueUrls ? issueUrls[key] : undefined);
  const pending = anyPending(summary);
  const published = record.pageStatus === 'published' && Boolean(record.pageUrl);
  const follows = record.number > 1 ? `follows Record ${record.number - 1}` : 'first record of this project';

  const publish = async () => {
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.publishPage, { recordId });
    setBusy(false);
    setTried(true);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    finished();
  };

  // `record.pageError` is the reason stored at the LAST try to write the page, which may be long ago. A record
  // sealed before Confluence was connected keeps "Confluence is not connected…" for ever, so that stored reason is
  // shown only while it can still be true: never when Confluence is connected now (`boot.confluence.available`,
  // read live), unless "Publish the page" was pressed on this screen a moment ago. When Confluence is not connected,
  // the quiet line above (ConfluenceWarning) already says so.
  const storedReason = record.pageStatus === 'failed' && !published ? record.pageError : null;
  const outdated = Boolean(storedReason) && !tried && /^Confluence is not (connected|available)/i.test(storedReason);
  const pageReason = storedReason && boot.confluence.available && !outdated ? storedReason : null;

  const decisionLine = (
    <Inline space="space.100" alignBlock="center" shouldWrap>
      <OutcomeLozenge outcome={p.decision.outcome} />
      <Subtle>Decided by</Subtle>
      <PersonName person={person(p.decision.decidedBy)} />
      <Subtle>on {dayTime(p.decision.decidedAt)}</Subtle>
    </Inline>
  );

  /**
   * The Jira issue that does the work of a condition: its key as a link, and where it stands now. In a table cell the
   * status goes under the key, so that neither is broken over two lines.
   */
  const conditionIssue = (c, stacked = false) => {
    const now = live(c.id);
    const key = (now && now.linkedIssue) || c.linkedIssue;
    if (!key) return <Text>{summary.pending && summary.pending.issues ? 'Being created' : '—'}</Text>;
    const link = <IssueLink issueKey={key} url={now ? now.linkedIssueUrl : undefined} />;
    const status = now && now.linkedIssueStatus ? <Subtle>{now.linkedIssueStatus}</Subtle> : null;
    return stacked ? (
      <Stack space="space.0">
        {link}
        {status}
      </Stack>
    ) : (
      <Inline space="space.100" alignBlock="center">
        {link}
        {status}
      </Inline>
    );
  };
  const conditionNow = (c) => {
    const now = live(c.id);
    if (!now) return <Text>—</Text>;
    const confirmed = confirmedLine(now);
    return (
      <Stack space="space.025">
        <Inline>
          <ConditionLozenge state={now.state} />
        </Inline>
        {confirmed ? <Subtle>{confirmed}</Subtle> : null}
      </Stack>
    );
  };
  const authorisedBy = (w) => (w.authorisedBy ? <PersonName person={person(w.authorisedBy)} /> : <Text>{w.authorisedByName || '—'}</Text>);
  const selfWaiver = p.waivers.some((w) => w.selfRecorded);

  const publishing = (
    <Stack space="space.100">
      <FinishPublishing recordId={recordId} pending={pending} auto={autoFinish} onDone={finished} />
      {pageReason ? (
        <SectionMessage appearance="warning">
          <Text>The last try to publish the page did not work: {pageReason}.</Text>
        </SectionMessage>
      ) : null}
      {!published && !pending && boot.confluence.available ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Text>This record has no Confluence page yet. It is kept and read here.</Text>
          <LoadingButton isLoading={busy} onClick={publish}>
            Publish the page
          </LoadingButton>
        </Inline>
      ) : null}
      <InlineError error={error} />
    </Stack>
  );

  if (compact) {
    return (
      <Stack space="space.150">
        {decisionLine}
        <Text>“{p.decision.statement}”</Text>
        <CountTiles counts={p.counts} />
        {p.conditions.length > 0 ? (
          <Stack space="space.075">
            <Text weight="bold">{plural(p.conditions.length, 'condition')}</Text>
            {p.conditions.map((c, i) => (
              <Stack key={c.id} space="space.025">
                <Text>{`${i + 1}. ${c.text}`}</Text>
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Subtle>Owner</Subtle>
                  <PersonName person={person(c.owner)} />
                  <Subtle>due {day(c.dueDate)}</Subtle>
                  <Subtle>Jira issue</Subtle>
                  {conditionIssue(c)}
                </Inline>
              </Stack>
            ))}
          </Stack>
        ) : null}
        {p.waivers.length > 0 ? (
          <Stack space="space.075">
            <Text weight="bold">{plural(p.waivers.length, 'waiver')}</Text>
            {p.waivers.map((w, i) => (
              <Stack key={w.id} space="space.025">
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Text>{`${i + 1}. ${w.coversLabel}`}</Text>
                  {w.selfRecorded ? <NotIndependent /> : null}
                </Inline>
                <Subtle>{w.reason}</Subtle>
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Subtle>Authorised by</Subtle>
                  {authorisedBy(w)}
                  <Subtle>Recorded by</Subtle>
                  <PersonName person={person(w.recordedBy)} />
                </Inline>
              </Stack>
            ))}
            {selfWaiver ? <Subtle>{WAIVER_SELF_LINE}</Subtle> : null}
          </Stack>
        ) : null}
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>Seal</Subtle>
          <Code>{seal8(record.seal)}</Code>
          <Subtle>{follows}</Subtle>
        </Inline>
        {publishing}
        <Inline space="space.100" alignBlock="center" shouldWrap>
          {published ? (
            <LinkButton href={record.pageUrl} target="_blank">
              Open the record
            </LinkButton>
          ) : (
            <Button onClick={() => onOpenFull(record.id)}>
              Open the record
            </Button>
          )}
          {published ? <Button onClick={() => onOpenFull(record.id)}>Read it in Jira</Button> : null}
          <Button onClick={() => onVerify(record.id)}>Verify seal</Button>
        </Inline>
      </Stack>
    );
  }

  const evidenceRows = p.items.flatMap((item) =>
    item.cases.length === 0
      ? [[<IssueLink issueKey={item.requirement.key} url={urlOf(item.requirement.key)} />, '—', <StateLozenge state="no_case" />, '—', '—', '—', '—']]
      : item.cases.map((c) => [
          <Stack space="space.0">
            <IssueLink issueKey={item.requirement.key} url={urlOf(item.requirement.key)} />
            <Subtle>{item.requirement.summary}</Subtle>
          </Stack>,
          <Stack space="space.0">
            <IssueLink issueKey={c.key} url={urlOf(c.key)} />
            <Subtle>{c.summary}</Subtle>
          </Stack>,
          <Stack space="space.0">
            <Inline>
              <StateLozenge state={c.state} />
            </Inline>
            {c.staleReasons.map((s, i) => (
              <Subtle key={`${s.code}-${i}`}>{staleReasonNote(s.code, s.at, s.by ? (person(s.by) || {}).name : null)}</Subtle>
            ))}
          </Stack>,
          c.run ? day(c.run.executedAt) : '—',
          c.run ? <PersonName person={person(c.run.executedBy)} /> : '—',
          c.run ? [c.run.build, c.run.environment].filter(Boolean).join(' · ') || '—' : '—',
          c.run && c.run.evidence.length > 0 ? (
            <Stack space="space.0">
              {c.run.evidence.map((e) => (
                <Text key={e.attachmentId}>
                  {e.filename} {e.sha256 ? seal8(e.sha256) : 'not captured'}
                </Text>
              ))}
            </Stack>
          ) : (
            '—'
          ),
        ])
  );

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Inline space="space.100" alignBlock="center">
          <Heading as="h2" size="medium">
            Acceptance record {record.number} — Release {record.releaseName}
          </Heading>
          {record.sample ? <SampleData /> : null}
        </Inline>
        <Inline space="space.100">
          <Button onClick={() => onVerify(record.id)}>Verify seal</Button>
          <Button appearance="subtle" onClick={onClose}>
            Close
          </Button>
        </Inline>
      </Inline>

      {published ? (
        <Link href={record.pageUrl} openNewTab>
          Open the record page in Confluence
        </Link>
      ) : null}
      <ConfluenceWarning confluence={boot.confluence} />
      {publishing}

      <Section title="Decision">
        {decisionLine}
        <Text>“{p.decision.statement}”</Text>
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>
            Release {p.release.name} · {buildText ? `${buildText} · ` : ''}Requested by
          </Subtle>
          <PersonName person={person(p.request.requestedBy)} />
          <Subtle>{day(p.request.requestedAt)}</Subtle>
        </Inline>
      </Section>

      <Section title="At the moment of signing">
        <CountTiles counts={p.counts} />
      </Section>

      {p.conditions.length > 0 ? (
        <Section title="Conditions">
          {table(
            'Conditions',
            ['#', 'What must be done', 'Owner', 'Due', 'Covers', 'Jira issue', 'Now'],
            p.conditions.map((c, i) => [
              String(i + 1),
              c.text,
              <PersonName person={person(c.owner)} />,
              day(c.dueDate),
              c.covers.map(coveredKey).join(', '),
              conditionIssue(c, true),
              conditionNow(c),
            ]),
            [3, 29, 12, 10, 12, 12, 22]
          )}
        </Section>
      ) : null}

      {p.waivers.length > 0 ? (
        <Section title="Waivers">
          {table(
            'Waivers',
            ['#', 'What was waived', 'Reason', 'Authorised by', 'Reference', 'Recorded by'],
            p.waivers.map((w, i) => [
              String(i + 1),
              w.coversLabel,
              w.reason,
              authorisedBy(w),
              w.reference || '—',
              <Stack space="space.025">
                <PersonName person={person(w.recordedBy)} />
                {w.selfRecorded ? (
                  <Inline>
                    <NotIndependent />
                  </Inline>
                ) : null}
              </Stack>,
            ])
          )}
          {selfWaiver ? <Subtle>{WAIVER_SELF_LINE}</Subtle> : null}
          {waivers.length !== p.waivers.length ? <Subtle>The sealed record lists {plural(p.waivers.length, 'waiver')}.</Subtle> : null}
        </Section>
      ) : null}

      <Section title="Evidence">
        {table(
          'Evidence',
          ['Requirement', 'Case', 'State at signing', 'Tested', 'By', 'Build', 'Evidence (SHA-256)'],
          evidenceRows,
          [16, 18, 14, 9, 11, 8, 24]
        )}
      </Section>

      {p.defects.length > 0 ? (
        <Section title="Open defects at signing">
          {table(
            'Open defects at signing',
            ['Defect', 'Priority', 'Summary', 'Status'],
            p.defects.map((d) => [<IssueLink issueKey={d.key} url={urlOf(d.key)} />, d.priority || '—', d.summary, d.status])
          )}
        </Section>
      ) : null}

      <Section title="Who did what">
        {p.duties.conflicts.length === 0 ? <Text>No conflicts were recorded at signing.</Text> : null}
        {p.duties.conflicts.map((c, i) => (
          <Inline key={`${c.code}-${i}`} space="space.100" alignBlock="center" shouldWrap>
            <PersonName person={person(c.person)} />
            {c.item ? <IssueLink issueKey={c.item} url={urlOf(c.item)} /> : null}
            <Text>{c.fact}</Text>
          </Inline>
        ))}
      </Section>

      {p.carriedConditions.length > 0 ? (
        <Section title="Carried over from earlier records">
          {table(
            'Carried over from earlier records',
            ['From', 'Condition', 'State at signing'],
            p.carriedConditions.map((c) => [`Record ${c.fromRecord}`, c.text, <ConditionLozenge state={c.state} />])
          )}
        </Section>
      ) : null}

      <Section title="Seal">
        <SealValue label="Seal of this record" seal={record.seal} />
        {record.number > 1 ? (
          <SealValue label={`Seal of Record ${record.number - 1}, which this record follows`} seal={record.prevSeal} />
        ) : (
          <Subtle>This is the first record of this project.</Subtle>
        )}
        {summary.anchorIssueKey ? (
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Subtle>The signer also posted this seal as a Jira comment on</Subtle>
            <IssueLink issueKey={summary.anchorIssueKey} url={summary.anchorUrl} />
          </Inline>
        ) : null}
        <Subtle>Method: SHA-256 over canonical JSON (RFC 8785). Record format {String(p.schema).split('/')[1] || '1'}.</Subtle>
        {summary.conditions ? <Subtle>Conditions now: {conditionsText(summary.conditions)}.</Subtle> : null}
      </Section>
    </Stack>
  );
};

// ── the list ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{boot: import('../../contract.js').Bootstrap, projectKey: string, openId: string|null,
 *          onOpen: (id: string|null) => void, onVerify: (id: string) => void, onChanged: () => void}} props
 */
export const Records = ({ boot, projectKey, openId, onOpen, onVerify, onChanged }) => {
  const q = useLoad(INVOKE.listRecords, { projectKey });
  const [all, setAll] = useState({ loading: false, results: null, error: null });
  const [finishId, setFinishId] = useState(null);
  const { reload } = q;
  const changed = useCallback(() => {
    reload();
    onChanged();
  }, [reload, onChanged]);

  const verifyAll = async () => {
    setAll({ loading: true, results: null, error: null });
    const res = await call(INVOKE.verifyAll, { projectKey });
    setAll(res.ok ? { loading: false, results: res.data, error: null } : { loading: false, results: null, error: res.error });
  };

  if (openId) {
    return (
      <RecordView
        recordId={openId}
        boot={boot}
        autoFinish={finishId === openId}
        onClose={() => {
          setFinishId(null);
          onOpen(null);
        }}
        onVerify={onVerify}
        onChanged={changed}
      />
    );
  }
  if (q.loading && !q.data) return <Loading text="Reading the records…" />;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading text="Reading the records…" />;

  const { records, chainLine } = q.data;
  if (records.length === 0) {
    return (
      <Stack space="space.150">
        <ConfluenceWarning confluence={boot.confluence} />
        <EmptyState
          header="No records yet"
          description="Every decision is sealed and listed here. Each record also seals the one before it, so a changed or missing record shows."
        />
      </Stack>
    );
  }

  const verified = new Map((all.results || []).map((v) => [v.recordId, v]));
  const notIntact = (all.results || []).filter((v) => v.result !== VERIFY_RESULT.INTACT);

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center">
        <Inline space="space.100" alignBlock="center">
          <Heading as="h2" size="medium">
            Records
          </Heading>
          {records.some((rec) => rec.sample) ? <SampleData /> : null}
        </Inline>
        <LoadingButton isLoading={all.loading} onClick={verifyAll}>
          Verify seals
        </LoadingButton>
      </Inline>

      {all.loading ? <Loading text="Checking the seal…" /> : null}
      {all.error ? <ErrorBox error={all.error} onRetry={verifyAll} /> : null}
      {all.results && notIntact.length === 0 ? (
        <SectionMessage appearance="success">
          <Text>{all.results.length === 1 ? 'Seal intact. 1 record checked.' : `Seals intact. ${all.results.length} records checked.`}</Text>
        </SectionMessage>
      ) : null}
      {notIntact.map((v) => (
        <VerifyDetails key={v.recordId} result={v} showSeal={false} />
      ))}

      <DynamicTable
        label="Acceptance records"
        head={{
          cells: [
            { key: 'number', content: '#', width: 4 },
            { key: 'release', content: 'Release', width: 12 },
            { key: 'decision', content: 'Decision', width: 20 },
            { key: 'by', content: 'Decided by', width: 20 },
            { key: 'conditions', content: 'Conditions', width: 12 },
            { key: 'seal', content: 'Seal', width: 14 },
            { key: 'actions', content: '', width: 18 },
          ],
        }}
        rows={records.map((rec) => ({
          key: rec.id,
          cells: [
            { key: 'number', content: <Text>{String(rec.number)}</Text> },
            { key: 'release', content: <Text>{rec.releaseName}</Text> },
            { key: 'decision', content: <OutcomeLozenge outcome={rec.outcome} /> },
            {
              key: 'by',
              content: (
                <Stack space="space.050">
                  <PersonName person={rec.decidedBy} />
                  <Subtle>{day(rec.decidedAt)}</Subtle>
                </Stack>
              ),
            },
            { key: 'conditions', content: <Text>{conditionsText(rec.conditions)}</Text> },
            {
              key: 'seal',
              content: (
                <Stack space="space.050">
                  <Code>{seal8(rec.seal)}</Code>
                  {verified.has(rec.id) ? (
                    <Inline>
                      <SealLozenge result={verified.get(rec.id).result} />
                    </Inline>
                  ) : null}
                </Stack>
              ),
            },
            {
              key: 'actions',
              content: (
                <Stack space="space.050" alignInline="start">
                  {anyPending(rec) ? (
                    <Button
                      spacing="compact"
                      onClick={() => {
                        setFinishId(rec.id);
                        onOpen(rec.id);
                      }}
                    >
                      Finish publishing
                    </Button>
                  ) : (
                    <Button spacing="compact" onClick={() => onOpen(rec.id)}>
                      Open the record
                    </Button>
                  )}
                  <Button spacing="compact" onClick={() => onVerify(rec.id)}>
                    Verify seal
                  </Button>
                </Stack>
              ),
            },
          ],
        }))}
      />
      <Subtle>{chainLine}</Subtle>
    </Stack>
  );
};
