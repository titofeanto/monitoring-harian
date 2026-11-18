import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadGs } from './helpers/load-gs.mjs';
import { cfg } from './helpers/fixtures.mjs';
import { buildDummy, ACCESS } from './dummy/dataset.mjs';
import { makeSpreadsheetApp, makeSpreadsheet } from './dummy/fakeSpreadsheet.mjs';

// Skor total DSR dari 5 KPI berbobot (plan 022). Angka tes dihitung tangan, bukan dari keluaran kode.
const g = loadGs();
const plain = v => JSON.parse(JSON.stringify(v));
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-9, m + ' ' + a + ' != ' + b);

// Satu toko hasil atribusi: o kode toko, sm pemilik, g grup monitoring, wk minggu order, bh banded tercapai (1/0/null), ln lines.
const S = (o, sm, g_, wk, bh, ln) => ({ o, sm, g: g_, wk, bh, ln });
const R2G = pct => ({ pct, nKomp: 5, ss: { pct }, e2e: { pct, a: 1, t: 1 }, e2s: { pct, a: 1, t: 1 }, pastiUntung: { pct, ach: 1, tot: 1 }, pastiLaku: { pct, ach: 1, tot: 1 } });
const W = { rank_w_ps: 10, rank_w_fop: 16, rank_w_asrt: 16, rank_w_banded: 12, rank_w_r2g: 12, fop_weekly: 3 };

// Salesman '1' DT X: 4 toko. FOP 2/4 weekly, Banded 3/4, Assortment 20 lines dari target 16, PS 3 toko (Full, Lite, Not), R2G 0,6.
const dtX = () => ({
  dist_kode: 'X', dist_nama: 'DT X',
  total: { stores: [S('o1', '1', 'SPM', 3, 1, 5), S('o2', '1', 'SPM', 4, 1, 5), S('o3', '1', 'MINIS', 1, 0, 5), S('o4', '1', 'MINIS', 0, 1, 5)], names: { '1': 'Ani' }, inactive: {} },
  ps: { o1: 'PS FULL', o2: 'PS LITE', o3: 'NOT PERFECT' },
  asrtTarget: { 'X|o1': 4, 'X|o2': 4, 'X|o3': 4, 'X|o4': 4 },
  r2g: { dsr: { '1': R2G(0.6) } },
});
const totals = (dts, c = W) => plain(g.computeDsrTotals_({ dts, cfg: c, targets: {} }));

test('1. skor total = jumlah(bobot x min(capaian,1)) / jumlah bobot x 100', () => {
  const [r] = totals([dtX()]);
  // PS (1 + 0,5 + 0) / 3 = 0,5; FOP 2/4 = 0,5; Banded 3/4 = 0,75; Assortment 20/16 = 1,25 (dibatasi 1); R2G 0,6
  assert.equal(r.peringkatLayak, true); assert.equal(r.kpiAda, 5);
  near(r.kpi.ps.pct, 0.5); near(r.kpi.fop.pct, 0.5); near(r.kpi.banded.pct, 0.75); near(r.kpi.asrt.pct, 1.25); near(r.kpi.r2g.pct, 0.6);
  near(r.kpi.asrt.skor, 100); near(r.kpi.ps.skor, 50);
  near(r.skor, (10 * 0.5 + 16 * 0.5 + 16 * 1 + 12 * 0.75 + 12 * 0.6) / 66 * 100);   // 68,4848...
  assert.deepEqual([r.kpi.ps.detail.full, r.kpi.ps.detail.lite, r.kpi.ps.n], [1, 1, 3]);
  assert.equal(r.n, 4); assert.equal(r.nama, 'Ani');
});

test('2. KPI tanpa data dikeluarkan dan bobot dinormalisasi ulang', () => {
  const d = dtX(); d.ps = {}; d.r2g = { dsr: {} };
  const [r] = totals([d]);
  assert.equal(r.kpi.ps.tanpaData, true); assert.equal(r.kpi.r2g.tanpaData, true); assert.equal(r.kpiAda, 3);
  assert.equal(r.kpi.ps.skor, null);
  near(r.skor, (16 * 0.5 + 16 * 1 + 12 * 0.75) / 44 * 100);   // 56,818...
});

