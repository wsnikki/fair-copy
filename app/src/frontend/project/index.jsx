// [E] jira:projectPage "Acceptance": tabs Readiness, Brief, Records (PRODUCT §4.1, §4.3, §4.5, §4.7).
// Calls resolvers only through `invoke(INVOKE.<name>)` from src/contract.js. UI Kit only (@forge/react).
import React, { useEffect, useRef, useState } from 'react';
import ForgeReconciler, {
  Box,
  EmptyState,
  Inline,
  LinkButton,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  xcss,
} from '@forge/react';
import { router } from '@forge/bridge';
import { ERROR, INVOKE } from '../../contract.js';
import { useLoad } from '../shared/api.js';
import { FirstRun, LoadSample, SampleProgress, SampleWatch, useSampleLoad } from '../shared/Sample.jsx';
import { VerifyModal } from '../shared/Verify.jsx';
import { ErrorBox, Loading, SectionMessage, Text } from '../shared/ui.jsx';
import { Brief } from './Brief.jsx';
import { Readiness } from './Readiness.jsx';
import { Records } from './Records.jsx';

const READINESS = 0;
const BRIEF = 1;
const RECORDS = 2;
const panel = xcss({ paddingTop: 'space.200', width: '100%' });

/** A project with no fix version at all: say what to do in Jira, with the address the server found for it. */
const NoReleases = ({ boot, onLoaded, onPoll }) => {
  const s = useSampleLoad(onLoaded);
  if (s.loading) return <SampleProgress progress={s.progress} labels={s.labels} />;
  if (boot.sample.loading) {
    return <SampleWatch sample={boot.sample} mayLoad={boot.permissions.siteAdmin} onPoll={onPoll} onContinue={s.load} />;
  }
  return (
    <Stack space="space.150">
      {s.error ? <ErrorBox error={s.error} onRetry={s.load} /> : null}
      <EmptyState
        header="No releases yet"
        description={`${boot.brand} accepts a Jira release (a fix version). Turn on Releases for this project, then create one.`}
        primaryAction={
          boot.releasesUrl ? (
            <LinkButton appearance="primary" href={boot.releasesUrl} target="_blank">
              Set up releases in Jira
            </LinkButton>
          ) : null
        }
      />
      {/* UI Kit draws only its own elements inside an action prop: a component of ours there stops the whole page. */}
      {!boot.sample.loaded && boot.permissions.siteAdmin ? (
        <Inline alignInline="center">
          <LoadSample permissions={boot.permissions} onLoad={s.load} appearance="default" />
        </Inline>
      ) : null}
    </Stack>
  );
};

/**
 * True at most once a minute per browser tab. Kept in the tab's own storage so that a page that reloads itself
 * cannot do it again and again; where that storage is not available the answer is "no" and the person presses the button.
 */
const mayReloadOnce = () => {
  try {
    const key = 'fair-copy-reloaded-at';
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(key, String(Date.now()));
    return true;
  } catch (err) {
    return false;
  }
};
const App = () => {
  const boot = useLoad(INVOKE.getBootstrap, {});
  const [tab, setTab] = useState(READINESS);
  const [releaseId, setReleaseId] = useState(null);
  const [own, setOwn] = useState(false);
  const [openRecordId, setOpenRecordId] = useState(null);
  const [verifyId, setVerifyId] = useState(null);
  const opened = useRef(null);
  const b = boot.data;
  // The resolver was not reached at all. Seen when the sample is removed and loaded again in the same tab: Jira's page
  // still holds the deleted project, the new one has the same key, and Jira refuses the call before it leaves the
  // browser. A fresh page cures it, so the page reloads itself once and "Try again" reloads the page too.
  const unreachable = Boolean(boot.error) && boot.code === ERROR.FAILED && !b;
  const freshPage = () => router.reload().catch(() => boot.reload());
  useEffect(() => {
    if (unreachable && mayReloadOnce()) freshPage();
  }, [unreachable]);

  if (boot.loading && !b) return <Loading />;
  if (boot.error) return <ErrorBox error={boot.error} onRetry={unreachable ? freshPage : boot.reload} />;
  if (!b) return <Loading />;
  if (!b.project) return <ErrorBox error="This project does not exist any more, or you may not see it." onRetry={boot.reload} />;

  const projectKey = b.project.key;
  const firstRun = !b.sample.loaded && b.recordCount === 0 && !own;
  const sampleElsewhere = b.sample.loaded && b.sample.projectKey && b.sample.projectKey !== projectKey;
  const openRecord = (id) => {
    setOpenRecordId(id);
    setTab(RECORDS);
  };
  // The release the page opened on stays until the reader chooses another: the server's default moves to the next
  // release once this one is decided, and the page must not jump away from a decision that was just sealed.
  const known = (id) => (id && b.releases.some((r) => r.id === id) ? id : null);
  if (!known(opened.current)) opened.current = b.defaultReleaseId;
  const shownReleaseId = known(releaseId) || opened.current;

  let body;
  if (b.releases.length === 0) {
    body = firstRun ? (
      <FirstRun boot={b} onOwn={() => setOwn(true)} onLoaded={boot.reload} onPoll={boot.reload} />
    ) : (
      <NoReleases boot={b} onLoaded={boot.reload} onPoll={boot.reload} />
    );
  } else {
    body = (
      <Tabs id="acceptance-tabs" selected={tab} onChange={(index) => setTab(index)}>
        <TabList>
          <Tab>Readiness</Tab>
          <Tab>Brief</Tab>
          <Tab>{b.recordCount > 0 ? `Records (${b.recordCount})` : 'Records'}</Tab>
        </TabList>
        <TabPanel>
          <Box xcss={panel}>
            {tab === READINESS ? (
              <Readiness
                boot={b}
                projectKey={projectKey}
                releaseId={shownReleaseId}
                firstRun={firstRun}
                onRelease={setReleaseId}
                onOwn={() => setOwn(true)}
                onOpenBrief={() => setTab(BRIEF)}
                onOpenRecord={openRecord}
                onChanged={boot.reload}
              />
            ) : null}
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={panel}>
            {tab === BRIEF ? (
              <Brief
                boot={b}
                projectKey={projectKey}
                releaseId={shownReleaseId}
                onRelease={setReleaseId}
                onOpenRecord={openRecord}
                onVerify={setVerifyId}
                onChanged={boot.reload}
              />
            ) : null}
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={panel}>
            {tab === RECORDS ? (
              <Records
                boot={b}
                projectKey={projectKey}
                openId={openRecordId}
                onOpen={setOpenRecordId}
                onVerify={setVerifyId}
                onChanged={boot.reload}
              />
            ) : null}
          </Box>
        </TabPanel>
      </Tabs>
    );
  }

  return (
    <Stack space="space.200">
      {sampleElsewhere ? (
        <SectionMessage appearance="information">
          <Text>The sample release is in project {b.sample.projectKey}.</Text>
          {b.sampleUrl ? (
            <Inline>
              <LinkButton appearance="link" spacing="none" href={b.sampleUrl}>
                Open {b.sample.projectKey}
              </LinkButton>
            </Inline>
          ) : null}
        </SectionMessage>
      ) : null}
      {body}
      {verifyId ? <VerifyModal recordId={verifyId} onClose={() => setVerifyId(null)} /> : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
