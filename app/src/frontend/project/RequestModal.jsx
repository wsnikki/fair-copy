// [E] "Request sign-off" modal with the approver check (PRODUCT §4.1).
import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Label,
  LoadingButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  RequiredAsterisk,
  Spinner,
  Stack,
  TextArea,
  UserPicker,
} from '@forge/react';
import { ERROR, INVOKE, RELEASE_STATUS } from '../../contract.js';
import { addDays, dayOf, nowIso } from '../../lib/format.js';
import { call, flag } from '../shared/api.js';
import { DATE_FORMAT, InlineError, PICKER_HINT, PICKER_PLACEHOLDER, SectionMessage, Text, checkedOf, day, valueOf } from '../shared/ui.jsx';

/**
 * @param {{projectKey: string, release: import('../../contract.js').Release, status: string, createTaskDefault: boolean,
 *          onClose: () => void, onSent: (request: import('../../contract.js').Request) => void}} props
 */
export const RequestModal = ({ projectKey, release, status, createTaskDefault, onClose, onSent }) => {
  const today = dayOf(nowIso());
  const [approverId, setApproverId] = useState(null);
  // refused: the chosen account cannot be an approver at all (an app, a former user); the request cannot be sent to it.
  const [check, setCheck] = useState({ loading: false, conflicts: [], error: null, refused: false });
  const [dueDate, setDueDate] = useState(release.releaseDate && release.releaseDate >= today ? release.releaseDate : addDays(today, 7));
  const [note, setNote] = useState('');
  const [createTask, setCreateTask] = useState(Boolean(createTaskDefault));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pick = async (user) => {
    const id = user && user.id ? user.id : null;
    setApproverId(id);
    setError(null);
    if (!id) {
      setCheck({ loading: false, conflicts: [], error: null, refused: false });
      return;
    }
    setCheck({ loading: true, conflicts: [], error: null, refused: false });
    const res = await call(INVOKE.checkApprover, { projectKey, releaseId: release.id, approverId: id });
    setCheck(
      res.ok
        ? { loading: false, conflicts: res.data.conflicts || [], error: null, refused: false }
        : { loading: false, conflicts: [], error: res.error, refused: res.code === ERROR.INVALID },
    );
  };

  const blocking = check.conflicts.filter((c) => c.blocking);
  const warnings = check.conflicts.filter((c) => !c.blocking);

  const send = async () => {
    if (!approverId || !dueDate) return;
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.requestSignoff, {
      projectKey,
      releaseId: release.id,
      approverId,
      dueDate,
      note: note.trim(),
      createTask,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    flag(`Request sent to ${res.data.approver.name}.`);
    onSent(res.data);
  };

  return (
    <ModalTransition>
      <Modal onClose={onClose} width="medium">
        <ModalHeader>
          <ModalTitle>Request sign-off for Release {release.name}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            {status === RELEASE_STATUS.NOT_READY ? (
              <SectionMessage appearance="warning">
                <Text>This release is not ready. You can still ask: the approver may reject it, or accept it with conditions.</Text>
              </SectionMessage>
            ) : null}

            <Stack space="space.050">
              <UserPicker
                label="Approver"
                name="approver"
                isRequired
                placeholder={PICKER_PLACEHOLDER}
                description={`Must not have built or tested anything in this release. ${PICKER_HINT}`}
                onChange={pick}
              />
              {check.loading ? <Spinner size="small" label="Reading Jira history…" /> : null}
              {check.error ? <InlineError error={check.error} /> : null}
              {blocking.length > 0 ? (
                <SectionMessage appearance="error">
                  {blocking.map((c) => (
                    <Text key={c.id}>{c.sentence}</Text>
                  ))}
                </SectionMessage>
              ) : null}
              {warnings.length > 0 ? (
                <SectionMessage appearance="warning">
                  {warnings.map((c) => (
                    <Text key={c.id}>{c.sentence}</Text>
                  ))}
                </SectionMessage>
              ) : null}
            </Stack>

            <Stack space="space.050">
              <Label labelFor="request-due">
                Decide by
                <RequiredAsterisk />
              </Label>
              <DatePicker
                dateFormat={DATE_FORMAT}
                placeholder={day(addDays(today, 7))}
                weekStartDay={1}
                id="request-due"
                name="dueDate"
                value={dueDate}
                minDate={today}
                onChange={(v) => setDueDate(valueOf(v) || '')}
              />
            </Stack>

            <Stack space="space.050">
              <Label labelFor="request-note">Note to the approver</Label>
              <TextArea id="request-note" name="note" value={note} onChange={(e) => setNote(valueOf(e))} />
            </Stack>

            <Checkbox
              name="createTask"
              label="Create a Jira task assigned to the approver, so Jira notifies them"
              isChecked={createTask}
              onChange={(e) => setCreateTask(checkedOf(e))}
            />
            <InlineError error={error} />
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton appearance="primary" isLoading={busy} isDisabled={!approverId || !dueDate || check.loading || check.refused} onClick={send}>
            {blocking.length > 0 ? 'Send anyway' : 'Send request'}
          </LoadingButton>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};
