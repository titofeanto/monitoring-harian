// Modul hitung menu Kategori (plan 034): rumus PBI dengan angka kecil yang bisa dihitung tangan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../assets/kat-calc.js', import.meta.url), 'utf8'), ctx);
const K = ctx.window.MHKat;
const plain = v => JSON.parse(JSON.stringify(v));
const HK = { hkTy: 100, hkLy: 200 };
const row = (o = {}, br = { division: 'D1', category: 'C1', brand: 'B1' }, tk = { id: 'T1', nama: 'Toko 1', dt: 'D01', ch: 'GT', sm: 0 }) =>
  Object.assign({ t: 0, b: 0, tk, br, fy: 0, ly: 0, ty: 0, r13: 0, r5: 0, wk: [0, 0, 0], m: [0, 0, 0], l3: 0, mty: new Array(12).fill(0), mly: new Array(12).fill(0) }, o);

test('rumus dasar Weekly: AVG, RR, growth dihitung tangan', () => {
  const m = K.M([row({ fy: 36500, ly: 4000, ty: 1000, r13: 910, r5: 350 })], 'weekly', HK);
  assert.equal(m.avgFY, 36500 / 365 * 7);               // 700
  assert.equal(m.avgSP, 4000 / 200 * 7);                // 140
  assert.equal(m.avgTY, 1000 / 100 * 7);                // 70
  assert.equal(m.rr13, 910 / 13 / 7 * 7);               // 70
  assert.equal(m.rr5, 350 / 5 / 7 * 7);                 // 70
  assert.ok(Math.abs(m.a2a - (70 / 700 - 1)) < 1e-12);
  assert.ok(Math.abs(m.sp - (70 / 140 - 1)) < 1e-12);
});

test('Monthly vs Weekly: hanya AVG dan RR yang berubah (faktor 365/12 / 7), growth sama', () => {
  const it = [row({ fy: 36500, ly: 4000, ty: 1000, r13: 910, r5: 350 })];
  const w = K.M(it, 'weekly', HK), mo = K.M(it, 'monthly', HK), f = 365 / 12 / 7;
  assert.ok(Math.abs(mo.avgTY - w.avgTY * f) < 1e-9); assert.ok(Math.abs(mo.rr13 - w.rr13 * f) < 1e-9); assert.ok(Math.abs(mo.rr5 - w.rr5 * f) < 1e-9);
  assert.ok(Math.abs(mo.a2a - w.a2a) < 1e-12); assert.ok(Math.abs(mo.sp - w.sp) < 1e-12);
  assert.equal(mo.ty, w.ty); assert.equal(mo.fy, w.fy);
});

test('pembanding nol memberi kosong (null) dan fG menampilkan strip', () => {
  const m = K.M([row({ ty: 500 })], 'weekly', HK);
  assert.equal(m.a2a, null); assert.equal(m.sp, null);
  assert.match(K.fG(m.a2a), /kt-na/);
});

test('retur negatif ikut dijumlah dan growth bisa turun', () => {
  const m = K.M([row({ fy: 3650, ly: 400, ty: 300 }), row({ ty: -150, r13: -50 })], 'weekly', HK);
  assert.equal(m.ty, 150); assert.equal(m.r13, -50);
  assert.ok(m.sp < 0);
  assert.match(K.fG(m.sp), /kt-down/);
});

test('format: ribuan titik, juta + M, growth panah, persen 1 desimal, tanpa -0', () => {
  assert.equal(K.fN(1234567.4), '1.234.567');
  assert.equal(K.fM(2500000), '3M'); assert.equal(K.fM(-300000), '0M'); assert.equal(K.fM(12345678), '12M');
  assert.equal(K.fP(0.12345), '12,3%');
  assert.equal(K.fG(0.1234), '<span class="kt-up">▲ 12,3%</span>');
  assert.equal(K.fG(-0.05), '<span class="kt-down">▼ 5,0%</span>');
  assert.equal(K.fG(0), '0,0%');
  assert.equal(K.fN(-0.2), '0');
});

test('kolom pivot: urutan PBI dan header L* mengikuti basis', () => {
  const heads = b => K.cols(b).map(c => c.sp ? '|' : c.h).join(',');
  assert.equal(heads('weekly'), 'ABS FY LY,ABS YTD LY,ABS YTD TY,Contr LY,Contr TY,|,Growth SP,Growth A2A,|,AVG FY LY,AVG SP LY,AVG YTD TY,|,RR 13,RR 5,|,L3W,L2W,LW');
  assert.equal(heads('monthly').split(',').slice(-3).join(','), 'L3M,L2M,LM');
  const m = K.M([row({ wk: [3e6, 2e6, 1e6], m: [30e6, 20e6, 10e6] })], 'weekly', HK);
  const get = (b, h) => K.cols(b).find(c => c.h === h).v(K.M([row({ wk: [3e6, 2e6, 1e6], m: [30e6, 20e6, 10e6] })], b, HK), m);
  assert.equal(get('weekly', 'LW'), '3M'); assert.equal(get('weekly', 'L3W'), '1M');
  assert.equal(get('monthly', 'LM'), '30M'); assert.equal(get('monthly', 'L3M'), '10M');
});

