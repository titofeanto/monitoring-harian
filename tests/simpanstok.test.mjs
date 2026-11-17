import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGs } from './helpers/load-gs.mjs';

const iso = d => d.toISOString().slice(0, 10);
const plus = n => iso(new Date(Date.now() + n * 86400000));

// tabs: isi tab Sheet pusat; produk: isi MASTER_PRODUK Sheet DT.
function setup({ tabs = {}, produk = [['SKUCode', 'LEVEL-9']], failTab = null, dts = ['D1', 'D2'] } = {}) {
  const writes = [];
  const sheet = { getDataRange: () => ({ getValues: () => { if (failTab === 'MASTER_PRODUK') throw new Error('gagal baca MASTER_PRODUK'); return produk; } }) };
  const ss = { getSpreadsheetTimeZone: () => 'Asia/Jayapura', getSheetByName: () => null, insertSheet: () => ({ hideSheet() {} }) };
  const ctx = loadGs({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ({ getSheetByName: n => (n === 'MASTER_PRODUK' ? sheet : null) }) },
    globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' } },
  });
  ctx.__tabs = tabs; ctx.__writes = writes; ctx.__failTab = failTab; ctx.__dts = dts;
  vm.runInContext(`
    readRegistry_ = () => __dts.map(k => ({ peran: 'dt', dt_kode: k, sheet_id: 'sid' + k, nama_dt: 'Nama ' + k }));
    readObjs_ = (ss, name) => { if (name === __failTab) throw new Error('gagal baca ' + name); return (__tabs[name] || []).map(r => Object.assign({}, r)); };
    writeObjs_ = (ss, name, header, rows) => { __writes.push({ name, rows }); };
  `, ctx);
  return ctx;
}
// baris laporan: [sku, karton, lusin, pcs, isi, rpp]
const body = (extra = {}) => ({ dt: 'D1', tanggal: plus(0), rows: [['100', 10, 0, 0, 12, 0]], ...extra });
const stokWrites = ctx => ctx.__writes.filter(w => w.name === 'STOK_GUDANG');

const jualHarga = {
  HARGA_PL: [{ sku: '100', isi: 12, mulai: '', h_new: 111000, h_old: '' }, { sku: '200', isi: 24, mulai: '', h_new: 111000, h_old: '' }],
  JUAL_SKU: [{ dt_kode: 'D1', sku: '100', bkt: 'GT', mulai: '2026-08', v: '300,300,300' }, { dt_kode: 'D1', sku: '200', bkt: 'GT', mulai: '2026-08', v: '300,300,300' }],
};
const produk = [['SKUCode', 'LEVEL-9'], ['100', 'P'], ['200', 'P']];

test('1. tanggal masa depan ditolak; hari ini lolos', () => {
  const ctx = setup({ tabs: jualHarga, produk });
  const r = ctx.simpanStok_(body({ tanggal: plus(2) }));
  assert.equal(r.skipped, true);
  assert.match(r.reason, /masa depan/);
  assert.equal(stokWrites(ctx).length, 0);
  const r2 = ctx.simpanStok_(body());
  assert.equal(r2.ok, true);
  assert.equal(r2.skipped, undefined);
  assert.equal(stokWrites(ctx).length, 1);
});

test('2. dua panggilan beruntun DT sama: kedua skipped; DT lain tidak terpengaruh', () => {
  const ctx = setup({ tabs: jualHarga, produk });
  assert.equal(ctx.simpanStok_(body()).skipped, undefined);
  const r2 = ctx.simpanStok_(body());
  assert.equal(r2.skipped, true);
  assert.match(r2.reason, /Terlalu sering/);
  assert.equal(ctx.simpanStok_(body({ dt: 'D2' })).skipped, undefined);
});

test('3. WC 102: tersimpan dan warnings memuat parent', () => {
  const ctx = setup({ tabs: jualHarga, produk });
  // SKU 100: 10 karton x12 = 120 pcs; SKU 200: 100 karton x24 = 2400 pcs; total 2520 / 24,652174 = 102,2
  const r = ctx.simpanStok_(body({ rows: [['100', 10, 0, 0, 12, 0], ['200', 100, 0, 0, 24, 0]] }));
  assert.equal(r.ok, true);
  assert.equal(stokWrites(ctx).length, 1);
  assert.equal(r.wcWarn, 100);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].parent, 'P');
  assert.equal(r.warnings[0].stokPcs, 2520);
  assert.equal(r.warnings[0].wc, 102.2);
});

test('4. stok normal: warnings kosong', () => {
  const ctx = setup({ tabs: jualHarga, produk });
  const r = ctx.simpanStok_(body({ rows: [['100', 10, 0, 0, 12, 0], ['200', 10, 0, 0, 24, 0]] }));
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.warnings), '[]');
});

test('5. galat baca MASTER_PRODUK / JUAL_SKU: tetap ok, warningsError terisi, data tersimpan', () => {
  for (const failTab of ['MASTER_PRODUK', 'JUAL_SKU']) {
    const ctx = setup({ tabs: jualHarga, produk, failTab });
    const r = ctx.simpanStok_(body());
    assert.equal(r.ok, true, failTab);
    assert.match(r.warningsError, /gagal baca/);
    assert.equal(stokWrites(ctx).length, 1);
  }
});

test('6. aturan lama: tanggal lebih lama dan penurunan SKU > 50%', () => {
  const lama = [{ dt_kode: 'D1', tanggal: plus(0), sku: '100', karton: 1, lusin: 0, pcs: 0, isi: 12, rpp: 0 }];
  let ctx = setup({ tabs: { ...jualHarga, STOK_GUDANG: lama }, produk });
  const r = ctx.simpanStok_(body({ tanggal: plus(-3) }));
  assert.equal(r.skipped, true);
  assert.match(r.reason, /lebih lama/);
  assert.equal(stokWrites(ctx).length, 0);

  const banyak = Array.from({ length: 100 }, (_, i) => ({ dt_kode: 'D1', tanggal: plus(-1), sku: String(1000 + i), karton: 1, lusin: 0, pcs: 0, isi: 12, rpp: 0 }));
  ctx = setup({ tabs: { ...jualHarga, STOK_GUDANG: banyak }, produk });
  const r2 = ctx.simpanStok_(body({ rows: Array.from({ length: 40 }, (_, i) => [String(1000 + i), 1, 0, 0, 12, 0]) }));
  assert.equal(r2.skipped, true);
  assert.match(r2.reason, /separuh/);
  assert.equal(stokWrites(ctx).length, 0);
});
