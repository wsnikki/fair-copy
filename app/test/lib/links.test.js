// N12: every Jira address comes from src/lib/links.js. These are the addresses as they are today; a decision to link
// issues another way changes `issuePath` and the first test here, nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';

import { absolute, commentPath, issuePath, projectAppPath, projectPath, releasePath, releasesSetupPath } from '../../src/lib/links.js';
import { computeDuties } from '../../src/domain/duties.js';
import { renderRecordPage } from '../../src/services/recordPage.js';

test('issue, comment, project, release', () => {
  assert.equal(issuePath('CLM-1'), '/browse/CLM-1');
  assert.equal(commentPath('CLM-25', '10042'), '/browse/CLM-25?focusedCommentId=10042');
  assert.equal(projectPath('CLM'), '/browse/CLM');
  assert.equal(releasePath('CLM', '10001'), '/projects/CLM/versions/10001');
});

test("the app's page in a project; the project when the app's ids are unknown", () => {
  assert.equal(projectAppPath('CLM', { appId: 'app-1', environmentId: 'env-2' }), '/jira/software/projects/CLM/apps/app-1/env-2');
  assert.equal(projectAppPath('CLM', null), '/browse/CLM');
});

test('where releases are set up: company-managed and team-managed projects', () => {
  assert.equal(
    releasesSetupPath({ key: 'CLM', style: 'classic' }),
    '/projects/CLM?selectedItem=com.atlassian.jira.jira-projects-plugin:release-page',
  );
  assert.equal(releasesSetupPath({ key: 'CLM', style: 'next-gen' }), '/jira/software/projects/CLM/settings/features');
  assert.equal(releasesSetupPath({ key: 'CLM', style: null }), '/jira/software/projects/CLM/settings/features');
});

test('absolute: the site in front of a path; a full address and an empty path are left alone', () => {
  const site = 'https://example.atlassian.net';
  assert.equal(absolute(site, '/browse/CLM-1'), 'https://example.atlassian.net/browse/CLM-1');
  assert.equal(absolute(site, '/wiki/spaces/CLMACC/pages/123'), 'https://example.atlassian.net/wiki/spaces/CLMACC/pages/123');
  assert.equal(absolute(site, 'https://other.example/x'), 'https://other.example/x');
  assert.equal(absolute('', '/browse/CLM-1'), '/browse/CLM-1', 'site unknown: the link stays relative');
  assert.equal(absolute(undefined, '/browse/CLM-1'), '/browse/CLM-1');
  assert.equal(absolute(site, null), '');
  assert.equal(absolute(site, ''), '');
});

test('the record page and the duty conflicts take their issue links from issuePath', () => {
  const sealed = [
    { path: 'req.CLM-8.summary', where: 'Requirement CLM-8', value: 'CLM-8 Refunds', kind: 'text' },
    { path: 'case.CLM-18.summary', where: 'Case CLM-18', value: 'CLM-18 Refund by the day', kind: 'text' },
  ];
  const record = { number: 1, releaseName: '2.4', outcome: 'accepted' };
  const storage = renderRecordPage(record, {}, sealed, { siteUrl: 'https://example.atlassian.net', anchorIssue: 'CLM-25', conditionIssues: [] });
  for (const key of ['CLM-8', 'CLM-18', 'CLM-25']) {
    assert.ok(storage.includes(`href="https://example.atlassian.net${issuePath(key)}"`), `link to ${key}`);
  }
  assert.ok(renderRecordPage(record, {}, sealed).includes(`href="${issuePath('CLM-8')}"`), 'no site given: relative');

  const person = { id: 'u1', name: 'Ada', kind: 'jira' };
  const duties = computeDuties({
    requirements: [{ key: 'CLM-8', caseKeys: ['CLM-18'], defectKeys: [] }],
    history: {},
    runs: [{ id: '1', caseKey: 'CLM-18', requirementKey: 'CLM-8', result: 'passed', executedAt: '2026-12-01T09:00:00Z', executedBy: person }],
    approver: person,
    requester: null,
    rules: { approverMustNotBuild: true, approverMustNotTest: true, noSelfTest: true },
    now: '2026-12-02T09:00:00Z',
  });
  const withLink = duties.conflicts.filter((c) => c.historyUrl);
  assert.ok(withLink.length > 0, 'the approver tested CLM-18: a conflict that cites an issue');
  for (const c of withLink) assert.match(c.historyUrl, /^\/browse\/CLM-\d+$/);
});
