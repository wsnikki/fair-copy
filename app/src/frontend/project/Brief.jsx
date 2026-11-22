// [E] Acceptance → Brief (PRODUCT §4.3). Reads like a letter, top to bottom, in the order an honest colleague would tell it.
import React, { useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  DynamicTable,
  EmptyState,
  Inline,
  Label,
  Link,
  LoadingButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  RadioGroup,
  RequiredAsterisk,
  Stack,
  TextArea,
} from '@forge/react';
import { COUNT_LABEL, ERROR, INVOKE, OUTCOME, WAIVER_SELF_LINE } from '../../contract.js';
import { buildPhrase, buildsOfRequirements } from '../../domain/buildWords.js';
import { nextRelease } from '../../domain/carried.js';
import { groupOpenItems, suggestedStatement } from '../../domain/signingRules.js';
import { call, flag, useLoad } from '../shared/api.js';
import {
  ASK_ADMIN,
  BeforeAfter,
  CarriedCondition,
  ChangedMark,
  ConflictMessage,
  ConfluenceWarning,
  ErrorBox,
  HistoryLink,
  InlineError,
  IssueLink,
  Loading,
  NotIndependent,
  PersonName,
  SampleData,
  Section,
  SectionMessage,
  StateLozenge,
  StatusLozenge,
  Subtle,
  Text,
  assembled,
  checkedOf,
  day,
  outcomeText,
  plural,
  uniquePeople,
  valueOf,
} from '../shared/ui.jsx';
import { ConditionModal, WaiverModal } from './BriefForms.jsx';
import { RecordView } from './Records.jsx';
import { RequestModal } from './RequestModal.jsx';

const B2_MESSAGE = 'Something changed while you were reading. Nothing was signed. The brief has been refreshed and the changes are marked.';
/** D4: what a seal does and does not promise. */
const SEAL_PROMISE = 'The record is tamper-evident: a later change to the page or to the stored record is shown.';
/** Development work the Teamwork Graph links to a work item, as section 3 names it. */
const GRAPH_KIND = { deployment: 'Deployment', pull_request: 'Pull request', branch: 'Branch', commit: 'Commit', build: 'Build' };

/** What differs between the brief the approver was reading and the fresh one (B2). A set of marks: `counts`, `change:<caseKey>`, … */
const diffBrief = (old, fresh) => {
  const marks = new Set();
  if (!old) return marks;
  if (JSON.stringify(old.counts) !== JSON.stringify(fresh.counts)) marks.add('counts');
  if (old.release.build !== fresh.release.build) marks.add('build');
  const compare = (prefix, before, after, id, signature) => {
    const was = new Map(before.map((x) => [id(x), signature(x)]));
    const now = new Set(after.map(id));
    after.forEach((x) => {
      if (was.get(id(x)) !== signature(x)) marks.add(`${prefix}:${id(x)}`);
    });
    if ([...was.keys()].some((k) => !now.has(k))) marks.add(`${prefix}:removed`);
  };
  const conditionsOf = (b) => b.carried.flatMap((g) => g.conditions);
  compare('change', old.changes, fresh.changes, (c) => c.caseKey, (c) => c.reasons.map((r) => r.sentence).join('|'));
  compare('open', old.open, fresh.open, (o) => o.key, (o) => `${o.state}|${o.line}`);
  compare('defect', old.defects.filter((d) => d.open), fresh.defects.filter((d) => d.open), (d) => d.key, (d) => `${d.status.name}|${d.priority}`);
  compare('conflict', old.duties.conflicts, fresh.duties.conflicts, (c) => c.id, (c) => c.sentence);
  compare('carried', conditionsOf(old), conditionsOf(fresh), (c) => c.id, (c) => c.state);
  compare('item', old.openItems, fresh.openItems, (o) => o.id, (o) => o.label);
  return marks;
};
const anyMark = (marks, prefix) => [...marks].some((m) => m === prefix || m.startsWith(`${prefix}:`));

const Numbered = ({ n, title, changed, children }) => (
  <Section
    title={`${n}  ${title}`}
    aside={changed ? <ChangedMark /> : null}
  >
    {children}
  </Section>
);

