// Dataset dummy menu Kategori (plan 034): bentuk tab sesuai docs/format-data-kategori.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDummy } from './dummy/dataset.mjs';
import { msOf } from './dummy/kategori.mjs';

const ds = buildDummy({ seed: 2026 });
const B = ds.pusat.GS_KAT_BULAN, W = ds.pusat.GS_KAT_MINGGU, P = ds.pusat.GS_KAT_PRODUK;

test('header tiga tab sesuai dokumen', () => {
  assert.deepEqual(B[0], ['periode', 'dist_kode', 'outlet_kode', 'division', 'category', 'brand', 'gsv']);
  assert.deepEqual(W[0], ['awal', 'akhir', 'dist_kode', 'outlet_kode', 'division', 'category', 'brand', 'gsv']);
  assert.deepEqual(P[0], ['sku', 'category', 'brand', 'division']);
});
test('tab bulan: Jan 2025 sampai Okt 2026, tanpa baris nol', () => {
  const per = [...new Set(B.slice(1).map(r => r[0]))].sort();
  assert.equal(per[0], '2025-01'); assert.equal(per[per.length - 1], '2026-10'); assert.equal(per.length, 22);
  assert.ok(B.slice(1).every(r => r[6] !== 0 && Number.isInteger(r[6])));
  assert.ok(W.slice(1).some(r => r[7] < 0), 'retur negatif di tab minggu');
});
test('tab minggu: tiap baris dalam satu minggu Senin-Minggu dan satu bulan, tanpa tumpang tindih per seri', () => {
  const seen = new Map();
  W.slice(1).forEach(r => {
    const a = msOf(r[0]), b = msOf(r[1]);
    assert.ok(b >= a);
    assert.equal(r[0].slice(0, 7), r[1].slice(0, 7), 'melintasi bulan ' + r[0]);
    const mon = d => new Date(d).getUTCDay() === 1 ? d : mon(d - 864e5);
    assert.equal(mon(a), mon(b), 'melintasi minggu ' + r[0]);
    const k = r.slice(2, 7).join('|'); (seen.get(k) || seen.set(k, []).get(k)).push([a, b]);
  });
  seen.forEach(v => { v.sort((x, y) => x[0] - y[0]); for (let i = 1; i < v.length; i++) assert.ok(v[i][0] > v[i - 1][1], 'tumpang tindih'); });
});
test('tab minggu mencakup 91 hari, bulan cutoff, Nov tahun lalu sampai LY_END, dan hari setelah cutoff', () => {
  const awal = new Set(W.slice(1).map(r => r[0]));
  ['2026-08-17', '2026-08-31', '2026-09-01', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2025-11-03', '2025-11-10'].forEach(d => assert.ok(awal.has(d), 'tidak ada ' + d));
  assert.ok(![...awal].some(d => d > '2026-11-17' || (d < '2026-08-17' && d >= '2025-12-01')));
  assert.ok(![...W.slice(1)].some(r => r[1] > '2025-11-16' && r[0] < '2026-01-01'));
});
test('produk: dua SKU tidak terpetakan, kategori ada di tab bulan', () => {
  assert.equal(ds.meta.kategori.tanpaPemetaan.length, 2);
  const cats = new Set(B.slice(1).map(r => r[4]));
  P.slice(1).forEach(r => assert.ok(cats.has(r[1]), r[1]));
});
test('ada toko berhenti beli, toko tak pernah beli, dan retur', () => {
  assert.ok(ds.meta.kategori.berhenti > 0 && ds.meta.kategori.takPernah > 0 && ds.meta.kategori.retur);
});