test('Contr TY menjumlah 100% untuk baris tingkat 1 dan tiap tingkat', () => {
  const items = [
    row({ ty: 600, ly: 100 }, { division: 'A', category: 'A1', brand: 'x' }), row({ ty: 300, ly: 100 }, { division: 'A', category: 'A2', brand: 'y' }),
    row({ ty: 100, ly: 300 }, { division: 'B', category: 'B1', brand: 'z' }),
  ];
  const tot = K.M(items, 'weekly', HK);
  const rows = K.rowsCategory(items, 'weekly', HK, new Set(['d:A', 'c:A|A1']));
  assert.deepEqual(plain(rows.map(r => r.label)), ['A', 'A1', 'x', 'A2', 'B']);   // urut ty menurun, hanya yang dibuka
  const cTy = r => r.m.ty / tot.ty, cLy = r => r.m.ly / tot.ly;
  const l1 = rows.filter(r => r.lv === 1);
  assert.ok(Math.abs(l1.reduce((s, r) => s + cTy(r), 0) - 1) < 1e-12); assert.ok(Math.abs(l1.reduce((s, r) => s + cLy(r), 0) - 1) < 1e-12);
  assert.equal(K.cols('weekly').find(c => c.h === 'Contr TY').v(rows[0].m, tot), '90,0%');
  assert.equal(rows.find(r => r.label === 'A').m.ty, 900);
  // buka semua: tiga tingkat, jumlah brand = 3
  assert.equal(K.rowsCategory(items, 'weekly', HK, new Set(['d:A', 'd:B', 'c:A|A1', 'c:A|A2', 'c:B|B1'])).filter(r => r.lv === 3).length, 3);
});

test('rowsOutlet: Salesman > Outlet, toko tanpa salesman dikelompokkan sendiri', () => {
  const sm = [{ nama: 'Andi', dt: 'D01' }];
  const a = row({ ty: 500 }), b = row({ ty: 200, t: 1 }, undefined, { id: 'T2', nama: 'Toko 2', dt: 'D01', ch: 'GT', sm: -1 });
  const rows = K.rowsOutlet([a, b], sm, 'weekly', HK, new Set());
  assert.deepEqual(plain(rows.map(r => r.label)), ['Andi (D01)', 'T1 - Toko 1', 'Tanpa salesman', 'T2 - Toko 2']);
  assert.deepEqual(plain(K.rowsOutlet([a, b], sm, 'weekly', HK, new Set(['s:0'])).map(r => r.label)), ['Andi (D01)', 'Tanpa salesman', 'T2 - Toko 2']);
});

test('label periode: bulan cutoff dan nomor minggu ISO', () => {
  assert.equal(K.periodLabel('2026-11-15'), 'NOV 2026 - WEEK 46');
  assert.equal(K.isoWeek('2026-01-01'), 1); assert.equal(K.isoWeek('2021-01-03'), 53);
  assert.equal(K.dateLabel('2026-11-15'), '15 Nov 2026');
});

test('insight: berhenti beli, peluang, naik, dan penetrasi', () => {
  const tokos = [0, 1, 2, 3].map(i => ({ id: 'T' + i, nama: 'N' + i, dt: 'D01', ch: 'GT', sm: 0 }));
  const cat = (c, b) => ({ division: 'D', category: c, brand: b });
  const rows = {
    0: [row({ fy: 1000, ty: 900, ly: 400, l3: 100, r13: 70 }, cat('C1', 'b1'))],                       // pembeli sehat
    1: [row({ fy: 1000, ty: 500, ly: 400, l3: 0 }, cat('C1', 'b1')), row({ l3: 50 }, cat('C2', 'b2'))], // C1 berhenti, toko aktif
    2: [row({ l3: 80 }, cat('C2', 'b2'))],                                                                // aktif, tak pernah C1: peluang
    3: [row({ fy: 100, ty: 1200, ly: 100, l3: 60, r13: 30 }, cat('C1', 'b1'))],                           // naik besar
  };
  const r = K.insight([0, 1, 2, 3], ti => rows[ti], 'C1', 'weekly', HK, tokos);
  assert.equal(r.aktif, 4); assert.equal(r.buyers, 2); assert.equal(r.penetrasi, 0.5);
  assert.deepEqual(plain(r.turun.map(x => x.t)), [1]); assert.deepEqual(plain(r.pel.map(x => x.t)), [2]); assert.deepEqual(plain(r.naik.map(x => x.t)), [3, 0]);   // toko 3 naik paling besar, toko 0 juga di atas +20%
  assert.ok(Math.abs(r.pel[0].pot - 70 / 13) < 1e-9);    // median RR 13 pembeli GT: [30/13, 70/13] -> indeks 1
  const c = K.composition([0, 1, 2, 3], ti => rows[ti], 0, ['C1', 'C2'], 'weekly', HK, tokos);
  assert.equal(c.peers, 3); assert.equal(c.rows[0].status, 'aktif'); assert.equal(c.rows[1].status, 'belum');
});
