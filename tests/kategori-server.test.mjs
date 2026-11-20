// Server menu Kategori (plan 034): view=kategori, penggabungan bulan + minggu, cakupan akun, tab kosong, data rusak, tanpa kode akses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGs } from './helpers/load-gs.mjs';
import { buildDummy, ACCESS } from './dummy/dataset.mjs';
import { makeSpreadsheetApp } from './dummy/fakeSpreadsheet.mjs';

const plain = v => JSON.parse(JSON.stringify(v));
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const serverFor = ds => loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FixedDate } });
const call = (ctx, parameter) => JSON.parse(ctx.doGet({ parameter }).getContent());

// ---------- hitungan murni computeKategori_ (angka kecil, hitung tangan) ----------
const ctxPure = loadGs({ SpreadsheetApp: {} });
const B = (periode, v, o = 'T1') => ({ periode, dt: 'D', o, div: 'DV', cat: 'CT', br: 'BR', v });
const W = (awal, akhir, v, o = 'T1') => ({ awal, akhir, dt: 'D', o, div: 'DV', cat: 'CT', br: 'BR', v });
const one = res => { assert.equal(res.series.length, 1); return plain(res.series[0]); };

test('a1. cutoff Minggu, bulan + minggu tidak dihitung dobel, baris setelah cutoff diabaikan', () => {
  const res = ctxPure.computeKategori_({
    bulan: [B('2025-01', 100), B('2025-11', 1000), B('2025-12', 2000), B('2026-01', 300), B('2026-10', 400)],
    minggu: [W('2026-10-26', '2026-10-31', 7), W('2026-11-02', '2026-11-08', 50), W('2026-11-09', '2026-11-15', 60), W('2026-11-16', '2026-11-17', 999),
      W('2025-11-03', '2025-11-09', 20), W('2025-11-10', '2025-11-16', 30)],
  });
  assert.equal(res.dataUntil, '2026-11-17'); assert.equal(res.cutoff, '2026-11-15'); assert.equal(res.lyEnd, '2025-11-16');
  assert.equal(res.hkTy, 319); assert.equal(res.hkLy, 320); assert.equal(res.lewatCutoff, 1);
  const s = one(res);
  assert.equal(s.ty, 300 + 400 + 50 + 60);       // 7 (minggu Okt) tidak ikut: Okt sudah ada di tab bulan
  assert.equal(s.ly, 100 + 20 + 30);             // bulan 2025 sebelum Nov + minggu Nov 2025 sampai LY_END
  assert.equal(s.fy, 100 + 1000 + 2000);         // semua baris bulan 2025
  assert.equal(s.r13, 7 + 50 + 60); assert.equal(s.r5, 7 + 50 + 60);
  assert.deepEqual(s.wk, [60, 50, 7]);
  assert.deepEqual(s.m, [400, 0, 0]);            // LM = Okt (cutoff bukan akhir bulan)
  assert.equal(s.l3, 400 + 110);
  assert.equal(s.mty[10], 110); assert.equal(s.mty[9], 400); assert.equal(s.mty[0], 300);
  assert.equal(s.mly[10], 1000); assert.equal(s.mly[11], 2000);
});

test('a2. cutoff jatuh di akhir bulan: LM = bulan cutoff (dari baris minggu), tahun lalu tidak dobel', () => {
  const res = ctxPure.computeKategori_({
    bulan: [B('2025-04', 3), B('2025-05', 50), B('2026-04', 100)],
    minggu: [W('2026-05-04', '2026-05-10', 40), W('2026-05-25', '2026-05-31', 5), W('2025-05-05', '2025-05-11', 10)],
  });
  assert.equal(res.cutoff, '2026-05-31');
  const s = one(res);
  assert.equal(s.ty, 145); assert.equal(s.ly, 3 + 10); assert.equal(s.fy, 53);
  assert.deepEqual(s.m, [45, 100, 0]);
});

test('a3. awal tahun: L3M melewati pergantian tahun (Des dan Nov tahun lalu)', () => {
  const res = ctxPure.computeKategori_({
    bulan: [B('2025-11', 30), B('2025-12', 20), B('2026-01', 10)],
    minggu: [W('2026-02-02', '2026-02-08', 4), W('2026-02-09', '2026-02-15', 6), W('2026-02-16', '2026-02-16', 1)],
  });
  assert.equal(res.cutoff, '2026-02-15');
  const s = one(res);
  assert.deepEqual(s.m, [10, 20, 30]);
  assert.equal(s.l3, 10 + 10 + 20);              // Feb (minggu) + Jan + Des
});

