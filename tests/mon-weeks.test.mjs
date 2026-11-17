import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { cfg, dmsHeader, row, stores, bandedSku, oneStore } from './helpers/fixtures.mjs';

// Kalender Nov 2026: 1 Nov = Minggu. Minggu ISO 44 (26 Okt-1 Nov), 45 (2-8), 46 (9-15), 47 (16-22), 48 (23-29), 49 (30 Nov-6 Des).
const g = loadGs();
const dms = (...rows) => [dmsHeader(), ...rows];
const many = (...kodes) => kodes.flatMap(k => oneStore(k));
const run = (rows, st = oneStore('A1'), hist = []) => g.computeMon_(dms(...rows), st, bandedSku(), cfg(), hist);
const find = (out, grp, kode) => out.groups[grp].find(x => x.outlet_kode === kode);
const plain = v => JSON.parse(JSON.stringify(v));   // lepas dari realm vm

test('monWeeksOfMonth_ 2026-11: enam minggu, rentang dan hari kerja dari kalender', () => {
  assert.deepEqual(plain(g.monWeeksOfMonth_('2026-11')), [
    { w: 44, from: '2026-11-01', to: '2026-11-01', workdays: 0 },
    { w: 45, from: '2026-11-02', to: '2026-11-08', workdays: 6 },
    { w: 46, from: '2026-11-09', to: '2026-11-15', workdays: 6 },
    { w: 47, from: '2026-11-16', to: '2026-11-22', workdays: 6 },
    { w: 48, from: '2026-11-23', to: '2026-11-29', workdays: 6 },
    { w: 49, from: '2026-11-30', to: '2026-11-30', workdays: 1 },
  ]);
});

test('terbaru 14 Nov (minggu 46), order minggu 45 saja: open 4, BIASA', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('B1', 'P1', 5, '2026-11-14')], many('A1', 'B1'));
  const s = find(out, 'SPM', 'A1');
  assert.deepEqual(plain(s.wks), [45]);
  assert.equal(s.needMore, 2);
  assert.equal(s.open, 4);
  assert.equal(s.risk, 'BIASA');
});

test('terbaru 28 Nov (minggu 48), order minggu 45 saja: open 2, KRITIS', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('B1', 'P1', 5, '2026-11-28')], many('A1', 'B1'));
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.needMore, 2);
  assert.equal(s.open, 2);
  assert.equal(s.risk, 'KRITIS');
});

test('terbaru 28 Nov, tanpa order: needMore 3, open 2, GAGAL', () => {
  const out = run([row('B1', 'P1', 5, '2026-11-28')], many('A1', 'B1'));
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.needMore, 3);
  assert.equal(s.open, 2);
  assert.equal(s.risk, 'GAGAL');
  assert.deepEqual(plain(s.wks), []);
});

test('order minggu 45, 46, 47: AMAN dan WEEKLY', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('A1', 'P1', 5, '2026-11-10'), row('A1', 'P1', 5, '2026-11-17')]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.risk, 'AMAN');
  assert.equal(s.status, 'WEEKLY');
  assert.equal(s.needMore, 0);
  assert.deepEqual(plain(s.wks), [45, 46, 47]);
});

test('minggu 44 (0 hari kerja) tidak dihitung open; order 1 Nov (Minggu) tetap masuk wks dan n', () => {
  // A1 order Minggu 1 Nov; terbaru 2 Nov (minggu 45). Sisa minggu: 45, 46, 47, 48, 49 = 5, minggu 44 diabaikan.
  const out = run([row('A1', 'P1', 5, '2026-11-01'), row('B1', 'P1', 5, '2026-11-02')], many('A1', 'B1'));
  const s = find(out, 'SPM', 'A1');
  assert.deepEqual(plain(s.wks), [44]);
  assert.equal(s.weeks, 1);
  assert.equal(s.open, 5);
  // Terbaru 2 Nov = minggu 45, jadi minggu 44 memang di luar rentang open; B1 sudah order minggu 45 -> open 4.
  assert.equal(find(out, 'SPM', 'B1').open, 4);
});

