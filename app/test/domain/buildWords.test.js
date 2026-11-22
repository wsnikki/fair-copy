// The words for "which build" (SPEC decision 11: the sample sets no build on the release). Pure.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_SINGLE_BUILD, buildPhrase, buildSentence, buildsOfPayload, buildsOfRequirements, buildsOfRuns, buildsTested,
} from '../../src/domain/buildWords.js';
import { assemble } from './fixtures.js';

const RC = ['2.4.0-rc1', '2.4.0-rc2'];

test('builds of runs: each once, sorted; a case with no run or a run with no build is skipped', () => {
  assert.deepEqual(buildsOfRuns([{ build: '2.4.0-rc2' }, null, { build: '2.4.0-rc1' }, { build: '2.4.0-rc2' }, { build: '' }, undefined]), RC);
  assert.deepEqual(buildsOfRuns([]), []);
  assert.deepEqual(buildsOfRequirements(undefined), []);
  assert.deepEqual(buildsOfRequirements([{ cases: [{ latestRun: { build: 'b2' } }, { latestRun: null }] }, { cases: [] }, { cases: [{ latestRun: { build: 'b1' } }] }]), ['b1', 'b2']);
  assert.deepEqual(buildsOfPayload({ items: [{ cases: [{ run: { build: 'b2' } }, { run: null }] }, { cases: [{ run: { build: 'b2' } }] }] }), ['b2']);
});

test('the sample release: no build set, and the latest runs name rc1 and rc2', () => {
  const r = assemble({ build: null });
  assert.deepEqual(buildsOfRequirements(r.requirements), RC);
  assert.equal(buildPhrase(r.release?.build ?? null, buildsOfRequirements(r.requirements)), 'Builds tested: 2.4.0-rc1, 2.4.0-rc2');
});

test('no build set: what was tested is said, never what is missing', () => {
  assert.deepEqual(buildsTested(RC), { label: 'Builds tested', list: '2.4.0-rc1, 2.4.0-rc2' });
  assert.deepEqual(buildsTested(['2.4.0-rc2']), { label: 'Build tested', list: '2.4.0-rc2' });
  assert.equal(buildsTested([]), null);
  assert.equal(buildPhrase(null, RC), 'Builds tested: 2.4.0-rc1, 2.4.0-rc2');
  assert.equal(buildPhrase(undefined, ['2.4.0-rc2']), 'Build tested: 2.4.0-rc2');
  assert.equal(buildPhrase(null, []), null);
  assert.equal(buildSentence(null, RC), 'Builds tested: 2.4.0-rc1, 2.4.0-rc2.');
  assert.equal(buildSentence(null, ['2.4.0-rc2']), 'Build tested: 2.4.0-rc2.');
  assert.equal(buildSentence(null, []), null);
  for (const words of [buildPhrase(null, RC), buildSentence(null, RC), buildPhrase(null, ['x']), buildSentence(null, ['x'])]) {
    assert.ok(!/not set|no build|any build|missing/i.test(words), words);
  }
});

test('a build set on the release: the words are the ones used before, whatever the runs say', () => {
  assert.equal(buildPhrase('2.4.0-rc2', RC), 'Build 2.4.0-rc2');
  assert.equal(buildPhrase('2.4.0-rc2', []), 'Build 2.4.0-rc2');
  assert.equal(buildSentence('2.4.0-rc2', RC), 'The build being accepted is 2.4.0-rc2.');
});

test('the one sentence that says no build is set (Readiness, beside "Choose a build")', () => {
  assert.equal(NO_SINGLE_BUILD, 'No single build is set for this release; each pass names the build it was tested on.');
});