test('a4. retur negatif ikut dijumlah; baris yang seluruhnya nol tidak keluar', () => {
  const res = ctxPure.computeKategori_({ bulan: [B('2026-01', 100)], minggu: [W('2026-11-03', '2026-11-08', -40), W('2026-11-09', '2026-11-15', 0, 'T2')] });
  assert.equal(one(res).ty, 60);
});

// ---------- dataset dummy lewat doGet ----------
const ds = buildDummy({ seed: 2026 });
const rowsOf = r => r.r.map(a => ({ t: r.tokos[a[0]], b: r.brands[a[1]], v: a }));
const sumTab = (rows, f, pick) => rows.slice(1).filter(f).reduce((s, r) => s + r[pick], 0);
const bulanT = ds.pusat.GS_KAT_BULAN, mingguT = ds.pusat.GS_KAT_MINGGU;

test('b. angka kunci cocok dengan hitungan independen dari tab dummy (pusat, semua DT)', () => {
  const r = call(serverFor(ds), { view: 'kategori', code: ACCESS.pusat });
  assert.equal(r.mode, 'kategori'); assert.equal(r.cutoff, '2026-11-15'); assert.equal(r.dataUntil, '2026-11-17');
  const tot = k => r.r.reduce((s, a) => s + a[k], 0);
  const ty = sumTab(bulanT, x => x[0].startsWith('2026'), 6) + sumTab(mingguT, x => x[0] >= '2026-11-01' && x[1] <= '2026-11-15', 7);
  const ly = sumTab(bulanT, x => x[0] >= '2025-01' && x[0] <= '2025-10', 6) + sumTab(mingguT, x => x[0] >= '2025-11-01' && x[1] <= '2025-11-16', 7);
  const fy = sumTab(bulanT, x => x[0].startsWith('2025'), 6);
  const r13 = sumTab(mingguT, x => x[0] >= '2026-08-17' && x[1] <= '2026-11-15', 7);
  const r5 = sumTab(mingguT, x => x[0] >= '2026-10-12' && x[1] <= '2026-11-15', 7);
  assert.equal(tot(4), ty, 'ABS YTD TY'); assert.equal(tot(3), ly, 'ABS YTD LY'); assert.equal(tot(2), fy, 'ABS FY LY');
  assert.equal(tot(5), r13, 'RR 13 (jumlah)'); assert.equal(tot(6), r5, 'RR 5 (jumlah)');
  assert.equal(tot(7), sumTab(mingguT, x => x[0] >= '2026-11-09' && x[1] <= '2026-11-15', 7), 'LW');
  // per baris: satu toko x brand yang dipilih
  const pick = rowsOf(r).find(x => x.t.dt === 'D01' && x.t.id === 'A1001' && x.b.brand === 'Merek Teh');
  const same = (x, o) => x[2] === 'D01' && x[3] === 'A1001' && x[6] === 'Merek Teh';
  assert.equal(pick.v[4], sumTab(bulanT, x => x[1] === 'D01' && x[2] === 'A1001' && x[5] === 'Merek Teh' && x[0].startsWith('2026'), 6) + sumTab(mingguT, x => same(x) && x[0] >= '2026-11-01' && x[1] <= '2026-11-15', 7));
  assert.ok(pick.v[8] < 0, 'toko retur: L2W (2-8 Nov) negatif');
});

test('b2. nama toko, salesman, channel, brand, stok tiba; catatan terisi', () => {
  const r = call(serverFor(ds), { view: 'kategori', code: ACCESS.pusat });
  assert.deepEqual(r.dts.map(d => d.kode), ['D01', 'D02']);
  const t = r.tokos.find(x => x.dt === 'D01' && x.id === 'A1001');
  assert.ok(t.nama && t.ch);
  assert.ok(r.salesmen.length >= 6 && r.tokos.some(x => x.sm >= 0));
  assert.ok(r.brands.every(b => b.division && b.category && b.brand));
  assert.equal(r.stok.rows.filter(x => x[1] === 'Tanpa kategori').length, 2);   // satu per DT
  assert.ok(r.catatan.skuTanpaKategori >= 2);
  const csA = r.stok.rows.filter(x => x[0] === 'D01').reduce((s, x) => s + x[2], 0);
  const st = ds.pusat.STOK_GUDANG.slice(1).filter(x => x[0] === 'D01').reduce((s, x) => s + (x[3] * x[6] + x[4] * 12 + x[5]) / x[6], 0);
  assert.ok(Math.abs(csA - st) < 0.5, csA + ' vs ' + st);
});

