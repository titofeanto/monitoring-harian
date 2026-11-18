import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGs } from './helpers/load-gs.mjs';

// Ranking bersama (plan 019): akun mana pun melihat semua DT, tetapi hanya bidang aman yang keluar.
const plain = v => JSON.parse(JSON.stringify(v));
const reg = [
  { kode_akses: 'kodeA', peran: 'dt', dt_kode: 'DA', nama_dt: 'DT Alfa', sheet_id: 'sA', aktif: true },
  { kode_akses: 'kodeB', peran: 'dt', dt_kode: 'DB', nama_dt: 'DT Beta', sheet_id: 'sB', aktif: true },
  { kode_akses: 'kodeP', peran: 'pusat', dt_kode: '', nama_dt: '', sheet_id: '', aktif: true },
];
// Satu salesman keluaran computeSalesRank_: dengan sengaja ikut bidang terlarang untuk membuktikan tersaring.
const sm = (kode, nama, n, weekly, extra = {}) => Object.assign({ kode, nama, tokoFop: n, fop: { n, weekly, pct: weekly / n, spmN: 2, spmWeekly: 1 },
  tokoBanded: n, banded: { n, hit: weekly, pct: weekly / n }, tokoAsrt: n, asrt: { toko: n, lines: n * 2, perToko: 2 },
  outlet_nama: 'TOKO RAHASIA', toko_kode: 'T1', sku: 'S1', omzet: 999 }, extra);
// Atribusi total (plan 022): tiap salesman 10 toko dengan kode toko yang HARUS tidak bocor ('KODETOKO...').
const totalOf = (r, sales) => ({ stores: sales.flatMap(s => Array.from({ length: 10 }, (_, i) => ({ o: 'KODETOKO' + r.dt_kode + s.kode + i, sm: s.kode, g: i % 2 ? 'SPM' : 'MINIS', wk: i < 7 ? 3 : 1, bh: i < 5 ? 1 : 0, ln: 4 }))),
  names: Object.fromEntries(sales.map(s => [s.kode, s.nama])), inactive: {} });
const dtRes = (r, sales) => ({ dist_kode: r.dt_kode, dist_nama: r.nama_dt, stores: 9, bulan: '2026-11', tanggalData: '2026-11-17', catatan: {}, bu: { FOODS: { label: 'Foods', sales, belumTransaksi: 1 } }, total: totalOf(r, sales) });
const DATA = {
  DA: [sm('1', 'Ani', 10, 8), sm('2', 'Budi', 10, 6), sm('3', 'Cici', 3, 3)],     // Cici n<5: belum cukup
  DB: [sm('1', 'Dedi', 10, 8), sm('2', 'Eka', 10, 8), sm('3', 'Fani', 10, 5)],    // Dedi dan Eka nilai kembar 0.8 = Ani
};