test('3. kurang dari 3 KPI: tanpa skor, tidak diperingkat (masuk belumCukup)', () => {
  const d = dtX(); d.ps = {}; d.r2g = { dsr: {} }; d.asrtTarget = {};
  const rows = totals([d]);
  assert.equal(rows[0].kpiAda, 2); assert.equal(rows[0].peringkatLayak, false); assert.equal(rows[0].skor, null);
  const rk = plain(g.rankTotal_(rows, 1));
  assert.equal(rk.rows.length, 0); assert.equal(rk.belumCukup.length, 1); assert.equal(rk.belumCukup[0].rank, null);
});

test('4. skor kembar berbagi peringkat (1, 1, 3); n di bawah minToko tidak diperingkat', () => {
  const mk = (kode, skor, n, dt = 'A') => ({ kode, nama: 'N' + kode, dt_kode: dt, dt_nama: dt, n, skor, peringkatLayak: true, kpi: {} });
  const rk = plain(g.rankTotal_([mk('1', 80, 10), mk('2', 80, 12), mk('3', 70, 10), mk('4', 99, 3), mk('5', 60, 10)], 5));
  assert.deepEqual(rk.rows.map(r => [r.kode, r.rank]), [['2', 1], ['1', 1], ['3', 3], ['5', 4]]);   // seri skor: jumlah toko lebih banyak dulu
  assert.deepEqual(rk.belumCukup.map(r => [r.kode, r.rank]), [['4', null]]);
});

test('5. rankDt = peringkat di DT yang sama (seri berbagi)', () => {
  const mk = (kode, skor, dt) => ({ kode, nama: 'N' + kode, dt_kode: dt, dt_nama: dt, n: 10, skor, peringkatLayak: true, kpi: {} });
  const rk = plain(g.rankTotal_([mk('1', 90, 'A'), mk('2', 85, 'B'), mk('3', 85, 'A'), mk('4', 85, 'A'), mk('5', 50, 'B')], 5));
  assert.deepEqual(rk.rows.map(r => [r.kode, r.rank, r.rankDt]), [['1', 1, 1], ['2', 2, 1], ['3', 2, 2], ['4', 2, 2], ['5', 5, 2]]);
});

test('6. bobot dari GS_CONFIG mengubah hasil; kunci kosong memakai bawaan', () => {
  const base = totals([dtX()])[0].skor;
  const ps0 = totals([dtX()], Object.assign({}, W, { rank_w_ps: 0 }))[0].skor;
  assert.notEqual(base, ps0);
  near(ps0, (16 * 0.5 + 16 * 1 + 12 * 0.75 + 12 * 0.6) / 56 * 100);
  const def = plain(g.readGsCfg_(makeSpreadsheet({})));
  assert.equal(def.rank_w_ps, 10);
  ['ps', 'fop', 'asrt', 'banded', 'r2g'].forEach(k => assert.equal(typeof def['rank_w_' + k], 'number', k));
  // lewat tab GS_CONFIG
  const ss = makeSpreadsheet({ GS_CONFIG: [['key', 'value', 'keterangan'], ['rank_w_ps', '25', ''], ['rank_w_r2g', '0,5', '']] });
  const c = plain(g.readGsCfg_(ss));
  assert.equal(c.rank_w_ps, 25); assert.equal(c.rank_w_r2g, 0.5); assert.equal(c.rank_w_fop, 16);
  // tanpa kunci bobot sama sekali: bawaan dipakai
  near(totals([dtX()], { fop_weekly: 3 })[0].skor, base);
});

test('6b. target FOP dan Banded dari snapshot terbaru GS_SCORECARD (bawaan 100%)', () => {
  const sc = [{ tanggal: '2026-11-03', kpi: 'FOP_SPM', target: 0.5 }, { tanggal: '2026-11-10', kpi: 'FOP_SPM', target: 0.8 }, { tanggal: '2026-11-10', kpi: 'BANDED_MINIS', target: 0.7 }];
  const t = plain(g.rankTargetsFromScorecard_(sc));
  assert.deepEqual(t, { fopSPM: 0.8, fopMINIS: 1, bandedSPM: 1, bandedMINIS: 0.7 });
  // FOP: 2 toko SPM (target 0,8) + 2 MINIS (target 1) -> rata-rata berbobot 0,9; nilai 0,5 -> capaian 0,5/0,9
  const [r] = plain(g.computeDsrTotals_({ dts: [dtX()], cfg: W, targets: t }));
  near(r.kpi.fop.detail.target, 0.9); near(r.kpi.fop.capaian, 0.5 / 0.9); near(r.kpi.fop.pct, 0.5);
});