test('c. akun DT hanya melihat DT sendiri', () => {
  const r = call(serverFor(ds), { view: 'kategori', code: ACCESS.tmk });
  assert.equal(r.peran, 'dt'); assert.deepEqual(r.dts.map(d => d.kode), ['D01']);
  assert.ok(r.tokos.every(t => t.dt === 'D01') && r.tokos.length > 0);
  assert.ok(r.salesmen.every(s => s.dt === 'D01'));
  assert.ok(r.stok.rows.every(x => x[0] === 'D01'));
  const all = call(serverFor(ds), { view: 'kategori', code: ACCESS.pusat });
  const d1 = all.r.filter(a => all.tokos[a[0]].dt === 'D01').reduce((s, a) => s + a[4], 0);
  assert.equal(r.r.reduce((s, a) => s + a[4], 0), d1);
  assert.ok(!JSON.stringify(r).includes('Sorong'));
});

test('d. tab kosong atau tidak ada memberi no_data yang menyebut tab', () => {
  const noBulan = plain(ds); noBulan.pusat.GS_KAT_BULAN = [noBulan.pusat.GS_KAT_BULAN[0]];
  let r = call(serverFor(noBulan), { view: 'kategori', code: ACCESS.pusat });
  assert.equal(r.error, 'no_data'); assert.match(r.message, /GS_KAT_BULAN/);
  // Tanpa GS_KAT_MINGGU: mode bulanan, bukan no_data.
  const noMinggu = plain(ds); delete noMinggu.pusat.GS_KAT_MINGGU;
  r = call(serverFor(noMinggu), { view: 'kategori', code: ACCESS.pusat });
  assert.equal(r.error, undefined); assert.equal(r.bulanan, true); assert.ok(r.r.length > 0);
  assert.ok(r.r.every(a => a[5] === 0 && a[6] === 0 && a[7] === 0 && a[8] === 0 && a[9] === 0), 'RR dan minggu kosong di mode bulanan');
});

test('d2. mode bulanan: cutoff akhir bulan terakhir, bulan itu ikut TY, YTD LY bulan yang sama', () => {
  const res = ctxPure.computeKategori_({ bulan: [B('2025-01', 100), B('2025-10', 40), B('2025-11', 1000), B('2026-01', 300), B('2026-10', 400)], minggu: [] });
  assert.equal(res.bulanan, true); assert.equal(res.cutoff, '2026-10-31'); assert.equal(res.dataUntil, '2026-10-31'); assert.equal(res.lyEnd, '2025-10-31');
  assert.equal(res.hkTy, 304); assert.equal(res.hkLy, 304); assert.equal(res.bulanTerlalu, 0);
  const s = one(res);
  assert.equal(s.ty, 700); assert.equal(s.ly, 140); assert.equal(s.fy, 1140);
  assert.deepEqual(s.m, [400, 0, 0]); assert.equal(s.l3, 400); assert.equal(s.r13, 0); assert.deepEqual(s.wk, [0, 0, 0]);
  assert.equal(ctxPure.computeKategori_({ bulan: [], minggu: [] }), null);
});

test('d3. toko di luar GS_TOKO dipakai bila baris membawa outlet_nama', () => {
  const x = plain(ds), b = x.pusat.GS_KAT_BULAN;
  b[0] = b[0].concat(['outlet_nama', 'channel']);
  for (let i = 1; i < b.length; i++) b[i] = b[i].concat(['', '']);
  b.push(['2026-03', 'D01', 'BARU01', 'FOODS', 'Minuman', 'Merek Teh', 5e6, 'TOKO BARU', 'LOCAL MINIS']);
  const r = call(serverFor(x), { view: 'kategori', code: ACCESS.pusat });
  const t = r.tokos.find(k => k.id === 'BARU01');
  assert.ok(t); assert.equal(t.nama, 'TOKO BARU'); assert.equal(t.ch, 'LOCAL MINIS'); assert.equal(r.catatan.tokoTakDikenal, 0);
});

