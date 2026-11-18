// Tes ringkas deterministik dari fuzz server (plan 025): seed tetap, FUZZ_N=60 agar cepat. Fuzz penuh: FUZZ_N=1000 node tests/fuzz/server.fuzz.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFuzz } from './fuzz/server.fuzz.mjs';
import { mutateDataset, MUTATION_NAMES } from './fuzz/mutate.mjs';
import { scaledDataset, timeCalls } from './fuzz/scale.mjs';
import { buildDummy } from './dummy/dataset.mjs';
import { makeRng } from './dummy/prng.mjs';

test('pemutasi: deterministik untuk seed yang sama dan tidak mengubah dataset dasar', () => {
  const base = buildDummy({ seed: 2026 }), snap = JSON.stringify(base);
  const a = mutateDataset(base, makeRng(5), {}), b = mutateDataset(base, makeRng(5), {});
  assert.deepEqual(a.log, b.log);
  assert.equal(JSON.stringify(base), snap);
  assert.ok(MUTATION_NAMES.length >= 25);
});

test('fuzz server: 60 iterasi bermutasi, nol pelanggaran invarian', () => {
  const n = +process.env.FUZZ_N || 60;
  const { violations, stats } = runFuzz({ seed: 1, n });
  assert.equal(stats.iter, n);
  assert.deepEqual(violations.slice(0, 3).map(v => `${v.call} ${v.rule} ${v.detail} :: ${v.tag}`), []);
});

test('skala: 5.000 baris DMS per DT, tiap respons < 3 detik dan tanpa galat', () => {
  const { out, bad } = timeCalls(scaledDataset(5000));
  assert.deepEqual(bad, []);
  Object.entries(out).forEach(([k, ms]) => assert.ok(ms < 3000, k + ' ' + ms + ' ms'));
});
