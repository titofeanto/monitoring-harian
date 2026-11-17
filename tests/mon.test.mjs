import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { cfg, dmsHeader, row, stores, bandedSku, oneStore } from './helpers/fixtures.mjs';

const g = loadGs();
const dms = (...rows) => [dmsHeader(), ...rows];
const find = (out, grp, kode) => out.groups[grp].find(x => x.outlet_kode === kode);
const run = (rows, st = oneStore('A1'), hist = []) => g.computeMon_(dms(...rows), st, bandedSku(), cfg(), hist);

test('monIsoWeek_: minggu ISO', () => {
  assert.equal(g.monIsoWeek_('2026-01-01'), 1);
  assert.equal(g.monIsoWeek_('2026-12-31'), 53);
  assert.equal(g.monIsoWeek_('2026-11-16'), 47);
});

test('FOP: 3 minggu berbeda = WEEKLY', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('A1', 'P1', 5, '2026-11-10'), row('A1', 'P1', 5, '2026-11-17')]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.status, 'WEEKLY');
  assert.equal(s.weeks, 3);
});

test('FOP: 2 minggu = BIWEEKLY', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('A1', 'P1', 5, '2026-11-10')]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.status, 'BIWEEKLY');
  assert.equal(s.weeks, 2);
});

test('FOP: 1 minggu = MONTHLY (beberapa baris di minggu sama)', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('A1', 'P2', 5, '2026-11-04')]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.status, 'MONTHLY');
  assert.equal(s.weeks, 1);
});

test('FOP: tak ada baris di bulan data = BELUM ORDER', () => {
  const st = [...oneStore('A1'), ...oneStore('A3')];
  const out = run([row('A1', 'P1', 5, '2026-11-17')], st);
  const s = find(out, 'SPM', 'A3');
  assert.equal(s.status, 'BELUM ORDER');
  assert.equal(s.weeks, 0);
});

test('FOP: minggu dengan qty bersih <= 0 (retur sama besar) tidak dihitung', () => {
  const out = run([
    row('A1', 'P1', 5, '2026-11-03'), row('A1', 'P1', -5, '2026-11-04'), // minggu 45 net 0
    row('A1', 'P1', 5, '2026-11-10'),                                      // minggu 46
  ]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.weeks, 1);
  assert.equal(s.status, 'MONTHLY');
});

test('toko INACTIVE dan remark OTHERS tidak masuk grup', () => {
  const out = g.computeMon_(dms(row('A1', 'P1', 5, '2026-11-03')), stores(), bandedSku(), cfg(), []);
  assert.equal(out.inactive, 1);
  assert.equal(out.excluded, 1);
  const kodeSpm = Array.from(out.groups.SPM, x => x.outlet_kode);
  const kodeMinis = Array.from(out.groups.MINIS, x => x.outlet_kode);
  assert.deepEqual(kodeSpm, ['A1']);
  assert.deepEqual(kodeMinis, ['M1']);
});

test('Banded SPM: 4 dari 5 SKU (0,8) = hit', () => {
  const out = run(['P1', 'P2', 'P3', 'P4'].map(k => row('A1', k, 1, '2026-11-03')));
  assert.equal(find(out, 'SPM', 'A1').bHit, 1);
});

test('Banded SPM: 3 dari 5 SKU (0,6) = tidak hit', () => {
  const out = run(['P1', 'P2', 'P3'].map(k => row('A1', k, 1, '2026-11-03')));
  assert.equal(find(out, 'SPM', 'A1').bHit, 0);
});

test('Banded MINIS: 3 dari 4 SKU (0,75) >= 0,7 = hit', () => {
  const out = run(['N1', 'N2', 'N3'].map(k => row('M1', k, 1, '2026-11-03')), oneStore('M1', 'LOCAL MINIS'));
  const s = find(out, 'MINIS', 'M1');
  assert.equal(s.bHit, 1);
  assert.equal(s.bBought, 3);
});

test('Banded memakai hist dari kuartal yang sama', () => {
  // Bulan ini beli P1,P2,P3 (3/5); hist Oktober (Q4) menambah P4,P5.
  const now = ['P1', 'P2', 'P3'].map(k => row('A1', k, 1, '2026-11-03'));
  const out = run(now, oneStore('A1'), [{ periode: '2026-10', outlet_kode: 'A1', banded_sku: 'P4, P5' }]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.bBought, 5);
  assert.equal(s.bHit, 1);
});

test('Banded tidak memakai hist dari kuartal lain', () => {
  const now = ['P1', 'P2', 'P3'].map(k => row('A1', k, 1, '2026-11-03'));
  const out = run(now, oneStore('A1'), [{ periode: '2026-09', outlet_kode: 'A1', banded_sku: 'P4,P5' }]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.bBought, 3);
  assert.equal(s.bHit, 0);
});

test('weekNow = 1 hanya bila order di minggu ISO tanggal data terbaru', () => {
  const st = [...oneStore('A1'), ...oneStore('A2')];
  const out = run([
    row('A1', 'P1', 5, '2026-11-17'),   // minggu 47
    row('A2', 'P1', 5, '2026-11-03'),   // minggu 45
    row('A2', 'P1', 5, '2026-11-10'),   // minggu 46
    row('Z9', 'P1', 5, '2026-11-18'),   // tanggal terbaru, minggu 47
  ], st);
  assert.equal(out.week, 47);
  assert.equal(find(out, 'SPM', 'A1').weekNow, 1);
  assert.equal(find(out, 'SPM', 'A2').weekNow, 0);
});

test('hanya bulan terbaru yang dihitung', () => {
  const out = run([row('A1', 'P1', 5, '2026-10-20'), row('A1', 'P1', 5, '2026-11-03')]);
  assert.equal(out.bulan, '2026-11');
  assert.equal(out.rows, 1);
  assert.equal(find(out, 'SPM', 'A1').weeks, 1);
});

test('DMS kosong -> noData', () => {
  const out = g.computeMon_([], stores(), bandedSku(), cfg(), []);
  assert.equal(out.noData, true);
});
