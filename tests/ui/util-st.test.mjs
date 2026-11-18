// Uji helper ikon status (.st) dan pembaca angka untuk tabel urut di assets/util.js. Tanpa DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../assets/util.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const { stIcon, stOf, stLegend, numOf } = ctx.window.MHUtil;

test('stIcon: tiap status punya aria-label teks, bukan hanya warna', () => {
  assert.match(stIcon('bad'), /aria-label="Belum capai"/);
  assert.match(stIcon('mid'), /aria-label="Hampir"/);
  assert.match(stIcon('ok'), /aria-label="Tercapai"/);
  assert.equal(stIcon('x'), '');
});
test('stIcon dekoratif (legenda) disembunyikan dari pembaca layar', () => {
  assert.match(stIcon('ok', true), /aria-hidden="true"/);
  assert.doesNotMatch(stIcon('ok', true), /aria-label/);
});
test('stOf memetakan kelas klasifikasi yang sudah ada, kelas lain kosong', () => {
  assert.equal(stOf('okc'), 'ok');
  assert.equal(stOf('amb'), 'mid');
  assert.equal(stOf('neg'), 'bad');
  assert.equal(stOf('plus'), '');
  assert.equal(stOf(''), '');
});
test('stLegend memuat tiga arti ikon', () => {
  const l = stLegend();
  ['Belum capai', 'Hampir', 'Tercapai', 'Arti ikon:'].forEach(t => assert.ok(l.includes(t), t));
});
test('numOf membaca angka format Indonesia', () => {
  assert.equal(numOf('1.234.567'), 1234567);
  assert.equal(numOf('Rp 2.500.000'), 2500000);
  assert.equal(numOf('46,5%'), 46.5);
  assert.equal(numOf('12/20'), 12);
  assert.equal(numOf('3,5'), 3.5);
  assert.equal(numOf('Aldo'), null);
  assert.equal(numOf('-'), null);
});
