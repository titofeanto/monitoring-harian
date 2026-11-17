import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGs } from './helpers/load-gs.mjs';

// tabs: isi tab Sheet pusat; produk: isi MASTER_PRODUK per DT; failProduk: DT yang MASTER_PRODUK-nya gagal dibaca.
function setup({ tabs, produk, failProduk = [] }) {
  const ss = { getSpreadsheetTimeZone: () => 'Asia/Jayapura', getSheetByName: () => null };
  const ctx = loadGs({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: id => ({ getSheetByName: n => (n === 'MASTER_PRODUK' ? { getDataRange: () => ({ getValues: () => {
        if (failProduk.includes(id)) throw new Error('gagal baca MASTER_PRODUK ' + id);
        return produk;
      } }) } : null) }),
    },
    globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' } },
  });
  ctx.__tabs = tabs;
  vm.runInContext(`readObjs_ = (ss, name) => (__tabs[name] || []).map(r => Object.assign({}, r));`, ctx);
  return ctx;
}

const reg = [
  { peran: 'dt', dt_kode: 'D1', sheet_id: 'sidD1', nama_dt: 'DT Satu' },
  { peran: 'dt', dt_kode: 'D2', sheet_id: 'sidD2', nama_dt: 'DT Dua' },
];
const pusat = { peran: 'pusat' };
const produk = [['SKUCode', 'LEVEL-9'], ['100', 'P'], ['200', 'P'], ['300', 'Q']];
// Rate: 300 ribu GSV/bulan, harga karton ex PPN 100000 -> 8,217391 pcs/mgg (isi 12), 16,434783 (isi 24), dari tes plan 004.
const base = {
  HARGA_PL: [
    { sku: '100', barcode: 'b1', brand: 'B', nama: 'N1', kemasan: 'k', isi: 12, mulai: '', h_new: 111000, h_old: '', s_new: '', s_old: '', tanggal_pl: '2026-11-01' },
    { sku: '200', barcode: 'b2', brand: 'B', nama: 'N2', kemasan: 'k', isi: 24, mulai: '', h_new: 111000, h_old: '', s_new: '', s_old: '', tanggal_pl: '2026-11-01' },
    { sku: '300', barcode: 'b3', brand: 'B', nama: 'N3', kemasan: 'k', isi: 12, mulai: '', h_new: 111000, h_old: '', s_new: '', s_old: '', tanggal_pl: '2026-11-01' },
  ],
  JUAL_SKU: ['D1', 'D2'].flatMap(d => ['100', '200', '300'].map(sku => ({ dt_kode: d, sku, bkt: 'GT', mulai: '2026-08', v: '300,300,300' }))),
  SKU_FLAG: [],
};
const stokRow = (dt, sku, karton, isi) => ({ dt_kode: dt, tanggal: '2026-11-16', sku, karton, lusin: 0, pcs: 0, isi, rpp: 0 });
// Parent P: 120 + 2400 = 2520 pcs / 24,652174 = 102,2. Parent Q (SKU 300): 120 pcs / 8,217391 = 14,6.
const stokD1 = [stokRow('D1', '100', 10, 12), stokRow('D1', '200', 100, 24), stokRow('D1', '300', 10, 12)];
const stokD2 = [stokRow('D2', '100', 10, 12), stokRow('D2', '200', 100, 24)];
const tabs = { ...base, STOK_GUDANG: [...stokD1, ...stokD2] };

test('1. parent WC 102,2 muncul di perDt; parent WC 14,6 tidak; ambang 100', () => {
  const ctx = setup({ tabs, produk });
  const r = ctx.respondStok_(pusat, reg, 'D1');
  assert.equal(r.wcWarn.ambang, 100);
  const list = r.wcWarn.perDt.D1;
  assert.equal(list.length, 1);
  assert.equal(list[0].parent, 'P');
  assert.equal(list[0].wc, 102.2);
  assert.equal(list[0].stokPcs, 2520);
  assert.equal(JSON.stringify(list[0].skus.slice().sort()), '["100","200"]');
  assert.equal(list[0].ratePcsMgg, 24.7);
  assert.ok(!list.some(x => x.parent === 'Q'));
});

test('2. perDt hanya berisi DT dalam cakupan', () => {
  const ctx = setup({ tabs, produk });
  const dt = ctx.respondStok_({ peran: 'dt', dt_kode: 'D2' }, reg, '');
  assert.equal(JSON.stringify(Object.keys(dt.wcWarn.perDt)), '["D2"]');
  const semua = ctx.respondStok_(pusat, reg, '');
  assert.equal(JSON.stringify(Object.keys(semua.wcWarn.perDt).sort()), '["D1","D2"]');
  const satu = ctx.respondStok_(pusat, reg, 'D1');
  assert.equal(JSON.stringify(Object.keys(satu.wcWarn.perDt)), '["D1"]');
});

test('3. galat MASTER_PRODUK satu DT: respons tetap utuh, error hanya di DT itu', () => {
  const ctx = setup({ tabs, produk, failProduk: ['sidD1'] });
  const r = ctx.respondStok_(pusat, reg, '');
  assert.equal(r.mode, 'stok');
  assert.equal(r.stok.length, 5);
  assert.ok(r.jual.length > 0);
  assert.equal(r.harga.length, 3);
  assert.match(r.wcWarn.perDt.D1.error, /gagal baca MASTER_PRODUK/);
  assert.equal(Array.isArray(r.wcWarn.perDt.D2), true);
  assert.equal(r.wcWarn.perDt.D2[0].parent, 'P');
});

test('4. field lama tidak berubah', () => {
  const ctx = setup({ tabs, produk });
  const r = ctx.respondStok_(pusat, reg, 'D1');
  assert.equal(r.mode, 'stok');
  assert.equal(JSON.stringify(r.dts), '[{"kode":"D1","nama":"DT Satu","tanggal":"2026-11-16"}]');
  assert.equal(JSON.stringify(r.stok[0]), '["D1","100",10,0,0,12,0]');
  assert.equal(r.stok.length, 3);
  assert.equal(JSON.stringify(r.jual[0]), '["D1","100","GT","2026-08","300,300,300"]');
  assert.equal(r.jual.length, 3);
  assert.equal(JSON.stringify(r.flags), '[]');
  assert.equal(r.harga.length, 3);
  assert.equal(r.harga[0].sku, '100');
  assert.equal(r.hargaTanggal, '2026-11-01');
});

test('5. hasil per DT di-cache: panggilan kedua tidak membaca MASTER_PRODUK lagi', () => {
  const ctx = setup({ tabs, produk });
  let reads = 0;
  const orig = ctx.SpreadsheetApp.openById;
  ctx.SpreadsheetApp.openById = id => { reads++; return orig(id); };
  ctx.respondStok_(pusat, reg, 'D1');
  const first = reads;
  const r2 = ctx.respondStok_(pusat, reg, 'D1');
  assert.equal(first, 1);
  assert.equal(reads, first);
  assert.equal(r2.wcWarn.perDt.D1[0].wc, 102.2);
});
