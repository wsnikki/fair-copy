// [E] Acceptance → Readiness (PRODUCT §4.1): is this release ready to be put in front of the approver, and if not, exactly why.
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  EmptyState,
  Inline,
  Label,
  LinkButton,
  LoadingButton,
  RequiredAsterisk,
  Select,
  Stack,
  TextArea,
  Textfield,
  xcss,
} from '@forge/react';
import { CASE_STATE, COUNT_LABEL, INVOKE, NO_CASE } from '../../contract.js';
import { metLateDays } from '../../domain/carried.js';
import { NO_SINGLE_BUILD, buildPhrase, buildsOfRequirements } from '../../domain/buildWords.js';
import { call, flag, useLoad } from '../shared/api.js';
import { AddCaseModal } from '../shared/AddCaseModal.jsx';
import { FirstRun } from '../shared/Sample.jsx';
import {
  ASK_ADMIN,
  BeforeAfter,
  CarriedCondition,
  ConfirmModal,
  ConflictMessage,
  CountTiles,
  ErrorBox,
  Headline,
  InlineError,
  IssueLink,
  Loading,
  PersonName,
  SampleData,
  Section,
  SectionMessage,
  StateLozenge,
  StatusLozenge,
  Subtle,
  Text,
  day,
  plural,
  valueOf,
} from '../shared/ui.jsx';
import { RequestModal } from './RequestModal.jsx';

/** The filter speaks the words of the four counts. */
const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Needs attention', value: 'attention' },
  { label: COUNT_LABEL.stale.label, value: 'stale' },
  { label: COUNT_LABEL.failing.label, value: 'failing' },
  { label: COUNT_LABEL.unproven.label, value: 'unproven' },
];

const caseMatches = (filter, c) => {
  if (filter === 'all') return true;
  if (filter === 'attention') return c.state !== CASE_STATE.PASSED;
  if (filter === 'stale') return c.state === CASE_STATE.PASSED_THEN_CHANGED;
  if (filter === 'failing') return c.state === CASE_STATE.FAILED || c.state === CASE_STATE.BLOCKED;
  return c.state === CASE_STATE.NOT_RUN;
};
const requirementMatches = (filter, r) => {
  if (filter === 'all') return true;
  if (r.state === NO_CASE) return filter === 'attention' || filter === 'unproven';
  return r.cases.some((c) => caseMatches(filter, c));
};

const indent = xcss({ paddingInlineStart: 'space.500' });
const rowPad = xcss({ paddingBlock: 'space.050' });
const releasePicker = xcss({ width: '220px' });
const BUILD_MAX = 64;

/** Why a pass no longer counts; for an edited text, the words that changed are one click away. */
const ReasonLine = ({ reason }) => {
  const [open, setOpen] = useState(false);
  const hasTexts = (reason.code === 'S1' || reason.code === 'S2') && (reason.before !== null || reason.after !== null);
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center">
        <Subtle>{reason.sentence}</Subtle>
        {hasTexts ? (
          <Button spacing="compact" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide what changed' : 'See what changed'}
          </Button>
        ) : null}
      </Inline>
      {open ? <BeforeAfter before={reason.before} after={reason.after} /> : null}
    </Stack>
  );
};

const CaseRow = ({ c }) => (
  <Stack space="space.025">
    <Inline space="space.200" spread="space-between" alignBlock="center">
      <Inline space="space.100" alignBlock="center">
        <IssueLink issueKey={c.key} url={c.url} />
        <Text>{c.summary}</Text>
      </Inline>
      <Inline space="space.100" alignBlock="center">
        {c.latestRun ? <Subtle>{day(c.latestRun.executedAt)}</Subtle> : null}
        {c.latestRun ? <PersonName person={c.latestRun.executedBy} /> : null}
        <StateLozenge state={c.state} />
      </Inline>
    </Inline>
    {[...c.staleReasons, ...c.notes].map((s, i) => (
      <ReasonLine key={`${s.code}-${i}`} reason={s} />
    ))}
  </Stack>
);

