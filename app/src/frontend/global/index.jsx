// [E] jira:globalPage: where a site starts. With no sample loaded it makes the argument and offers the sample; after
// that it is the short list of projects that have acceptance data.
// Calls resolvers only through `invoke(INVOKE.<name>)` from src/contract.js. UI Kit only (@forge/react).
import React from 'react';
import ForgeReconciler, { Inline, LinkButton, Stack } from '@forge/react';
import { INVOKE } from '../../contract.js';
import { BRAND } from '../../lib/brand.js';
import { useLoad } from '../shared/api.js';
import { FirstRun } from '../shared/Sample.jsx';
import { ErrorBox, Loading, SampleData, Section, Subtle, Text } from '../shared/ui.jsx';

/** @param {{projects: {key: string, name: string, url: string}[], sampleKey: string|null}} props */
const Projects = ({ projects, sampleKey }) => (
  <Section title="Projects with acceptance data">
    {projects.map((p) => (
      <Inline key={p.key} space="space.200" spread="space-between" alignBlock="center">
        <Inline space="space.100" alignBlock="center">
          <Text weight="medium">{p.name}</Text>
          <Subtle>{p.key}</Subtle>
          {p.key === sampleKey ? <SampleData /> : null}
        </Inline>
        <Inline>
          <LinkButton appearance={p.key === sampleKey ? 'primary' : 'default'} href={p.url}>
            Open
          </LinkButton>
        </Inline>
      </Inline>
    ))}
  </Section>
);

const App = () => {
  const start = useLoad(INVOKE.getStart, {});
  const s = start.data;

  if (start.loading && !s) return <Loading text="Opening…" />;
  if (start.error) return <ErrorBox error={start.error} onRetry={start.reload} />;
  if (!s) return <Loading text="Opening…" />;

  return (
    <Stack space="space.200">
      {s.sample.loaded ? null : <FirstRun boot={s} onLoaded={start.reload} onPoll={start.reload} />}
      {s.projects.length > 0 ? <Projects projects={s.projects} sampleKey={s.sample.loaded ? s.sample.projectKey : null} /> : null}
      {s.sample.loaded && s.projects.length === 0 ? (
        <Text>{`No project has acceptance data yet. Open the ${BRAND} tab of a Jira project to start.`}</Text>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
