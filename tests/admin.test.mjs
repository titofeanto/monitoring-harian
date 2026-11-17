import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';

const BENAR = 'kodebenar123';

function setup(withHash = true) {
  const probe = loadGs();
  const props = withHash ? { ADMIN_HASH: probe.adminHash_(BENAR) } : {};
  return loadGs({ props });
}
const salah = (g, n) => { for (let i = 0; i < n; i++) g.adminAuth_('salah'); };

test('kode benar tanpa salah sebelumnya: null', () => {
  assert.equal(setup().adminAuth_(BENAR), null);
});

test('4 salah tanpa sleep, salah ke-5 menahan 2 detik', () => {
  const g = setup();
  for (let i = 0; i < 4; i++) assert.equal(g.adminAuth_('salah').error, 'invalid_code');
  assert.ok(!g.__slept);
  assert.equal(g.adminAuth_('salah').error, 'invalid_code');
  assert.ok(g.__slept >= 2000);
});

test('setelah 10 salah, kode benar diterima dan penghitung di-reset', () => {
  const g = setup();
  salah(g, 10);
  assert.equal(g.adminAuth_(BENAR), null);
  const before = g.__slept;
  assert.equal(g.adminAuth_('salah').error, 'invalid_code');
  assert.equal(g.__slept, before);
});

test('setelah 25 salah, kode benar ditolak terkunci', () => {
  const g = setup();
  salah(g, 25);
  assert.equal(g.adminAuth_(BENAR).error, 'terkunci');
});

test('ADMIN_HASH kosong: belum_diatur', () => {
  assert.equal(setup(false).adminAuth_(BENAR).error, 'belum_diatur');
});