/**
 * Section 2 says each change once. Cases of one requirement whose pass is undone by the same change (same reason, same
 * before and after) share a box that lists them.
 * @param {import('../../contract.js').BriefChange[]} changes
 * @returns {{id: string, requirementKey: string, reason: any, cases: import('../../contract.js').BriefChange[]}[]}
 */
const groupChanges = (changes) => {
  const groups = new Map();
  changes.forEach((change) => {
    change.reasons.forEach((reason) => {
      const id = JSON.stringify([change.requirementKey, reason.code, reason.issueKey, reason.sentence, reason.before, reason.after]);
      if (!groups.has(id)) groups.set(id, { id, requirementKey: change.requirementKey, reason, cases: [] });
      groups.get(id).cases.push(change);
    });
  });
  return [...groups.values()];
};

const ChangeGroup = ({ group, marks }) => {
  const { reason, cases } = group;
  const hasTexts = (reason.code === 'S1' || reason.code === 'S2') && (reason.before !== null || reason.after !== null);
  return (
    <SectionMessage appearance="warning" title={reason.sentence}>
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Subtle>{cases.length === 1 ? `Affects 1 case of ${group.requirementKey}:` : `Affects ${cases.length} cases of ${group.requirementKey}:`}</Subtle>
        <HistoryLink url={reason.url} />
      </Inline>
      {cases.map((c) => (
        <Inline key={c.caseKey} space="space.100" alignBlock="center" shouldWrap>
          <IssueLink issueKey={c.caseKey} url={c.url} />
          <Text>{c.caseSummary}</Text>
          <Subtle>{c.passedLine}</Subtle>
          {marks.has(`change:${c.caseKey}`) ? <ChangedMark /> : null}
        </Inline>
      ))}
      {hasTexts ? <BeforeAfter before={reason.before} after={reason.after} /> : null}
    </SectionMessage>
  );
};

const OUTCOME_OPTIONS = [
  [OUTCOME.ACCEPTED, 'Accept'],
  [OUTCOME.ACCEPTED_WITH_CONDITIONS, 'Accept with conditions'],
  [OUTCOME.REJECTED, 'Reject'],
];

const confirmSentence = (outcome, name, conditions, waivers) => {
  if (outcome === OUTCOME.REJECTED) return `You are rejecting Release ${name}.`;
  if (outcome === OUTCOME.ACCEPTED) return `You are accepting Release ${name}.`;
  return `You are accepting Release ${name} with ${plural(conditions, 'condition')} and ${plural(waivers, 'waiver')}.`;
};

/** Section 1 in one line: the four numbers of Readiness, as words. The tiles themselves are on Readiness and on the record. */
const countsLine = (counts) =>
  ['proven', 'stale', 'failing', 'unproven'].map((key) => `${counts[key]} ${COUNT_LABEL[key].label.toLowerCase()}`).join(' · ');

/** The earlier records that have conditions, newest first, each condition with where it stands now (section 5). */
const CarriedGroups = ({ groups, marks, onOpenRecord }) => (
  <Stack space="space.100">
    {groups.map((g) => (
      <Stack key={g.record.id} space="space.075">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Text weight="medium">{g.sentence}</Text>
          <Button spacing="compact" onClick={() => onOpenRecord(g.record.id)}>
            Open Record {g.record.number}
          </Button>
        </Inline>
        {g.conditions.map((c) => (
          <CarriedCondition key={c.id} condition={c}>
            {marks.has(`carried:${c.id}`) ? <ChangedMark /> : null}
          </CarriedCondition>
        ))}
      </Stack>
    ))}
  </Stack>
);

/** The first line about earlier promises: red while any of them is overdue. */
const PromiseLine = ({ brief: b }) =>
  b.carriedLine ? (
    <Text weight="medium" color={b.carriedOverdue > 0 ? 'color.text.danger' : 'color.text'}>
      {b.carriedLine}
    </Text>
  ) : null;

/** A release that follows this one and is not released yet: where the conditions of this decision are seen again. */
const laterRelease = (b) => (b && !b.release.released ? nextRelease(b.releases, b.release.id) : null);

/** One sealed evidence file of the brief, for "Try it" on a site without a record page. */
const firstEvidence = (b) => {
  for (const c of b ? b.requirements.flatMap((r) => r.cases) : []) {
    const file = c.latestRun && c.latestRun.evidence[0];
    if (file) return { caseKey: c.key, filename: file.filename };
  }
  return null;
};

