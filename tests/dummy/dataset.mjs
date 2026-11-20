// Pembangkit dataset DUMMY (semua fiktif, deterministik). Lihat tests/dummy/README.md.
// buildDummy({seed}) -> { pusat: {TAB: [header, ...baris]}, dts: { D01: {TAB...}, D02: {...} }, registry: [...], meta }
// Tanggal "hari ini" dummy 2026-11-18; data sampai 2026-11-17 (MTD-1).
import { makeRng } from './prng.mjs';
import { buildKategori, sundayOnOrBefore, isoOf, msOf } from './kategori.mjs';

export const TODAY = '2026-11-18';
export const DATA_UNTIL = '2026-11-17';
export const BULAN = '2026-11';
// Kode akses HANYA untuk tes (jelas palsu). Bukan kode nyata dan tidak boleh muncul di fixture.
export const ACCESS = { pusat: 'dummy-pusat', tmk: 'dummy-dt-tmk', srg: 'dummy-dt-srg' };

const pad = n => String(n).padStart(2, '0');
const roundTo = (v, step) => Math.round(v / step) * step;

// ---------- Katalog produk (sama untuk dua DT) ----------
const BU_DEFS = [
  { key: 'FOODS', short: 'FO', label: 'Foods', merek: 'Merek Dapur', names: ['Kecap Manis', 'Mi Instan Goreng', 'Margarin', 'Bumbu Ayam', 'Sosis Ayam', 'Teh Celup'] },
  { key: 'HOME CARE', short: 'HC', label: 'Home Care', merek: 'Merek Rumah', names: ['Deterjen Bubuk', 'Pelembut Pakaian', 'Sabun Cuci Piring', 'Pembersih Lantai', 'Pewangi Ruangan', 'Pemutih Pakaian'] },
  { key: 'PERSONAL CARE', short: 'PC', label: 'Personal Care', merek: 'Merek Mandi', names: ['Sampo', 'Sabun Mandi Cair', 'Pasta Gigi', 'Deodoran', 'Kondisioner', 'Sabun Muka'] },
  { key: 'BEAUTY & WELLBEING', short: 'BW', label: 'Beauty & Wellbeing', merek: 'Merek Cantik', names: ['Serum Wajah', 'Pelembap', 'Tabir Surya', 'Pelembap Bibir', 'Vitamin C', 'Masker Wajah'] },
];
const ISI = [12, 24, 12, 24, 48, 12];

function buildCatalog(seed) {
  const rng = makeRng(seed).sub('katalog');
  const bps = [], skus = [];
  BU_DEFS.forEach((bu, b) => bu.names.forEach((nm, p) => {
    const bp = { code: 'BP-' + bu.short + '-0' + (p + 1), name: nm + ' Dummy', bu: bu.key, buIdx: b, idx: p, isi: ISI[p], skus: [] };
    const p1 = rng.int(120, 800) * 1000;
    [1, 2].forEach(v => {
      const sku = { code: String(700000 + b * 100 + p * 10 + v), name: nm + ' Dummy ' + (v === 1 ? 'Reguler' : 'Besar'), bp: bp.code, bu: bu.key, buIdx: b, variant: v,
        isi: bp.isi, hNew: v === 1 ? p1 : roundTo(p1 * 1.6, 1000), merek: bu.merek + ' ' + String.fromCharCode(65 + p) };
      bp.skus.push(sku); skus.push(sku);
    });
    bps.push(bp);
  }));
  // Banded: per BU, 2 SKU untuk SPM (basepack 1-2) dan 2 SKU untuk MINIS (basepack 3-4), varian reguler.
  const banded = { SPM: [], MINIS: [] };
  BU_DEFS.forEach((bu, b) => {
    const mine = bps.filter(x => x.buIdx === b);
    banded.SPM.push(mine[0].skus[0], mine[1].skus[0]);
    banded.MINIS.push(mine[2].skus[0], mine[3].skus[0]);
  });
  return { bps, skus, banded };
}

// ---------- Definisi DT dan salesman ----------
const KANAL = { SPM: 'LOCAL SUPERMARKET', MINIS: 'LOCAL MINIS' };
const BP_PROB = { bintang: { p2: 0.75, p1: 0.2 }, sedang: { p2: 0.45, p1: 0.35 }, tertinggal: { p2: 0.15, p1: 0.3 } };
const DT_DEFS = [
  { kode: 'D01', nama: 'Dummy Timika', sheet: 'dummy-sheet-tmk', akses: ACCESS.tmk, prefix: 'A', extra: 3, inactive: 2, skala: 1,
    sales: [
      { kode: '101', nama: 'Salesman Timika 1', profile: 'bintang', pola: ['4', '4', '3', '3', '3', '3', '3', '2', '2', '1', '0'], buProb: { 'FOODS': 1, 'HOME CARE': 0.95, 'PERSONAL CARE': 0.9, 'BEAUTY & WELLBEING': 0.85 }, rasio: 1.12 },
      { kode: '102', nama: 'Salesman Timika 2', profile: 'bintang', pola: ['4', '3', '3', '3', '3', '3', '2', '2', '1', '1'], buProb: { 'FOODS': 0.95, 'HOME CARE': 0.9, 'PERSONAL CARE': 0.9, 'BEAUTY & WELLBEING': 0.8 }, rasio: 1.02 },
      { kode: '103', nama: 'Salesman Timika 3', profile: 'sedang', pola: ['3', '3', '3', '2', '2', '2', '1', '1', '1', '0'], buProb: { 'FOODS': 0.85, 'HOME CARE': 0.8, 'PERSONAL CARE': 0.75, 'BEAUTY & WELLBEING': 0.6 }, rasio: 0.86 },
    ] },
  { kode: 'D02', nama: 'Dummy Sorong', sheet: 'dummy-sheet-srg', akses: ACCESS.srg, prefix: 'K', extra: 3, inactive: 2, skala: 0.8,
    sales: [
      // 201 memakai pola toko yang sama dengan 101 dan Foods selalu dibeli: nilai Weekly FOP Foods kembar tepat (7 dari 10).
      { kode: '201', nama: 'Salesman Sorong 1', profile: 'bintang', pola: ['4', '4', '3', '3', '3', '3', '3', '2', '2', '1', '0'], buProb: { 'FOODS': 1, 'HOME CARE': 0.9, 'PERSONAL CARE': 0.8, 'BEAUTY & WELLBEING': 0.7 }, rasio: 1.08 },
      { kode: '202', nama: 'Salesman Sorong 2', profile: 'sedang', pola: ['3', '3', '3', '2', '2', '2', '1', '1', '0', '0'], buProb: { 'FOODS': 0.85, 'HOME CARE': 0.75, 'PERSONAL CARE': 0.7, 'BEAUTY & WELLBEING': 0.55 }, rasio: 0.88 },
      { kode: '203', nama: 'Salesman Sorong 3', profile: 'tertinggal', pola: ['3', '2', '2', '1', '1', '1', '1', '0', '0'], buProb: { 'FOODS': 0.95, 'HOME CARE': 0.45, 'PERSONAL CARE': 0.35, 'BEAUTY & WELLBEING': 0.2 }, rasio: 0.55 },
    ] },
];

