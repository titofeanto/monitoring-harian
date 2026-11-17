import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';

const gs = loadGs();
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' got ' + a + ' want ' + b);

// today 2026-11-17, bulan jual terakhir 2026-10: Agu 31 + Sep 30 + Okt 31 = 92 hari = 13,142857 minggu.
// GSV 300 ribu/bulan, harga karton ex PPN 100000 -> 3 karton/bulan, 9 karton/13,142857 = 0,684783 karton/mgg.
const TODAY = '2026-11-17';
const jual = (sku, v = '300,300,300', mulai = '2026-08') => ({ sku, bkt: 'GT', mulai, v });
const harga = (sku, isi, extra = {}) => ({ sku, isi, mulai: '', h_new: 111000, h_old: null, ...extra });
const stok = (sku, karton, isi, lusin = 0, pcs = 0) => ({ sku, karton, lusin, pcs, isi });

test('1. satu SKU: rate 8,217391 pcs/mgg, wc 14,6', () => {
  const r = gs.computeStokWc_({ stok: [stok('100', 10, 12)], harga: [harga('100', 12)], jual: [jual('100')], parentOf: {}, today: TODAY });
  assert.equal(r.length, 1);
  near(r[0].ratePcsMgg, 8.217391, 'rate'); // 0,684783 x 12
  assert.equal(r[0].stokPcs, 120);
  near(r[0].wc, 120 / 8.217391);
  assert.ok(Math.abs(r[0].wc - 14.6) < 0.05);
});

test('2. dua SKU satu parent: stok pcs dijumlah, bukan rata-rata WC', () => {
  const base = { harga: [harga('100', 12), harga('200', 24)], jual: [jual('100'), jual('200')], parentOf: { 100: 'P', 200: 'P' }, today: TODAY };
  let r = gs.computeStokWc_({ ...base, stok: [stok('100', 10, 12), stok('200', 10, 24)] });
  assert.equal(r.length, 1);
  assert.equal(r[0].parent, 'P');
  assert.equal(r[0].stokPcs, 360);
  near(r[0].ratePcsMgg, 24.652174);
  assert.ok(Math.abs(r[0].wc - 14.6) < 0.05);
  r = gs.computeStokWc_({ ...base, stok: [stok('100', 10, 12), stok('200', 100, 24)] });
  assert.equal(r[0].stokPcs, 2520);
  near(r[0].wc, 2520 / 24.652174);
  assert.ok(Math.abs(r[0].wc - 102.2) < 0.05);
  // rata-rata WC kedua SKU (14,6 dan 146,0 = 80,3) berbeda dari 102,2
});

test('3. SKU tanpa parentOf menjadi parent dirinya sendiri', () => {
  const r = gs.computeStokWc_({ stok: [stok('100', 10, 12), stok('300', 10, 12)], harga: [harga('100', 12), harga('300', 12)], jual: [jual('100'), jual('300')], parentOf: { 100: 'P' }, today: TODAY });
  assert.equal(JSON.stringify(r.map(x => x.parent).sort()), '["300","P"]');
});

test('4. tanpa harga atau tanpa jual tidak menambah rate; rate 0 tidak dikembalikan', () => {
  // 100: ada harga + jual. 200: jual tanpa harga. 300: harga tanpa jual. Semua satu parent P.
  let r = gs.computeStokWc_({ stok: [stok('100', 10, 12), stok('200', 50, 12), stok('300', 50, 12)], harga: [harga('100', 12), harga('300', 12)], jual: [jual('100'), jual('200')], parentOf: { 100: 'P', 200: 'P', 300: 'P' }, today: TODAY });
  assert.equal(r.length, 1);
  near(r[0].ratePcsMgg, 8.217391);
  assert.equal(r[0].stokPcs, 120 + 600 + 600);
  // parent 300 sendiri: tidak ada jual -> tidak dikembalikan
  r = gs.computeStokWc_({ stok: [stok('100', 10, 12), stok('300', 5, 12)], harga: [harga('100', 12), harga('300', 12)], jual: [jual('100')], parentOf: {}, today: TODAY });
  assert.equal(JSON.stringify(r.map(x => x.parent)), '["100"]');
});

test('5. mulai harga di masa depan memakai h_old', () => {
  // h_old 222000 -> karton ex PPN 200000 -> 1,5 karton/bln -> 4,5/13,142857 = 0,342391 karton/mgg = 4,108696 pcs/mgg
  const r = gs.computeStokWc_({ stok: [stok('100', 10, 12)], harga: [harga('100', 12, { mulai: '2026-12-01', h_old: 222000 })], jual: [jual('100')], parentOf: {}, today: TODAY });
  near(r[0].ratePcsMgg, 4.108696);
  // mulai sudah lewat -> h_new
  const r2 = gs.computeStokWc_({ stok: [stok('100', 10, 12)], harga: [harga('100', 12, { mulai: '2026-11-01', h_old: 222000 })], jual: [jual('100')], parentOf: {}, today: TODAY });
  near(r2[0].ratePcsMgg, 8.217391);
});

test('6. lusin 12 pcs: 1 karton isi 24 + 2 lusin + 3 pcs = 51', () => {
  const r = gs.computeStokWc_({ stok: [stok('100', 1, 24, 2, 3)], harga: [harga('100', 24)], jual: [jual('100')], parentOf: {}, today: TODAY });
  assert.equal(r[0].stokPcs, 51);
});

test('7. urut wc menurun', () => {
  const r = gs.computeStokWc_({ stok: [stok('100', 1, 12), stok('200', 50, 12), stok('300', 10, 12)], harga: [harga('100', 12), harga('200', 12), harga('300', 12)], jual: [jual('100'), jual('200'), jual('300')], parentOf: {}, today: TODAY });
  assert.equal(JSON.stringify(r.map(x => x.parent)), '["200","300","100"]');
});

test('8. tanpa data jual -> []', () => {
  const r = gs.computeStokWc_({ stok: [stok('100', 10, 12)], harga: [harga('100', 12)], jual: [], parentOf: {}, today: TODAY });
  assert.equal(JSON.stringify(r), '[]');
});

test('hanya 3 bulan terakhir dipakai (bulan lebih lama diabaikan)', () => {
  const r = gs.computeStokWc_({ stok: [stok('100', 10, 12)], harga: [harga('100', 12)], jual: [jual('100', '99999,300,300,300', '2026-07')], parentOf: {}, today: TODAY });
  near(r[0].ratePcsMgg, 8.217391);
});
