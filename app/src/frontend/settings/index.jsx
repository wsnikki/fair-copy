// [E] jira:projectSettingsPage "Acceptance" (PRODUCT §4.6): sample data, people, rules, what counts, records.
// Calls resolvers only through `invoke(INVOKE.<name>)` from src/contract.js. UI Kit only (@forge/react).
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Checkbox,
  Inline,
  Label,
  LoadingButton,
  Select,
  Stack,
  Textfield,
  Toggle,
  User,
  UserPicker,
} from '@forge/react';
import { router, view } from '@forge/bridge';
import { ERROR, INVOKE, WAIVER_NOT_INDEPENDENT } from '../../contract.js';
import { call, flag, useLoad } from '../shared/api.js';
import { LoadSample, SampleProgress, SampleWatch, useSampleLoad } from '../shared/Sample.jsx';
import {
  ASK_ADMIN,
  ConfirmModal,
  ConfluenceWarning,
  ErrorBox,
  InlineError,
  Loading,
  PICKER_HINT,
  PICKER_PLACEHOLDER,
  Section,
  SectionMessage,
  Subtle,
  Text,
  checkedOf,
  day,
  valueOf,
} from '../shared/ui.jsx';

const RULES = [
  ['staleBlocks', 'A pass that was followed by a change blocks plain acceptance'],
  ['unprovenBlocks', 'A failed, blocked or untested case blocks plain acceptance'],
  ['approverMustNotBuild', 'The approver must not have built anything in the release'],
  ['approverMustNotTest', 'The approver must not have tested anything in the release'],
  ['noSelfTest', 'Nobody may test a requirement they built'],
  ['overdueConditionBlocks', 'An overdue condition from an earlier release blocks acceptance'],
  ['passNeedsEvidence', 'A pass needs at least one evidence file'],
];
const DESCRIPTION_ONLY = { label: 'Description only', value: '' };
const ENVIRONMENT_MAX = 64;

const ids = (picked) => (Array.isArray(picked) ? picked : picked ? [picked] : []).map((u) => u.id).filter(Boolean);
const named = (list) => list.map((x) => ({ label: x.name, value: x.id }));

const RuleToggle = ({ id, label, isChecked, isDisabled, onChange }) => (
  <Inline space="space.100" alignBlock="center">
    <Toggle id={id} isChecked={isChecked} isDisabled={isDisabled} onChange={(e) => onChange(checkedOf(e))} />
    <Label labelFor={id}>{label}</Label>
  </Inline>
);

/**
 * Issue types, chosen from the types this project has. Ids and names are stored together; names alone (the defaults)
 * are matched by name until the list is changed here.
 */
const TypePicker = ({ id, label, options, typeIds, typeNames, isDisabled, onChange }) => {
  const picked = options.filter((o) => (typeIds.length > 0 ? typeIds.includes(o.value) : typeNames.includes(o.label)));
  const absent = typeIds.length > 0 ? [] : typeNames.filter((n) => !options.some((o) => o.label === n));
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      <Select
        inputId={id}
        name={id}
        isMulti
        isDisabled={isDisabled}
        options={options}
        value={picked}
        placeholder="Choose issue types"
        onChange={(sel) => onChange(sel || [])}
      />
      {absent.length > 0 ? <Subtle>{`Also counted by name, but not a type of this project: ${absent.join(', ')}.`}</Subtle> : null}
    </Stack>
  );
};

/** People as names, for a reader who may not change them. */
const PeopleLine = ({ label, accountIds }) => (
  <Inline space="space.100" alignBlock="center" shouldWrap>
    <Subtle>{label}</Subtle>
    {accountIds.length === 0 ? <Text>Anyone who can see the project</Text> : accountIds.map((id) => <User key={id} accountId={id} />)}
  </Inline>
);

