// Skeleton checks: the contract, the schema and every pure stub load, and the names the slices share agree.
// Slice A adds its rule tests under app/test/domain/. Tests never import @forge/* modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BRAND } from '../src/lib/brand.js';
import { DEFAULT_SETTINGS, ERROR, INVOKE } from '../src/contract.js';
import { MIGRATIONS, TABLES } from '../src/data/schema.js';
import { AppError, fail, failFrom, ok } from '../src/lib/result.js';
import { addDays, compareKeys, daysBetween, formatDay, formatDayTime, shortSeal, toIso } from '../src/lib/format.js';

const DOMAIN = ['caseState', 'staleness', 'duties', 'signingRules', 'canonicalJson', 'seal', 'verify', 'briefFingerprint'];

test('brand is one constant', () => {
  assert.equal(BRAND, 'Fair Copy');
});

test('invoke names are unique and equal to their keys', () => {
  for (const [key, name] of Object.entries(INVOKE)) assert.equal(key, name);
  assert.equal(new Set(Object.values(INVOKE)).size, Object.keys(INVOKE).length);
});

test('migrations: ordered ids, one per table', () => {
  const ids = MIGRATIONS.map((m) => m.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, ids.length);
  for (const table of TABLES) {
    assert.ok(MIGRATIONS.some((m) => m.sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`)), table);
  }
});

test('default settings keep the sample oracle rules on', () => {
  assert.equal(DEFAULT_SETTINGS.rules.staleBlocks, true);
  assert.equal(DEFAULT_SETTINGS.rules.overdueConditionBlocks, false);
});

test('every domain module loads without Forge', async () => {
  for (const name of DOMAIN) {
    const mod = await import(`../src/domain/${name}.js`);
    assert.ok(Object.keys(mod).length > 0, name);
    const source = readFileSync(new URL(`../src/domain/${name}.js`, import.meta.url), 'utf8');
    assert.ok(!/from '@forge\//.test(source), `${name} must not import @forge/*`);
  }
});

test('result helpers', () => {
  assert.deepEqual(ok(1), { ok: true, data: 1 });
  assert.deepEqual(fail('x', 'y'), { ok: false, code: 'x', error: 'y' });
  assert.deepEqual(failFrom(new AppError(ERROR.B1_NOT_APPROVER, 'Only Grace can decide on this release.')), {
    ok: false,
    code: 'B1',
    error: 'Only Grace can decide on this release.',
  });
});

test('format helpers', () => {
  assert.equal(toIso('2026-12-03T15:40:12.345Z'), '2026-12-03T15:40:12Z');
  assert.equal(formatDay('2026-12-05T16:22:00Z', '2026-12-09T00:00:00Z'), '5 Dec');
  assert.equal(formatDay('2026-12-05', '2027-01-02T00:00:00Z'), '5 Dec 2026');
  assert.equal(formatDayTime('2026-12-10T11:42:00Z', null, true), '10 Dec 2026, 11:42 UTC');
  assert.equal(addDays('2026-11-30', 9), '2026-12-09');
  assert.equal(daysBetween('2026-11-30', '2026-12-09T08:00:00Z'), 9);
  assert.equal(shortSeal('3fa94c1e' + '0'.repeat(52) + 'b07d'), '3fa94c1e…b07d');
  assert.deepEqual(['CLM-10', 'CLM-7', 'CLM-8'].sort(compareKeys), ['CLM-7', 'CLM-8', 'CLM-10']);
});