test('minggu data terbaru yang sudah di-order (weekNow 1) tidak dihitung open', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-14')]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.weekNow, 1);
  assert.deepEqual(plain(s.wks), [46]);
  assert.equal(s.open, 3);   // 47, 48, 49 saja
});

test('bySku.SPM: urut bought menaik lalu kode; total = jumlah toko; month <= bought', () => {
  const rows = [];
  ['A1', 'A2', 'A3', 'A4'].forEach(k => rows.push(row(k, 'P1', 5, '2026-11-10')));   // P1 dibeli 4 toko
  rows.push(row('A1', 'P2', 5, '2026-11-10'));                                          // P2 dibeli 1 toko
  const out = run(rows, many('A1', 'A2', 'A3', 'A4'));
  const bs = plain(out.bySku.SPM);
  assert.equal(bs.length, 5);
  assert.ok(bs.every(x => x.total === 4 && x.month <= x.bought));
  const kode = bs.map(x => x.sku_kode);
  assert.ok(kode.indexOf('P2') < kode.indexOf('P1'));
  assert.equal(kode[kode.length - 1], 'P1');
  assert.equal(bs.find(x => x.sku_kode === 'P2').bought, 1);
  assert.equal(bs.find(x => x.sku_kode === 'P1').bought, 4);
  // tiga SKU belum dibeli siapa pun: bought 0, urut kode
  assert.deepEqual(kode.slice(0, 3), ['P3', 'P4', 'P5']);
});

test('bySku bought memperhitungkan hist kuartal dan cocok dengan bBought per toko', () => {
  const hist = [{ periode: '2026-10', dist_kode: 'D1', outlet_kode: 'A1', banded_sku: 'P3,P4' }];
  const out = run([row('A1', 'P1', 5, '2026-11-10'), row('A2', 'P3', 5, '2026-11-10')], many('A1', 'A2'), hist);
  const bs = plain(out.bySku.SPM);
  const P3 = bs.find(x => x.sku_kode === 'P3'), P4 = bs.find(x => x.sku_kode === 'P4');
  assert.equal(P3.bought, 2);   // A1 dari hist, A2 bulan ini
  assert.equal(P3.month, 1);
  assert.equal(P4.bought, 1);
  assert.equal(P4.month, 0);
  const sumSku = bs.reduce((a, x) => a + x.bought, 0);
  const sumToko = out.groups.SPM.reduce((a, x) => a + x.bBought, 0);
  assert.equal(sumSku, sumToko);
});

test('grup kosong: bySku [] ; DMS kosong: tidak melempar', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-10')]);
  assert.deepEqual(plain(out.bySku.MINIS.map(x => x.total)), [0, 0, 0, 0]);   // SKU ada, toko 0
  const kosong = g.computeMon_([], oneStore('A1'), [], cfg(), []);
  assert.equal(kosong.noData, true);
  const tanpaSku = g.computeMon_(dms(row('A1', 'P1', 5, '2026-11-10')), oneStore('A1'), [], cfg(), []);
  assert.deepEqual(plain(tanpaSku.bySku), { SPM: [], MINIS: [] });
});

test('aturan lama tidak berubah: status, weeks, bHit, bMiss', () => {
  const out = run([row('A1', 'P1', 5, '2026-11-03'), row('A1', 'P2', 5, '2026-11-10'), row('A1', 'P3', 5, '2026-11-10'), row('A1', 'P4', 5, '2026-11-10')]);
  const s = find(out, 'SPM', 'A1');
  assert.equal(s.status, 'BIWEEKLY');
  assert.equal(s.weeks, 2);
  assert.equal(s.bBought, 4);
  assert.equal(s.bHit, 1);   // 4/5 = 0.8 >= 0.8
  assert.deepEqual(plain(s.bMiss), ['P5']);
});
