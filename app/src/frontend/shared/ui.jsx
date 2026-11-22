// [E] Small shared pieces used by every screen. UI Kit only.
import React, { useState } from 'react';
import {
  Box,
  Button,
  Code,
  CodeBlock,
  Heading,
  Inline,
  Link,
  LoadingButton,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage as UiSectionMessage,
  SectionMessageAction,
  Spinner,
  Stack,
  Text as UiText,
  User,
  xcss,
} from '@forge/react';
import {
  CASE_STATE_LOZENGE,
  COUNT_LABEL,
  OUTCOME_LOZENGE,
  VERIFY_RESULT,
  VERIFY_RESULT_TEXT,
  WAIVER_NOT_INDEPENDENT,
} from '../../contract.js';
import { changedPart, formatDay, formatDayTime, plural, shortSeal } from '../../lib/format.js';

/**
 * Text as UI Kit should draw it inside a row. The stock <Text> is a paragraph, and every paragraph after the first one
 * in the same parent gets a 12px top margin, which pushes it off the line in an <Inline>. A span has no such margin;
 * spacing between lines comes from the surrounding <Stack>.
 */
export const Text = (props) => <UiText as="span" {...props} />;

/**
 * A section message whose lines are stacked, with its actions where UI Kit draws them. Write the actions as children
 * (<SectionMessageAction>), next to the lines they belong to.
 */
export const SectionMessage = ({ children, ...rest }) => {
  const all = React.Children.toArray(children);
  const isAction = (child) => Boolean(child) && child.type === SectionMessageAction;
  const actions = all.filter(isAction);
  return (
    <UiSectionMessage {...rest} actions={actions.length > 0 ? actions : undefined}>
      <Stack space="space.075">{all.filter((child) => !isAction(child))}</Stack>
    </UiSectionMessage>
  );
};

// ── text helpers ────────────────────────────────────────────────────────────────────────────────────────────────

/** Every date on screen reads "15 Nov 2026"; every time "15 Nov 2026, 16:22 UTC" (the record page prints the same). */
export const day = (iso) => (iso ? formatDay(iso, null, true) : '—');
export const dayTime = (iso) => (iso ? formatDayTime(iso, null, true) : '—');
/** The same format in the date pickers. */
export const DATE_FORMAT = 'D MMM YYYY';
export const seal8 = (seal) => (seal ? shortSeal(seal) : '—');
export { plural };

/** Value of a UI Kit change event, whatever the component hands over. */
export const valueOf = (e) => (e && e.target ? e.target.value : e);
export const checkedOf = (e) => (e && e.target ? Boolean(e.target.checked) : Boolean(e));

/** "Assembled just now" / "Assembled 10 Dec 2026, 11:42 UTC". */
export const assembled = (iso) => {
  if (!iso) return '';
  const age = Date.now() - Date.parse(iso);
  return age >= 0 && age < 90000 ? 'Assembled just now' : `Assembled ${dayTime(iso)}`;
};

export const fileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
};

/** "2 of 3 passed": a count in the one wording of the four counts. */
export const countOf = (key, n, total) => `${n} of ${total} ${COUNT_LABEL[key].label.toLowerCase()}`;

// ── states ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const Loading = ({ text = 'Reading Jira history…' }) => (
  <Inline space="space.100" alignBlock="center">
    <Spinner size="medium" label={text} />
    <Text>{text}</Text>
  </Inline>
);

/** An error sentence from the resolver, shown as is, with the next step. */
export const ErrorBox = ({ error, onRetry, retryText = 'Try again', children }) => (
  <SectionMessage appearance="error">
    <Stack space="space.100">
      <Text>{error}</Text>
      {children}
      {onRetry ? (
        <Inline>
          <Button appearance="default" onClick={onRetry}>
            {retryText}
          </Button>
        </Inline>
      ) : null}
    </Stack>
  </SectionMessage>
);

export const InlineError = ({ error }) => (error ? <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage> : null);

/** Sentences that could not be done but are no failure (Confluence not connected, …), as the server wrote them. */
export const Notes = ({ notes }) =>
  notes && notes.length > 0 ? (
    <SectionMessage appearance="warning">
      {notes.map((n, i) => (
        <Text key={`note-${i}`}>{n}</Text>
      ))}
    </SectionMessage>
  ) : null;

/**
 * "Are you sure?" for the actions that cannot be taken back.
 * @param {{title: string, confirmText: string, danger?: boolean, busy?: boolean, error?: string|null,
 *          onConfirm: () => void, onClose: () => void, children: any}} props
 */
