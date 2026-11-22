// [E] jira:issuePanel "Acceptance" in three modes (PRODUCT §4.2): a case (record a run), a requirement (its cases), any other issue.
// Calls resolvers only through `invoke(INVOKE.<name>)` from src/contract.js. UI Kit only (@forge/react).
import React, { useState } from 'react';
import ForgeReconciler, {
  Button,
  Checkbox,
  Heading,
  Inline,
  Label,
  LoadingButton,
  RadioGroup,
  RequiredAsterisk,
  SectionMessageAction,
  Select,
  Stack,
  TextArea,
  Textfield,
} from '@forge/react';
import { CASE_STATE, CASE_STATE_LOZENGE, COUNT_LABEL, INVOKE, RUN_RESULT } from '../../contract.js';
import { call, flag, useExtension, useLoad } from '../shared/api.js';
import { AddCaseModal } from '../shared/AddCaseModal.jsx';
import {
  BeforeAfter,
  ErrorBox,
  HistoryLink,
  InlineError,
  IssueLink,
  Loading,
  PersonName,
  RunLozenge,
  SectionMessage,
  StateLozenge,
  Subtle,
  Text,
  checkedOf,
  countOf,
  day,
  dayTime,
  fileSize,
  plural,
  valueOf,
} from '../shared/ui.jsx';

const BUILD_MAX = 64;
const NOTES_MAX = 2000;
/** A long note is cut in the run list; the rest is one click away. */
const NOTES_SHOWN = 300;

const RESULT_OPTIONS = [
  { name: 'result', value: RUN_RESULT.PASSED, label: 'Passed' },
  { name: 'result', value: RUN_RESULT.FAILED, label: 'Failed' },
  { name: 'result', value: RUN_RESULT.BLOCKED, label: 'Blocked' },
];