function setup({ failDt = [] } = {}) {
  const ss = { getSheetByName: () => null, getSpreadsheetTimeZone: () => 'Asia/Jayapura' };
  const ctx = loadGs({ SpreadsheetApp: { getActiveSpreadsheet: () => ss }, globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' } } });
  ctx.__reg = reg; ctx.__data = DATA; ctx.__fail = failDt; ctx.__dtRes = dtRes;
  vm.runInContext(`
    readRegistry_ = () => __reg;
    readObjs_ = () => [];
    readGsCfg_ = () => ({ rank_min_toko: 5 });
    r2gForDt_ = r => ({ periode: '2026-11', dsr: { '1': { pct: 0.7, nKomp: 5, ss: { pct: 0.7, aktual: 123456789, target: 1 }, e2e: { pct: 0.7, a: 7, t: 10 }, e2s: { pct: 0.7, a: 7, t: 10 }, pastiUntung: { pct: 0.7, ach: 7, tot: 10 }, pastiLaku: { pct: 0.7, ach: 7, tot: 10 } } } });
    salesRankForDt_ = r => __fail.includes(r.dt_kode) ? { dist_kode: r.dt_kode, dist_nama: r.nama_dt, error: 'Error: rahasia sheet ' + r.sheet_id } : __dtRes(r, __data[r.dt_kode]);
  `, ctx);
  return ctx;
}
const body = o => JSON.parse(o.getContent());
const call = (ctx, code) => body(ctx.doGet({ parameter: { view: 'rank', code } }));
const keysDeep = (v, acc = new Set()) => { if (v && typeof v === 'object') Object.keys(v).forEach(k => { acc.add(k); keysDeep(v[k], acc); }); return acc; };

test('a. akun DT-A menerima baris DT-B (lintas DT) dan peran pusat juga', () => {
  const ctx = setup();
  const a = call(ctx, 'kodeA');
  assert.equal(a.mode, 'rank'); assert.equal(a.peran, 'dt'); assert.deepEqual(a.me, { dt_kode: 'DA' });
  const kodes = a.bu.FOODS.fop.map(r => r.dt_kode + r.kode);
  assert.ok(kodes.includes('DB1') && kodes.includes('DA1'));
  assert.deepEqual(a.dts.map(d => [d.kode, d.status]), [['DA', 'ok'], ['DB', 'ok']]);
  const p = call(ctx, 'kodeP');
  assert.equal(p.peran, 'pusat'); assert.deepEqual(p.me, { dt_kode: '' });
  assert.equal(p.bu.FOODS.fop.length, a.bu.FOODS.fop.length);
});

test('b. tidak ada bidang terlarang di JSON respons', () => {
  const out = call(setup(), 'kodeA');
  const keys = keysDeep(out);
  ['outlet', 'outlet_nama', 'outlet_kode', 'toko_kode', 'toko_nama', 'sku', 'omzet', 'kode_akses'].forEach(k => assert.ok(!keys.has(k), 'bidang terlarang: ' + k));
  const txt = JSON.stringify(out);
  assert.ok(!/kodeA|kodeB|kodeP|TOKO RAHASIA|KODETOKO|123456789/.test(txt));
  // bidang baris sesuai daftar yang diizinkan
  const allowed = new Set(['rank', 'rankDt', 'kode', 'nama', 'dt_kode', 'dt_nama', 'n', 'nilai', 'weekly', 'spm', 'hit', 'lines', 'toko']);
  out.bu.FOODS.fop.concat(out.bu.FOODS.belumCukup.fop).forEach(r => Object.keys(r).forEach(k => assert.ok(allowed.has(k), 'bidang tak terduga: ' + k)));
  // rankPublicRow_ sendiri membuang apa pun selebihnya
  const row = plain(setup().rankPublicRow_({ rank: 1, rankDt: 1, kode: '1', nama: 'X', dt_kode: 'D', dt_nama: 'DT', n: 5, nilai: 1, outlet_nama: 'T', sku: 'S', omzet: 1, kode_akses: 'k', hit: 3 }));
  assert.deepEqual(Object.keys(row).sort(), ['dt_kode', 'dt_nama', 'hit', 'kode', 'n', 'nama', 'nilai', 'rank', 'rankDt']);
});

test('b2. skor total: hanya bidang aman, tanpa kode toko, SKU, omzet', () => {
  const out = call(setup(), 'kodeA'), t = out.total;
  assert.ok(t && t.rows.length > 0);
  assert.deepEqual(Object.keys(t).sort(), ['aktif', 'belumCukup', 'bobot', 'rows']);
  const rowAllowed = new Set(['rank', 'rankDt', 'kode', 'nama', 'dt_kode', 'dt_nama', 'n', 'skor', 'kpi']);
  const kpiAllowed = new Set(['pct', 'skor', 'bobot', 'tanpaData', 'n', 'full', 'lite', 'weekly', 'target', 'hit', 'lines', 'tokoNaik', 'tanpaBaseline', 'komponen']);
  t.rows.concat(t.belumCukup).forEach(r => { Object.keys(r).forEach(k => assert.ok(rowAllowed.has(k), 'bidang baris tak terduga: ' + k)); Object.values(r.kpi).forEach(x => Object.keys(x).forEach(k => assert.ok(kpiAllowed.has(k), 'bidang KPI tak terduga: ' + k))); });
  // R2G: komponen hanya pct dan hitungan a/t; nilai rupiah SS tidak ikut
  const k1 = t.rows.find(r => r.kode === '1').kpi.r2g.komponen;
  assert.deepEqual(Object.keys(k1.ss), ['pct']); assert.deepEqual(Object.keys(k1.e2e).sort(), ['a', 'pct', 't']);
  const keys = keysDeep(t); ['outlet', 'outlet_nama', 'o', 'sm', 'sku', 'omzet', 'aktual', 'gsv', 'kode_akses'].forEach(k => assert.ok(!keys.has(k), 'bidang terlarang: ' + k));
  // rankPublicRow_ menyaring baris total
  const row = plain(setup().rankPublicRow_({ rank: 1, rankDt: 1, kode: '1', nama: 'X', dt_kode: 'D', dt_nama: 'DT', n: 9, skor: 80, outlet_nama: 'T', omzet: 1,
    kpi: { ps: { pct: 0.5, capaian: 0.5, skor: 50, bobot: 10, tanpaData: false, n: 3, detail: { full: 1, lite: 1, outlet: 'RAHASIA' } } } }));
  assert.deepEqual(Object.keys(row).sort(), ['dt_kode', 'dt_nama', 'kode', 'kpi', 'n', 'nama', 'rank', 'rankDt', 'skor']);
  assert.deepEqual(Object.keys(row.kpi.ps).sort(), ['bobot', 'full', 'lite', 'n', 'pct', 'skor', 'tanpaData']);
});

test('c. rankDt benar untuk dua DT dengan nilai kembar', () => {
  const out = call(setup(), 'kodeA').bu.FOODS.fop;
  const at = (dt, k) => out.find(r => r.dt_kode === dt && r.kode === k);
  // Gabungan: Ani, Dedi, Eka nilai 0,8 -> rank 1 semua; Budi 0,6 -> 4; Fani 0,5 -> 5. Cici n<5 tanpa rank.
  assert.deepEqual(['DA1', 'DB1', 'DB2', 'DA2', 'DB3'].map(x => at(x.slice(0, 2), x.slice(2)).rank), [1, 1, 1, 4, 5]);
  // Dalam DT: DT-A Ani 1, Budi 2; DT-B Dedi 1, Eka 1 (kembar), Fani 3.
  assert.deepEqual(['DA1', 'DA2'].map(x => at(x.slice(0, 2), x.slice(2)).rankDt), [1, 2]);
  assert.deepEqual(['DB1', 'DB2', 'DB3'].map(x => at(x.slice(0, 2), x.slice(2)).rankDt), [1, 1, 3]);
  const low = call(setup(), 'kodeA').bu.FOODS.belumCukup.fop;
  assert.deepEqual(low.map(r => [r.kode, r.rank, r.rankDt]), [['3', null, null]]);
  // fungsi murni langsung
  const g = setup();
  const rows = plain(g.rankWithinDt_([{ rank: 1, dt_kode: 'X', nilai: 0.9 }, { rank: 2, dt_kode: 'Y', nilai: 0.8 }, { rank: 3, dt_kode: 'X', nilai: 0.7 }, { rank: 3, dt_kode: 'X', nilai: 0.7 }, { rank: 5, dt_kode: 'X', nilai: 0.1 }, { rank: null, dt_kode: 'X', nilai: 0.0 }]));
  assert.deepEqual(rows.map(r => r.rankDt), [1, 1, 2, 2, 4, undefined]);
});

test('d. kode salah dan kode kosong: galat tanpa data', () => {
  const ctx = setup();
  const bad = call(ctx, 'salah');
  assert.deepEqual(Object.keys(bad), ['error']); assert.equal(bad.error, 'invalid_code');
  const none = body(ctx.doGet({ parameter: { view: 'rank' } }));
  assert.deepEqual(Object.keys(none), ['error']);
});

test('e. satu DT galat tidak menggagalkan respons dan pesan galat tidak bocor', () => {
  const out = call(setup({ failDt: ['DB'] }), 'kodeA');
  assert.equal(out.mode, 'rank');
  assert.deepEqual(out.dts.map(d => [d.kode, d.status]), [['DA', 'ok'], ['DB', 'error']]);
  assert.ok(out.bu.FOODS.fop.every(r => r.dt_kode === 'DA'));
  assert.ok(!JSON.stringify(out).includes('rahasia'));
});
