// [E] Confluence `macro` "Acceptance seal": the live seal panel at the top of a record page (PRODUCT §4.4, §4.5).
// Calls resolvers only through `invoke(INVOKE.<name>)` from src/contract.js. UI Kit only (@forge/react).
import React, { useCallback, useState } from 'react';
import ForgeReconciler, { Button, LoadingButton, Stack } from '@forge/react';
import { ERROR, INVOKE, VERIFY_RESULT } from '../../contract.js';
import { call, useExtension } from '../shared/api.js';
import { RESTORED, VerifyDetails, canRestore, useVerify } from '../shared/Verify.jsx';
import { ErrorBox, Loading, SectionMessage, Text } from '../shared/ui.jsx';

const SealPanel = ({ pageId }) => {
  const verify = useCallback(() => call(INVOKE.verifyPage, { pageId }), [pageId]);
  const v = useVerify(verify);
  const [details, setDetails] = useState(false);
  const r = v.result;

  if (v.loading) return <Loading text="Checking the seal…" />;
  if (v.error) {
    return v.code === ERROR.NOT_FOUND ? (
      <SectionMessage appearance="information">
        <Text>{v.error}</Text>
      </SectionMessage>
    ) : (
      <ErrorBox error={v.error} onRetry={v.run} />
    );
  }
  if (!r) return <Loading text="Checking the seal…" />;

  // An intact seal is one line until asked; anything else shows its reasons at once.
  const intact = r.result === VERIFY_RESULT.INTACT;

  return (
    <Stack space="space.100">
      <VerifyDetails result={r} details={!intact || details}>
        <Button onClick={v.run}>Verify again</Button>
        {intact ? (
          <Button appearance="subtle" onClick={() => setDetails((d) => !d)}>
            {details ? 'Hide details' : 'Show details'}
          </Button>
        ) : null}
        {canRestore(r) ? (
          <LoadingButton isLoading={v.busy} onClick={() => v.act(INVOKE.restorePage, r.recordId, `Page restored from the sealed record. Reload to see the restored page; the edited version is in the page history.`)}>
            Restore the page from the sealed record
          </LoadingButton>
        ) : null}
      </VerifyDetails>
      {v.note && v.note.error ? <ErrorBox error={v.note.error} /> : null}
      {v.note && v.note.ok ? (
        <SectionMessage appearance="success">
          <Text>{v.note.ok}</Text>
        </SectionMessage>
      ) : null}
    </Stack>
  );
};

const App = () => {
  const ext = useExtension();
  if (ext === null) return <Loading text="Checking the seal…" />;
  return <SealPanel pageId={ext.content && ext.content.id ? String(ext.content.id) : null} />;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
