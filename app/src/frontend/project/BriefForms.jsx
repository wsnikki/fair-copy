// [E] "Add condition" and "Add waiver" (PRODUCT §4.3). Drafts are saved on the open request.
import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Inline,
  Label,
  LoadingButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  RequiredAsterisk,
  Stack,
  TextArea,
  Textfield,
  UserPicker,
} from '@forge/react';
import { INVOKE } from '../../contract.js';
import { addDays, dayOf, nowIso } from '../../lib/format.js';
import { call, flag } from '../shared/api.js';
import {
  DATE_FORMAT,
  InlineError,
  PICKER_HINT,
  PICKER_PLACEHOLDER,
  SectionMessage,
  Subtle,
  Text,
  checkedOf,
  day,
  valueOf,
} from '../shared/ui.jsx';

/**
 * A new condition starts with every open item ticked that still needs a condition and has none; an existing one keeps its own list.
 * @param {{requestId: string, condition: import('../../contract.js').Condition|null,
 *          openItems: import('../../contract.js').OpenItem[], onClose: () => void, onSaved: () => void}} props
 */
export const ConditionModal = ({ requestId, condition, openItems, onClose, onSaved }) => {
  const today = dayOf(nowIso());
  const coverable = openItems.filter(
    (o) => o.needs === 'condition' && (!o.coveredBy || (condition && o.coveredBy.by === 'condition' && o.coveredBy.id === condition.id))
  );
  const [text, setText] = useState(condition ? condition.text : '');
  const [covers, setCovers] = useState(condition ? condition.covers : coverable.map((o) => o.id));
  const [ownerId, setOwnerId] = useState(condition ? condition.owner.id : null);
  const [dueDate, setDueDate] = useState(condition ? condition.dueDate : addDays(today, 7));
  // Editing: a draft that has no issue yet is one that waits for a new issue after signing — keep that choice.
  const [createIssue, setCreateIssue] = useState(condition ? !condition.linkedIssue : true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const toggle = (id, on) => setCovers((c) => (on ? [...new Set([...c, id])] : c.filter((x) => x !== id)));

  const save = async () => {
    if (!ownerId || !dueDate) {
      setError('A condition needs an owner and a due date.');
      return;
    }
    if (dueDate < today) {
      setError(`The due date ${day(dueDate)} is in the past. Choose today or a later day.`);
      return;
    }
    setBusy('save');
    setError(null);
    const res = await call(INVOKE.saveCondition, {
      requestId,
      id: condition ? condition.id : null,
      text: text.trim(),
      covers,
      ownerId,
      dueDate,
      createIssue,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    flag(condition ? 'Condition saved.' : 'Condition added.');
    onSaved();
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    const res = await call(INVOKE.deleteCondition, { requestId, id: condition.id });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  return (
    <ModalTransition>
      <Modal onClose={onClose} width="medium">
        <ModalHeader>
          <ModalTitle>{condition ? 'Edit condition' : 'Add condition'}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            <Stack space="space.050">
              <Label labelFor="condition-text">
                What must be done
                <RequiredAsterisk />
              </Label>
              <TextArea id="condition-text" name="text" value={text} onChange={(e) => setText(valueOf(e))} />
            </Stack>

            <Stack space="space.050">
              <Label labelFor="condition-covers">Covers</Label>
              {coverable.length === 0 ? <Subtle>No open item needs a condition.</Subtle> : null}
              {!condition && coverable.length > 1 ? (
                <Subtle>Every open item that still needs a condition is ticked. Untick any that this condition does not cover.</Subtle>
              ) : null}
              {coverable.map((o) => (
                <Checkbox
                  key={o.id}
                  name={`covers-${o.id}`}
                  label={o.label}
                  isChecked={covers.includes(o.id)}
                  onChange={(e) => toggle(o.id, checkedOf(e))}
                />
              ))}
            </Stack>

            <Stack space="space.050">
              <UserPicker
                label="Owner"
                name="owner"
                isRequired
                placeholder={PICKER_PLACEHOLDER}
                description={PICKER_HINT}
                defaultValue={condition && condition.owner.kind === 'jira' ? condition.owner.id : undefined}
                onChange={(u) => setOwnerId(u && u.id ? u.id : null)}
              />
              {condition && condition.owner.kind === 'sample' && ownerId === condition.owner.id ? (
                <Subtle>Owner now: {condition.owner.name}, a fictional person of the sample. Choose someone above to change the owner.</Subtle>
              ) : null}
            </Stack>

            <Stack space="space.050">
              <Label labelFor="condition-due">
                Due
                <RequiredAsterisk />
              </Label>
              <DatePicker
                dateFormat={DATE_FORMAT}
                placeholder={day(addDays(today, 7))}
                weekStartDay={1}
                id="condition-due"
                name="dueDate"
                value={dueDate}
                minDate={today}
                onChange={(v) => setDueDate(valueOf(v) || '')}
              />
            </Stack>

            <Checkbox
              name="createIssue"
              label="Create a Jira issue for this condition in the next release"
              isChecked={createIssue}
              onChange={(e) => setCreateIssue(checkedOf(e))}
            />
            <InlineError error={error} />
          </Stack>
        </ModalBody>
        <ModalFooter>
          {condition ? (
            <LoadingButton appearance="subtle" isLoading={busy === 'remove'} onClick={remove}>
              Remove
            </LoadingButton>
          ) : null}
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton appearance="primary" isLoading={busy === 'save'} isDisabled={!text.trim() || covers.length === 0} onClick={save}>
            Save condition
          </LoadingButton>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};

/**
 * @param {{requestId: string, waiver: import('../../contract.js').Waiver|null, item: import('../../contract.js').OpenItem,
 *          onClose: () => void, onSaved: () => void}} props
 */
export const WaiverModal = ({ requestId, waiver, item, onClose, onSaved }) => {
  const [reason, setReason] = useState(waiver ? waiver.reason : '');
  const [authorisedById, setAuthorisedById] = useState(waiver && waiver.authorisedBy ? waiver.authorisedBy.id : null);
  const [authorisedByName, setAuthorisedByName] = useState(waiver && waiver.authorisedByName ? waiver.authorisedByName : '');
  const [reference, setReference] = useState(waiver ? waiver.reference : '');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const save = async () => {
    if (reason.trim().length < 20) {
      setError('Give a reason of at least 20 characters. It is printed on the record.');
      return;
    }
    const name = authorisedByName.trim();
    if (!authorisedById && !name) {
      setError('Say who authorised this waiver.');
      return;
    }
    setBusy('save');
    setError(null);
    const res = await call(INVOKE.saveWaiver, {
      requestId,
      id: waiver ? waiver.id : null,
      covers: item.id,
      reason: reason.trim(),
      authorisedById: name ? null : authorisedById,
      authorisedByName: name || null,
      reference: reference.trim(),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    flag(waiver ? 'Waiver saved.' : 'Waiver added.');
    onSaved();
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    const res = await call(INVOKE.deleteWaiver, { requestId, id: waiver.id });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  return (
    <ModalTransition>
      <Modal onClose={onClose} width="medium">
        <ModalHeader>
          <ModalTitle>{waiver ? 'Edit waiver' : 'Add waiver'}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            <Inline space="space.100">
              <Text weight="bold">Covers</Text>
              <Text>{waiver ? waiver.coversLabel : item.label}</Text>
            </Inline>

            <Stack space="space.050">
              <Label labelFor="waiver-reason">
                Reason
                <RequiredAsterisk />
              </Label>
              <TextArea id="waiver-reason" name="reason" value={reason} placeholder="At least 20 characters" onChange={(e) => setReason(valueOf(e))} />
            </Stack>

            <Stack space="space.050">
              <UserPicker
                label="Authorised by"
                name="authorisedBy"
                isRequired
                placeholder={PICKER_PLACEHOLDER}
                description={PICKER_HINT}
                defaultValue={waiver && waiver.authorisedBy && waiver.authorisedBy.kind === 'jira' ? waiver.authorisedBy.id : undefined}
                onChange={(u) => setAuthorisedById(u && u.id ? u.id : null)}
              />
              {waiver && waiver.authorisedBy && waiver.authorisedBy.kind === 'sample' && authorisedById === waiver.authorisedBy.id ? (
                <Subtle>
                  Authorised now by {waiver.authorisedBy.name}, a fictional person of the sample. Choose someone above to change that.
                </Subtle>
              ) : null}
              <Label labelFor="waiver-name">or name and title, when they are outside Jira</Label>
              <Textfield id="waiver-name" name="authorisedByName" value={authorisedByName} onChange={(e) => setAuthorisedByName(valueOf(e))} />
            </Stack>

            <Stack space="space.050">
              <Label labelFor="waiver-reference">Reference</Label>
              <Textfield
                id="waiver-reference"
                name="reference"
                value={reference}
                placeholder="Document number or link"
                onChange={(e) => setReference(valueOf(e))}
              />
            </Stack>

            {waiver && !waiver.selfRecorded ? (
              <Subtle>
                Recorded by {waiver.recordedBy.name}
                {waiver.recordedBy.kind === 'sample' ? ' (Sample)' : ''}. If you save a change, the waiver is recorded under your name instead.
              </Subtle>
            ) : null}

            <SectionMessage appearance="information">
              <Text>This waiver applies to this decision only and will be printed on the record.</Text>
            </SectionMessage>
            <InlineError error={error} />
          </Stack>
        </ModalBody>
        <ModalFooter>
          {waiver ? (
            <LoadingButton appearance="subtle" isLoading={busy === 'remove'} onClick={remove}>
              Remove
            </LoadingButton>
          ) : null}
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton appearance="primary" isLoading={busy === 'save'} onClick={save}>
            Save waiver
          </LoadingButton>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};
