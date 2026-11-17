import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGs } from './helpers/load-gs.mjs';

const g = loadGs();
const J = x => JSON.parse(JSON.stringify(x));   // lepas dari prototipe konteks vm
const T = '2026-11-17';

const row = (kpi, o = {}) => ({ tanggal: T, kpi, label: o.label || kpi, target: o.t ?? '', aktual: o.a ?? '', bobot: o.b ?? '', poin: o.p ?? '', catatan: o.c || '' });
const kp = (live, kpi) => live.kpis.find(k => k.kpi === kpi);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const run = o => J(g.computeGsLive_(Object.assign({ scorecard: [], ps: {}, asrt: {}, mon: {}, scoped: false }, o)));
const mkStores = (prefix, n, weekly, bhit) => Array.from({ length: n }, (_, i) => ({ outlet_kode: prefix + i, status: i < weekly ? 'WEEKLY' : 'MONTHLY', bHit: i < bhit }));
const monDt = (spm, minis, tanggalData = T) => ({ dist_kode: 'D1', dist_nama: 'DT', tanggalData, bulan: '2026-11', week: 3, qLabel: 'Q4 2026', qMonths: ['2026-10', '2026-11'], groups: { SPM: spm, MINIS: minis } });
const psStores = (full, lite, other, tanggal = T) => [].concat(
  Array(full).fill('PS FULL'), Array(lite).fill('PS LITE'), Array(other).fill('NOT PS')).map((status, i) => ({ outlet_kode: 'P' + i, status, tanggal }));

test('1. PS: perfect / (target full + lite), poin = bobot x rasio', () => {
  const live = run({
    scorecard: [row('PS', { t: 1, a: 0.5, b: 10, p: 5 })],
    ps: { stores: psStores(3, 1, 2), targets: [{ target_full: 3, target_lite: 2 }] },
  });
  const k = kp(live, 'PS');
  near(k.aktual, 0.8); near(k.poin, 8); near(k.hilang, 2);
  assert.equal(live.summary.ps.perfect, 4);
  assert.equal(live.summary.ps.target, 5);
});

test('2. ASRT: lines semua DT / target channel', () => {
  const ch = (lines, outlets) => ({ lines, outlets, registered: outlets });
  const live = run({
    scorecard: [row('ASRT_SPM', { t: 1, a: 0.1, b: 8, p: 0.8 })],
    asrt: {
      perDt: [{ channels: { SPM: ch(70, 7), MINIS: ch(1, 1) } }, { channels: { SPM: ch(50, 5), MINIS: ch(1, 1) } }, { error: 'gagal' }],
      targets: [{ channel: 'LOCAL SUPERMARKET', target_lines: 120 }, { channel: 'LOCAL SUPERMARKET', target_lines: '80' }, { channel: 'LOCAL MINIS', target_lines: 10 }],
    },
  });
  near(kp(live, 'ASRT_SPM').aktual, 0.6);
  assert.equal(live.summary.asrt.SPM.lines, 120);
  assert.equal(live.summary.asrt.SPM.target, 200);
  assert.match(kp(live, 'ASRT_SPM').catatan, /120 lines dari target 200/);
});

test('3. FOP dan Banded: jumlah toko WEEKLY / bHit per jumlah toko monitoring', () => {
  const live = run({
    scorecard: [row('FOP_SPM', { t: 1, a: 0, b: 8, p: 0 }), row('BANDED_SPM', { t: 1, a: 0, b: 6, p: 0 })],
    mon: { hasList: true, perDt: [monDt(mkStores('S', 10, 4, 7), mkStores('M', 2, 0, 0))] },
  });
  near(kp(live, 'FOP_SPM').aktual, 0.4);
  near(kp(live, 'BANDED_SPM').aktual, 0.7);
  assert.equal(live.monLive, true);
});

