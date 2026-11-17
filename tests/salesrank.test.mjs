import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { cfg } from './helpers/fixtures.mjs';

// Bulan data 2026-11. Minggu ISO: 45 (2-8 Nov), 46 (9-15), 47 (16-22), 48 (23-29).
// Semua angka di bawah dihitung tangan dari Definisi di plans/013, bukan dari keluaran kode.
const g = loadGs();
const plain = v => JSON.parse(JSON.stringify(v));
const HDR = ['Salesman', 'Sub_division', 'Outlet', 'SKUCode', 'TotalQuantity(PCS)', 'INVDate'];
const r = (sm, bu, o, sku, q, d) => [sm, bu, o, sku, q, d];
const FOODS = 'FOODS', HC = 'HOME CARE', PC = 'PERSONAL CARE';

// SKU F1..F5 Foods (F1 dan F2 satu basepack), H1/H2 Home Care, P1 Personal Care.
const produk = [['SKUCode', 'LEVEL-9', 'BU'],
  ['F1', 'BPF1', 'FOODS'], ['F2', 'BPF1', 'FOODS'], ['F3', 'BPF3', 'FOODS'], ['F4', 'BPF4', 'FOODS'], ['F5', 'BPF5', 'FOODS'],
  ['H1', 'BPH1', 'HOME CARE'], ['H2', 'BPH2', 'HOME CARE'], ['P1', 'BPP1', 'PERSONAL CARE']];
const banded = [
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'H1', 'H2', 'X9'].map(k => ({ channel: 'SPM', sku_kode: k, sku_nama: 'SKU ' + k })), // X9 tidak ada di MASTER_PRODUK
  ...['F1', 'F2', 'F3', 'F4', 'H1'].map(k => ({ channel: 'MINIS', sku_kode: k, sku_nama: 'SKU ' + k })),
];
const dsrTab = [['kode_dsr', 'nama_dsr', 'channel'], ['21', 'Ani', 'GT'], ['22', 'Budi', 'GT'], ['31', 'Citra', 'GT'], ['41', 'Dewi', 'GT']];
const st = (kode, remark = 'LOCAL SPM', status = 'ACTIVE') => ({ outlet_kode: kode, outlet_nama: 'Toko ' + kode, remark, status });
const run = (rows, o = {}) => plain(g.computeSalesRank_({
  dms: [HDR, ...rows], produk, outletMaster: o.om || [], dsr: o.dsr || dsrTab, stores: o.stores || [], bandedSku: banded,
  cfg: cfg(), hist: o.hist || [], dtKode: 'D1', moq: 3,
}));
const sal = (out, bu, kode) => out.bu[bu].sales.find(s => s.kode === kode);

test('1. atribusi per BU: dual coverage, kode 021 cocok dengan 21', () => {
  const out = run([r('021', FOODS, 'A', 'F1', 10, '2026-11-03'), r('22', FOODS, 'A', 'F1', 4, '2026-11-03'), r('31', HC, 'A', 'H1', 6, '2026-11-04')], { stores: [st('A')] });
  assert.deepEqual(out.bu[FOODS].sales.map(s => s.kode), ['21']);        // 21 menang 10 vs 4; 22 tidak punya toko
  assert.equal(sal(out, FOODS, '21').nama, 'Ani');
  assert.equal(sal(out, FOODS, '21').tokoFop, 1);
  assert.deepEqual(out.bu[HC].sales.map(s => s.kode), ['31']);           // di Home Care toko A milik 31
  assert.equal(out.bu[HC].label, 'Home Care');
});

test('2. seri atribusi: kode lebih kecil (dibandingkan sebagai angka: 9 < 10)', () => {
  const out = run([r('22', FOODS, 'A', 'F1', 5, '2026-11-03'), r('21', FOODS, 'A', 'F1', 5, '2026-11-03'),
    r('10', FOODS, 'B', 'F1', 5, '2026-11-03'), r('9', FOODS, 'B', 'F1', 5, '2026-11-03')], { stores: [st('A'), st('B')] });
  assert.deepEqual(out.bu[FOODS].sales.map(s => s.kode).sort(), ['21', '9']);
});