test('7. atribusi total: semua BU digabung, qty terbanyak, seri = kode lebih kecil, retur mengurangi', () => {
  const HDR = ['Salesman', 'Sub_division', 'Outlet', 'SKUCode', 'TotalQuantity(PCS)', 'INVDate'];
  const produk = [['SKUCode', 'LEVEL-9', 'BU'], ['F1', 'BPF1', 'FOODS'], ['H1', 'BPH1', 'HOME CARE']];
  const rows = [
    ['21', 'FOODS', 'A', 'F1', 4, '2026-11-03'], ['22', 'HOME CARE', 'A', 'H1', 3, '2026-11-03'], ['22', 'HOME CARE', 'A', 'H1', 3, '2026-11-10'],   // A: 22 menang total 6 vs 4 walau Foods milik 21
    ['10', 'FOODS', 'B', 'F1', 5, '2026-11-03'], ['9', 'HOME CARE', 'B', 'H1', 5, '2026-11-03'],                                                    // B: seri -> 9
    ['21', 'FOODS', 'C', 'F1', 5, '2026-11-03'], ['21', 'FOODS', 'C', 'F1', -5, '2026-11-04'],                                                      // C: nol -> tanpa pemilik
  ];
  const out = plain(g.computeSalesRank_({ dms: [HDR, ...rows], produk, outletMaster: [], dsr: [['kode_dsr', 'nama_dsr', 'channel'], ['22', 'Budi', 'GT']], stores: [{ outlet_kode: 'A', remark: 'LOCAL SPM', status: 'ACTIVE' }],
    bandedSku: [], cfg: cfg(), hist: [], dtKode: 'D1', moq: 3 }));
  const by = Object.fromEntries(out.total.stores.map(s => [s.o, s]));
  assert.equal(by.A.sm, '22'); assert.equal(by.B.sm, '9'); assert.equal(by.C, undefined);
  assert.equal(by.A.g, 'SPM'); assert.equal(by.A.wk, 2); assert.equal(by.A.ln, 2);   // minggu 45 dan 46; dua basepack (Foods 4, Home Care 6) >= 3
  assert.equal(out.total.names['22'], 'Budi');
});

// ---------- R2G ----------
const R2G_TABS = () => ({
  DSR: [['kode_dsr', 'nama_dsr', 'channel'], ['1', 'Ani', 'GT'], ['2', 'Budi', 'GT'], ['3', 'Citra', '-']],
  TARGET: [['periode', 'kode_dsr', 'target_ss_bw', 'target_ss_pc', 'target_ss_hc', 'target_ss_fo'], ['2026-11', '1', 0, 0, 0, 1000], ['2026-11', '2', 0, 0, 0, 0], ['2026-10', '1', 0, 0, 0, 9]],
  MASTER_PRODUK: [['SKUCode', 'LEVEL-9', 'BU'], ['F1', 'BP1', 'FOODS'], ['F2', 'BP2', 'FOODS']],
  OUTLET_MASTER: [['Outlet Code', 'Outlet Name', 'Salesman'], ['D1A', 'Toko A', 'Ani'], ['D1B', 'Toko B', 'Ani'], ['D1C', 'Toko C', 'Budi']],
  DMS_EXTRACT: [['Salesman', 'Sub_division', 'GSV', 'Outlet', 'SKUCode', 'TotalQuantity(PCS)', 'INVDate'],
    ['1', 'FOODS', 400, 'A', 'F1', 10, '2026-11-03'], ['1', 'FOODS', 100, 'A', 'F2', 2, '2026-11-04'], ['1', 'XXX', 999, 'B', 'F1', 1, '2026-11-04'], ['2', 'FOODS', 50, 'C', 'F1', 5, '2026-11-05']],
  NORMS_SKU: [['PACKTYPE', 'OutletCode', 'LEVEL-9', 'SUB DIVISION2', 'Target SOQ (in pcs)'],
    ['Width', 'A', 'BP1', 'FOODS', 10], ['NPD', 'BA', 'BP2', 'FOODS', 3], ['Everbilled', 'A', 'BP1', 'FOODS', 11], ['Big Bets', 'A', 'BP1', 'FOODS', 1], ['Redlines', 'C', 'BP1', 'FOODS', 5]],
  NGDMS_ASRT: [['Laporan', '', '', '', '', '', '', '', ''], ['Distributor', 'Distributor Name', 'Salesman', 'Salesman Name', 'No of Active Outlets', 'E2E Target', 'E2S Target', 'E2E Achieved', 'E2S Achieved'],
    ['D1', 'DT', '1', 'Ani', 5, 0, 10, 0, 6], ['D1', 'DT', '2', 'Budi', 5, 4, 0, 3, 0]],
});
const r2g = (tabs = R2G_TABS()) => plain(g.computeDsrR2g_({ tabs, config: { dt_kode: 'D1', periode: '2026-11' } }));