/** Load or delete the sample. A site administrator's job: it creates and deletes a whole Jira project. */
const SampleSection = ({ boot, onChanged }) => {
  const sample = boot.sample;
  const admin = boot.permissions.siteAdmin;
  const loader = useSampleLoad(onChanged);
  const [removing, setRemoving] = useState({ asking: false, busy: false, error: null });

  const remove = async () => {
    setRemoving({ asking: true, busy: true, error: null });
    const res = await call(INVOKE.removeSample, { confirm: true });
    if (!res.ok) {
      setRemoving({ asking: true, busy: false, error: res.error });
      return;
    }
    setRemoving({ asking: false, busy: false, error: null });
    flag(res.data.flag);
    // The project this settings page belongs to is gone: go to the app's start page instead of an error.
    try {
      const { localId } = await view.getContext();
      const [, appId, environmentId] = /extension\/([^/]+)\/([^/]+)\//.exec(String(localId)) ?? [];
      if (appId && environmentId) {
        await router.navigate(`/jira/apps/${appId}/${environmentId}`);
        return;
      }
    } catch (err) {
      // Staying is fine: the page below says the project is gone.
    }
    onChanged();
  };

  let body;
  if (loader.loading) body = <SampleProgress progress={loader.progress} labels={loader.labels} />;
  else if (sample.loading) body = <SampleWatch sample={sample} mayLoad={admin} onPoll={onChanged} onContinue={loader.load} />;
  else if (sample.loaded) {
    body = (
      <Inline space="space.150" alignBlock="center" shouldWrap>
        <Text>
          Sample release loaded on {day(sample.loadedAt)}
          {sample.projectKey ? `, in project ${sample.projectKey}` : ''}.
        </Text>
        {admin ? (
          <Button appearance="danger" onClick={() => setRemoving({ asking: true, busy: false, error: null })}>
            Remove sample data
          </Button>
        ) : (
          <Subtle>Only a Jira administrator can remove it. {ASK_ADMIN}</Subtle>
        )}
      </Inline>
    );
  } else {
    body = (
      <Inline space="space.150" alignBlock="center" shouldWrap>
        <Text>The sample adds one fictional Jira project, ClaimPoint, with releases 2.4 and 2.5. Loading takes under a minute.</Text>
        <LoadSample permissions={boot.permissions} onLoad={loader.load} appearance="default" />
      </Inline>
    );
  }

  return (
    <Section title="Sample data">
      {loader.error ? <ErrorBox error={loader.error} onRetry={loader.load} /> : null}
      {body}
      {removing.asking ? (
        <ConfirmModal
          danger
          title="Delete the sample project?"
          confirmText="Delete sample project"
          busy={removing.busy}
          error={removing.error}
          onConfirm={remove}
          onClose={() => setRemoving({ asking: false, busy: false, error: null })}
        >
          <Text>
            This deletes the Jira project {sample.projectKey} with every issue in it (also ones you added), its records and
            their Confluence pages. It cannot be undone.
          </Text>
        </ConfirmModal>
      ) : null}
    </Section>
  );
};