test('3. FOP BU: hanya baris BU itu; retur membatalkan minggu; WEEKLY = 3 minggu', () => {
  const rows = [
    // A (SPM): Foods minggu 45, 46, 47; Home Care hanya minggu 45
    r('21', FOODS, 'A', 'F1', 2, '2026-11-03'), r('21', FOODS, 'A', 'F1', 2, '2026-11-10'), r('21', FOODS, 'A', 'F1', 2, '2026-11-17'),
    r('21', HC, 'A', 'H1', 2, '2026-11-03'),
    // M1 (Minis): Foods minggu 45, 46; minggu 47 +5 lalu -5 = 0; Home Care minggu 48
    r('21', FOODS, 'M1', 'F1', 2, '2026-11-04'), r('21', FOODS, 'M1', 'F1', 2, '2026-11-11'),
    r('21', FOODS, 'M1', 'F1', 5, '2026-11-17'), r('21', FOODS, 'M1', 'F1', -5, '2026-11-18'),
    r('21', HC, 'M1', 'H1', 3, '2026-11-24'),
  ];
  const out = run(rows, { stores: [st('A'), st('M1', 'LOCAL MINIS')] });
  assert.deepEqual(sal(out, FOODS, '21').fop, { n: 2, weekly: 1, pct: 0.5, spmN: 1, spmWeekly: 1 });
  assert.deepEqual(sal(out, HC, '21').fop, { n: 2, weekly: 0, pct: 0, spmN: 1, spmWeekly: 0 });
});

test('4. Banded BU: SKU BU lain tidak ikut, ambang channel, kuartal sama ya / lain tidak, SKU tanpa BU dicatat', () => {
  const rows = [
    ...['F1', 'F2', 'F3'].map(k => r('21', FOODS, 'A', k, 2, '2026-11-03')),
    r('31', HC, 'A', 'H2', 2, '2026-11-04'), r('41', PC, 'A', 'P1', 2, '2026-11-05'),
    ...['F1', 'F2', 'F3'].map(k => r('21', FOODS, 'B', k, 2, '2026-11-03')),
    ...['F1', 'F2', 'F3'].map(k => r('21', FOODS, 'M1', k, 2, '2026-11-03')),
    ...['F1', 'F2'].map(k => r('21', FOODS, 'M2', k, 2, '2026-11-03')),
  ];
  const hist = [{ periode: '2026-10', outlet_kode: 'A', banded_sku: 'F4,H1' }, { periode: '2026-09', outlet_kode: 'B', banded_sku: 'F4' }];
  const out = run(rows, { stores: [st('A'), st('B'), st('M1', 'LOCAL MINIS'), st('M2', 'LOCAL MINIS')], hist });
  // Foods SPM punya 5 SKU: A 3 bulan ini + F4 (Okt, Q4 sama) = 4/5 = 0,8 tercapai; B 3/5 = 0,6 (F4 dari Sep = Q3, tidak ikut).
  // Foods Minis punya 4 SKU: M1 3/4 = 0,75 >= 0,7 tercapai; M2 2/4 = 0,5 tidak. H1 dari hist A tidak menambah Foods.
  assert.deepEqual(sal(out, FOODS, '21').banded, { n: 4, hit: 2, pct: 0.5 });
  // Home Care SPM punya 2 SKU (H1, H2): A beli H2 bulan ini + H1 dari hist Okt = 2/2 tercapai.
  assert.deepEqual(sal(out, HC, '31').banded, { n: 1, hit: 1, pct: 1 });
  // Personal Care tidak punya SKU banded: toko tidak dihitung Banded, tetap dihitung FOP.
  assert.equal(sal(out, PC, '41').tokoBanded, 0);
  assert.equal(sal(out, PC, '41').banded.pct, null);
  assert.equal(sal(out, PC, '41').tokoFop, 1);
  assert.equal(out.catatan.bandedTanpaBu, 1);   // X9
});

