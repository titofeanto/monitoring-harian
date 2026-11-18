import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDummy, ACCESS } from './dummy/dataset.mjs';
import { buildAll } from './dummy/build-fixtures.mjs';

const ds = buildDummy({ seed: 2026 });
const built = buildAll(2026);

test('dataset deterministik: dua panggilan identik', () => {
  assert.equal(JSON.stringify(buildDummy({ seed: 2026 })), JSON.stringify(ds));
  assert.equal(JSON.stringify(buildAll(2026).files), JSON.stringify(built.files));
});

test('tiap tab punya header yang dibutuhkan fungsi server', () => {
  const need = {
    GS_SCORECARD: ['tanggal', 'kpi', 'label', 'target', 'bobot', 'aktual', 'poin'], GS_TOKO: ['dist_kode', 'outlet_kode', 'remark', 'status'],
    GS_PS: ['outlet_kode', 'status', 's_cotc', 's_npd', 's_sos', 's_sstd', 's_banded'], GS_PS_HIST: ['tanggal', 'dist_kode'], GS_TARGET: ['dist_kode', 'target_full', 'target_lite'],
    GS_ASRT_TARGET: ['dist_kode', 'channel', 'target_lines'], GS_BANDED_SKU: ['channel', 'sku_kode', 'sku_nama'], GS_BULANAN: ['periode', 'outlet_kode', 'banded_sku', 'status_fop'],
    GS_BULANAN_ASRT: ['periode', 'channel', 'lines'], GS_CONFIG: ['key', 'value'], GS_MANUAL: ['tanggal', 'rank', 'dr'], GS_OUTLET: ['jenis'],
    GS_TREND_ASRT: ['dist_kode', 'outlet_kode', 'periode', 'lines'], DAFTAR_DT: ['kode_akses', 'peran', 'dt_kode', 'sheet_id'],
    STOK_GUDANG: ['dt_kode', 'sku', 'karton'], HARGA_PL: ['sku', 'h_new', 'h_old'], JUAL_SKU: ['dt_kode', 'sku', 'v'], KEHADIRAN: ['dt_kode', 'sales_id', 'jam'], SALES_MASTER: ['sales_id', 'nama'],
  };
  Object.entries(need).forEach(([tab, cols]) => { assert.ok(ds.pusat[tab], 'tab hilang: ' + tab); cols.forEach(c => assert.ok(ds.pusat[tab][0].includes(c), tab + ' tanpa kolom ' + c)); });
  ['TARGET', 'DMS_EXTRACT', 'NORMS_SKU', 'SKU_FOKUS', 'DSR', 'OUTLET_MASTER', 'KPI', 'MASTER_PRODUK', 'HARI_LIBUR', 'NGDMS_ASRT', 'CONFIG', 'HASIL_PERHITUNGAN']
    .forEach(t => Object.values(ds.dts).forEach(d => assert.ok(d[t] && d[t].length >= 1, 'tab DT hilang: ' + t)));
});

test('jumlah toko dan salesman sesuai spesifikasi', () => {
  assert.equal(ds.meta.salesmen.length, 6);
  Object.values(ds.meta.dts).forEach(d => { assert.ok(d.monitored >= 28 && d.monitored <= 34); assert.equal(d.salesmen, 3); });
  assert.equal(ds.meta.catalog.basepacks, 24);
});

test('ranking memuat nilai kembar dan salesman < 5 toko', () => {
  const rk = built.files['dummy-rank.json'];
  let kembar = false, belum = false;
  Object.values(rk.bu).forEach(b => ['fop', 'banded', 'asrt'].forEach(k => {
    const rows = b[k]; rows.forEach((r, i) => { if (i && rows[i - 1].rank === r.rank) kembar = true; });
    if (b.belumCukup[k].length) belum = true;
  }));
  assert.ok(kembar, 'tidak ada nilai kembar'); assert.ok(belum, 'tidak ada salesman < 5 toko');
});

test('GS_TREND_ASRT mencakup Q4 2025 dan 2026-01..10', () => {
  const per = new Set(ds.pusat.GS_TREND_ASRT.slice(1).map(r => r[2]));
  ['2025-10', '2025-11', '2025-12', '2026-01', '2026-10'].forEach(p => assert.ok(per.has(p), p));
  const stores = new Set(ds.pusat.GS_TREND_ASRT.slice(1).filter(r => r[2] === '2025-11').map(r => r[0] + r[1]));
  assert.ok(stores.size < ds.pusat.GS_TOKO.filter(r => r[8] === 'ACTIVE').length);   // ada toko baru / lubang
});

test('fixture: tanpa galat server, tanpa kode akses, di bawah 2 MB, dua parent WC >= 100', () => {
  Object.entries(built.files).forEach(([n, o]) => {
    assert.ok(!o.error, n + ' galat: ' + o.error);
    const t = JSON.stringify(o);
    assert.ok(t.length < 2 * 1024 * 1024, n + ' terlalu besar');
    Object.values(ACCESS).forEach(c => assert.ok(!t.includes(c), n + ' memuat kode akses'));
    assert.ok(!t.includes('kode_akses'));
  });
  Object.values(built.files['dummy-stok.json'].wcWarn.perDt).forEach(l => assert.ok(l.length >= 2));
  assert.equal(Object.keys(built.files).length, 7);
});
