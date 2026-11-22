// [E] "Add case" (PRODUCT §4.2), opened from Readiness and from the issue panel.
import React, { useState } from 'react';
import {
  Button,
  Label,
  LoadingButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  RequiredAsterisk,
  Select,
  Stack,
  TextArea,
  Textfield,
} from '@forge/react';
import { INVOKE } from '../../contract.js';
import { call, flag } from './api.js';
import { InlineError, Subtle, Text, valueOf } from './ui.jsx';

/**
 * @param {{projectKey: string, releaseId: string, requirements: {key: string, summary: string}[], requirementKey?: string|null,
 *          onClose: () => void, onAdded: (caseKey: string) => void}} props
 */
export const AddCaseModal = ({ projectKey, releaseId, requirements, requirementKey = null, onClose, onAdded }) => {
  const options = requirements.map((r) => ({ label: `${r.key}  ${r.summary}`, value: r.key }));
  const [requirement, setRequirement] = useState(options.find((o) => o.value === requirementKey) || (options.length === 1 ? options[0] : null));
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!requirement) {
      setError('Choose the requirement this case tests.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await call(INVOKE.addCase, {
      projectKey,
      releaseId,
      requirementKey: requirement.value,
      summary: summary.trim(),
      steps: steps.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    flag(`Case added: ${res.data.caseKey}.`);
    onAdded(res.data.caseKey);
  };

  return (
    <ModalTransition>
      <Modal onClose={onClose} width="medium">
        <ModalHeader>
          <ModalTitle>Add case</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            <Text>A case is one check a business user can run. Add one per thing you need to see working.</Text>
            <Stack space="space.050">
              <Label labelFor="case-summary">
                Summary
                <RequiredAsterisk />
              </Label>
              <Textfield id="case-summary" name="summary" value={summary} onChange={(e) => setSummary(valueOf(e))} />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="case-steps">Steps</Label>
              <TextArea id="case-steps" name="steps" value={steps} onChange={(e) => setSteps(valueOf(e))} />
              <Subtle>Written so a business user can run it. Saved as the description of the new issue.</Subtle>
            </Stack>
            <Stack space="space.050">
              <Label labelFor="case-requirement">
                Tests requirement
                <RequiredAsterisk />
              </Label>
              <Select inputId="case-requirement" name="requirement" options={options} value={requirement} onChange={setRequirement} />
            </Stack>
            <InlineError error={error} />
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton appearance="primary" isLoading={busy} isDisabled={!summary.trim()} onClick={save}>
            Add case
          </LoadingButton>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};