test('8. R2G: contoh tangan; komponen tanpa target dikeluarkan', () => {
  const o = r2g();
  assert.deepEqual(Object.keys(o.dsr), ['1', '2']);   // DSR nonaktif ('-') tidak ada
  const a = o.dsr['1'];
  // SS: GSV hanya baris ber-BU dikenal: 400 + 100 = 500 (baris 'XXX' tidak dihitung), target periode 2026-11 = 1000 -> 0,5
  near(a.ss.aktual, 500); near(a.ss.target, 1000); near(a.ss.pct, 0.5);
  // E2E tanpa target (0) -> dikeluarkan; E2S 6/10
  assert.equal(a.e2e.pct, null); near(a.e2s.pct, 0.6);
  // Pasti Untung: Width A (qty BP1 = 10 >= 10 tercapai) + NPD 'BA' -> toko A (qty BP2 = 2 < 3) = 1 dari 2; Pasti Laku: Everbilled A (10 < 11) = 0 dari 1; Big Bets tidak dihitung
  assert.deepEqual([a.pastiUntung.ach, a.pastiUntung.tot, a.pastiLaku.ach, a.pastiLaku.tot], [1, 2, 0, 1]);
  near(a.pastiUntung.pct, 0.5); near(a.pastiLaku.pct, 0);
  // R2G = rata-rata SS 0,5, E2S 0,6, PU 0,5, PL 0 = 1,6 / 4 (E2E dikeluarkan)
  assert.equal(a.nKomp, 4); near(a.pct, 1.6 / 4);
  const b = o.dsr['2'];
  // Budi: target SS 0 -> keluar; E2E 3/4; E2S tanpa target; Pasti Laku Redlines toko C: qty 5 >= 5 -> 1 dari 1; tanpa Pasti Untung
  assert.equal(b.ss.pct, null); near(b.e2e.pct, 0.75); assert.equal(b.e2s.pct, null); assert.equal(b.pastiUntung.pct, null); near(b.pastiLaku.pct, 1);
  near(b.pct, (0.75 + 1) / 2);
});

test('8b. R2G: komponen di atas 100% dibatasi 1 saat dirata-rata; tanpa satu pun komponen = null', () => {
  const t = R2G_TABS(); t.NGDMS_ASRT[2][5] = 4; t.NGDMS_ASRT[2][7] = 40;   // E2E Ani 40/4 = 10x
  const a = r2g(t).dsr['1'];
  near(a.e2e.pct, 10); near(a.pct, (0.5 + 1 + 0.6 + 0.5 + 0) / 5);
  const e = r2g({ DSR: R2G_TABS().DSR }).dsr['1'];
  assert.equal(e.pct, null); assert.equal(e.nKomp, 0);
});

// ---------- Karakterisasi terhadap assets/app.js ----------
const appSrc = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const appCtx = { window: { MHUtil: { esc: s => String(s) } }, module: { exports: {} } };
vm.createContext(appCtx); vm.runInContext(appSrc, appCtx, { filename: 'app.js' });
const M = appCtx.module.exports;

test('9. karakterisasi: computeDsrR2g_ sama dengan buildModel di assets/app.js untuk tiap DSR dummy (dua DT)', () => {
  const ds = buildDummy({ seed: 2026 });
  const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' } } });
  let checked = 0;
  [['D01', 'dummy-sheet-tmk'], ['D02', 'dummy-sheet-srg']].forEach(([dk, sid]) => {
    const payload = plain(ctx.getPayload_(sid));
    const ref = M.buildModel(payload);
    const mine = plain(ctx.computeDsrR2g_({ tabs: payload.tabs, config: payload.config }));
    assert.equal(mine.periode, ref.periode);
    ref.dsrList.forEach(d => {
      const x = mine.dsr[d.kode]; assert.ok(x, 'DSR ' + d.kode);
      near(x.ss.aktual, d.ss.aktual, d.kode + ' ss aktual'); near(x.ss.target, d.ss.target, d.kode + ' ss target');
      near(x.e2e.a, d.asrt.e2eA, d.kode + ' e2eA'); near(x.e2e.t, d.asrt.e2eT, d.kode + ' e2eT'); near(x.e2s.a, d.asrt.e2sA); near(x.e2s.t, d.asrt.e2sT);
      assert.deepEqual([x.pastiLaku.ach, x.pastiLaku.tot], [d.sku.iq.pastiLaku.ach, d.sku.iq.pastiLaku.tot], d.kode + ' pasti laku');
      assert.deepEqual([x.pastiUntung.ach, x.pastiUntung.tot], [d.sku.iq.pastiUntung.ach, d.sku.iq.pastiUntung.tot], d.kode + ' pasti untung');
      assert.ok(x.pastiLaku.tot + x.pastiUntung.tot > 0, 'dataset harus memuat norms');
      checked++;
    });
  });
  assert.equal(checked, 6);
});

