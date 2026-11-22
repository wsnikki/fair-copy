// [E] Verify seal result (PRODUCT §4.5): the same body in the Jira modal, the Confluence seal panel and the Confluence page.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  DynamicTable,
  Icon,
  Inline,
  Link,
  LoadingButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  Stack,
} from '@forge/react';
import { ERROR, INVOKE, VERIFY_RESULT, VERIFY_RESULT_TEXT } from '../../contract.js';
import { call, flag } from './api.js';
import {
  ErrorBox,
  Loading,
  PersonName,
  SealValue,
  SectionMessage,
  Subtle,
  Text,
  dayTime,
  seal8,
} from './ui.jsx';

/** The five checks, in the order they are listed. `anchor` is the seal as the signer posted it in a Jira comment. */
const CHECKS = [
  ['snapshot', 'Stored record'],
  ['page', 'Confluence page'],
  ['chain', 'Earlier records'],
  ['evidence', 'Evidence files'],
  ['anchor', 'Jira comment'],
];

const pageIdOf = (pageUrl) => {
  const m = /\/pages\/(\d+)/.exec(pageUrl || '');
  return m ? m[1] : null;
};

/** Green only for a seal that every check confirmed; red only for a difference; yellow for everything in between. */
export const sealAppearance = (v) =>
  v.result === VERIFY_RESULT.INTACT ? 'success' : v.result === VERIFY_RESULT.BROKEN ? 'error' : 'warning';

const checksOf = (v) => CHECKS.filter(([key]) => v.checks[key]).map(([key, name]) => ({ key, name, check: v.checks[key] }));

/** The one sentence under "Seal broken": what no longer matches. */
const brokenSentence = (v) => {
  if (v.checks.page && v.checks.page.ok === false) return 'The Confluence page no longer matches what was signed.';
  const failed = checksOf(v).find((c) => c.check.ok === false);
  return failed ? `${String(failed.check.message).replace(/\.$/, '')}.` : 'Something no longer matches what was signed.';
};

const CheckRow = ({ name, check }) => {
  const word = check.ok === true ? 'Passed' : check.ok === false ? 'Failed' : 'Not checked';
  const glyph = check.ok === true ? 'check-circle' : check.ok === false ? 'cross-circle' : 'question-circle';
  const color = check.ok === true ? 'color.icon.success' : check.ok === false ? 'color.icon.danger' : 'color.icon.subtle';
  return (
    <Inline space="space.100" alignBlock="center">
      <Icon glyph={glyph} label={`${name}: ${word}`} color={color} />
      <Text>{check.message}</Text>
    </Inline>
  );
};

/** Every difference in one table: where, what was sealed, what is there now. */
const Differences = ({ differences, pageUrl }) => {
  const pageId = pageIdOf(pageUrl);
  const edit = differences.find((d) => d.editedBy || d.editedAt) || null;
  return (
    <Stack space="space.075">
      <DynamicTable
        label="What differs from the sealed record"
        head={{
          cells: [
            { key: 'where', content: 'Where' },
            { key: 'sealed', content: 'Sealed value' },
            { key: 'found', content: 'Found now' },
          ],
        }}
        rows={differences.map((d, i) => ({
          key: `${d.check}-${i}`,
          cells: [
            { key: 'where', content: <Text>{d.where}</Text> },
            { key: 'sealed', content: <Text>{d.sealed ?? '—'}</Text> },
            { key: 'found', content: <Text>{d.found ?? '—'}</Text> },
          ],
        }))}
      />
      {edit ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Subtle>Page last edited by</Subtle>
          {edit.editedBy ? <PersonName person={edit.editedBy} /> : null}
          <Subtle>
            {dayTime(edit.editedAt)}
            {edit.version ? `, version ${edit.version}` : ''}
          </Subtle>
          {pageId ? (
            <Link href={`/wiki/pages/viewpreviousversions.action?pageId=${pageId}`} openNewTab>
              Compare versions
            </Link>
          ) : null}
        </Inline>
      ) : null}
    </Stack>
  );
};

/**
 * One verify result: ONE coloured box that says the result (with the caller's buttons in it), then the checks, the
 * differences, the seal and what happened in Jira since.
 * @param {{result: import('../../contract.js').VerifyResult, showSeal?: boolean, details?: boolean, children?: any}} props
 *   details false = the box only (the seal panel, until "Show details"). children = buttons, drawn inside the box.
 */