/** What a reader can do to see the seal work, said with what is reachable on this site. null when nothing is. */
const tryItLine = (b, confluence) => {
  const lead = 'Try it: change something that was sealed, then press Verify seal.';
  if (confluence.available) {
    return `${lead} With the record page: open it, edit a cell of any table and publish. Verify seal then says "Seal broken" and names the cell.`;
  }
  const file = firstEvidence(b);
  if (!file) return null;
  return `${lead} In Jira: delete the evidence file ${file.filename} from ${file.caseKey}. Verify seal then says "Seal intact, evidence missing" and names the file.`;
};

/** Section 6: the decision, the open items and what answers each, the statement, the affirmation and the seal. */
const Decision = ({ brief: b, marks, reloading, confluence, onReload, onB2, onSigned }) => {
  const a = b.availability;
  const [outcome, setOutcome] = useState(a.accepted.allowed ? OUTCOME.ACCEPTED : b.openItems.length > 0 ? OUTCOME.ACCEPTED_WITH_CONDITIONS : null);
  const [statement, setStatement] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [modal, setModal] = useState(null); // {kind:'condition'|'waiver', item, existing}
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // One decision is sent once: the ref closes the door before React has drawn the disabled button.
  const sent = useRef(false);

  const mayDecide = b.viewerIsApprover;
  // Nobody is asked to tick a sentence that the brief itself says is untrue.
  const involved = b.duties.conflicts.some((c) => c.person.id === b.viewer.id && (c.code === 'D1' || c.code === 'D2'));
  const affirmation = involved
    ? `I have read this brief. I am deciding as ${b.viewer.name}, and my own part in this release is shown in section 4.`
    : `I have read this brief. I am deciding as ${b.viewer.name}, and I did not build or test the items in this release.`;
  const mayWaive = b.viewerMayWaive || b.viewerIsApprover;
  const conditions = b.draft.conditions;
  const waivers = b.draft.waivers;
  const uncovered = b.openItems.filter((o) => !o.coveredBy).length;
  const selfWaiver = waivers.some((w) => w.selfRecorded);
  const suggestion = suggestedStatement({ outcome, releaseName: b.release.name, conditions: conditions.length, waivers: waivers.length });
  // The table says each thing once: the open cases of one requirement that have the same answer are one row.
  const rows = groupOpenItems(b.openItems, b.requirements);
  const [listed, setListed] = useState({}); // row id → its cases are listed

  const nameOf = (person) => (person && person.name ? person.name : null);
  const authoriserOf = (w) => nameOf(w.authorisedBy) || w.authorisedByName || null;
  // The table stays short: a row names its condition or waiver, and what each one says is printed once above the table.
  const answer = (item) => {
    if (!item.coveredBy) return <Text>—</Text>;
    if (item.coveredBy.by === 'condition') return <Text>{`Condition ${conditions.findIndex((c) => c.id === item.coveredBy.id) + 1}`}</Text>;
    const at = waivers.findIndex((w) => w.id === item.coveredBy.id);
    const w = at >= 0 ? waivers[at] : null;
    const authoriser = w ? authoriserOf(w) : null;
    return (
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text>{`Waiver ${at + 1}`}</Text>
        {authoriser ? <Subtle>authorised by {authoriser}</Subtle> : null}
        {w && w.selfRecorded ? <NotIndependent /> : null}
      </Inline>
    );
  };
  const waiverPeople = (w) =>
    [
      authoriserOf(w) ? `Authorised by ${authoriserOf(w)}.` : '',
      nameOf(w.recordedBy) ? `Recorded by ${nameOf(w.recordedBy)}.` : '',
      w.reference ? `Reference: ${w.reference}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  // A row of several cases opens the same dialog as one case: a new condition starts with every open item ticked.
  const open = (row) => {
    const [item] = row.items;
    if (row.needs === 'condition') {
      const existing = row.coveredBy ? conditions.find((c) => c.id === row.coveredBy.id) || null : null;
      setModal({ kind: 'condition', item, existing });
    } else {
      const existing = row.coveredBy ? waivers.find((w) => w.id === row.coveredBy.id) || null : null;
      setModal({ kind: 'waiver', item, existing });
    }
  };
  const action = (item) => {
    const allowed = item.needs === 'condition' ? mayDecide : mayWaive;
    if (!allowed) return null;
    const label = item.coveredBy ? 'Edit' : item.needs === 'condition' ? 'Add condition' : 'Add waiver';
    return (
      <Button spacing="compact" onClick={() => open(item)}>
        {label}
      </Button>
    );
  };

  let blocked = null;
  if (b.historyError) blocked = b.historyError;
  else if (reloading) blocked = 'Refreshing the brief…';
  else if (!outcome) blocked = 'Choose a decision.';
  else if (outcome === OUTCOME.ACCEPTED && !a.accepted.allowed) {
    blocked = `This release cannot be accepted as it stands: ${a.accepted.reasons.join(', ')}. Accept with conditions, or reject.`;
  } else if (outcome === OUTCOME.ACCEPTED_WITH_CONDITIONS && uncovered > 0) {
    blocked = uncovered === 1 ? '1 open item has no condition or waiver yet.' : `${uncovered} open items have no condition or waiver yet.`;
  } else if (!statement.trim()) blocked = 'Write a short statement. It is printed on the record.';
  else if (!affirmed) blocked = 'Tick the box to confirm you have read the brief.';

  const sign = async () => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.sign, {
      requestId: b.request.id,
      outcome,
      statement: statement.trim(),
      affirmed,
      fingerprint: b.fingerprint,
    });
    if (res.ok) {
      // The button stays disabled: this request is decided.
      flag(res.data.flag);
      onSigned(res.data.record);
      return;
    }
    sent.current = false;
    setBusy(false);
    setConfirming(false);
    if (res.code === ERROR.B2_BRIEF_CHANGED) {
      setAffirmed(false);
      if (res.details && res.details.brief) onB2(res.details.brief);
      else onReload();
      setError(res.error || B2_MESSAGE);
      return;
    }
    setError(res.error);
  };
  // Drafts are part of what is signed: after every change to one, the brief is read again before signing.
  const draftSaved = () => {
    setModal(null);
    onReload();
  };

  const radioOptions = OUTCOME_OPTIONS.map(([value, label]) => ({
    name: 'outcome',
    value,
    label,
    isDisabled: !mayDecide || (value === OUTCOME.ACCEPTED && !a.accepted.allowed) || (value === OUTCOME.REJECTED && !a.rejected.allowed),
  }));

  return (
    <Numbered n={6} title={mayDecide ? 'Your decision' : 'The decision'} changed={anyMark(marks, 'item')}>
      <ConfluenceWarning confluence={confluence} title="Records will be kept in Jira only" />
      {!mayDecide ? (
        <SectionMessage appearance="information">
          <Text>You are viewing this brief. Only {b.request.approver.name} can decide.</Text>
        </SectionMessage>
      ) : null}

      <RadioGroup name="outcome" options={radioOptions} value={outcome} onChange={(e) => setOutcome(valueOf(e))} />
      {!a.accepted.allowed ? <Subtle>Accept — Not available: {a.accepted.reasons.join(', ')}.</Subtle> : null}
      {b.openItems.length > 0 ? (
        <Subtle>
          Accept with conditions — Each open item needs a condition or a waiver: {a.accepted_with_conditions.covered} of{' '}
          {a.accepted_with_conditions.total} done.
        </Subtle>
      ) : null}
      {b.proposed ? <Text>{b.proposed.line}</Text> : null}
      {conditions.length + waivers.length > 0 ? (
        <Stack space="space.100">
          {conditions.map((c, i) => (
            <Stack key={c.id} space="space.025">
              <Text>{`Condition ${i + 1}: ${c.text}`}</Text>
              <Subtle>
                Owner {nameOf(c.owner) || '—'}, due {day(c.dueDate)}.
              </Subtle>
            </Stack>
          ))}
          {waivers.map((w, i) => (
            <Stack key={w.id} space="space.025">
              <Text>{`Waiver ${i + 1}: ${w.reason}`}</Text>
              <Subtle>{waiverPeople(w)}</Subtle>
            </Stack>
          ))}
        </Stack>
      ) : null}

      {b.openItems.length > 0 ? (
        <DynamicTable
          label="Open items and the condition or waiver for each"
          head={{
            cells: [
              { key: 'item', content: 'Open item' },
              { key: 'answer', content: 'Condition or waiver' },
              { key: 'action', content: '' },
            ],
          }}
          rowsPerPage={rows.length > 20 ? 20 : undefined}
          rows={rows.map((row) => ({
            key: row.id,
            cells: [
              {
                key: 'item',
                content: (
                  <Stack space="space.050">
                    <Inline space="space.100" alignBlock="center" shouldWrap>
                      <Text>{row.label}</Text>
                      {row.detail ? <Subtle>{row.detail}</Subtle> : null}
                      {row.items.some((item) => marks.has(`item:${item.id}`)) ? <ChangedMark /> : null}
                      {row.items.length > 1 ? (
                        <Button spacing="compact" onClick={() => setListed((l) => ({ ...l, [row.id]: !l[row.id] }))}>
                          {listed[row.id] ? 'Hide cases' : 'Show cases'}
                        </Button>
                      ) : null}
                    </Inline>
                    {row.items.length > 1 && listed[row.id] ? row.items.map((item) => <Subtle key={item.id}>{item.label}</Subtle>) : null}
                  </Stack>
                ),
              },
              { key: 'answer', content: answer(row) },
              { key: 'action', content: action(row) },
            ],
          }))}
        />
      ) : null}

      {selfWaiver ? (
        <Stack space="space.050">
          <Inline>
            <NotIndependent />
          </Inline>
          <Subtle>{WAIVER_SELF_LINE}</Subtle>
        </Stack>
      ) : null}

      {mayDecide ? (
        <Stack space="space.150">
          <Stack space="space.050">
            <Label labelFor="statement">
              Statement
              <RequiredAsterisk />
            </Label>
            <TextArea id="statement" name="statement" value={statement} onChange={(e) => setStatement(valueOf(e))} />
            {suggestion && statement.trim() !== suggestion ? (
              <Stack space="space.050">
                <Subtle>Suggested wording: “{suggestion}”</Subtle>
                <Inline>
                  <Button spacing="compact" onClick={() => setStatement(suggestion)}>
                    Use this wording
                  </Button>
                </Inline>
              </Stack>
            ) : null}
          </Stack>
          <Checkbox
            name="affirmed"
            isChecked={affirmed}
            onChange={(e) => setAffirmed(checkedOf(e))}
            label={affirmation}
          />
          <InlineError error={error} />
          <Inline space="space.150" alignBlock="center" alignInline="end" shouldWrap>
            {blocked ? <Subtle>{blocked}</Subtle> : null}
            <Button appearance="primary" isDisabled={Boolean(blocked) || busy} onClick={() => setConfirming(true)}>
              Sign and seal
            </Button>
          </Inline>
        </Stack>
      ) : null}

      {modal && modal.kind === 'condition' ? (
        <ConditionModal
          requestId={b.request.id}
          condition={modal.existing}
          openItems={b.openItems}
          onClose={() => setModal(null)}
          onSaved={draftSaved}
        />
      ) : null}
      {modal && modal.kind === 'waiver' ? (
        <WaiverModal requestId={b.request.id} waiver={modal.existing} item={modal.item} onClose={() => setModal(null)} onSaved={draftSaved} />
      ) : null}

      {confirming ? (
        <ModalTransition>
          <Modal onClose={() => (busy ? undefined : setConfirming(false))} width="small">
            <ModalHeader>
              <ModalTitle>Sign and seal this decision?</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.100">
                <Text>{confirmSentence(outcome, b.release.name, conditions.length, waivers.length)}</Text>
                <Text>
                  Signing seals this decision as Record {b.nextRecordNumber}. {SEAL_PROMISE}
                </Text>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" isDisabled={busy} onClick={() => setConfirming(false)}>
                Go back
              </Button>
              <LoadingButton appearance="primary" isLoading={busy} isDisabled={busy} onClick={sign}>
                Sign and seal
              </LoadingButton>
            </ModalFooter>
          </Modal>
        </ModalTransition>
      ) : null}
    </Numbered>
  );
};

/**
 * @param {{boot: import('../../contract.js').Bootstrap, projectKey: string, releaseId: string|null,
 *          onOpenRecord: (id: string) => void, onVerify: (id: string) => void, onChanged: () => void,
 *          onRelease?: (id: string) => void}} props
 *   onRelease: tells the page which release is being looked at, so that Readiness follows "See it in the next release".
 *   Without it the brief alone moves to that release.
 */
export const Brief = ({ boot, projectKey, releaseId, onOpenRecord, onVerify, onChanged, onRelease }) => {
  const [movedTo, setMovedTo] = useState(null); // release id chosen with "See it in the next release"
  const q = useLoad(INVOKE.getBrief, { projectKey, releaseId: movedTo || releaseId || null });
  const [marks, setMarks] = useState(new Set());
  const [b2, setB2] = useState(false);
  const [signed, setSigned] = useState(null); // RecordSummary
  const [published, setPublished] = useState(false); // the follow-ups of signing (page, condition issues) have run
  const [requesting, setRequesting] = useState(false);
  const b = q.data;

  const seeRelease = (id) => {
    setSigned(null);
    setMarks(new Set());
    setB2(false);
    setMovedTo(id);
    if (onRelease) onRelease(id);
  };

  if (signed) {
    const conditionCount = signed.conditions.open + signed.conditions.met + signed.conditions.overdue;
    const next = conditionCount > 0 ? laterRelease(b) : null;
    const tryIt = tryItLine(b, boot.confluence);
    return (
      <Stack space="space.200">
        <SectionMessage appearance="success" title={`Sealed. Record ${signed.number} of Release ${signed.releaseName}`}>
          <Text>{SEAL_PROMISE}</Text>
        </SectionMessage>
        <RecordView
          compact
          autoFinish
          recordId={signed.id}
          boot={boot}
          onOpenFull={onOpenRecord}
          onVerify={onVerify}
          onChanged={() => {
            setPublished(true);
            onChanged();
          }}
        />
        {next ? (
          <Inline space="space.150" alignBlock="center" shouldWrap>
            <Button appearance="primary" isDisabled={!published} onClick={() => seeRelease(next.id)}>
              See it in the next release
            </Button>
            <Text>
              {conditionCount === 1 ? 'Your condition is' : 'Your conditions are'} the first thing Release {next.name} says, until{' '}
              {conditionCount === 1 ? 'it is' : 'they are'} confirmed met.
            </Text>
          </Inline>
        ) : null}
        {tryIt ? <Subtle>{tryIt}</Subtle> : null}
      </Stack>
    );
  }

  if (q.loading && !b) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!b) return <Loading />;

  const refresh = () => {
    setMarks(new Set());
    setB2(false);
    q.reload();
  };

  if (!b.request) {
    const mayWrite = boot.permissions.write;
    const ask = (appearance) =>
      mayWrite ? (
        <Button appearance={appearance} onClick={() => setRequesting(true)}>
          {b.decided ? 'Request sign-off again' : 'Request sign-off'}
        </Button>
      ) : null;
    const decidedConditions = b.decided ? b.decided.conditions.open + b.decided.conditions.met + b.decided.conditions.overdue : 0;
    const next = decidedConditions > 0 ? laterRelease(b) : null;
    return (
      <Stack space="space.150">
        <Inline space="space.100" alignBlock="center">
          <Text weight="bold">Acceptance brief · Release {b.release.name}</Text>
          {b.sample ? <SampleData /> : null}
        </Inline>
        {b.carried.length > 0 ? (
          <Section title="What was promised last time">
            <PromiseLine brief={b} />
            <CarriedGroups groups={b.carried} marks={marks} onOpenRecord={onOpenRecord} />
          </Section>
        ) : null}
        {b.decided ? (
          <EmptyState
            header={`Release ${b.release.name} was ${outcomeText(b.decided.outcome).toLowerCase()} on ${day(b.decided.decidedAt)}`}
            description="A new request starts a new brief and, when it is signed, a new record. The earlier record stays."
            primaryAction={
              <Button appearance="primary" onClick={() => onOpenRecord(b.decided.id)}>
                Open the record
              </Button>
            }
            secondaryAction={ask('default')}
          />
        ) : (
          <EmptyState
            header="Nobody has been asked to sign"
            description={
              mayWrite
                ? 'When the release is ready, or ready enough to be judged, request sign-off.'
                : `Sign-off is requested by someone who may change this project. ${ASK_ADMIN}`
            }
            primaryAction={ask('primary')}
          />
        )}
        {next ? (
          <Inline space="space.150" alignBlock="center" shouldWrap>
            <Text>
              The conditions of this decision are the first thing Release {next.name} says.
            </Text>
            <Button onClick={() => seeRelease(next.id)}>See it in the next release</Button>
          </Inline>
        ) : null}
        {requesting ? (
          <RequestModal
            projectKey={projectKey}
            release={b.release}
            status={b.status}
            createTaskDefault={boot.settings.records.createTask}
            onClose={() => setRequesting(false)}
            onSent={() => {
              setRequesting(false);
              q.reload();
              onChanged();
            }}
          />
        ) : null}
      </Stack>
    );
  }

  const builders = uniquePeople(b.duties.builders.map((f) => f.person));
  const testers = uniquePeople(b.duties.testers.map((f) => f.person));
  const conflicts = b.duties.conflicts;
  // The approver's own part is already said by the conflict about them.
  const ownConflict = conflicts.some((c) => c.person.id === b.viewer.id && c.code !== 'D4');
  const openDefects = b.defects.filter((d) => d.open);
  const nothingOpen = b.open.length === 0 && openDefects.length === 0;
  const changeGroups = groupChanges(b.changes);
  const buildText = buildPhrase(b.release.build, buildsOfRequirements(b.requirements));

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Inline space="space.100" alignBlock="center">
          <Text weight="bold">Acceptance brief · Release {b.release.name}</Text>
          {b.sample ? <SampleData /> : null}
        </Inline>
        <Inline space="space.100" alignBlock="center">
          <Subtle>{q.loading ? 'Reading Jira history…' : assembled(b.assembledAt)}</Subtle>
          <Button onClick={refresh}>Refresh</Button>
        </Inline>
      </Inline>

      {b2 ? (
        <SectionMessage appearance="warning">
          <Text>{B2_MESSAGE}</Text>
        </SectionMessage>
      ) : null}
      {b.historyError ? <ErrorBox error={b.historyError} onRetry={q.reload} /> : null}

      <Stack space="space.050">
        <Text>{b.intro}</Text>
        {b.request.note ? <Text>“{b.request.note}”</Text> : null}
        {b.viewerIsApprover ? null : (
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Subtle>Requested by</Subtle>
            <PersonName person={b.request.requestedBy} />
            <Subtle>Approver</Subtle>
            <PersonName person={b.request.approver} />
          </Inline>
        )}
        {b.request.sample ? <Subtle>The request is part of the sample: a fictional test lead asks. The decision is yours and is real.</Subtle> : null}
        {b.carriedOwn ? <PromiseLine brief={b} /> : null}
      </Stack>

      <Numbered n={1} title="What you are signing" changed={marks.has('counts') || marks.has('build')}>
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Text>
            {buildText ? `${buildText} · ` : ''}{plural(b.totals.requirements, 'requirement')} ·{' '}
            {plural(b.totals.cases, 'acceptance case')}: {countsLine(b.counts)}
          </Text>
          {marks.has('counts') ? <ChangedMark /> : null}
        </Inline>
      </Numbered>

      <Numbered n={2} title="What changed since testing" changed={anyMark(marks, 'change')}>
        {changeGroups.length === 0 ? <Text>Nothing changed since testing.</Text> : null}
        {changeGroups.map((g) => (
          <ChangeGroup key={g.id} group={g} marks={marks} />
        ))}
      </Numbered>

      <Numbered n={3} title="What is still open" changed={anyMark(marks, 'open') || anyMark(marks, 'defect')}>
        {nothingOpen ? <Text>Nothing is still open.</Text> : null}
        {b.open.map((o) => (
          <Inline key={`${o.state}-${o.key}`} space="space.200" spread="space-between" alignBlock="center">
            <Inline space="space.100" alignBlock="center">
              <IssueLink issueKey={o.key} url={o.url} />
              <Text>{o.summary}</Text>
              {o.line ? <Subtle>{o.line}</Subtle> : null}
              {marks.has(`open:${o.key}`) ? <ChangedMark /> : null}
            </Inline>
            <StateLozenge state={o.state} />
          </Inline>
        ))}
        {b.defects.length > 0 ? (
          <Text>
            Defects: {openDefects.length} open of {b.defects.length}.
          </Text>
        ) : null}
        {openDefects.length > 3 ? (
          <DynamicTable
            label="Open defects"
            head={{
              cells: [
                { key: 'key', content: 'Defect' },
                { key: 'priority', content: 'Priority' },
                { key: 'summary', content: 'Summary' },
                { key: 'status', content: 'Status' },
              ],
            }}
            rows={openDefects.map((d) => ({
              key: d.key,
              cells: [
                { key: 'key', content: <IssueLink issueKey={d.key} url={d.url} /> },
                { key: 'priority', content: <Text>{d.priority || '—'}</Text> },
                { key: 'summary', content: <Text>{d.summary}</Text> },
                { key: 'status', content: <Text>{d.status.name}</Text> },
              ],
            }))}
          />
        ) : (
          openDefects.map((d) => (
            <Inline key={d.key} space="space.200" spread="space-between" alignBlock="center">
              <Inline space="space.100" alignBlock="center">
                <IssueLink issueKey={d.key} url={d.url} />
                <Text>{d.summary}</Text>
                {marks.has(`defect:${d.key}`) ? <ChangedMark /> : null}
              </Inline>
              <Inline space="space.100" alignBlock="center">
                <Subtle>{d.priority || 'No priority'}</Subtle>
                <StatusLozenge status={d.status} />
              </Inline>
            </Inline>
          ))
        )}
        {b.graph.state === 'off' ? null : (
          <Stack space="space.050">
            {b.graph.items.length > 0 ? (
              <Text>
                {b.graph.line} {b.graph.note}
              </Text>
            ) : (
              <Subtle>{b.graph.note ? `${b.graph.line} ${b.graph.note}` : b.graph.line}</Subtle>
            )}
            {b.graph.items.map((w, i) =>
              w.kind === 'work_item' ? (
                <Inline key={`${w.relatedKey}-${i}`} space="space.100" alignBlock="center" shouldWrap>
                  <IssueLink issueKey={w.relatedKey} url={w.url} />
                  <Text>{w.title}</Text>
                  <Subtle>not in this release, linked to {w.linkedTo.join(', ')}</Subtle>
                </Inline>
              ) : (
                <Inline key={`${w.issueKey}-${i}`} space="space.100" alignBlock="center" shouldWrap>
                  <IssueLink issueKey={w.issueKey} url={w.issueUrl} />
                  <Subtle>{GRAPH_KIND[w.kind] ?? 'Linked'}</Subtle>
                  {w.url ? (
                    <Link href={w.url} openNewTab>
                      {w.title}
                    </Link>
                  ) : (
                    <Text>{w.title}</Text>
                  )}
                  {w.at ? <Subtle>{day(w.at)}</Subtle> : null}
                </Inline>
              ),
            )}
          </Stack>
        )}
      </Numbered>

      <Numbered n={4} title="Who did what" changed={anyMark(marks, 'conflict')}>
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>Built by</Subtle>
          {builders.length === 0 ? <Text>—</Text> : builders.map((p) => <PersonName key={p.id} person={p} />)}
        </Inline>
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>Tested by</Subtle>
          {testers.length === 0 ? <Text>—</Text> : testers.map((p) => <PersonName key={p.id} person={p} />)}
        </Inline>
        {conflicts.map((c) => (
          <ConflictMessage key={c.id} conflict={c} viewerId={b.viewer.id} changed={marks.has(`conflict:${c.id}`)} />
        ))}
        {conflicts.length === 0 && !b.historyError ? (
          <Text>No conflicts. Nobody tested their own work, and you were not involved in building or testing.</Text>
        ) : ownConflict ? null : (
          <Text>{b.selfLine}</Text>
        )}
        {[...builders, ...testers].some((p) => p.kind === 'sample') ? (
          <Subtle>These people are fictional and are not accounts on your site. Their history is sample data. Yours is real.</Subtle>
        ) : null}
      </Numbered>

      <Numbered n={5} title="What was promised last time" changed={anyMark(marks, 'carried')}>
        {b.carried.length === 0 ? <Text>No earlier conditions.</Text> : null}
        <CarriedGroups groups={b.carried} marks={marks} onOpenRecord={onOpenRecord} />
      </Numbered>

      <Decision
        key={b.request.id}
        brief={b}
        marks={marks}
        reloading={q.loading}
        confluence={boot.confluence}
        onReload={q.reload}
        onB2={(fresh) => {
          setMarks(diffBrief(b, fresh));
          setB2(true);
          q.setData(fresh);
        }}
        onSigned={(record) => {
          setSigned(record);
          onChanged();
        }}
      />
    </Stack>
  );
};