test('5. Assortment BU: basepack, MOQ 3, retur, hanya SPM/MINIS, toko tanpa qty bersih positif tidak aktif', () => {
  const om = [['Outlet Code', 'Outlet Type Desc'], ['D1A', 'LOCAL SUPERMARKET'], ['D1M1', 'LOCAL MINIS'], ['D1L1', 'KIOS'], ['D1N', 'LOCAL SUPERMARKET']];
  const rows = [
    r('21', FOODS, 'A', 'F1', 2, '2026-11-03'), r('21', FOODS, 'A', 'F2', 1, '2026-11-04'),   // BPF1 = 3 -> line
    r('21', FOODS, 'A', 'F3', 5, '2026-11-05'), r('21', FOODS, 'A', 'F3', -3, '2026-11-06'),  // BPF3 = 2 -> bukan line
    r('21', FOODS, 'A', 'F4', 3, '2026-11-07'),                                                 // BPF4 = 3 -> line
    r('21', FOODS, 'M1', 'F3', 2, '2026-11-03'),                                                // aktif, 0 line
    r('21', FOODS, 'L1', 'F1', 10, '2026-11-03'),                                               // channel LAIN: tidak dihitung
    r('21', FOODS, 'N', 'F1', 3, '2026-11-03'), r('21', FOODS, 'N', 'F1', -3, '2026-11-04'),  // net 0: tanpa pemilik
  ];
  const out = run(rows, { om });
  assert.deepEqual(sal(out, FOODS, '21').asrt, { toko: 2, lines: 2, perToko: 1 });
  assert.equal(sal(out, FOODS, '21').tokoAsrt, 2);
});

test('6. toko monitoring tanpa transaksi BU dihitung belumTransaksi (INACTIVE dan OTHERS tidak)', () => {
  const stores = [st('A'), st('B'), st('C'), st('D', 'LOCAL SPM', 'INACTIVE'), st('E', 'OTHERS')];
  const out = run([r('21', FOODS, 'A', 'F1', 2, '2026-11-03'), r('31', HC, 'B', 'H1', 2, '2026-11-03')], { stores });
  assert.equal(out.bu[FOODS].belumTransaksi, 2);   // B, C
  assert.equal(out.bu[HC].belumTransaksi, 2);      // A, C
  assert.equal(out.bu[PC], undefined);
});

test('7. salesman nonaktif tidak muncul; tanpa nama tampil kodenya dan dicatat', () => {
  const dsr = [['kode_dsr', 'nama_dsr', 'channel'], ['21', 'Ani', 'GT'], ['22', 'Budi', '-']];
  const out = run([r('022', FOODS, 'A', 'F1', 2, '2026-11-03'), r('023', FOODS, 'B', 'F1', 2, '2026-11-03'), r('021', FOODS, 'C', 'F1', 2, '2026-11-03')],
    { stores: [st('A'), st('B'), st('C')], dsr });
  assert.deepEqual(out.bu[FOODS].sales.map(s => [s.kode, s.nama]), [['21', 'Ani'], ['23', '23']]);
  assert.equal(out.catatan.salesTanpaNama, 1);
});

const mk = (kode, nama, n, pct) => ({ kode, nama, tokoFop: n, fop: { n, weekly: Math.round(pct * n), pct, spmN: 1, spmWeekly: 1 },
  tokoBanded: 0, banded: { n: 0, hit: 0, pct: null }, tokoAsrt: 0, asrt: { toko: 0, lines: 0, perToko: 0 } });
const dtOf = (kode, sales, belum = 0) => ({ dist_kode: kode, dist_nama: 'DT ' + kode, bulan: '2026-11', tanggalData: '2026-11-20', bu: { [FOODS]: { label: 'Foods', sales, belumTransaksi: belum } }, catatan: { bandedTanpaBu: 0, salesTanpaNama: 0 } });

test('8. rankSales_: urutan menurun, seri berbagi peringkat, n < minimal tanpa peringkat', () => {
  const d = dtOf('D1', [mk('1', 'Satu', 10, 0.9), mk('2', 'Dua', 8, 0.7), mk('3', 'Zed', 6, 0.7), mk('7', 'Aaa', 6, 0.7), mk('4', 'Empat', 7, 0.5), mk('5', 'Lima', 4, 1), mk('6', 'Enam', 0, 0)]);
  const f = plain(g.rankSales_([d], 5)).bu[FOODS];
  assert.deepEqual(f.fop.map(x => [x.kode, x.rank]), [['1', 1], ['2', 2], ['7', 2], ['3', 2], ['4', 5]]);   // seri .7: n 8, lalu 6 (Aaa sebelum Zed)
  assert.deepEqual(f.belumCukup.fop.map(x => [x.kode, x.rank]), [['5', null]]);                              // n=4 < 5; n=0 tidak tampil
  assert.equal(f.fop[0].nilai, 0.9);
  assert.deepEqual(f.fop[0].spm, { weekly: 1, n: 1 });
  const d2 = dtOf('D1', [mk('1', 'A', 9, 0.9), mk('2', 'B', 9, 0.7), mk('3', 'C', 9, 0.7), mk('4', 'D', 9, 0.5)]);
  assert.deepEqual(plain(g.rankSales_([d2], 5)).bu[FOODS].fop.map(x => x.rank), [1, 2, 2, 4]);
  assert.equal(plain(g.rankSales_([d2], 10)).bu[FOODS].fop.length, 0);                                       // minimal bisa diubah
  // dua DT, kode salesman sama: tidak digabung
  const two = plain(g.rankSales_([dtOf('D1', [mk('21', 'Ani', 6, 0.8)], 2), dtOf('D2', [mk('21', 'Ani', 6, 0.6)], 3)], 5)).bu[FOODS];
  assert.deepEqual(two.fop.map(x => [x.dt_kode, x.kode, x.rank]), [['D1', '21', 1], ['D2', '21', 2]]);
  assert.equal(two.belumTransaksi, 5);
});