const KATA = ['Sinar', 'Harapan', 'Mentari', 'Pelita', 'Cendana', 'Berkah', 'Sejahtera', 'Makmur', 'Rejeki', 'Anugerah', 'Bintang', 'Mutiara', 'Karya', 'Lestari', 'Surya',
  'Cahaya', 'Damai', 'Fajar', 'Gemilang', 'Indah', 'Jaya', 'Kasih', 'Lancar', 'Mandiri', 'Nusantara', 'Permata', 'Rahayu', 'Sentosa', 'Tunas', 'Utama', 'Wijaya'];
const HARI = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Minggu ISO bulan data dan hari invoice yang mungkin. Minggu 44 hanya 1 Nov (Minggu): dipakai toko "4 minggu".
const HARI_MINGGU = { 44: [1], 45: [2, 3, 4, 5, 6, 7], 46: [9, 10, 11, 12, 13, 14], 47: [16, 17] };

function polaMinggu(p, rng) {
  if (p === '4') return [44, 45, 46, 47];
  if (p === '3') return [45, 46, 47];
  if (p === '2') return rng.shuffle([45, 46, 47]).slice(0, 2).sort();
  if (p === '1') return [rng.pick([45, 46, 47])];
  return [];
}

// ---------- Satu DT ----------
function genDt(def, cat, seed) {
  const rng = makeRng(seed).sub('dt-' + def.kode);
  const words = rng.shuffle(KATA);
  let wi = 0;
  const nameFor = ch => { const w = words[wi % words.length] + (wi >= words.length ? ' II' : ''); wi++; return (ch === 'SPM' ? 'Swalayan ' : rng.pick(['Toko ', 'Kios ', 'Mini '])) + w; };
  const stores = [];
  let seq = 1;
  def.sales.forEach(sm => sm.pola.forEach((p, i) => {
    const ch = i % 3 === 0 ? 'SPM' : 'MINIS';
    const suffix = def.prefix + String(1000 + seq++);
    stores.push({ suffix, nama: nameFor(ch), ch, sm: sm.kode, pola: p, weeks: polaMinggu(p, rng), monitored: true, status: 'ACTIVE',
      remark: ch === 'SPM' ? 'LOCAL SPM' : (i % 2 ? 'LOCAL MINIS' : 'TOP 1000 LOCAL MINIS'), pjp: HARI[(seq + i) % 6], dual: null,
      skill: (sm.profile === 'bintang' ? 9 : sm.profile === 'sedang' ? 6 : 3.5) + rng.int(-1, 2) + (ch === 'SPM' ? 2 : 0), hist: 'full' });
  }));
  // Dual coverage: beberapa toko juga dilayani salesman lain untuk satu BU (qty kecil, pemilik BU tetap yang utama).
  stores.filter((s, i) => i % 7 === 3).forEach(s => { const o = def.sales.find(x => x.kode !== s.sm); s.dual = { sm: o.kode, bu: rng.pick(BU_DEFS).key }; });
  const monitored = stores.slice();
  // Toko di luar monitoring (REMARK OTHERS) dan toko INACTIVE.
  for (let i = 0; i < def.extra; i++) { const sm = def.sales[i % def.sales.length]; stores.push({ suffix: def.prefix + String(2000 + i), nama: 'Toko ' + words[(wi++) % words.length] + ' Lain', ch: 'GT', sm: sm.kode, pola: '2', weeks: polaMinggu('2', rng), monitored: false, status: 'ACTIVE', remark: 'OTHERS', pjp: HARI[i % 6], dual: null, skill: 3, hist: 'none' }); }
  for (let i = 0; i < def.inactive; i++) { const sm = def.sales[(i + 1) % def.sales.length]; const ch = i % 2 ? 'MINIS' : 'SPM'; stores.push({ suffix: def.prefix + String(3000 + i), nama: nameFor(ch) + ' (tutup)', ch, sm: sm.kode, pola: '0', weeks: [], monitored: false, status: 'INACTIVE', remark: ch === 'SPM' ? 'LOCAL SPM' : 'LOCAL MINIS', pjp: HARI[i % 6], dual: null, skill: 0, hist: 'none' }); }
  // Riwayat tren: sebagian toko baru (tanpa riwayat Q4 2025), sebagian ada lubang bulan.
  const tm = rng.shuffle(monitored);
  tm.slice(0, 5).forEach(s => { s.hist = 'baru'; });
  tm.slice(5, 11).forEach(s => { s.hist = 'lubang'; });

  const smBy = {}; def.sales.forEach(s => { smBy[s.kode] = s; });
  const bpsOfBu = {}; BU_DEFS.forEach(b => { bpsOfBu[b.key] = cat.bps.filter(x => x.bu === b.key); });
  const dms = [['Salesman', 'Sub_division', 'Category', 'GSV', 'Outlet', 'Outlet Name', 'SubChannel', 'SKUCode', 'TotalQuantity(PCS)', 'INVDate']];
  const line = (sm, sku, bp, st, qty, d) => {
    const gsv = Math.round(qty * (sku.hNew / sku.isi) * (0.94 + rng.next() * 0.06));
    dms.push([sm, sku.bu, bp.name, gsv, st.suffix, st.nama, st.ch === 'GT' ? 'LOCAL GT' : KANAL[st.ch], sku.code, qty, '2026-11-' + pad(d)]);
  };
  stores.forEach(st => {
    if (!st.weeks.length) return;
    const sm = smBy[st.sm], bp0 = BP_PROB[sm.profile];
    // SKU banded yang ingin dibeli bulan ini per BU (hanya toko monitoring)
    const want = {};
    BU_DEFS.forEach(bu => {
      const list = st.monitored ? cat.banded[st.ch].filter(x => x.bu === bu.key) : [];
      const r = rng.next(), n = r < bp0.p2 ? 2 : r < bp0.p2 + bp0.p1 ? 1 : 0;
      want[bu.key] = rng.shuffle(list).slice(0, n);
    });
    const isBanded = code => cat.banded.SPM.concat(cat.banded.MINIS).some(x => x.code === code);
    st.weeks.forEach(w => {
      const d = rng.pick(HARI_MINGGU[w]);
      BU_DEFS.forEach(bu => {
        const prob = st.monitored ? sm.buProb[bu.key] : 0.6;
        if (!rng.chance(prob)) return;
        const kmax = sm.profile === 'bintang' ? 4 : sm.profile === 'sedang' ? 3 : 2;
        const picks = rng.shuffle(bpsOfBu[bu.key]).slice(0, rng.int(1, kmax));
        picks.forEach(bp => {
          let sku = bp.skus[rng.int(0, 1)];
          if (isBanded(sku.code)) sku = bp.skus[1];
          const qty = rng.int(3, 10) * (rng.chance(0.25) ? 2 : 1);
          line(st.sm, sku, bp, st, qty, d);
          if (rng.chance(0.04)) line(st.sm, sku, bp, st, -rng.int(1, 2), d);   // retur kecil
        });
        (want[bu.key] || []).splice(0).forEach(sku => { line(st.sm, sku, cat.bps.find(x => x.code === sku.bp), st, 6, d); });
        if (st.dual && st.dual.bu === bu.key && rng.chance(0.6)) { const bp = rng.pick(bpsOfBu[bu.key]); line(st.dual.sm, bp.skus[1], bp, st, rng.int(1, 2), d); }
      });
    });
  });

  // Agregat dari DMS (bantu menyusun target, lines, dan toko aktif)
  const gsvBy = {}, netBp = {}, skuToBp = {};
  cat.skus.forEach(s => { skuToBp[s.code] = s.bp; });
  dms.slice(1).forEach(r => {
    const g = gsvBy[r[0]] = gsvBy[r[0]] || {}; g[r[1]] = (g[r[1]] || 0) + r[3];
    const k = r[4] + '|' + skuToBp[r[7]]; netBp[k] = (netBp[k] || 0) + r[8];
  });
  const lines = {}, active = {};
  Object.keys(netBp).forEach(k => { const o = k.split('|')[0]; if (netBp[k] > 0) active[o] = true; if (netBp[k] >= 3) lines[o] = (lines[o] || 0) + 1; });
  stores.forEach(s => { s.lines = lines[s.suffix] || 0; s.aktif = !!active[s.suffix]; });
  return { rng, stores, monitored, dms, gsvBy, smBy };
}

