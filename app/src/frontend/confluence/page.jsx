// [E] confluence:globalPage "Verify seal": every record of a project with its seal state (PRODUCT §4.5).
// Calls resolvers only through `invoke(INVOKE.<name>)` from src/contract.js. UI Kit only (@forge/react).
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Label,
  Link,
  LoadingButton,
  Stack,
  Textfield,
} from '@forge/react';
import { INVOKE, VERIFY_RESULT } from '../../contract.js';
import { BRAND, TAGLINE } from '../../lib/brand.js';
import { call, useLoad } from '../shared/api.js';
import { VerifyDetails } from '../shared/Verify.jsx';
import {
  ErrorBox,
  Loading,
  SampleData,
  SealLozenge,
  SectionMessage,
  Subtle,
  Text,
  dayTime,
  seal8,
  valueOf,
} from '../shared/ui.jsx';

const App = () => {
  const boot = useLoad(INVOKE.getBootstrap, {});
  const [projectKey, setProjectKey] = useState('');
  const [state, setState] = useState({ loading: false, results: null, error: null, key: null });

  const verify = async (key) => {
    const k = key.trim().toUpperCase();
    if (!k) return;
    setState({ loading: true, results: null, error: null, key: k });
    const res = await call(INVOKE.verifyAll, { projectKey: k });
    setState(res.ok ? { loading: false, results: res.data, error: null, key: k } : { loading: false, results: null, error: res.error, key: k });
  };

  const sampleKey = boot.data && boot.data.sample.loaded ? boot.data.sample.projectKey : null;
  useEffect(() => {
    if (sampleKey) {
      setProjectKey(sampleKey);
      verify(sampleKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey]);

  if (boot.loading && !boot.data) return <Loading text="Checking the seal…" />;
  if (boot.error) return <ErrorBox error={boot.error} onRetry={boot.reload} />;

  const results = state.results;
  const notIntact = (results || []).filter((v) => v.result !== VERIFY_RESULT.INTACT);

  return (
    <Stack space="space.200">
      <Stack space="space.050">
        <Heading as="h1" size="large">
          {BRAND}
        </Heading>
        <Subtle>{TAGLINE}</Subtle>
      </Stack>

      <Inline space="space.100" alignBlock="end" shouldWrap>
        <Stack space="space.0">
          <Label labelFor="project-key">Jira project key</Label>
          <Textfield id="project-key" name="projectKey" width="small" value={projectKey} onChange={(e) => setProjectKey(valueOf(e))} />
        </Stack>
        <LoadingButton appearance="primary" isLoading={state.loading} isDisabled={!projectKey.trim()} onClick={() => verify(projectKey)}>
          Verify seals
        </LoadingButton>
        {sampleKey && state.key === sampleKey ? <SampleData /> : null}
      </Inline>

      {state.loading ? <Loading text="Checking the seal…" /> : null}
      {state.error ? <ErrorBox error={state.error} onRetry={() => verify(state.key)} /> : null}

      {results && results.length === 0 ? (
        <EmptyState
          header="No records yet"
          description="Every decision is sealed and listed here. Each record also seals the one before it, so a changed or missing record shows."
        />
      ) : null}

      {results && results.length > 0 && notIntact.length === 0 ? (
        <SectionMessage appearance="success">
          <Text>{results.length === 1 ? 'Seal intact. 1 record checked.' : `Seals intact. ${results.length} records checked.`}</Text>
        </SectionMessage>
      ) : null}

      {results && results.length > 0 ? (
        <DynamicTable
          label="Acceptance records"
          head={{
            cells: [
              { key: 'number', content: '#' },
              { key: 'release', content: 'Release' },
              { key: 'sealed', content: 'Sealed' },
              { key: 'seal', content: 'Seal' },
              { key: 'state', content: 'State' },
              { key: 'page', content: 'Page' },
            ],
          }}
          rows={results.map((v) => ({
            key: v.recordId,
            cells: [
              { key: 'number', content: <Text>{String(v.recordNumber)}</Text> },
              { key: 'release', content: <Text>{v.releaseName}</Text> },
              { key: 'sealed', content: <Text>{dayTime(v.sealedAt)}</Text> },
              { key: 'seal', content: <Text>{seal8(v.seal)}</Text> },
              { key: 'state', content: <SealLozenge result={v.result} /> },
              {
                key: 'page',
                content: v.pageUrl ? (
                  <Link href={v.pageUrl}>Open the record</Link>
                ) : (
                  <Text>—</Text>
                ),
              },
            ],
          }))}
        />
      ) : null}

      {notIntact.map((v) => (
        <VerifyDetails key={v.recordId} result={v} />
      ))}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