export const VerifyDetails = ({ result: v, showSeal = true, details = true, children }) => {
  const checks = checksOf(v);
  // "Nothing to check" (a sample record has no signer; a record with no page) is not a check that failed to run.
  const notRun = checks.filter((c) => c.check.ok === null && !c.check.notApplicable);
  const changed = v.changedSinceSigning || [];
  const identity = `Record ${v.recordNumber} · Release ${v.releaseName} · sealed ${dayTime(v.sealedAt)} · seal ${seal8(v.seal)}`;
  return (
    <Stack space="space.150">
      <SectionMessage appearance={sealAppearance(v)} title={v.title || VERIFY_RESULT_TEXT[v.result]}>
        {v.result === VERIFY_RESULT.BROKEN ? <Text>{brokenSentence(v)}</Text> : null}
        {v.result === VERIFY_RESULT.INTACT_EVIDENCE_MISSING && v.evidenceLine ? <Text>{v.evidenceLine}</Text> : null}
        {v.result === VERIFY_RESULT.NOT_FULLY_CHECKED ? <Text>Nothing differs, but not every check could run:</Text> : null}
        {v.result === VERIFY_RESULT.NOT_FULLY_CHECKED
          ? notRun.map((c) => <Text key={c.key}>{`${c.name}: ${c.check.message}`}</Text>)
          : null}
        <Subtle>{identity}</Subtle>
        {children ? (
          <Inline space="space.100" shouldWrap>
            {children}
          </Inline>
        ) : null}
      </SectionMessage>

      {details && v.differences.length > 0 ? <Differences differences={v.differences} pageUrl={v.pageUrl} /> : null}

      {details && v.result === VERIFY_RESULT.BROKEN && v.checks.snapshot.ok === true ? (
        <Text weight="bold">The stored record still matches its seal: what was signed is unchanged.</Text>
      ) : null}

      {details ? (
        <Stack space="space.075">
          {checks.map((c) => (
            <CheckRow key={c.key} name={c.name} check={c.check} />
          ))}
        </Stack>
      ) : null}

      {details && showSeal ? <SealValue seal={v.seal} short={false} /> : null}

      {changed.length > 0 ? (
        <Stack space="space.025">
          <Subtle>After signing, in Jira (the record is unchanged):</Subtle>
          {changed.map((c, i) => (
            <Subtle key={`${c.issueKey}-${i}`}>{c.sentence}</Subtle>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

/**
 * Verify one record: state, the restore action and the "page is gone" way out. Shared by the modal and the seal panel.
 * @param {() => Promise<any>} verify  resolver call returning a Result<VerifyResult>
 */
export const useVerify = (verify) => {
  const [state, setState] = useState({ loading: true, result: null, error: null, code: null });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const res = await verify();
    setState(res.ok ? { loading: false, result: res.data, error: null, code: null } : { loading: false, result: null, error: res.error, code: res.code });
    return res;
  }, [verify]);

  useEffect(() => {
    run();
  }, [run]);

  const act = useCallback(
    async (name, recordId, done) => {
      setBusy(true);
      setNote(null);
      const res = await call(name, { recordId });
      setBusy(false);
      if (!res.ok) {
        setNote({ error: res.error });
        return;
      }
      if (done) {
        setNote({ ok: done });
        flag(done);
      }
      await run();
    },
    [run]
  );

  return { ...state, busy, note, run, act };
};

export const RESTORED = 'Page restored from the sealed record. The edited version is kept in the page history.';

/** May the page be put back from the sealed record? When it is the page that differs, or it has an older layout. */
export const canRestore = (r) =>
  Boolean(
    r && r.canRestore && r.checks.page &&
      ((r.result === VERIFY_RESULT.BROKEN && r.checks.page.ok === false) || r.checks.page.restorable === true),
  );

/** Verify seal (modal, Jira). `recordId` identifies the record. */
export const VerifyModal = ({ recordId, onClose }) => {
  const verify = useCallback(() => call(INVOKE.verifyRecord, { recordId }), [recordId]);
  const v = useVerify(verify);
  const r = v.result;
  return (
    <ModalTransition>
      <Modal onClose={onClose} width="large">
        <ModalHeader>
          <ModalTitle>Verify seal</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            {v.loading ? <Loading text="Checking the seal…" /> : null}
            {!v.loading && v.error ? (
              v.code === ERROR.CONFLUENCE || v.code === ERROR.NOT_FOUND ? (
                <ErrorBox error={v.error} onRetry={() => v.act(INVOKE.publishPage, recordId, null)} retryText="Publish the page again" />
              ) : (
                <ErrorBox error={v.error} onRetry={v.run} />
              )
            ) : null}
            {!v.loading && r ? <VerifyDetails result={r} /> : null}
            {v.note && v.note.error ? <ErrorBox error={v.note.error} /> : null}
            {v.note && v.note.ok ? (
              <SectionMessage appearance="success">
                <Text>{v.note.ok}</Text>
              </SectionMessage>
            ) : null}
          </Stack>
        </ModalBody>
        <ModalFooter>
          {canRestore(r) ? (
            <LoadingButton appearance="primary" isLoading={v.busy} onClick={() => v.act(INVOKE.restorePage, recordId, RESTORED)}>
              Restore the page from the sealed record
            </LoadingButton>
          ) : null}
          <Button appearance="subtle" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};