export const ConfirmModal = ({ title, confirmText, danger = false, busy = false, error = null, onConfirm, onClose, children }) => (
  <ModalTransition>
    <Modal onClose={onClose} width="small">
      <ModalHeader>
        <ModalTitle appearance={danger ? 'danger' : undefined}>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.100">
          {children}
          <InlineError error={error} />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>
          Cancel
        </Button>
        <LoadingButton appearance={danger ? 'danger' : 'primary'} isLoading={busy} onClick={onConfirm}>
          {confirmText}
        </LoadingButton>
      </ModalFooter>
    </Modal>
  </ModalTransition>
);

// ── lozenges ────────────────────────────────────────────────────────────────────────────────────────────────────

/** One per screen, next to the release or the project it is about. Never one per person or row. */
export const SampleData = () => <Lozenge appearance="new">Sample data</Lozenge>;

/** A waiver recorded by the person who signed. */
export const NotIndependent = () => (
  <Lozenge appearance="removed" maxWidth="100%">
    {WAIVER_NOT_INDEPENDENT}
  </Lozenge>
);

export const StateLozenge = ({ state }) => {
  const l = CASE_STATE_LOZENGE[state] || { text: String(state), appearance: 'default' };
  return <Lozenge appearance={l.appearance}>{l.text}</Lozenge>;
};

const RUN_LOZENGE = {
  passed: { text: 'Passed', appearance: 'success' },
  failed: { text: 'Failed', appearance: 'removed' },
  blocked: { text: 'Blocked', appearance: 'removed' },
};
export const RunLozenge = ({ result }) => {
  const l = RUN_LOZENGE[result] || { text: String(result), appearance: 'default' };
  return <Lozenge appearance={l.appearance}>{l.text}</Lozenge>;
};

export const OutcomeLozenge = ({ outcome }) => {
  const l = OUTCOME_LOZENGE[outcome] || { text: String(outcome), appearance: 'default' };
  return <Lozenge appearance={l.appearance}>{l.text}</Lozenge>;
};
export const outcomeText = (outcome) => (OUTCOME_LOZENGE[outcome] ? OUTCOME_LOZENGE[outcome].text : String(outcome));

/** A Jira status, coloured the way Jira colours its three categories. */
const STATUS_APPEARANCE = { todo: 'default', in_progress: 'inprogress', done: 'success' };
export const StatusLozenge = ({ status }) =>
  status && status.name ? <Lozenge appearance={STATUS_APPEARANCE[status.category] || 'default'}>{status.name}</Lozenge> : null;

const CONDITION_LOZENGE = {
  open: { text: 'Open', appearance: 'default' },
  met: { text: 'Met', appearance: 'success' },
  overdue: { text: 'Overdue', appearance: 'removed' },
};
export const ConditionLozenge = ({ state }) => {
  const l = CONDITION_LOZENGE[state] || { text: String(state), appearance: 'default' };
  return <Lozenge appearance={l.appearance}>{l.text}</Lozenge>;
};

/** Green only when every check ran and passed. */
const SEAL_APPEARANCE = {
  [VERIFY_RESULT.INTACT]: 'success',
  [VERIFY_RESULT.BROKEN]: 'removed',
  [VERIFY_RESULT.INTACT_EVIDENCE_MISSING]: 'moved',
  [VERIFY_RESULT.NOT_FULLY_CHECKED]: 'moved',
};
export const SealLozenge = ({ result }) =>
  VERIFY_RESULT_TEXT[result] ? (
    <Lozenge appearance={SEAL_APPEARANCE[result] || 'default'} maxWidth="100%">
      {VERIFY_RESULT_TEXT[result]}
    </Lozenge>
  ) : null;

// ── people and links ────────────────────────────────────────────────────────────────────────────────────────────

/** A person. Sample people are never drawn as Jira accounts: the name only (the screen says once that it is sample data). */
export const PersonName = ({ person }) => {
  if (!person) return <Text>—</Text>;
  if (person.kind === 'sample') return <Text>{person.name}</Text>;
  return <User accountId={person.id} />;
};

/** Distinct people, in first-seen order. */
export const uniquePeople = (people) => {
  const seen = new Set();
  return people.filter((p) => p && !seen.has(p.id) && seen.add(p.id));
};

/** An issue key. A link only where the server gave the address: the frontend builds no Jira address of its own. */
export const IssueLink = ({ issueKey, url }) =>
  url ? (
    <Link href={url} openNewTab>
      {issueKey}
    </Link>
  ) : (
    <Text>{issueKey}</Text>
  );

/** "History" next to a fact, where the server gave the address of that history. */
export const HistoryLink = ({ url }) =>
  url ? (
    <Link href={url} openNewTab>
      History
    </Link>
  ) : null;