const RunForm = ({ panel, onRecorded }) => {
  const current = panel.release ? panel.release.build : null;
  const envOptions = panel.environments.map((e) => ({ label: e, value: e }));
  const [result, setResult] = useState(null);
  const [build, setBuild] = useState(current || '');
  const [environment, setEnvironment] = useState(envOptions[0] || null);
  const [notes, setNotes] = useState('');
  const [ticked, setTicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (id, on) => setTicked((t) => (on ? [...new Set([...t, id])] : t.filter((x) => x !== id)));

  const save = async () => {
    if (!result) return setError('Choose a result.');
    if (!build.trim()) return setError('Enter the build you tested.');
    if (result !== RUN_RESULT.PASSED && !notes.trim()) {
      return setError('Say what happened. For a fail: what you did, what you expected, what you saw.');
    }
    if (result === RUN_RESULT.PASSED && panel.passNeedsEvidence && ticked.length === 0) {
      return setError('A pass needs at least one evidence file. Attach a file to this work item, then tick it here.');
    }
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.recordRun, {
      caseKey: panel.issue.key,
      result,
      build: build.trim(),
      environment: environment ? environment.value : '',
      notes: notes.trim(),
      attachmentIds: ticked,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    flag(res.data.flag);
    setResult(null);
    setNotes('');
    setTicked([]);
    return onRecorded(res.data);
  };

  const otherBuild = current && build.trim() && build.trim().toLowerCase() !== current.toLowerCase();

  return (
    <Stack space="space.100">
      <Heading as="h3" size="xsmall">
        Record a run
      </Heading>
      <RadioGroup name="result" options={RESULT_OPTIONS} value={result} onChange={(e) => setResult(valueOf(e))} />
      <Inline space="space.100" alignBlock="start" shouldWrap>
        <Stack space="space.0">
          <Label labelFor="run-build">
            Build tested
            <RequiredAsterisk />
          </Label>
          <Textfield id="run-build" name="build" isCompact width="small" maxLength={BUILD_MAX} value={build} onChange={(e) => setBuild(valueOf(e))} />
        </Stack>
        {envOptions.length > 0 ? (
          <Stack space="space.0">
            <Label labelFor="run-environment">Environment</Label>
            <Select
              inputId="run-environment"
              name="environment"
              spacing="compact"
              options={envOptions}
              value={environment}
              onChange={setEnvironment}
            />
          </Stack>
        ) : null}
      </Inline>
      {envOptions.length === 0 ? (
        <Subtle>This project lists no test environment in its settings, so the run is recorded without one.</Subtle>
      ) : null}
      {otherBuild && result === RUN_RESULT.PASSED ? (
        <SectionMessage appearance="warning">
          <Text>
            You are recording a test of {build.trim()}. The build being accepted is {current}, so this pass will show as “
            {COUNT_LABEL.stale.label}”.
          </Text>
        </SectionMessage>
      ) : null}
      <TextArea
        id="run-notes"
        name="notes"
        isCompact
        minimumRows={2}
        maxLength={NOTES_MAX}
        value={notes}
        placeholder="Notes. For a fail: what you did, what you expected, what you saw."
        onChange={(e) => setNotes(valueOf(e))}
      />
      {panel.attachments.length > 0 ? (
        <Stack space="space.0">
          <Label labelFor="run-evidence">Evidence</Label>
          {panel.attachments.map((a) => (
            <Checkbox
              key={a.id}
              name={`evidence-${a.id}`}
              label={`${a.filename} · ${fileSize(a.size)} · added ${day(a.created)}`}
              isChecked={ticked.includes(a.id)}
              onChange={(e) => toggle(a.id, checkedOf(e))}
            />
          ))}
        </Stack>
      ) : (
        <Subtle>Attach a file to this work item to use it as evidence.</Subtle>
      )}
      <InlineError error={error} />
      <Inline alignInline="end">
        <LoadingButton appearance="primary" isLoading={busy} onClick={save}>
          Record run
        </LoadingButton>
      </Inline>
    </Stack>
  );
};

/** The notes of one run: the first 300 characters, the rest on request. */
const RunNotes = ({ notes }) => {
  const [all, setAll] = useState(false);
  const long = notes.length > NOTES_SHOWN;
  return (
    <Inline space="space.050" alignBlock="center" shouldWrap>
      <Subtle>{`“${long && !all ? `${notes.slice(0, NOTES_SHOWN)}…` : notes}”`}</Subtle>
      {long ? (
        <Button appearance="subtle" spacing="compact" onClick={() => setAll((a) => !a)}>
          {all ? 'Show less' : 'Show more'}
        </Button>
      ) : null}
    </Inline>
  );
};

const CaseMode = ({ panel, onReload }) => {
  const [showChange, setShowChange] = useState(false);
  const [builderWarning, setBuilderWarning] = useState(null);
  const c = panel.caseView;
  const stale = c.state === CASE_STATE.PASSED_THEN_CHANGED;
  const withText = c.staleReasons.filter((s) => s.before !== null || s.after !== null);
  const earlier = panel.runs;

  return (
    <Stack space="space.150">
      <Stack space="space.050">
        <Inline>
          <StateLozenge state={c.state} />
        </Inline>
        {panel.release ? (
          <Subtle>
            Release {panel.release.name}
            {panel.release.build ? ` · build being accepted ${panel.release.build}` : ''}
          </Subtle>
        ) : null}
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>Tests requirement</Subtle>
          {panel.requirement ? <IssueLink issueKey={panel.requirement.key} url={panel.requirement.url} /> : null}
          {panel.requirement ? <Text>{panel.requirement.summary}</Text> : null}
        </Inline>
      </Stack>

      {stale ? (
        <SectionMessage appearance="warning" title="This pass no longer counts.">
          {c.staleReasons.map((s, i) => (
            <Inline key={`${s.code}-${i}`} space="space.100" alignBlock="center" shouldWrap>
              <Text>{s.sentence}</Text>
              <HistoryLink url={s.url} />
            </Inline>
          ))}
          {showChange ? withText.map((s, i) => <BeforeAfter key={`change-${i}`} before={s.before} after={s.after} />) : null}
          {withText.length > 0 && !showChange ? (
            <SectionMessageAction onClick={() => setShowChange(true)}>See what changed</SectionMessageAction>
          ) : null}
        </SectionMessage>
      ) : null}
      {c.notes.map((s, i) => (
        <Subtle key={`note-${i}`}>{s.sentence}</Subtle>
      ))}

      {builderWarning ? (
        <SectionMessage appearance="information">
          <Text>{builderWarning}</Text>
        </SectionMessage>
      ) : null}

      <RunForm
        panel={panel}
        onRecorded={(data) => {
          setBuilderWarning(data.builderWarning || null);
          onReload();
        }}
      />

      <Stack space="space.100">
        <Heading as="h3" size="xsmall">
          {`Earlier runs (${earlier.length})`}
        </Heading>
        {earlier.length === 0 ? (
          <Subtle>{CASE_STATE_LOZENGE.not_run.text}.</Subtle>
        ) : (
          // A list, not a table: the issue view gives the panel a narrow column.
          earlier.map((run) => (
            <Stack key={run.id} space="space.025">
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <RunLozenge result={run.result} />
                <Text>{dayTime(run.executedAt)}</Text>
                <Subtle>{[run.build, run.environment, plural(run.evidence.length, 'file')].filter(Boolean).join(' · ')}</Subtle>
              </Inline>
              <Inline>
                <PersonName person={run.executedBy} />
              </Inline>
              {run.notes ? <RunNotes notes={run.notes} /> : null}
            </Stack>
          ))
        )}
      </Stack>
    </Stack>
  );
};

const RequirementMode = ({ panel, onReload }) => {
  const [adding, setAdding] = useState(false);
  const r = panel.requirementView;
  const passed = r.cases.filter((c) => c.state === CASE_STATE.PASSED).length;
  return (
    <Stack space="space.100">
      <Inline spread="space-between" alignBlock="center">
        <Subtle>{panel.release ? `Release ${panel.release.name}` : ''}</Subtle>
        <Text weight="medium">{r.cases.length === 0 ? CASE_STATE_LOZENGE.no_case.text : countOf('proven', passed, r.cases.length)}</Text>
      </Inline>
      {r.cases.length === 0 ? <Text>This requirement has no acceptance case.</Text> : null}
      {r.cases.map((c) => (
        <Stack key={c.key} space="space.0">
          <Inline space="space.100" spread="space-between" alignBlock="center">
            <Inline space="space.100" alignBlock="center">
              <IssueLink issueKey={c.key} url={c.url} />
              <Text>{c.summary}</Text>
            </Inline>
            <StateLozenge state={c.state} />
          </Inline>
          {[...c.staleReasons, ...c.notes].map((s, i) => (
            <Subtle key={`${s.code}-${i}`}>{s.sentence}</Subtle>
          ))}
        </Stack>
      ))}
      <Inline alignInline="end">
        <Button isDisabled={!panel.release} onClick={() => setAdding(true)}>
          Add case
        </Button>
      </Inline>
      {panel.teachLine ? (
        <SectionMessage appearance="information">
          <Text>{panel.teachLine}</Text>
        </SectionMessage>
      ) : null}
      {adding && panel.release ? (
        <AddCaseModal
          projectKey={panel.release.projectKey}
          releaseId={panel.release.id}
          requirements={[{ key: r.key, summary: r.summary }]}
          requirementKey={r.key}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onReload();
          }}
        />
      ) : null}
    </Stack>
  );
};