test('4. DR: entri manual terbaru yang punya rank; yang tanpa rank diabaikan', () => {
  const live = run({
    scorecard: [row('DR', { t: 1, a: 0.1, b: 10, p: 1, c: 'HO' })],
    mon: { manual: [{ tanggal: '2026-11-03', rank: 11, dr: 0.5 }, { tanggal: '2026-11-17', rank: 7, dr: 0.9 }, { tanggal: '2026-11-18', rank: '', dr: 0.2 }] },
  });
  const k = kp(live, 'DR');
  near(k.aktual, 0.9);
  assert.equal(k.weekly, true);
  assert.equal(live.rank, 7);
  assert.equal(live.prevRank, 11);
  assert.match(k.catatan, /Isian manual 17 Nov 2026/);
});

test('4b. DR tanpa isian manual: nilai HO + catatan', () => {
  const live = run({ scorecard: [row('DR', { t: 1, a: 0.5, b: 10, p: 5, c: 'HO' })] });
  const k = kp(live, 'DR');
  assert.equal(k.aktual, 0.5);
  assert.equal(k.catatan, 'HO · belum diisi di tool upload, memakai angka file');
});

test('5. poin tidak melebihi bobot; target kosong/0 = poin null, hilang 0', () => {
  const live = run({
    scorecard: [row('PS', { t: 0.5, a: 0.1, b: 10, p: 2 }), row('FOP_SPM', { t: '', a: 0.1, b: 8, p: 1 })],
    ps: { stores: psStores(4, 0, 0), targets: [{ target_full: 2, target_lite: 0 }] },
    mon: { hasList: true, perDt: [monDt(mkStores('S', 4, 4, 0), [])] },
  });
  const ps = kp(live, 'PS');
  near(ps.aktual, 2); near(ps.poin, 10); near(ps.hilang, 0);
  const fop = kp(live, 'FOP_SPM');
  assert.equal(fop.target, null);
  assert.equal(fop.poin, null);
  assert.equal(fop.hilang, 0);
});

test('6. level: batas tepat 0,8 x target', () => {
  const lv = (a, t) => run({ scorecard: [row('R2G', { t, a, b: 5, p: 1 })] }).kpis[0].level;
  assert.equal(lv(100, 100), 'green');
  assert.equal(lv(120, 100), 'green');
  assert.equal(lv(80, 100), 'amber');
  assert.equal(lv(99.9, 100), 'amber');
  assert.equal(lv(79.99, 100), 'red');
  assert.equal(lv(0, 100), 'red');
  assert.equal(lv(50, ''), 'amber');
  assert.equal(lv('', 100), 'amber');
});

test('7. score = jumlah poin; scoped memakai skor HO dari baris SCORE', () => {
  const sc = [row('SCORE', { a: 71.5 }), row('RANK', { a: 4 }), row('PS', { t: 1, a: 0, b: 10, p: 0 }), row('R2G', { t: 1, a: 1, b: 5, p: 5 })];
  const input = { scorecard: sc, ps: { stores: psStores(3, 1, 2), targets: [{ target_full: 3, target_lite: 2 }] } };
  const all = run(input);
  near(all.score, 13);                 // PS 8 + R2G 5
  near(all.scoreShown, 13);
  assert.equal(all.recalculated, true);
  const scoped = run(Object.assign({}, input, { scoped: true }));
  near(scoped.score, 13);
  assert.equal(scoped.scoreShown, 71.5);
  assert.equal(scoped.recalculated, false);
});

test('8. tanpa PS/Asrt/Mon/Manual: score null, KPI tetap nilai HO, monLive false', () => {
  const live = run({ scorecard: [row('SCORE', { a: 70 }), row('RANK', { a: 3 }), row('PS', { t: 0.9, a: 0.5, b: 10, p: 5.5, c: 'HO' })] });
  assert.equal(live.score, null);
  assert.equal(live.scoreShown, 70);
  assert.equal(live.monLive, false);
  assert.equal(live.rank, 3);
  assert.equal(live.prevRank, null);
  const k = kp(live, 'PS');
  assert.equal(k.aktual, 0.5); assert.equal(k.poin, 5.5); assert.equal(k.catatan, 'HO');
  assert.equal(live.summary.ps, null); assert.equal(live.summary.asrt, null); assert.equal(live.summary.mon, null);
});