// ── the first two lines ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Readiness and the brief open with the same two lines: what the usual sheet would hide, then what was promised last
 * time. The verdict follows in small print only when it says something else.
 * @param {{view: {headline: string, carriedLine: string|null, carriedOverdue: number, verdict: string}}} props
 */
export const Headline = ({ view, showVerdict = true }) => (
  <Stack space="space.050">
    <Heading as="h2" size="large">
      {view.headline}
    </Heading>
    {view.carriedLine ? (
      <Text weight="medium" color={view.carriedOverdue > 0 ? 'color.text.danger' : 'color.text'}>
        {view.carriedLine}
      </Text>
    ) : null}
    {showVerdict && view.verdict && view.verdict !== view.headline ? <Subtle>{view.verdict}</Subtle> : null}
  </Stack>
);

// ── who did what ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One conflict (PRODUCT §4.1, §4.3). About the viewer it speaks in the second person; while nobody has been asked to
 * sign (`ifNamed`), it is a warning about what would happen.
 * @param {{conflict: import('../../contract.js').DutyConflict, viewerId: string, ifNamed?: boolean, changed?: boolean}} props
 */
export const ConflictMessage = ({ conflict: c, viewerId, ifNamed = false, changed = false }) => {
  const own = c.person.id === viewerId && Boolean(c.youSentence);
  const hypothetical = own && ifNamed;
  return (
    <SectionMessage appearance={c.blocking && !hypothetical ? 'error' : 'warning'}>
      <Text weight="medium">{own ? c.youSentence : c.sentence}</Text>
      {hypothetical && c.blocking ? <Text>If you are named as approver, you can sign only with a waiver for this.</Text> : null}
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Subtle>{c.fact}</Subtle>
        {changed ? <ChangedMark /> : null}
        <HistoryLink url={c.historyUrl} />
      </Inline>
    </SectionMessage>
  );
};

/** "Confirmed by Grace Whitlock on 12 Nov 2026: note" for a condition that was confirmed as met; null before that. */
export const confirmedLine = (c) => {
  if (!c || c.state !== 'met' || !c.metAt) return null;
  const who = c.metBy ? ` by ${c.metBy.name}` : '';
  return `Confirmed${who} on ${day(c.metAt)}${c.metNote ? `: ${c.metNote}` : '.'}`;
};

/**
 * A condition carried over from an earlier record: what was promised, then who owes it and where it stands.
 * `condition.line` is "<what>. — <owner and dates>"; children go at the end of the second line (a button, a mark).
 */
export const CarriedCondition = ({ condition: c, children }) => {
  const [what, ...rest] = String(c.line).split(' — ');
  const detail = rest.join(' — ');
  const confirmed = confirmedLine(c);
  return (
    <Stack space="space.025">
      <Inline space="space.100" alignBlock="center">
        <ConditionLozenge state={c.state} />
        <Text>{what}</Text>
      </Inline>
      <Inline space="space.100" alignBlock="center" shouldWrap>
        {detail ? <Subtle>{detail.charAt(0).toUpperCase() + detail.slice(1)}</Subtle> : null}
        {c.linkedIssue ? <IssueLink issueKey={c.linkedIssue} url={c.linkedIssueUrl} /> : null}
        {c.linkedIssue && c.linkedIssueStatus ? <Subtle>{c.linkedIssueStatus}</Subtle> : null}
        {children}
      </Inline>
      {confirmed ? <Subtle>{confirmed}</Subtle> : null}
    </Stack>
  );
};

// ── the four numbers ────────────────────────────────────────────────────────────────────────────────────────────

const tileBase = { padding: 'space.150', borderRadius: 'border.radius', flexGrow: 1, minWidth: '128px' };
const tileStyles = {
  proven: xcss({ ...tileBase, backgroundColor: 'color.background.success' }),
  stale: xcss({ ...tileBase, backgroundColor: 'color.background.warning' }),
  failing: xcss({ ...tileBase, backgroundColor: 'color.background.danger' }),
  unproven: xcss({ ...tileBase, backgroundColor: 'color.background.neutral' }),
};

/** Same component on Readiness, in the brief and on the record, so the numbers are visibly the same numbers. */
export const CountTiles = ({ counts, changed = false }) => (
  <Inline space="space.150" shouldWrap>
    {Object.keys(tileStyles).map((key) => (
      <Box key={key} xcss={tileStyles[key]}>
        <Stack space="space.0">
          <Heading as="h3" size="large">
            {String(counts ? counts[key] : 0)}
          </Heading>
          <Text weight="bold">{COUNT_LABEL[key].label}</Text>
          <Text size="small" color="color.text.subtle">
            {COUNT_LABEL[key].hint}
          </Text>
        </Stack>
      </Box>
    ))}
    {changed ? <ChangedMark /> : null}
  </Inline>
);