const OtherMode = ({ panel, onMarked }) => {
  const options = panel.candidates.map((c) => ({ label: `${c.key}  ${c.summary}`, value: c.key }));
  const [requirement, setRequirement] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const mark = async () => {
    if (!requirement) {
      setError('Choose the requirement this case tests.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.markCase, { issueKey: panel.issue.key, requirementKey: requirement.value });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onMarked(res.data);
  };

  return (
    <Stack space="space.100">
      <Text>This work item is not part of acceptance.</Text>
      <Inline space="space.150" alignBlock="end" shouldWrap>
        <Stack space="space.0">
          <Label labelFor="tests-requirement">Tests requirement</Label>
          <Select inputId="tests-requirement" name="requirement" options={options} value={requirement} onChange={setRequirement} />
        </Stack>
        <LoadingButton isLoading={busy} isDisabled={options.length === 0} onClick={mark}>
          Make this an acceptance case
        </LoadingButton>
      </Inline>
      {options.length === 0 ? <Subtle>This release has no requirement yet that a case could test.</Subtle> : null}
      <InlineError error={error} />
    </Stack>
  );
};

const Panel = ({ issueKey }) => {
  const q = useLoad(INVOKE.getPanel, { issueKey });
  const p = q.data;
  if (q.loading && !p) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!p) return <Loading />;

  if (p.mode === 'no_release') {
    return (
      <Stack space="space.050">
        <Text weight="bold">Not in a release</Text>
        <Text>Acceptance works release by release. Set “Fix versions” on this work item to a release, and it appears here.</Text>
      </Stack>
    );
  }
  if (p.mode === 'case' && p.caseView) return <CaseMode panel={p} onReload={q.reload} />;
  if (p.mode === 'requirement' && p.requirementView) return <RequirementMode panel={p} onReload={q.reload} />;
  return <OtherMode panel={p} onMarked={q.setData} />;
};

const App = () => {
  const ext = useExtension();
  if (ext === null) return <Loading />;
  const issueKey = ext.issue ? ext.issue.key : null;
  if (!issueKey) return <ErrorBox error="That did not work, and nothing was changed." />;
  return <Panel issueKey={issueKey} />;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