test('9. KPI tanpa data hitung (R2G) tetap nilai HO walau KPI lain dihitung ulang', () => {
  const live = run({
    scorecard: [row('R2G', { t: 1, a: 0.9, b: 12, p: 10.8, c: 'HO R2G' }), row('PS', { t: 1, a: 0, b: 10, p: 0 })],
    ps: { stores: psStores(1, 0, 0), targets: [{ target_full: 2, target_lite: 0 }] },
  });
  const k = kp(live, 'R2G');
  assert.equal(k.aktual, 0.9); assert.equal(k.poin, 10.8); assert.equal(k.catatan, 'HO R2G');
});

test('10. catatan memuat tanggal 12 Nov 2026 untuk PS dan FOP', () => {
  const live = run({
    scorecard: [row('PS', { t: 1, a: 0, b: 10, p: 0 }), row('FOP_SPM', { t: 1, a: 0, b: 8, p: 0 })],
    ps: { stores: psStores(1, 0, 0, '2026-11-12'), targets: [{ target_full: 2, target_lite: 0 }] },
    mon: { hasList: true, perDt: [monDt(mkStores('S', 2, 1, 0), [], '2026-11-12')] },
  });
  assert.equal(kp(live, 'PS').catatan, 'Dihitung dari upload Perfect Stores 12 Nov 2026: 1 dari target 2 toko perfect');
  assert.equal(kp(live, 'FOP_SPM').catatan, 'Dihitung dari Extract DMS 12 Nov 2026: 1 dari 2 toko monitoring WEEKLY');
});

test('11. kpis berurutan menurut hilang menurun', () => {
  const live = run({ scorecard: [row('A', { t: 1, a: 0.9, b: 10, p: 9 }), row('B', { t: 1, a: 0.1, b: 10, p: 1 }), row('C', { t: 1, a: 0.5, b: 10, p: 5 })] });
  assert.deepEqual(live.kpis.map(k => k.kpi), ['B', 'C', 'A']);
});

test('riwayat: semua snapshot urut tanggal; rank dari snapshot sebelumnya bila tanpa isian manual', () => {
  const old = (kpi, o) => Object.assign(row(kpi, o), { tanggal: '2026-11-10' });
  const live = run({ scorecard: [row('RANK', { a: 5 }), row('SCORE', { a: 60 }), old('RANK', { a: 8 }), old('SCORE', { a: 50 })] });
  assert.deepEqual(live.history.map(h => [h.tanggal, h.rank, h.score]), [['2026-11-10', 8, 50], ['2026-11-17', 5, 60]]);
  assert.equal(live.rank, 5);
  assert.equal(live.prevRank, 8);
});

test('12. kesetaraan dengan oracle (kode browser lama) pada tiga fixture', () => {
  const dir = new URL('./fixtures/gs/', import.meta.url);
  const oracle = JSON.parse(fs.readFileSync(new URL('oracle-out.json', dir), 'utf8'));
  for (const f of Object.keys(oracle)) {
    const D = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    const live = J(g.computeGsLive_({ scorecard: D.scorecard, ps: { stores: D.ps.stores, targets: D.ps.targets }, asrt: D.asrt, mon: D.mon, scoped: !!D.scope }));
    const o = oracle[f];
    const mine = live.kpis.map(k => ({ kpi: k.kpi, label: k.label, target: k.target, aktual: k.aktual, bobot: k.bobot, poin: k.poin, hilang: k.hilang, catatan: k.catatan, level: k.level, weekly: k.weekly === true }));
    assert.deepEqual(mine, o.kpis, f + ' kpis');
    assert.deepEqual(live.score, o.score, f + ' score');
    assert.deepEqual(live.scoreShown, o.scoreShown, f + ' scoreShown');
    assert.deepEqual(live.rank, o.rank, f + ' rank');
    assert.deepEqual(live.prevRank, o.prevRank, f + ' prevRank');
    assert.deepEqual(live.fopWeek, o.fopWeek, f + ' fopWeek');
    assert.deepEqual(live.summary, o.summary, f + ' summary');
  }
});

test('respondGs_ menyertakan live', () => {
  // computeGsLive_ dipanggil dari respondGs_: pastikan tanda tangan terpasang (tes bentuk, bukan angka).
  assert.match(String(g.respondGs_), /live: computeGsLive_\(/);
});