/** Marks what differs after a brief reload (B2). */
export const ChangedMark = () => <Lozenge appearance="new">Changed</Lozenge>;

const quietBox = xcss({ backgroundColor: 'color.background.neutral', padding: 'space.100', borderRadius: 'border.radius' });
export const QuietBox = ({ children }) => <Box xcss={quietBox}>{children}</Box>;

const halfBox = xcss({ backgroundColor: 'color.background.neutral', padding: 'space.100', borderRadius: 'border.radius', width: '50%' });
/** One line of a text, with the words that differ from the other version in bold. */
const DiffLine = ({ head, part, tail }) => (
  <Text>
    {head}
    {part ? <UiText as="strong">{part}</UiText> : null}
    {tail}
  </Text>
);
/**
 * "Tested against" next to "It now says" (PRODUCT §4.3): the two texts line by line, only the changed words in bold.
 * @param {{before: string|null, after: string|null}} props
 */
export const BeforeAfter = ({ before, after }) => {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  const paired = a.length === b.length;
  const diffs = paired ? a.map((line, i) => changedPart(line, b[i])) : [changedPart(a.join(' '), b.join(' '))];
  const side = (label, pick, empty) => (
    <Box xcss={halfBox}>
      <Stack space="space.050">
        <Subtle>{label}</Subtle>
        {empty ? <Text>—</Text> : diffs.map((d, i) => <DiffLine key={i} head={d.head} part={pick(d)} tail={d.tail} />)}
      </Stack>
    </Box>
  );
  return (
    <Inline space="space.100" alignBlock="stretch">
      {side('Tested against', (d) => d.was, before === null)}
      {side('It now says', (d) => d.now, after === null)}
    </Inline>
  );
};

const ruleStyle = xcss({ paddingTop: 'space.150' });
/** A titled section with an optional note on the right. */
export const Section = ({ title, aside, children }) => (
  <Box xcss={ruleStyle}>
    <Stack space="space.100">
      <Inline spread="space-between" alignBlock="center">
        <Heading as="h3" size="small">
          {title}
        </Heading>
        {aside || null}
      </Inline>
      {children}
    </Stack>
  </Box>
);

export const Subtle = ({ children }) => (
  <Text size="small" color="color.text.subtle">
    {children}
  </Text>
);

/**
 * A seal is 64 characters: shown short ("67873b17...7971"), the full value one click away. `short` false = the
 * short form is already on screen next to it, so only the button is drawn.
 * @param {{label?: string, seal: string|null, short?: boolean}} props
 */
export const SealValue = ({ label, seal, short = true }) => {
  const [open, setOpen] = useState(false);
  if (!seal) return null;
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        {label ? <Subtle>{label}</Subtle> : null}
        {short ? <Code>{seal8(seal)}</Code> : null}
        <Button spacing="compact" onClick={() => setOpen((o) => !o)}>
          {open ? SEAL_HIDE : SEAL_SHOW}
        </Button>
      </Inline>
      {open ? <CodeBlock text={seal} language="text" showLineNumbers={false} /> : null}
    </Stack>
  );
};
export const SEAL_SHOW = 'Show the full seal';
export const SEAL_HIDE = 'Hide the full seal';

/** Said once, calmly, wherever Confluence is not connected: nothing is wrong, and the record page can come later. */
export const CONFLUENCE_LATER = 'Records are kept in Jira. Connect Confluence later to also get a record page.';

/**
 * Confluence is not connected: one quiet line, never a warning box. The app stays usable and the record is kept and
 * read in Jira. `connectStep` is the server's sentence with the exact step for an administrator, shown on "How".
 * @param {{confluence: {available: boolean, connectStep: string}}} props
 */
export const ConfluenceWarning = ({ confluence }) => {
  const [open, setOpen] = useState(false);
  if (!confluence || confluence.available) return null;
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Subtle>{CONFLUENCE_LATER}</Subtle>
        <Button spacing="compact" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'How'}
        </Button>
      </Inline>
      {open ? <Subtle>{confluence.connectStep}</Subtle> : null}
    </Stack>
  );
};

/** A person the record names but whose name could not be read: never an id on screen. */
export const UNKNOWN_PERSON = 'Unknown person';

/** Said wherever an action is hidden because the viewer may not take it. */
export const ASK_ADMIN = 'Ask a Jira administrator.';

/** The people picker finds people by display name only: an email finds nothing, and the picker does not say why. */
export const PICKER_PLACEHOLDER = 'Search by name';
export const PICKER_HINT = 'Search by name, not by email.';