const SettingsForm = ({ boot, projectKey, initial, options, onBootChanged }) => {
  const confluence = boot.confluence;
  const [s, setS] = useState(initial);
  const [envText, setEnvText] = useState(initial.whatCounts.environments.join(', '));
  const [spaces, setSpaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [refused, setRefused] = useState(false);
  const [test, setTest] = useState({ loading: false, ok: null, message: null });
  const readOnly = !boot.permissions.projectAdmin || refused;

  useEffect(() => {
    let live = true;
    if (confluence.available) {
      call(INVOKE.listSpaces, {}).then((res) => live && res.ok && setSpaces(res.data));
    }
    return () => {
      live = false;
    };
  }, [confluence.available]);

  const patch = (group, values) => setS((cur) => ({ ...cur, [group]: { ...cur[group], ...values } }));

  const typeOptions = named(options.issueTypes);
  const priorityOptions = named(options.priorities);
  const fieldOptions = [DESCRIPTION_ONLY, ...named(options.fields)];
  const criteria = s.whatCounts.criteriaField || '';
  // A stored field that the site no longer has is named as that, never by its id.
  if (criteria && !fieldOptions.some((o) => o.value === criteria)) {
    fieldOptions.push({ label: 'A field that is no longer on this site', value: criteria });
  }
  const priority = s.rules.defectBlockPriorityId
    ? priorityOptions.find((o) => o.value === s.rules.defectBlockPriorityId)
    : priorityOptions.find((o) => o.label === s.rules.defectBlockPriority);

  const OWN_SPACE = { label: `Let ${boot.brand} create its own space`, value: '' };
  const spaceOptions = [OWN_SPACE, ...spaces.map((sp) => ({ label: `${sp.name} (${sp.key})`, value: sp.key }))];
  if (s.records.spaceKey && !spaceOptions.some((o) => o.value === s.records.spaceKey)) {
    spaceOptions.push({ label: s.records.spaceKey, value: s.records.spaceKey });
  }

  const setEnvironments = (text) => {
    setEnvText(text);
    const words = text
      .split(',')
      .map((w) => w.trim().slice(0, ENVIRONMENT_MAX))
      .filter(Boolean);
    patch('whatCounts', { environments: [...new Set(words)] });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.saveSettings, { projectKey, settings: s });
    setBusy(false);
    if (!res.ok) {
      if (res.code === ERROR.FORBIDDEN) setRefused(true);
      setError(res.error);
      return;
    }
    setS(res.data);
    setEnvText(res.data.whatCounts.environments.join(', '));
    flag('Settings saved.');
  };

  const testConnection = async () => {
    setTest({ loading: true, ok: null, message: null });
    const res = await call(INVOKE.testConnection, { spaceKey: s.records.spaceKey });
    setTest(res.ok ? { loading: false, ok: res.data.ok, message: res.data.message } : { loading: false, ok: false, message: res.error });
  };

  return (
    <Stack space="space.200">
      <Subtle>The defaults work on a new site. Turning a rule off never hides the fact: it only decides whether it blocks plain acceptance.</Subtle>
      {readOnly ? (
        <SectionMessage appearance="information">
          <Text>Only a project administrator can change these.</Text>
        </SectionMessage>
      ) : null}

      <SampleSection boot={boot} onChanged={onBootChanged} />

      <Section title="People">
        {readOnly ? (
          <PeopleLine label="Who may be named as approver" accountIds={s.people.approvers} />
        ) : (
          <UserPicker
            label="Who may be named as approver"
            name="approvers"
            isMulti
            defaultValue={s.people.approvers}
            placeholder={PICKER_PLACEHOLDER}
            description={`${PICKER_HINT} Leave empty to allow anyone who can see the project.`}
            onChange={(picked) => patch('people', { approvers: ids(picked) })}
          />
        )}
        {readOnly ? (
          <PeopleLine label="Who may record a waiver" accountIds={s.people.waiverAuthorities} />
        ) : (
          <UserPicker
            label="Who may record a waiver"
            name="waiverAuthorities"
            isMulti
            defaultValue={s.people.waiverAuthorities}
            placeholder={PICKER_PLACEHOLDER}
            description={`${PICKER_HINT} Leave empty to allow anyone who can see the project.`}
            onChange={(picked) => patch('people', { waiverAuthorities: ids(picked) })}
          />
        )}
        <Checkbox
          name="approverMayRecordOwnWaiver"
          label="The approver may record their own waiver"
          isChecked={s.people.approverMayRecordOwnWaiver}
          isDisabled={readOnly}
          onChange={(e) => patch('people', { approverMayRecordOwnWaiver: checkedOf(e) })}
        />
        <Subtle>{`Such a waiver is marked "${WAIVER_NOT_INDEPENDENT}" on the brief and on the record.`}</Subtle>
      </Section>

      <Section title="Rules">
        {RULES.map(([key, label]) => (
          <RuleToggle
            key={key}
            id={`rule-${key}`}
            label={label}
            isChecked={Boolean(s.rules[key])}
            isDisabled={readOnly}
            onChange={(v) => patch('rules', { [key]: v })}
          />
        ))}
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Label labelFor="defect-priority">Open defects block acceptance at priority</Label>
          <Select
            inputId="defect-priority"
            name="defectBlockPriority"
            isDisabled={readOnly}
            options={priorityOptions}
            value={priority || null}
            onChange={(o) => o && patch('rules', { defectBlockPriorityId: o.value, defectBlockPriority: o.label })}
          />
          <Text>and above</Text>
        </Inline>
      </Section>

      <Section title="What counts">
        <TypePicker
          id="requirement-types"
          label="Requirement issue types"
          options={typeOptions}
          typeIds={s.whatCounts.requirementTypeIds}
          typeNames={s.whatCounts.requirementTypes}
          isDisabled={readOnly}
          onChange={(sel) => patch('whatCounts', { requirementTypeIds: sel.map((o) => o.value), requirementTypes: sel.map((o) => o.label) })}
        />
        <TypePicker
          id="defect-types"
          label="Defect issue types"
          options={typeOptions}
          typeIds={s.whatCounts.defectTypeIds}
          typeNames={s.whatCounts.defectTypes}
          isDisabled={readOnly}
          onChange={(sel) => patch('whatCounts', { defectTypeIds: sel.map((o) => o.value), defectTypes: sel.map((o) => o.label) })}
        />
        <Stack space="space.050">
          <Label labelFor="criteria-field">Acceptance criteria field</Label>
          <Select
            inputId="criteria-field"
            name="criteriaField"
            isDisabled={readOnly}
            options={fieldOptions}
            value={fieldOptions.find((o) => o.value === criteria) || DESCRIPTION_ONLY}
            onChange={(o) => patch('whatCounts', { criteriaField: o && o.value ? o.value : null })}
          />
          <Subtle>The field where your team writes acceptance criteria. An edit to it after a test counts as a change.</Subtle>
        </Stack>
        <Stack space="space.050">
          <Label labelFor="environments">Environments</Label>
          <Textfield
            id="environments"
            name="environments"
            width="large"
            isDisabled={readOnly}
            value={envText}
            placeholder="UAT, Staging"
            onChange={(e) => setEnvironments(valueOf(e))}
          />
          <Subtle>Where tests are run. Separate the names with commas.</Subtle>
        </Stack>
      </Section>

      <Section title="Records">
        {confluence.available ? (
          <Stack space="space.050">
            <Label labelFor="space">Confluence space for records</Label>
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Select
                inputId="space"
                name="spaceKey"
                isDisabled={readOnly}
                options={spaceOptions}
                value={spaceOptions.find((o) => o.value === (s.records.spaceKey || '')) || OWN_SPACE}
                onChange={(o) => patch('records', { spaceKey: o && o.value ? o.value : null })}
              />
              <LoadingButton isLoading={test.loading} onClick={testConnection}>
                Test connection
              </LoadingButton>
            </Inline>
            {test.message ? (
              <SectionMessage appearance={test.ok ? 'success' : 'error'}>
                <Text>{test.message}</Text>
              </SectionMessage>
            ) : null}
          </Stack>
        ) : (
          <ConfluenceWarning confluence={confluence} />
        )}
        <RuleToggle
          id="create-task"
          label="Create a Jira task for the approver when sign-off is requested"
          isChecked={s.records.createTask}
          isDisabled={readOnly}
          onChange={(v) => patch('records', { createTask: v })}
        />
      </Section>

      <InlineError error={error} />
      {readOnly ? null : (
        <Inline alignInline="end">
          <LoadingButton appearance="primary" isLoading={busy} onClick={save}>
            Save
          </LoadingButton>
        </Inline>
      )}
    </Stack>
  );
};

const App = () => {
  const boot = useLoad(INVOKE.getBootstrap, {});
  const projectKey = boot.data && boot.data.project ? boot.data.project.key : null;
  const q = useLoad(INVOKE.getSettings, projectKey ? { projectKey } : null);

  if (boot.error) return <ErrorBox error={boot.error} onRetry={boot.reload} />;
  if (boot.data && !boot.data.project) {
    return <ErrorBox error={`This project does not exist any more, or you may not see it. Open Apps → ${boot.data.brand} to start again.`} />;
  }
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!boot.data || !q.data) return <Loading text="Reading the settings…" />;

  return <SettingsForm boot={boot.data} projectKey={projectKey} initial={q.data.settings} options={q.data.options} onBootChanged={boot.reload} />;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
