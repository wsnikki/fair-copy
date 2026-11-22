// [E] First run and "Load sample release" (PRODUCT §4.7, DOMAIN §4 scenario: ClaimPoint, project CLM, releases 2.4 and 2.5).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Heading, Icon, Inline, Lozenge, ProgressBar, Stack, xcss } from '@forge/react';
import { router } from '@forge/bridge';
import { COUNT_LABEL, ERROR, INVOKE } from '../../contract.js';
import { BRAND } from '../../lib/brand.js';
import { call } from './api.js';
import { ASK_ADMIN, ConfluenceWarning, ErrorBox, Loading, Subtle, Text } from './ui.jsx';

/** A call that never answered (cut off by the platform) is simply made again: the loader carries on where it stopped. */
const MAX_LOST_CALLS = 3;
const TIMING = 'This takes under a minute.';

/**
 * The loader works in short calls and answers `pending` until it is done (Forge stops a function at 25 seconds).
 * `progress` is the loader's own `{step, of, label}`; `labels` are the step labels it has named so far.
 * @returns {{loading: boolean, progress: {step: number, of: number, label: string}|null, labels: string[], error: string|null, load: () => Promise<void>}}
 */
export const useSampleLoad = (onLoaded) => {
  const [state, setState] = useState({ loading: false, progress: null, labels: [], error: null });
  const live = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState({ loading: true, progress: null, labels: [], error: null });
    let lost = 0;
    let res;
    while (live.current) {
      res = await call(INVOKE.loadSample, {});
      if (res.ok && res.data.pending) {
        lost = 0;
        const progress = res.data.progress || null;
        setState((s) => ({
          loading: true,
          progress,
          labels: progress && progress.label && !s.labels.includes(progress.label) ? [...s.labels, progress.label] : s.labels,
          error: null,
        }));
      } else if (!res.ok && res.code === ERROR.FAILED && lost < MAX_LOST_CALLS) {
        lost += 1;
      } else {
        break;
      }
    }
    running.current = false;
    if (!live.current) return;
    if (!res.ok && res.code !== ERROR.SAMPLE_LOADED) {
      setState({ loading: false, progress: null, labels: [], error: res.error });
      return;
    }
    const data = res.ok ? res.data : {};
    setState({ loading: false, progress: null, labels: [], error: null });
    // No flag here: the screen that opens next says that the sample is loaded.
    if (data.url) {
      try {
        await router.navigate(data.url);
        return;
      } catch (err) {
        // Staying here is fine: the caller reloads and links to the sample project.
      }
    }
    if (onLoaded) onLoaded(data);
  }, [onLoaded]);

  return { ...state, load };
};

/** The load this tab is driving: the loader's own step labels, the finished ones ticked. */
export const SampleProgress = ({ progress, labels }) => {
  const done = progress ? labels.filter((l) => l !== progress.label) : [];
  return (
    <Stack space="space.150">
      <ProgressBar
        ariaLabel="Loading the sample release"
        isIndeterminate={!progress}
        value={progress ? Math.min(1, Math.max(0, (progress.step - 1) / progress.of)) : 0}
      />
      {done.map((label) => (
        <Inline key={label} space="space.100" alignBlock="center">
          <Icon glyph="check-circle" label="Done" color="color.icon.success" />
          <Subtle>{label}</Subtle>
        </Inline>
      ))}
      <Loading text={progress ? `Step ${progress.step} of ${progress.of}: ${progress.label}` : 'Loading the sample release…'} />
      <Subtle>{TIMING} Keep this page open.</Subtle>
    </Stack>
  );
};

/** How often a screen asks again while somebody else's load runs, and when a silent load is offered for taking over. */
const WATCH_EVERY_MS = 4000;
const STALLED_AFTER_MS = 20000;

/**
 * A load that this tab is not driving (another tab, another administrator, or a page that was reloaded half way).
 * It shows where the load is, asks again every few seconds, and lets an administrator carry it on when it stands still.
 * @param {{sample: {progress?: {step: number, of: number, label: string}}, mayLoad: boolean, onPoll: () => void, onContinue: () => void}} props
 */
export const SampleWatch = ({ sample, mayLoad, onPoll, onContinue }) => {
  const progress = sample.progress || null;
  const at = progress ? `${progress.step}:${progress.label}` : '';
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = setInterval(onPoll, WATCH_EVERY_MS);
    return () => clearInterval(timer);
  }, [onPoll]);
  useEffect(() => {
    setStalled(false);
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [at]);
  return (
    <Stack space="space.100">
      <Loading
        text={progress ? `The sample release is being loaded. Step ${progress.step} of ${progress.of}: ${progress.label}` : 'The sample release is being loaded…'}
      />
      <Subtle>{TIMING}</Subtle>
      {stalled && mayLoad ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>The load has not moved for a while. If the page that started it was closed, carry it on here.</Subtle>
          <Button spacing="compact" onClick={onContinue}>
            Continue loading
          </Button>
        </Inline>
      ) : null}
    </Stack>
  );
};

// ── the argument, as a picture ──────────────────────────────────────────────────────────────────────────────────