// ---------- Respons view=rank pada dataset dummy ----------
const keysDeep = (v, acc = new Set()) => { if (v && typeof v === 'object') Object.keys(v).forEach(k => { acc.add(k); keysDeep(v[k], acc); }); return acc; };
const dsDummy = buildDummy({ seed: 2026 });
const callRank = () => {
  const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(dsDummy), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' } } });
  return JSON.parse(ctx.doGet({ parameter: { view: 'rank', code: ACCESS.tmk } }).getContent());
};

test('10. view=rank dummy: total ada, bidang aman saja, dua DSR kembar berbagi peringkat, satu DSR belumCukup', () => {
  const out = callRank(); const t = out.total;
  assert.deepEqual(Object.keys(t).sort(), ['aktif', 'belumCukup', 'bobot', 'rows']);
  assert.deepEqual(t.bobot, { ps: 10, fop: 16, asrt: 16, banded: 12, r2g: 12 });
  assert.deepEqual(t.aktif, ['ps', 'fop', 'asrt', 'banded', 'r2g']);
  const forbidden = ['outlet', 'outlet_nama', 'outlet_kode', 'toko_kode', 'toko_nama', 'sku', 'omzet', 'kode_akses', 'aktual', 'gsv', 'nilai', 'o', 'sm'];
  const keys = keysDeep(t); forbidden.forEach(k => assert.ok(!keys.has(k), 'bidang terlarang: ' + k));
  const rowKeys = new Set(['rank', 'rankDt', 'kode', 'nama', 'dt_kode', 'dt_nama', 'n', 'skor', 'kpi']);
  t.rows.concat(t.belumCukup).forEach(r => Object.keys(r).forEach(k => assert.ok(rowKeys.has(k), 'bidang baris tak terduga: ' + k)));
  const kpiKeys = new Set(['pct', 'skor', 'bobot', 'tanpaData', 'n', 'full', 'lite', 'weekly', 'target', 'hit', 'lines', 'tokoNaik', 'tanpaBaseline', 'komponen']);
  t.rows.forEach(r => Object.values(r.kpi).forEach(k => Object.keys(k).forEach(x => assert.ok(kpiKeys.has(x), 'bidang KPI tak terduga: ' + x))));
  const txt = JSON.stringify(out); assert.ok(!/A10\d\d|K10\d\d|dummy-sheet|dummy-dt/.test(txt), 'kode toko / sheet / akses bocor');
  const tied = t.rows.filter(r => r.rank === 1); assert.equal(tied.length, 2);
  assert.deepEqual(tied.map(r => r.kode).sort(), ['101', '201']);
  near(tied[0].skor, tied[1].skor);
  assert.equal(t.belumCukup.length, 1); assert.equal(t.belumCukup[0].kode, '203'); assert.equal(t.belumCukup[0].rank, null);
  // rankDt: 101 dan 201 masing-masing juara di DT-nya
  assert.deepEqual(tied.map(r => r.rankDt), [1, 1]);
  assert.deepEqual(t.rows.map(r => r.rank), [1, 1, 3, 4, 5]);
});

test('11. KPI R2G dan Assortment pada respons: komponen R2G ada dan Assortment memakai target tren', () => {
  const t = callRank().total;
  const r = t.rows.find(x => x.kode === '102');
  assert.equal(r.kpi.asrt.tanpaData, false); assert.ok(r.kpi.asrt.target > 0 && r.kpi.asrt.lines > 0);
  assert.deepEqual(Object.keys(r.kpi.r2g.komponen), ['ss', 'e2e', 'e2s', 'pastiUntung', 'pastiLaku']);
});