// ---------- Perakitan ----------
function hargaRows(cat, rng) {
  const rows = [['sku', 'barcode', 'brand', 'nama', 'kemasan', 'isi', 'mulai', 'h_new', 'h_old', 's_new', 's_old', 'tanggal_pl']];
  const naik = rng.shuffle(cat.skus).slice(0, 12);
  cat.skus.forEach(s => {
    const i = naik.indexOf(s);
    const hNew = i < 0 ? s.hNew : roundTo(s.hNew * (1.03 + (i % 4) * 0.01), 1000);
    const mulai = i < 0 ? '' : i < 4 ? '2026-12-01' : '2026-11-01';
    rows.push([s.code, '8990000' + s.code, s.merek, s.name, 'Karton', s.isi, mulai, hNew, s.hNew, Math.round(hNew / s.isi), Math.round(s.hNew / s.isi), '2026-11-01']);
  });
  return rows;
}

export function buildDummy({ seed = 2026, tanpaData = false } = {}) {
  const cat = buildCatalog(seed);
  const root = makeRng(seed);
  const registry = [{ kode_akses: ACCESS.pusat, peran: 'pusat', dt_kode: '', nama_dt: '', sheet_id: '', aktif: true }]
    .concat(DT_DEFS.map(d => ({ kode_akses: d.akses, peran: 'dt', dt_kode: d.kode, nama_dt: d.nama, sheet_id: d.sheet, aktif: true })));
  const gen = {}; DT_DEFS.forEach(d => { gen[d.kode] = genDt(d, cat, seed); });

  // ----- Tab per DT (Sheet DT) -----
  const dts = {};
  DT_DEFS.forEach(def => {
    const g = gen[def.kode], rng = g.rng.sub('tab');
    const periodes = ['2026-09', '2026-10', '2026-11'];
    const prog = 0.52;   // hari kerja berjalan / total (13 dari 25)
    const targetBy = {};
    def.sales.forEach(sm => {
      const t = targetBy[sm.kode] = {};
      BU_DEFS.forEach(bu => {
        const mtd = ((g.gsvBy[sm.kode] || {})[bu.key]) || 0;
        t[bu.key] = mtd > 0 ? Math.max(5e6, roundTo(mtd / prog / (sm.rasio * (0.88 + rng.next() * 0.24)), 1e5)) : 12e6;
      });
    });
    const target = [['periode', 'kode_dsr', 'target_ss_bw', 'target_ss_pc', 'target_ss_hc', 'target_ss_fo', 'target_assortment', 'target_bp']];
    const hasil = [['periode', 'kode_dsr', 'nama_dsr', 'ss_bw_target', 'ss_bw_aktual', 'ss_pc_target', 'ss_pc_aktual', 'ss_hc_target', 'ss_hc_aktual', 'ss_fo_target', 'ss_fo_aktual',
      'ss_target', 'ss_aktual', 'ach_ss', 'asrt_target', 'asrt_aktual', 'ach_asrt', 'eco_pjp', 'eco_tx', 'ach_eco', 'skor', 'band', 'insentif_jasper', 'insentif_add', 'insentif_sku', 'insentif_total', 'disimpan_pada']];
    periodes.forEach((per, pi) => def.sales.forEach(sm => {
      const f = pi === 2 ? 1 : 0.94 + pi * 0.03 + rng.next() * 0.08;
      const t = BU_DEFS.reduce((a, b) => (a[b.short.toLowerCase()] = roundTo(targetBy[sm.kode][b.key] * f, 1e5), a), {});
      const nStore = g.monitored.filter(s => s.sm === sm.kode).length;
      target.push([per, sm.kode, t.bw, t.pc, t.hc, t.fo, 30 + Math.round(nStore * 3), nStore]);
      if (pi < 2) {
        const ak = {}; let sa = 0, st = 0;
        ['bw', 'pc', 'hc', 'fo'].forEach(k => { ak[k] = Math.round(t[k] * sm.rasio * (0.8 + rng.next() * 0.35) / 1e4) * 1e4; sa += ak[k]; st += t[k]; });
        const ach = sa / st, skor = Math.min(100, Math.round(ach * 85));
        hasil.push([per, sm.kode, sm.nama, t.bw, ak.bw, t.pc, ak.pc, t.hc, ak.hc, t.fo, ak.fo, st, sa, ach, 30 + nStore * 3, 28 + Math.round(nStore * 2.6 * sm.rasio), 0.9 * sm.rasio, nStore, Math.round(nStore * 0.8), 0.8, skor,
          skor >= 90 ? 'GREEN' : skor >= 70 ? 'AMBER' : 'RED', Math.round(ach * 400000), 0, Math.round(rng.int(0, 6) * 1000), Math.round(ach * 400000), per + '-28T10:00:00.000Z']);
      }
    }));
    const dsr = [['kode_dsr', 'nama_dsr', 'channel']].concat(def.sales.map(s => [s.kode, s.nama, 'GT']));
    const kpi = [['id', 'nama', 'tipe', 'bu', 'bobot', 'tier_juara', 'tier_achieve', 'tier_bawah', 'jasper_juara', 'jasper_achieve', 'jasper_bawah', 'khusus_dsr'],
      ['ss_bw', 'SS Beauty & Wellbeing', 'ss_bu', 'bw', 1, 1.1, 1, 0.8, 300000, 200000, 100000, ''],
      ['ss_pc', 'SS Personal Care', 'ss_bu', 'pc', 1, 1.1, 1, 0.8, 300000, 200000, 100000, ''],
      ['ss_hc', 'SS Home Care', 'ss_bu', 'hc', 1, 1.1, 1, 0.8, 300000, 200000, 100000, ''],
      ['ss_fo', 'SS Foods', 'ss_bu', 'fo', 1, 1.1, 1, 0.8, 300000, 200000, 100000, ''],
      ['asrt', 'Assortment', 'asrt', 'bw', 1, 1.1, 1, 0.8, 200000, 150000, 50000, ''],
      ['eco', 'ECO', 'eco', 'bw', 1, 1.1, 1, 0.8, 200000, 150000, 50000, ''],
      ['bp', 'Basepack toko', 'bp', 'bw', 1, 1.1, 1, 0.8, 150000, 100000, 50000, '']];
    const om = [['Outlet Code', 'Outlet Name', 'Salesman', 'PJP Day', 'Outlet Type Desc', 'Outlet sub-Type Description']];
    g.stores.forEach(s => om.push([def.kode + s.suffix, s.nama, def.sales.find(x => x.kode === s.sm).nama, s.pjp, s.ch === 'GT' ? 'LOCAL GT' : KANAL[s.ch], s.ch === 'SPM' ? 'Supermarket' : s.ch === 'MINIS' ? 'Minimarket' : 'Toko']));
    const produk = [['SKUCode', 'LEVEL-9', 'BU', 'nama_basepack']].concat(cat.skus.map(s => [s.code, s.bp, s.bu, cat.bps.find(b => b.code === s.bp).name]));
    // NORMS_SKU: 3 baris per toko monitoring (target SOQ), campuran tercapai dan belum.
    const norms = [['PACKTYPE', 'OutletCode', 'LEVEL-9', 'SUB DIVISION2', 'Target SOQ (in pcs)']];
    const tipe = ['Everbilled', 'Redlines', 'Width', 'NPD', 'Big Bets'];
    g.monitored.forEach(s => {
      for (let k = 0; k < 3; k++) {
        const bp = rng.pick(cat.bps);
        norms.push([tipe[(s.suffix.length + k + (+s.suffix.slice(1))) % tipe.length], (rng.chance(0.5) ? 'B' : '') + s.suffix, bp.code, bp.bu, rng.pick([6, 12, 12, 24, 36])]);
      }
    });
    const focus = [['channel', 'LEVEL-9']];
    ['SPM', 'MINIS'].forEach(ch => rng.shuffle(cat.bps).slice(0, 4).forEach(bp => focus.push([KANAL[ch], bp.code])));
    // NGDMS_ASRT: report ditempel apa adanya (baris judul + periode, lalu header).
    const ngd = [['Laporan NGDMS Assortment (dummy)', '', '', '', 'Periode', 2026, 11, '', ''],
      ['Distributor', 'Distributor Name', 'Salesman', 'Salesman Name', 'No of Active Outlets', 'E2E Target', 'E2S Target', 'E2E Achieved', 'E2S Achieved']];
    def.sales.forEach(sm => {
      const n = g.monitored.filter(s => s.sm === sm.kode).length;
      const e2eT = n * 12, e2sT = n * 9;
      ngd.push([def.kode, def.nama, sm.kode, sm.nama, n, e2eT, e2sT, Math.round(e2eT * 0.9 * sm.rasio * (0.9 + rng.next() * 0.2)), Math.round(e2sT * 0.9 * sm.rasio * (0.9 + rng.next() * 0.2))]);
    });
    dts[def.kode] = {
      CONFIG: [['key', 'value'], ['dt_kode', def.kode], ['dt_nama', def.nama], ['periode', BULAN], ['tanggal_data', DATA_UNTIL], ['ngdms_tanggal_data', DATA_UNTIL], ['hk_total', 25], ['hk_run', 13],
        ['band_green', 90], ['band_amber', 70], ['rate_sku_fokus', 1000], ['rate_npd_regular', 1000], ['rate_npd_thematic', 1000], ['npd_thematic_eco_min', 0.5], ['add_mid_pct', 0.4], ['add_reward', 100000]],
      TARGET: target, DMS_EXTRACT: g.dms, NORMS_SKU: norms, SKU_FOKUS: focus, DSR: dsr, OUTLET_MASTER: om, KPI: kpi, MASTER_PRODUK: produk,
      HARI_LIBUR: [['tanggal', 'keterangan'], ['2026-08-17', 'Hari Kemerdekaan'], ['2026-12-25', 'Natal'], ['2027-01-01', 'Tahun Baru']],
      NGDMS_ASRT: ngd, HASIL_PERHITUNGAN: hasil,
    };
  });

  // ----- Sheet pusat -----
  const P = {};
  const nama = c => DT_DEFS.find(d => d.kode === c).nama;
  P.DAFTAR_DT = [['kode_akses', 'peran', 'dt_kode', 'nama_dt', 'sheet_id', 'aktif']].concat(registry.map(r => [r.kode_akses, r.peran, r.dt_kode, r.nama_dt, r.sheet_id, 'TRUE']));
  const config = [['key', 'value', 'keterangan'], ['remark_spm', 'LOCAL SPM', ''], ['remark_minis', 'TOP 1000 LOCAL MINIS, LOCAL MINIS', ''], ['fop_weekly', 3, ''], ['fop_biweekly', 2, ''],
    ['banded_spm', 0.8, ''], ['banded_minis', 0.7, ''], ['rank_min_toko', 8, '']];
  P.GS_CONFIG = config;
  P.GS_BANDED_SKU = [['tanggal', 'channel', 'sku_kode', 'sku_nama']];
  ['SPM', 'MINIS'].forEach(ch => cat.banded[ch].forEach(s => P.GS_BANDED_SKU.push([DATA_UNTIL, ch, s.code, s.name])));
  P.GS_TOKO = [['tanggal', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'channel', 'subchannel', 'remark', 'status']];
  DT_DEFS.forEach(def => gen[def.kode].stores.forEach(s => P.GS_TOKO.push([DATA_UNTIL, def.kode, def.nama, s.suffix, s.nama, s.ch === 'GT' ? 'LOCAL GT' : KANAL[s.ch], s.ch === 'SPM' ? 'Supermarket' : s.ch === 'MINIS' ? 'Minimarket' : 'Toko', s.remark, s.status])));
  P.GS_OUTLET = [['tanggal', 'jenis', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'channel', 'remark', 'v1', 'v2', 'v3', 'status', 'detail']];   // mode live tidak memakainya

  // Scorecard: 3 snapshot mingguan
  const bob = { PS: 10, ASRT_SPM: 8, ASRT_MINIS: 8, FOP_SPM: 8, FOP_MINIS: 8, BANDED_SPM: 6, BANDED_MINIS: 6, DR: 10, R2G: 12 };
  const lab = { PS: 'Perfect Store', ASRT_SPM: 'Assortment SPM', ASRT_MINIS: 'Assortment Minis', FOP_SPM: 'Weekly FOP SPM', FOP_MINIS: 'Weekly FOP Minis', BANDED_SPM: 'Banded SPM', BANDED_MINIS: 'Banded Minis', DR: '%DR', R2G: 'R2G' };
  const tgt = { PS: 0.9, ASRT_SPM: 0.9, ASRT_MINIS: 0.9, FOP_SPM: 0.8, FOP_MINIS: 0.8, BANDED_SPM: 0.8, BANDED_MINIS: 0.7, DR: 0.95, R2G: 1 };
  const snaps = [['2026-11-03', { PS: 0.48, ASRT_SPM: 0.62, ASRT_MINIS: 0.58, FOP_SPM: 0.35, FOP_MINIS: 0.3, BANDED_SPM: 0.25, BANDED_MINIS: 0.2, DR: 0.88, R2G: 0.86 }, 12],
    ['2026-11-10', { PS: 0.55, ASRT_SPM: 0.7, ASRT_MINIS: 0.66, FOP_SPM: 0.5, FOP_MINIS: 0.44, BANDED_SPM: 0.4, BANDED_MINIS: 0.33, DR: 0.9, R2G: 0.9 }, 11],
    ['2026-11-17', { PS: 0.6, ASRT_SPM: 0.76, ASRT_MINIS: 0.71, FOP_SPM: 0.62, FOP_MINIS: 0.55, BANDED_SPM: 0.52, BANDED_MINIS: 0.45, DR: 0.93, R2G: 0.92 }, 9]];
  P.GS_SCORECARD = [['tanggal', 'kpi', 'label', 'target', 'bobot', 'aktual', 'poin', 'catatan']];
  snaps.forEach(([t, v, rank], i) => {
    let sum = 0; const body = [];
    Object.keys(bob).forEach(k => { const poin = Math.round(bob[k] * Math.min(v[k] / tgt[k], 1) * 100) / 100; sum += poin; body.push([t, k, lab[k], tgt[k], bob[k], v[k], poin, '']); });
    P.GS_SCORECARD.push([t, 'SCORE', 'SCORE', '', 100, Math.round(sum * 100) / 100, Math.round(sum * 100) / 100, ''], [t, 'RANK', 'RANK', '', '', rank, '', ''], [t, 'FOP_WEEK', 'Minggu data FOP terakhir', '', '', 44 + i + 1, '', 'Minggu berjalan ' + (46 + i)]);
    body.forEach(r => P.GS_SCORECARD.push(r));
  });
  P.GS_MANUAL = [['tanggal', 'rank', 'dr', 'waktu'], ['2026-11-03', 12, 0.88, '2026-11-03 09:00'], ['2026-11-10', 11, 0.9, '2026-11-10 09:00'], ['2026-11-17', 9, 0.93, '2026-11-17 09:00']];

  // Perfect Stores
  const rngP = root.sub('ps');
  P.GS_PS = [['tanggal', 'periode', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'channel', 'status', 'total_kpi', 'cotc', 'npd', 'sos', 'sstd', 'banded', 's_cotc', 's_npd', 's_sos', 's_sstd', 's_banded']];
  DT_DEFS.forEach(def => gen[def.kode].monitored.forEach(s => {
    if (rngP.chance(0.12)) return;   // sebagian toko tidak ada di laporan PS
    const prof = def.sales.find(x => x.kode === s.sm).profile, r = rngP.next();
    const pFull = prof === 'bintang' ? 0.35 : prof === 'sedang' ? 0.2 : 0.06, pLite = prof === 'bintang' ? 0.3 : prof === 'sedang' ? 0.3 : 0.18;
    const okN = r < pFull ? 5 : r < pFull + pLite ? 4 : rngP.int(1, 3);
    const flags = rngP.shuffle([0, 1, 2, 3, 4]).map((x, i) => (i < okN ? 1 : 0));
    const sc = flags.map(f => (f ? 1 : Math.round(rngP.next() * 8) / 10));
    P.GS_PS.push([DATA_UNTIL, BULAN, def.kode, def.nama, s.suffix, s.nama, KANAL[s.ch], okN === 5 ? 'PS FULL' : okN === 4 ? 'PS LITE' : 'NOT PERFECT', okN + '/5', ...flags.map(String), ...sc]);
  }));
  P.GS_TARGET = [['dist_kode', 'dist_nama', 'target_full', 'target_lite'], ['D01', nama('D01'), 8, 10], ['D02', nama('D02'), 7, 9]];
  P.GS_PS_HIST = [['tanggal', 'dist_kode', 'target', 'full', 'lite', 'perfect']];
  ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'].forEach((t, i) => DT_DEFS.forEach(def => {
    const tg = def.kode === 'D01' ? 18 : 16, full = Math.min(tg, 2 + i * 2 + (def.kode === 'D01' ? 1 : 0)), lite = Math.min(tg - full, 3 + i * 2);
    P.GS_PS_HIST.push([t, def.kode, tg, full, lite, full + lite]);
  }));

  // Target assortment per channel: 105% dari lines aktual bulan data (jadi pencapaian sekitar 95%) dikali faktor DT.
  P.GS_ASRT_TARGET = [['dist_kode', 'dist_nama', 'channel', 'target_lines']];
  DT_DEFS.forEach(def => ['SPM', 'MINIS'].forEach(ch => {
    const sum = gen[def.kode].stores.filter(s => s.ch === ch).reduce((a, s) => a + s.lines, 0);
    P.GS_ASRT_TARGET.push([def.kode, def.nama, KANAL[ch], Math.round(sum * (ch === 'SPM' ? 1.12 : 1.25) / 5) * 5]);
  }));

  // Riwayat bulanan (Agu-Okt) + tren assortment
  const rngH = root.sub('hist');
  const lastWd = { '2026-08': '2026-08-31', '2026-09': '2026-09-30', '2026-10': '2026-10-31' };
  P.GS_BULANAN = [['periode', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'grup', 'remark', 'minggu', 'status_fop', 'banded_sku', 'data_sampai', 'final', 'disimpan']];
  P.GS_BULANAN_ASRT = [['periode', 'dist_kode', 'dist_nama', 'channel', 'outlet_aktif', 'lines', 'terdaftar', 'data_sampai', 'final', 'disimpan']];
  P.GS_TREND_ASRT = [['dist_kode', 'outlet_kode', 'periode', 'lines']];
  const bulanTren = ['2025-10', '2025-11', '2025-12'].concat(Array.from({ length: 10 }, (_, i) => '2026-' + pad(i + 1)));
  DT_DEFS.forEach(def => {
    const g = gen[def.kode], agg = {};
    g.monitored.forEach(s => {
      const prof = def.sales.find(x => x.kode === s.sm).profile;
      const pw = prof === 'bintang' ? [0.1, 0.1, 0.2, 0.6] : prof === 'sedang' ? [0.2, 0.25, 0.3, 0.25] : [0.4, 0.3, 0.2, 0.1];
      const pb = prof === 'bintang' ? 0.8 : prof === 'sedang' ? 0.55 : 0.3;
      ['2026-08', '2026-09', '2026-10'].forEach(per => {
        const r = rngH.next(); let w = 0, acc = 0; for (let i = 0; i < 4; i++) { acc += pw[i]; if (r < acc) { w = i + 1; break; } if (i === 3) w = 4; }
        const wk = r < pw[0] ? 0 : w;
        const skus = cat.banded[s.ch].filter(() => rngH.chance(pb)).map(x => x.code);
        P.GS_BULANAN.push([per, def.kode, def.nama, s.suffix, s.nama, s.ch, s.remark, wk, wk >= 3 ? 'WEEKLY' : wk === 2 ? 'BIWEEKLY' : wk === 1 ? 'MONTHLY' : 'BELUM ORDER', skus.join(','), lastWd[per], 1, per + '-28 08:00']);
      });
      bulanTren.forEach((per, mi) => {
        const bulanKe = mi < 3 ? mi : mi - 3 + 3;   // 2025-10..12 = 0..2, 2026-01.. = 3..12
        if (s.hist === 'baru' && per < '2026-04') return;
        if (s.hist === 'lubang' && (per === '2025-11' || per === '2026-03' || per === '2026-06')) return;
        // Skala sama dengan lines bulan data (s.lines): bintang sudah jauh di atas Q4 2025, tertinggal belum mengejar.
        const lines = Math.max(0, Math.round(s.lines * (prof === 'bintang' ? 0.7 : prof === 'sedang' ? 0.88 : 1.15) * (1 + (bulanKe - 1) * 0.01) + rngH.int(-1, 1)));
        P.GS_TREND_ASRT.push([def.kode, s.suffix, per, lines]);
        if (per >= '2026-08') { const a = agg[per + s.ch] = agg[per + s.ch] || { per, ch: s.ch, n: 0, lines: 0, reg: 0 }; a.n += lines > 0 ? 1 : 0; a.lines += lines; }
      });
    });
    Object.keys(agg).sort().forEach(k => { const a = agg[k]; P.GS_BULANAN_ASRT.push([a.per, def.kode, def.nama, a.ch, a.n, a.lines, g.monitored.filter(s => s.ch === a.ch).length, lastWd[a.per], 1, a.per + '-28 08:00']); });
  });

  // ----- Harga, stok, penjualan -----
  const rngS = root.sub('stok');
  P.HARGA_PL = hargaRows(cat, rngS);
  const hargaOf = {}; P.HARGA_PL.slice(1).forEach(r => { hargaOf[r[0]] = { hNew: r[7], hOld: r[8], mulai: r[6] }; });
  P.SKU_FLAG = [['barcode', 'flag', 'plu', 'ket']];
  rngS.shuffle(cat.skus).slice(0, 10).forEach((s, i) => P.SKU_FLAG.push(['8990000' + s.code, i < 5 ? 'SAT' : 'IDM', String(100000 + i * 13), i < 5 ? 'Listing SAT dummy' : 'Listing IDM dummy']));
  const flagged = {}; P.SKU_FLAG.slice(1).forEach(r => { flagged[r[0].slice(7)] = r[1]; });
  P.JUAL_SKU = [['dt_kode', 'sku', 'bkt', 'mulai', 'v']];
  P.STOK_GUDANG = [['dt_kode', 'tanggal', 'sku', 'karton', 'lusin', 'pcs', 'isi', 'rpp']];
  DT_DEFS.forEach(def => {
    const r2 = rngS.sub('jual-' + def.kode);
    const sold = {};   // sku -> total GSV ribuan 3 bulan (semua bucket)
    cat.skus.forEach(s => {
      const base = r2.int(4000, 36000) * def.skala * (s.variant === 1 ? 1 : 0.6);
      const bkts = [['GT', 1]]; if (flagged[s.code] === 'SAT') bkts.push(['SAT', 0.35]); if (flagged[s.code] === 'IDM') bkts.push(['IDM', 0.3]);
      bkts.forEach(([b, f]) => {
        const v = [0, 1, 2].map(i => Math.round(base * f * (0.85 + i * 0.07 + r2.next() * 0.2)));
        P.JUAL_SKU.push([def.kode, s.code, b, '2026-08', v.join(',')]);
        sold[s.code] = (sold[s.code] || 0) + v.reduce((a, x) => a + x, 0);
      });
    });
    // Target week cover per parent: sebagian rendah, banyak sedang, beberapa tinggi, dua >= 100 minggu.
    const wcPool = [0.4, 0.9, 1.4, 1.8, 2.6, 3.4, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 14, 16, 18, 22, 28, 40, 55, 130, 210];
    const wcFor = {}; rngS.shuffle(cat.bps).forEach((bp, i) => { wcFor[bp.code] = wcPool[i % wcPool.length]; });
    cat.skus.forEach(s => {
      const h = hargaOf[s.code], price = ((h.mulai && h.mulai > TODAY) ? (h.hOld || h.hNew) : (h.hNew || h.hOld)) / 1.11;
      const rate = (sold[s.code] * 1000 / price) / (92 / 7) * s.isi;   // pcs per minggu
      const pcs = Math.max(0, Math.round(wcFor[s.bp] * rate)), karton = Math.floor(pcs / s.isi), rem = pcs - karton * s.isi;
      P.STOK_GUDANG.push([def.kode, '2026-11-16', s.code, karton, Math.floor(rem / 12), rem % 12, s.isi, 0]);
    });
  });

  // ----- Kehadiran -----
  const hariKerja = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17];
  const rngK = root.sub('hadir');
  const perilaku = { '101': { telat: [], geo0: [], absen: [] }, '102': { telat: [4, 10, 16], geo0: [], absen: [] }, '103': { telat: [6], geo0: [5, 12], absen: [13] },
    '201': { telat: [9], geo0: [], absen: [] }, '202': { telat: [2, 5, 11, 16], geo0: [], absen: [7, 14] }, '203': { telat: [3, 6, 9, 12, 17], geo0: [4, 10, 16], absen: [5, 11, 13, 14] } };
  P.KEHADIRAN = [['dt_kode', 'sales_id', 'tanggal', 'jam', 'geo', 'kunjungan']];
  P.SALES_MASTER = [['dt_kode', 'sales_id', 'nama']];
  DT_DEFS.forEach(def => def.sales.forEach(sm => {
    P.SALES_MASTER.push([def.kode, sm.kode, sm.nama]);
    const pr = perilaku[sm.kode];
    hariKerja.forEach(d => {
      if (pr.absen.includes(d)) return;
      const telat = pr.telat.includes(d);
      const jam = telat ? '09:' + pad(rngK.int(8, 48)) : '0' + rngK.int(7, 8) + ':' + pad(rngK.int(0, 55));
      P.KEHADIRAN.push([def.kode, sm.kode, '2026-11-' + pad(d), jam, pr.geo0.includes(d) ? 0 : 1, rngK.int(9, 20)]);
    });
  }));

  // ----- Dua salesman kembar (101 dan 201): skor total ranking identik, untuk menguji peringkat bersama (plan 022) -----
  // Tanpa memakai PRNG, jadi data lain tidak bergeser. FOP, Banded, dan Assortment sudah sama; di sini PS dan R2G disamakan:
  // PS 3 Full + 3 Lite + 2 Not dari 8 toko; R2G: SS, E2E, E2S tercapai penuh, Pasti Untung 2 dari 4, Pasti Laku 1 dari 2.
  const skuBp = {}; cat.skus.forEach(x => { skuBp[x.code] = x; });
  [['D01', '101'], ['D02', '201']].forEach(([dk, smk]) => {
    const def = DT_DEFS.find(d => d.kode === dk), g = gen[dk], T = dts[dk];
    const mine = g.monitored.filter(x => x.sm === smk && x.weeks.length && !x.dual);
    const all = new Set(g.monitored.filter(x => x.sm === smk).map(x => x.suffix));
    // PS
    const pat = [5, 5, 5, 4, 4, 4, 2, 2];
    P.GS_PS = P.GS_PS.filter(r => !(r[2] === dk && all.has(r[4])));
    mine.slice(0, pat.length).forEach((x, i) => {
      const okN = pat[i], flags = [0, 1, 2, 3, 4].map(j => (j < okN ? 1 : 0));
      P.GS_PS.push([DATA_UNTIL, BULAN, dk, def.nama, x.suffix, x.nama, KANAL[x.ch], okN === 5 ? 'PS FULL' : okN === 4 ? 'PS LITE' : 'NOT PERFECT', okN + '/5', ...flags.map(String), ...flags.map(f => (f ? 1 : 0.4))]);
    });
    // E2E dan E2S tercapai penuh
    T.NGDMS_ASRT.forEach(r => { if (String(r[2]) === smk) { r[7] = r[5]; r[8] = r[6]; } });
    // Target SS diturunkan supaya SS tercapai penuh
    T.TARGET.forEach((r, i) => { if (i && String(r[1]) === smk && r[0] === BULAN) for (let c = 2; c <= 5; c++) r[c] = Math.round(r[c] * 0.4 / 1e5) * 1e5; });
    // NORMS_SKU: baris salesman ini diganti dengan enam baris terkendali pada toko yang pernah membeli basepack itu
    const bought = {};
    g.dms.slice(1).forEach(r => { const k = r[4] + '|' + skuBp[r[7]].bp; bought[k] = (bought[k] || 0) + r[8]; });
    const bpOf = suffix => Object.keys(bought).filter(k => k.startsWith(suffix + '|') && bought[k] > 0).map(k => k.split('|')[1]).sort()[0];
    const buOfBp = code => cat.bps.find(b => b.code === code).bu;
    T.NORMS_SKU = T.NORMS_SKU.filter((r, i) => !i || !all.has(String(r[1]).replace(/^B/i, '')));
    [['Width', 1], ['NPD', 1], ['Width', 99999], ['NPD', 99999], ['Everbilled', 1], ['Redlines', 99999]].forEach(([tipe, soq], i) => {
      const x = mine[i], bp = bpOf(x.suffix);
      T.NORMS_SKU.push([tipe, x.suffix, bp, buOfBp(bp), soq]);
    });
  });

  // Varian uji jalur "Belum ada data" (plan 030): tanpa tab GS_TREND_ASRT (Assortment tanpaData semua DSR) dan DSR 202 (D02) tanpa toko di laporan PS.
  if (tanpaData) {
    delete P.GS_TREND_ASRT;
    const sm202 = new Set(gen.D02.monitored.filter(x => x.sm === '202').map(x => x.suffix));
    P.GS_PS = P.GS_PS.filter(r => !(r[2] === 'D02' && sm202.has(r[4])));
  }

  // ----- Menu Kategori (plan 034): tiga tab baru di Sheet pusat, dari PRNG turunan sendiri sehingga data lain tidak bergeser -----
  const kat = buildKategori({ seed, cat, cutoff: isoOf(sundayOnOrBefore(msOf(DATA_UNTIL))), dataUntil: DATA_UNTIL, dts: DT_DEFS.map(d => ({ kode: d.kode, stores: gen[d.kode].stores })) });
  P.GS_KAT_BULAN = kat.KAT_BULAN; P.GS_KAT_MINGGU = kat.KAT_MINGGU; P.GS_KAT_PRODUK = kat.KAT_PRODUK;

  const meta = { seed, kategori: kat.meta, catalog: { basepacks: cat.bps.length, skus: cat.skus.length, bandedSpm: cat.banded.SPM.length, bandedMinis: cat.banded.MINIS.length },
    dts: {}, salesmen: DT_DEFS.flatMap(d => d.sales.map(s => ({ kode: s.kode, nama: s.nama, dt: d.kode, profile: s.profile }))) };
  DT_DEFS.forEach(d => { meta.dts[d.kode] = { monitored: gen[d.kode].monitored.length, total: gen[d.kode].stores.length, salesmen: d.sales.length }; });
  return { pusat: P, dts, registry, meta };
}