const RequirementRow = ({ r, open, filter, mayWrite, onToggle, onAddCase }) => {
  const cases = r.cases.filter((c) => caseMatches(filter, c));
  return (
    <Box xcss={rowPad}>
      <Stack space="space.050">
        <Inline space="space.200" spread="space-between" alignBlock="center">
          <Inline space="space.100" alignBlock="center">
            <Button appearance="subtle" spacing="compact" iconBefore={open ? 'chevron-down' : 'chevron-right'} onClick={onToggle} />
            <IssueLink issueKey={r.key} url={r.url} />
            <Text weight="medium">{r.summary}</Text>
          </Inline>
          <Inline space="space.100" alignBlock="center">
            {r.state === NO_CASE ? (
              <StateLozenge state={NO_CASE} />
            ) : (
              <Subtle>{r.state === 'all_passed' ? `${plural(r.cases.length, 'case')}, all passed` : plural(r.cases.length, 'case')}</Subtle>
            )}
            <StatusLozenge status={r.status} />
          </Inline>
        </Inline>
        {open ? (
          <Box xcss={indent}>
            <Stack space="space.075">
              {r.state === NO_CASE ? (
                <Inline space="space.100" alignBlock="center">
                  <Text>This requirement has no acceptance case.</Text>
                  {mayWrite ? (
                    <Button spacing="compact" onClick={() => onAddCase(r.key)}>
                      Add case
                    </Button>
                  ) : null}
                </Inline>
              ) : (
                cases.map((c) => <CaseRow key={c.key} c={c} />)
              )}
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
};

const BuildLine = ({ projectKey, release, builds, mayWrite, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [build, setBuild] = useState(release.build || '');
  const [busy, setBusy] = useState(null); // 'save' | 'clear' | null
  const [error, setError] = useState(null);

  const send = async (value, kind) => {
    setBusy(kind);
    setError(null);
    const res = await call(INVOKE.setBuild, { projectKey, releaseId: release.id, build: value });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // The headline and the counts above are read again and say what the new build did to the passes.
    flag(res.data.build ? `Build being accepted is now ${res.data.build}.` : 'Build cleared. Passes are no longer compared with a build.');
    setEditing(false);
    onSaved();
  };
  const save = () => {
    if (!build.trim()) {
      setError(release.build ? 'Enter the build you tested, or choose Clear.' : 'Enter the build you tested.');
      return;
    }
    send(build.trim(), 'save');
  };

  if (!editing) {
    // No build set is a normal state (the sample sets none on purpose): the line says which builds were tested, and
    // only here, beside the button, that no single build is set. With no run yet there is nothing to say.
    const tested = buildPhrase(null, builds);
    const quiet = release.build ? `Build being accepted: ${release.build}` : tested ? `${tested}. ${NO_SINGLE_BUILD}` : mayWrite ? NO_SINGLE_BUILD : null;
    return (
      <Inline space="space.100" alignBlock="center" shouldWrap>
        {quiet ? <Subtle>{quiet}</Subtle> : null}
        {mayWrite ? (
          <Button spacing="compact" onClick={() => setEditing(true)}>
            {release.build ? 'Change' : 'Choose a build'}
          </Button>
        ) : null}
      </Inline>
    );
  }
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="end" shouldWrap>
        <Stack space="space.0">
          <Label labelFor="build">Build being accepted</Label>
          <Textfield id="build" name="build" value={build} maxLength={BUILD_MAX} placeholder="2.4.0-rc2" onChange={(e) => setBuild(valueOf(e))} />
        </Stack>
        <LoadingButton appearance="primary" isLoading={busy === 'save'} isDisabled={busy === 'clear'} onClick={save}>
          Save build
        </LoadingButton>
        {release.build ? (
          <LoadingButton isLoading={busy === 'clear'} isDisabled={busy === 'save'} onClick={() => send('', 'clear')}>
            Clear
          </LoadingButton>
        ) : null}
        <Button appearance="subtle" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Inline>
      <InlineError error={error} />
    </Stack>
  );
};

/** "Confirm met" is a statement by a named person: it needs a note, and it says so when the linked issue is not done. */
const ConfirmMetModal = ({ condition: c, onClose, onConfirmed }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    if (!note.trim()) {
      setError('Write how you know it was done. The note is shown with the condition.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.confirmConditionMet, { conditionId: c.id, note: note.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const late = res.data ? metLateDays(res.data) : 0;
    flag(late > 0 ? `Condition confirmed as met, ${plural(late, 'day')} late.` : 'Condition confirmed as met.');
    onConfirmed();
  };

  return (
    <ConfirmModal title="Confirm this condition as met?" confirmText="Confirm met" busy={busy} error={error} onConfirm={confirm} onClose={onClose}>
      <Text weight="medium">{c.text}</Text>
      {c.linkedIssue && c.linkedIssueDone === false ? (
        <SectionMessage appearance="warning">
          <Text>
            {c.linkedIssue} is still {c.linkedIssueStatus || 'not done'}.
          </Text>
        </SectionMessage>
      ) : null}
      {c.state === 'overdue' && c.daysLate > 0 ? (
        <Subtle>It was due {day(c.dueDate)}. It will be shown as met {plural(c.daysLate, 'day')} late.</Subtle>
      ) : null}
      <Stack space="space.050">
        <Label labelFor="met-note">
          How do you know it was done?
          <RequiredAsterisk />
        </Label>
        <TextArea id="met-note" name="note" value={note} onChange={(e) => setNote(valueOf(e))} />
        <Subtle>Your name, today&apos;s date and this note are shown with the condition.</Subtle>
      </Stack>
    </ConfirmModal>
  );
};

const Carried = ({ groups, mayWrite, onConfirmed }) => {
  const [confirming, setConfirming] = useState(null); // the condition | null
  const open = groups.reduce((n, g) => n + g.conditions.filter((c) => c.state !== 'met').length, 0);
  return (
    <Section title="Carried over from earlier releases" aside={<Subtle>{open} open</Subtle>}>
      {groups.length === 0 ? <Text>No earlier conditions.</Text> : null}
      {groups.map((g) => (
        <Stack key={g.record.id} space="space.075">
          <Text weight="medium">{g.sentence}</Text>
          {g.conditions.map((c) => (
            <CarriedCondition key={c.id} condition={c}>
              {c.state !== 'met' && mayWrite ? (
                <Button spacing="compact" onClick={() => setConfirming(c)}>
                  Confirm met
                </Button>
              ) : null}
            </CarriedCondition>
          ))}
        </Stack>
      ))}
      {confirming ? (
        <ConfirmMetModal
          condition={confirming}
          onClose={() => setConfirming(null)}
          onConfirmed={() => {
            setConfirming(null);
            onConfirmed();
          }}
        />
      ) : null}
    </Section>
  );
};

/** "Naomi Field asked you to decide by 15 Nov 2026." */
const requestLine = (r) => {
  const q = r.request;
  const to = q.approver.id === r.viewer.id ? 'you' : q.approver.name;
  const sample = q.sample ? ' The request is part of the sample; the decision is yours.' : '';
  return `${q.requestedBy.name} asked ${to} to decide by ${day(q.dueDate)}.${sample}`;
};

/**
 * @param {{boot: import('../../contract.js').Bootstrap, projectKey: string, releaseId: string|null, firstRun: boolean,
 *          onRelease: (id: string) => void, onOwn: () => void, onOpenBrief: () => void, onOpenRecord: (id: string) => void,
 *          onChanged: () => void}} props
 */
export const Readiness = ({ boot, projectKey, releaseId, firstRun, onRelease, onOwn, onOpenBrief, onOpenRecord, onChanged }) => {
  const q = useLoad(INVOKE.getReadiness, { projectKey, releaseId: releaseId || null });
  const [filter, setFilter] = useState(FILTERS[0]);
  const [expanded, setExpanded] = useState({});
  const [addCase, setAddCase] = useState(null); // {requirementKey} | null
  const [requesting, setRequesting] = useState(false);
  const [withdraw, setWithdraw] = useState({ asking: false, busy: false, error: null });
  const r = q.data;

  const releaseOptions = useMemo(
    () => (r ? r.releases : boot.releases).map((v) => ({ label: v.released ? `${v.name} (released)` : v.name, value: v.id })),
    [r, boot.releases]
  );

  if (q.loading && !r) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!r) return <Loading />;

  if (firstRun && r.totals.cases === 0) return <FirstRun boot={boot} onOwn={onOwn} onLoaded={onChanged} onPoll={onChanged} />;

  const mayWrite = boot.permissions.write;
  const refresh = () => {
    q.reload();
    onChanged();
  };
  const doWithdraw = async () => {
    setWithdraw({ asking: true, busy: true, error: null });
    const res = await call(INVOKE.withdrawRequest, { requestId: r.request.id });
    if (!res.ok) {
      setWithdraw({ asking: true, busy: false, error: res.error });
      return;
    }
    setWithdraw({ asking: false, busy: false, error: null });
    flag('Request withdrawn.');
    refresh();
  };

  const visible = r.requirements.filter((req) => requirementMatches(filter.value, req));
  const isOpen = (req) => (req.key in expanded ? expanded[req.key] : filter.value !== 'all' || req.state !== 'all_passed');
  const conflicts = r.duties.conflicts;
  const openDefects = r.defects.filter((d) => d.open);
  const samplePeople = [...r.duties.builders, ...r.duties.testers].some((f) => f.person.kind === 'sample');

  return (
    <Stack space="space.200">
      <Inline space="space.200" spread="space-between" alignBlock="start">
        <Headline view={r} showVerdict={!r.request} />
        <Inline space="space.100" alignBlock="center">
          <Label labelFor="release">Release</Label>
          <Box xcss={releasePicker}>
            <Select
              inputId="release"
              name="release"
              options={releaseOptions}
              value={releaseOptions.find((o) => o.value === r.release.id) || null}
              onChange={(o) => o && onRelease(o.value)}
            />
          </Box>
          {r.sample ? <SampleData /> : null}
        </Inline>
      </Inline>

      <CountTiles counts={r.counts} />

      <Inline space="space.200" alignBlock="center" shouldWrap>
        <Subtle>
          {r.release.releaseDate ? `Due ${day(r.release.releaseDate)} · ` : ''}
          {plural(r.totals.requirements, 'requirement')} · {plural(r.totals.cases, 'acceptance case')}
        </Subtle>
        <BuildLine
          key={`${r.release.id}:${r.release.build}`}
          projectKey={projectKey}
          release={r.release}
          builds={buildsOfRequirements(r.requirements)}
          mayWrite={mayWrite}
          onSaved={q.reload}
        />
        {q.loading ? <Subtle>Reading Jira history…</Subtle> : null}
      </Inline>

      {!mayWrite ? <Subtle>You can read this release but not change it. {ASK_ADMIN}</Subtle> : null}
      {r.historyError ? <ErrorBox error={r.historyError} onRetry={q.reload} /> : null}

      {r.request ? (
        <SectionMessage appearance="information">
          <Text>{requestLine(r)}</Text>
          <Inline>
            <Button appearance="primary" onClick={onOpenBrief}>
              Open the brief
            </Button>
          </Inline>
        </SectionMessage>
      ) : null}

      {r.decided ? (
        <Inline space="space.100" alignBlock="center">
          <Button onClick={() => onOpenRecord(r.decided.id)}>Open the record</Button>
          <Subtle>
            Record {r.decided.number} · sealed {day(r.decided.decidedAt)}
          </Subtle>
        </Inline>
      ) : null}

      <Section
        title="Requirements and cases"
        aside={
          <Inline space="space.100" alignBlock="center">
            {mayWrite && r.requirements.length === 0 ? <Subtle>A case tests a requirement: add a requirement to the release first.</Subtle> : null}
            <Label labelFor="show">Show</Label>
            <Select inputId="show" name="show" options={FILTERS} value={filter} onChange={(o) => o && setFilter(o)} />
            <Button isDisabled={!mayWrite || r.requirements.length === 0} onClick={() => setAddCase({ requirementKey: null })}>
              Add case
            </Button>
          </Inline>
        }
      >
        {r.requirements.length === 0 ? (
          <EmptyState
            header="Nothing in this release"
            description={`Give issues the fix version ${r.release.name} in Jira and they will appear here.`}
            primaryAction={
              boot.releasesUrl ? (
                <LinkButton href={boot.releasesUrl} target="_blank">
                  Open releases in Jira
                </LinkButton>
              ) : null
            }
          />
        ) : null}
        {r.requirements.length > 0 && r.totals.cases === 0 ? (
          <EmptyState
            header="No acceptance cases yet"
            description="A case is one check a business user can run. Add one per thing you need to see working."
            primaryAction={
              <Button appearance="primary" isDisabled={!mayWrite} onClick={() => setAddCase({ requirementKey: null })}>
                Add case
              </Button>
            }
          />
        ) : null}
        {r.requirements.length > 0 && visible.length === 0 ? <Text>Nothing to show for this filter.</Text> : null}
        <Stack space="space.0">
          {visible.map((req) => (
            <RequirementRow
              key={req.key}
              r={req}
              filter={filter.value}
              open={isOpen(req)}
              mayWrite={mayWrite}
              onToggle={() => setExpanded((e) => ({ ...e, [req.key]: !isOpen(req) }))}
              onAddCase={(requirementKey) => setAddCase({ requirementKey })}
            />
          ))}
        </Stack>
      </Section>

      {openDefects.length > 0 ? (
        <Section title="Open defects" aside={<Subtle>{`${openDefects.length} open of ${r.defects.length}`}</Subtle>}>
          {openDefects.map((d) => (
            <Inline key={d.key} space="space.200" spread="space-between" alignBlock="center">
              <Inline space="space.100" alignBlock="center">
                <IssueLink issueKey={d.key} url={d.url} />
                <Text>{d.summary}</Text>
              </Inline>
              <Inline space="space.100" alignBlock="center">
                <Subtle>{d.blocking ? `${d.priority}, blocks plain acceptance` : d.priority || 'No priority'}</Subtle>
                <StatusLozenge status={d.status} />
              </Inline>
            </Inline>
          ))}
        </Section>
      ) : null}

      <Section title="Who did what" aside={<Subtle>{plural(conflicts.length, 'conflict')}</Subtle>}>
        {conflicts.length === 0 && !r.historyError ? (
          <Text>No conflicts. Nobody tested their own work, and you were not involved in building or testing.</Text>
        ) : null}
        {conflicts.map((c) => (
          <ConflictMessage key={c.id} conflict={c} viewerId={r.viewer.id} ifNamed={!r.approverNamed} />
        ))}
        {samplePeople ? (
          <Subtle>These people are fictional and are not accounts on your site. Their history is sample data. Yours is real.</Subtle>
        ) : null}
      </Section>

      <Carried groups={r.carried} mayWrite={mayWrite} onConfirmed={q.reload} />

      {!r.request && mayWrite ? (
        <Inline space="space.100" alignInline="end" alignBlock="center">
          {r.totals.requirements === 0 ? (
            <Subtle>Sign-off can be requested once the release has at least one requirement.</Subtle>
          ) : null}
          <Button appearance="primary" isDisabled={r.totals.requirements === 0} onClick={() => setRequesting(true)}>
            {r.decided ? 'Request sign-off again' : 'Request sign-off'}
          </Button>
        </Inline>
      ) : null}

      {r.request && mayWrite ? (
        <Inline space="space.050" alignInline="end" alignBlock="center">
          <Subtle>Asked the wrong person, or too early?</Subtle>
          <Button appearance="subtle" spacing="compact" onClick={() => setWithdraw({ asking: true, busy: false, error: null })}>
            Withdraw request
          </Button>
        </Inline>
      ) : null}

      {addCase ? (
        <AddCaseModal
          projectKey={projectKey}
          releaseId={r.release.id}
          requirements={r.requirements}
          requirementKey={addCase.requirementKey}
          onClose={() => setAddCase(null)}
          onAdded={() => {
            setAddCase(null);
            q.reload();
          }}
        />
      ) : null}

      {requesting ? (
        <RequestModal
          projectKey={projectKey}
          release={r.release}
          status={r.status}
          createTaskDefault={boot.settings.records.createTask}
          onClose={() => setRequesting(false)}
          onSent={() => {
            setRequesting(false);
            refresh();
          }}
        />
      ) : null}

      {withdraw.asking && r.request ? (
        <ConfirmModal
          title="Withdraw this request?"
          confirmText="Withdraw request"
          busy={withdraw.busy}
          error={withdraw.error}
          onConfirm={doWithdraw}
          onClose={() => setWithdraw({ asking: false, busy: false, error: null })}
        >
          <Text>
            The request to {r.request.approver.name} for Release {r.release.name} is closed without a decision. You can
            request sign-off again afterwards.
          </Text>
        </ConfirmModal>
      ) : null}
    </Stack>
  );
};