test('9. DMS kosong atau tanpa kolom Sub_division: hasil kosong tanpa galat', () => {
  assert.deepEqual(plain(g.computeSalesRank_({ dms: [] })).bu, {});
  const noBu = plain(g.computeSalesRank_({ dms: [['Salesman', 'Outlet', 'SKUCode', 'TotalQuantity(PCS)', 'INVDate'], ['21', 'A', 'F1', 2, '2026-11-03']], produk, stores: [st('A')], bandedSku: banded, cfg: cfg() }));
  assert.deepEqual(noBu.bu, {});
  assert.deepEqual(plain(g.rankSales_([], 5)).bu, {});
  assert.deepEqual(plain(g.rankSales_([{ error: 'x' }], 5)).bu, {});
});

test('10. respondGs_ memuat ranking; satu DT gagal tidak menggagalkan DT lain', () => {
  const sheets = {
    GS_SCORECARD: [['tanggal', 'kpi', 'label', 'aktual'], ['2026-11-16', 'SCORE', 'Score', 80]],
    GS_TOKO: [['dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'remark', 'status'], ['D1', 'DT Satu', 'A', 'Toko A', 'LOCAL SPM', 'ACTIVE'], ['D2', 'DT Dua', 'A', 'Toko A', 'LOCAL SPM', 'ACTIVE']],
    GS_BANDED_SKU: [['channel', 'sku_kode', 'sku_nama'], ['SPM', 'F1', 'SKU F1']],
  };
  const sh = aoa => ({ getLastRow: () => aoa.length, getDataRange: () => ({ getValues: () => aoa }) });
  const ss = { getSpreadsheetTimeZone: () => 'Asia/Jayapura', getSheetByName: n => (sheets[n] ? sh(sheets[n]) : null) };
  const ctx = loadGs({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ({ getSheetByName: n => (n === 'MASTER_PRODUK' ? sh(produk) : null) }) },
  });
  ctx.__pay = { sidD1: { builtAt: 't1', tabs: { DMS_EXTRACT: [HDR, r('21', FOODS, 'A', 'F1', 2, '2026-11-03')], OUTLET_MASTER: [], DSR: dsrTab } } };
  // getPayload_ palsu: D1 ada, D2 gagal baca
  ctx.getPayload_ = id => { if (!ctx.__pay[id]) throw new Error('gagal baca ' + id); return ctx.__pay[id]; };
  const reg = [{ peran: 'dt', dt_kode: 'D1', sheet_id: 'sidD1', nama_dt: 'DT Satu' }, { peran: 'dt', dt_kode: 'D2', sheet_id: 'sidD2', nama_dt: 'DT Dua' }];
  const res = plain(ctx.respondGs_({ peran: 'pusat' }, reg, ''));
  assert.ok(res.ranking, 'ranking ada di respons');
  assert.deepEqual(res.ranking.perDt.map(x => [x.dist_kode, x.status]), [['D1', 'ok'], ['D2', 'error']]);
  assert.match(res.ranking.perDt[1].error, /gagal baca sidD2/);
  assert.equal(res.ranking.minToko, 5);
  // satu toko < 5: salesman 21 masuk belumCukup, tanpa peringkat
  assert.deepEqual(res.ranking.bu[FOODS].belumCukup.fop.map(x => [x.dt_kode, x.kode, x.rank, x.n]), [['D1', '21', null, 1]]);
});