/** The twelve acceptance cases of the sample release, and what is true of each: 'passed' | 'changed' | 'none'. */
const SHEET = [
  ['Upload a PDF to an open claim', 'passed'],
  ['An oversized or unsafe file is refused', 'passed'],
  ['The document reaches the caseworker', 'passed'],
  ['Award is recalculated for household size', 'passed'],
  ['A backdated change pays the right arrears', 'changed'],
  ['An audit note records who and why', 'changed'],
  ['Email is sent on a status change', 'passed'],
  ['SMS is sent on a status change', 'changed'],
  ['An opted-out claimant gets no message', 'passed'],
  ['A recovery plan above 15% is refused', 'passed'],
  ['Claimant sees the repayment schedule', 'passed'],
  ['Recovery can be paused for hardship', 'none'],
];
const count = (state) => SHEET.filter(([, s]) => s === state).length;
const RAN = SHEET.length - count('none');

const TRUE_LOZENGE = {
  passed: { appearance: 'success', text: COUNT_LABEL.proven.label },
  changed: { appearance: 'moved', text: COUNT_LABEL.stale.label },
  none: { appearance: 'default', text: COUNT_LABEL.unproven.label },
};
/** The usual sheet knows two things only: it passed, or it was not tested. */
const usualLozenge = (state) => (state === 'none' ? TRUE_LOZENGE.none : TRUE_LOZENGE.passed);

const sideBase = {
  padding: 'space.200',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  flexGrow: 1,
  width: '45%',
  minWidth: '300px',
};
const usualSide = xcss({ ...sideBase, borderColor: 'color.border.success', backgroundColor: 'color.background.success' });
const trueSide = xcss({ ...sideBase, borderColor: 'color.border' });

const SheetRows = ({ lozengeOf }) => (
  <Stack space="space.050">
    {SHEET.map(([name, state]) => {
      const l = lozengeOf(state);
      return (
        <Inline key={name} space="space.100" spread="space-between" alignBlock="center">
          <Text size="small">{name}</Text>
          <Lozenge appearance={l.appearance} maxWidth="100%">
            {l.text}
          </Lozenge>
        </Inline>
      );
    })}
  </Stack>
);

/** The same twelve rows twice: as a sign-off sheet shows them, and as they are. Built from boxes; no image. */
const SheetPicture = () => (
  <Inline space="space.200" alignBlock="stretch" shouldWrap>
    <Box xcss={usualSide}>
      <Stack space="space.100">
        <Subtle>The usual sign-off sheet</Subtle>
        <Heading as="h3" size="medium">
          {`${RAN} of ${SHEET.length} passed`}
        </Heading>
        <SheetRows lozengeOf={usualLozenge} />
      </Stack>
    </Box>
    <Box xcss={trueSide}>
      <Stack space="space.100">
        <Subtle>What you would actually be signing</Subtle>
        <Heading as="h3" size="medium">
          {`${count('changed')} of those ${RAN} passes are no longer true`}
        </Heading>
        <SheetRows lozengeOf={(state) => TRUE_LOZENGE[state]} />
        <Inline space="space.100" shouldWrap>
          <Lozenge appearance="removed" maxWidth="100%">
            You built part of this
          </Lozenge>
          <Lozenge appearance="removed" maxWidth="100%">
            Last release: 1 condition overdue
          </Lozenge>
        </Inline>
      </Stack>
    </Box>
  </Inline>
);

/**
 * "Load sample release" for a site administrator; for everybody else, who to ask.
 * @param {{permissions: {siteAdmin: boolean}, onLoad: () => void, appearance?: string}} props
 */
export const LoadSample = ({ permissions, onLoad, appearance = 'primary' }) =>
  permissions.siteAdmin ? (
    <Button appearance={appearance} onClick={onLoad}>
      Load sample release
    </Button>
  ) : (
    <Text>Only a Jira administrator can load the sample release. {ASK_ADMIN}</Text>
  );

/**
 * "Would you sign this?" — the first screen of a site or project with no acceptance data. The argument is the picture;
 * the sample is one click below it.
 * @param {{boot: {permissions: {siteAdmin: boolean}, confluence: {available: boolean, connectStep: string}, sample: any},
 *          onOwn?: () => void, onLoaded: (data: any) => void, onPoll: () => void}} props
 */
export const FirstRun = ({ boot, onOwn, onLoaded, onPoll }) => {
  const s = useSampleLoad(onLoaded);
  let action;
  if (s.loading) action = <SampleProgress progress={s.progress} labels={s.labels} />;
  else if (boot.sample.loading) {
    action = <SampleWatch sample={boot.sample} mayLoad={boot.permissions.siteAdmin} onPoll={onPoll} onContinue={s.load} />;
  } else {
    action = (
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <LoadSample permissions={boot.permissions} onLoad={s.load} />
          {onOwn ? <Button onClick={onOwn}>Start with my own release</Button> : null}
        </Inline>
        <Subtle>
          Loading takes under a minute. It adds one fictional Jira project, ClaimPoint, with release 2.4 (12 acceptance
          cases, one earlier sealed record, and a sign-off request to you from a fictional test lead) and the release after
          it, 2.5, where what you sign comes back. A Jira administrator can delete it again in the settings of {BRAND}.
        </Subtle>
      </Stack>
    );
  }
  return (
    <Stack space="space.200">
      <Stack space="space.050">
        <Heading as="h2" size="large">
          Would you sign this?
        </Heading>
        <Text>
          A sign-off sheet shows passes. It does not show what changed after the test, who built what, or what was promised
          last time. {BRAND} does.
        </Text>
      </Stack>
      <SheetPicture />
      {s.error ? <ErrorBox error={s.error} onRetry={s.load} /> : null}
      <ConfluenceWarning confluence={boot.confluence} title="Records will be kept in Jira only" />
      {action}
    </Stack>
  );
};