test('d4. muatKategori: hanya kode pusat, tab terbatas, mulai menimpa, potongan berikut menambah', () => {
  const x = plain(ds), ctx = serverFor(x);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  const H = ['sku', 'category', 'brand', 'division'];
  assert.equal(post({ action: 'muatKategori', code: ACCESS.d01 || 'salah', tab: 'GS_KAT_PRODUK', header: H, rows: [] }).error, 'invalid_code');
  assert.equal(post({ action: 'muatKategori', code: ACCESS.pusat, tab: 'DAFTAR_DT', header: H, rows: [] }).error, 'bad_request');
  assert.equal(post({ action: 'muatKategori', code: ACCESS.pusat, tab: 'GS_KAT_PRODUK', header: H, rows: [['1', 'a']] }).error, 'bad_request');
  let r = post({ action: 'muatKategori', code: ACCESS.pusat, tab: 'GS_KAT_PRODUK', header: H, rows: [['0012', 'C', 'B', 'D']], mulai: true });
  assert.equal(r.ok, true); assert.equal(r.total, 1);
  r = post({ action: 'muatKategori', code: ACCESS.pusat, tab: 'GS_KAT_PRODUK', header: H, rows: [['0013', 'C', 'B', 'D'], ['0014', 'C', 'B', 'D']], selesai: true });
  assert.equal(r.ok, true); assert.equal(r.total, 3);
  r = post({ action: 'muatKategori', code: ACCESS.pusat, tab: 'GS_KAT_PRODUK', header: ['x'], rows: [['1']] });
  assert.equal(r.error, 'bad_request');
});

test('e. tanggal, periode, dan gsv rusak dibuang dan dihitung; toko tak dikenal dihitung', () => {
  const bad = plain(ds);
  const b0 = bad.pusat.GS_KAT_BULAN, w0 = bad.pusat.GS_KAT_MINGGU, ok0 = call(serverFor(ds), { view: 'kategori', code: ACCESS.pusat });
  b0.push(['2026-13', 'D01', 'A1001', 'FOODS', 'Minuman', 'Merek Teh', 5e6], ['Jan 2026', 'D01', 'A1001', 'FOODS', 'Minuman', 'Merek Teh', 5e6]);
  w0.push(['31/31/2026', '2026-11-08', 'D01', 'A1001', 'FOODS', 'Minuman', 'Merek Teh', 5e6], ['2026-11-09', '<b>x</b>', 'D01', 'A1001', 'FOODS', 'Minuman', 'Merek Teh', 5e6],
    ['2026-11-09', '2026-11-12', 'D01', 'A1001', 'FOODS', 'Minuman', 'Merek Teh', 'abc'], ['2026-10-30', '2026-11-02', 'D01', 'A1001', 'FOODS', 'Minuman', 'Merek Teh', 5e6],
    ['2026-11-09', '2026-11-12', 'D01', 'ZZZ9', 'FOODS', 'Minuman', 'Merek Teh', 5e6]);
  const r = call(serverFor(bad), { view: 'kategori', code: ACCESS.pusat });
  assert.equal(r.catatan.tanggalRusak, 4); assert.equal(r.catatan.gsvRusak, 1); assert.equal(r.catatan.mingguLintasBulan, 1); assert.equal(r.catatan.tokoTakDikenal, 1);
  assert.equal(r.r.reduce((s, a) => s + a[4], 0), ok0.r.reduce((s, a) => s + a[4], 0), 'baris rusak tidak mengubah angka');
});

test('f. tidak ada kode akses atau kolom registri di respons', () => {
  const ctx = serverFor(ds);
  for (const code of Object.values(ACCESS)) {
    const txt = ctx.doGet({ parameter: { view: 'kategori', code } }).getContent();
    Object.values(ACCESS).forEach(c => assert.ok(!txt.includes(c), 'memuat kode akses'));
    assert.ok(!/kode_akses|sheet_id/.test(txt));
  }
  assert.equal(call(ctx, { view: 'kategori', code: 'salah' }).error, 'invalid_code');
  assert.equal(call(ctx, { view: 'kategori' }).error, 'missing_code');
});

test('g. salesman tidak tersedia: filter kosong dan dilaporkan, bukan galat', () => {
  const ctx = serverFor(ds);
  vm.runInContext('salesRankForDt_ = r => ({ dist_kode: r.dt_kode, dist_nama: r.nama_dt, error: "gagal" });', ctx);
  const r = call(ctx, { view: 'kategori', code: ACCESS.pusat });
  assert.ok(!r.error); assert.equal(r.salesmen.length, 0); assert.ok(r.tokos.every(t => t.sm === -1));
  assert.deepEqual(r.catatan.salesmanTidakTersedia.sort(), ['D01', 'D02']);
});

test('h. hasil di-cache: panggilan kedua tidak membaca tab lagi', () => {
  const ctx = serverFor(ds);
  const a = ctx.doGet({ parameter: { view: 'kategori', code: ACCESS.pusat } }).getContent();
  vm.runInContext('readObjs_ = () => { throw new Error("tidak boleh membaca"); };', ctx);
  assert.equal(ctx.doGet({ parameter: { view: 'kategori', code: ACCESS.pusat } }).getContent(), a);
});
