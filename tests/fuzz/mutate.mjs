// Pemutasi berbenih untuk dataset dummy (plan 025). mutateDataset(ds, rng, n) -> { ds, log } dengan ds salinan dalam.
// Setiap mutasi dicatat di log (string) supaya pelanggaran invarian bisa direproduksi: seed + indeks iterasi.
import { makeRng } from '../dummy/prng.mjs';

const LONG = 'X'.repeat(5000);
export const BAD_NUM_TEXT = ['1.234,5', '1,234.5', '1e3', '-5', 'abc', '  7 ', '0', '', ' ', '1.5', '١٢٣', '5%', '$10', '--1', '1 000'];
// Sheet tidak pernah menyerahkan Infinity ke Apps Script: sel galat rumus datang sebagai teks '#DIV/0!' dst.
export const BAD_NUMS = [0, -1, -5, 999999999999, 0.5, 1e21, '#NUM!', '#DIV/0!', '#N/A', '#REF!', '#VALUE!', 2.5, 1e-9];
export const BAD_DATES = [new Date('2026-11-17T00:00:00Z'), '2026-11-17', '17/11/2026', '17-Nov-26', 46000, '', null, new Date('1900-01-01T00:00:00Z'), new Date('2999-12-31T00:00:00Z'),
  '2026-12-31', '2027-01-01', '2028-02-29', '2026-02-30', '2026-13-01', 'kemarin', 0, '0000-00-00', '2026-11-17T23:59:59'];
export const BAD_TEXT = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'; DROP TABLE x;--", '=HYPERLINK("http://x","y")', '@SUM(1)', '😀🏪', '‮abc‬', LONG,
  'a\u0000b', 'a\nb\tc', '  Dua  Spasi  ', 'TOKO huruf BESAR', '{{x}}', '${1+1}', '\\', 'null', 'true'];
// Kunci prototipe ('constructor', '__proto__') sengaja tidak ada di sini: mencatat temuan T-07 di docs/temuan-bug.md. Aktifkan lewat FUZZ_PROTO=1.
if (process.env.FUZZ_PROTO) BAD_TEXT.push('constructor', '__proto__', 'toString');
// undefined tidak ada: getValues() selalu mengembalikan sel (kosong = '').
const ANY = () => [...BAD_NUM_TEXT, ...BAD_NUMS, ...BAD_TEXT, null, true, false];

const clone = o => structuredClone(o);
const tabsOf = ds => [['pusat', ds.pusat], ...Object.entries(ds.dts).map(([k, v]) => ['dts.' + k, v])];

function pickTab(ds, rng, pred) {
  const all = tabsOf(ds).flatMap(([scope, tabs]) => Object.keys(tabs).map(name => ({ scope, name, tabs })))
    .filter(t => t.tabs[t.name] && t.tabs[t.name].length && t.name !== 'DAFTAR_DT' && (!pred || pred(t)));
  // separuh pilihan diarahkan ke tab yang menentukan KPI supaya mutasi tidak habis di tab tambahan
  const hot = all.filter(t => /DMS_EXTRACT|GS_|DSR|OUTLET_MASTER|MASTER_PRODUK|NGDMS|^KPI$/.test(t.name));
  return all.length ? rng.pick(hot.length && rng.chance(0.6) ? hot : all) : null;
}
const rowCount = t => t.tabs[t.name].length - 1;

function syncRegistry(ds) {
  const rows = (ds.pusat.DAFTAR_DT || []).slice(1);
  ds.registry = rows.map(r => ({ kode_akses: String(r[0] ?? ''), peran: String(r[1] ?? '').toLowerCase(), dt_kode: String(r[2] ?? ''), nama_dt: r[3], sheet_id: String(r[4] ?? ''), aktif: true }));
}

// Mutasi tingkat sel / kolom.
const CELL = [
  ['sel-acak', (ds, rng, t) => {
    if (rowCount(t) < 1) return null;
    const a = t.tabs[t.name], r = rng.int(1, a.length - 1), c = rng.int(0, a[0].length - 1), v = rng.pick(ANY());
    a[r][c] = v; return `${t.scope}/${t.name}[${r}][${a[0][c]}]=${fmt(v)}`;
  }],
  ['kolom-penuh', (ds, rng, t) => {
    const a = t.tabs[t.name]; if (a.length < 2) return null; const c = rng.int(0, a[0].length - 1), v = rng.pick(ANY());
    for (let r = 1; r < a.length; r++) a[r][c] = v; return `${t.scope}/${t.name}.${a[0][c]}=semua ${fmt(v)}`;
  }],
  ['kolom-sebagian', (ds, rng, t) => {
    const a = t.tabs[t.name]; if (a.length < 2) return null; const c = rng.int(0, a[0].length - 1), v = rng.pick(ANY()), p = rng.pick([0.1, 0.3, 0.5]);
    for (let r = 1; r < a.length; r++) if (rng.next() < p) a[r][c] = v; return `${t.scope}/${t.name}.${a[0][c]}=${p * 100}% ${fmt(v)}`;
  }],
  ['tanggal', (ds, rng, t) => {
    const a = t.tabs[t.name], cols = a[0].map((h, i) => [String(h), i]).filter(([h]) => /tanggal|invdate|periode|date|jam/i.test(h));
    if (!cols.length || a.length < 2) return null; const [h, c] = rng.pick(cols), v = rng.pick(BAD_DATES), r = rng.int(1, a.length - 1);
    if (rng.chance(0.5)) { for (let i = 1; i < a.length; i++) if (rng.chance(0.3)) a[i][c] = v; } else a[r][c] = v;
    return `${t.scope}/${t.name}.${h}~tanggal ${fmt(v)}`;
  }],
  ['teks-nama', (ds, rng, t) => {
    const a = t.tabs[t.name], cols = a[0].map((h, i) => [String(h), i]).filter(([h]) => /nama|name|outlet|salesman|sku|label|kode/i.test(h));
    if (!cols.length || a.length < 2) return null; const [h, c] = rng.pick(cols), v = rng.pick(BAD_TEXT), r = rng.int(1, a.length - 1);
    a[r][c] = v; return `${t.scope}/${t.name}[${r}].${h}=${fmt(v)}`;
  }],
];

// Mutasi struktur.
const STRUCT = [
  ['tab-hilang', (ds, rng, t) => { delete t.tabs[t.name]; return `hapus tab ${t.scope}/${t.name}`; }],
  ['tab-kosong', (ds, rng, t) => { t.tabs[t.name] = []; return `kosongkan tab ${t.scope}/${t.name}`; }],
  ['tab-hanya-header', (ds, rng, t) => { t.tabs[t.name] = [t.tabs[t.name][0]]; return `hanya header ${t.scope}/${t.name}`; }],
  ['header-hilang', (ds, rng, t) => { const a = t.tabs[t.name]; const c = rng.int(0, a[0].length - 1); const h = a[0][c]; a.forEach(r => r.splice(c, 1)); return `hapus kolom ${t.scope}/${t.name}.${h}`; }],
  ['header-ganti-nama', (ds, rng, t) => { const a = t.tabs[t.name]; const c = rng.int(0, a[0].length - 1); const h = a[0][c]; a[0][c] = rng.pick(['  ' + h + ' ', String(h).toUpperCase(), 'x_' + h, '', null]); return `ganti nama header ${t.scope}/${t.name}.${h}`; }],
  ['kolom-tukar', (ds, rng, t) => { const a = t.tabs[t.name]; if (a[0].length < 2) return null; const i = rng.int(0, a[0].length - 2); a.forEach(r => { [r[i], r[i + 1]] = [r[i + 1], r[i]]; }); return `tukar kolom ${i},${i + 1} ${t.scope}/${t.name}`; }],
  ['kolom-ekstra', (ds, rng, t) => { const a = t.tabs[t.name]; const at = rng.int(0, a[0].length); a.forEach((r, i) => r.splice(at, 0, i ? 'ekstra' : 'kolom_ekstra')); return `kolom ekstra di ${at} ${t.scope}/${t.name}`; }],
  ['baris-dobel', (ds, rng, t) => { const a = t.tabs[t.name]; if (a.length < 2) return null; const r = rng.int(1, a.length - 1); a.splice(r, 0, a[r].slice()); return `baris dobel ${t.scope}/${t.name}[${r}]`; }],
  ['baris-kosong', (ds, rng, t) => { const a = t.tabs[t.name]; const r = rng.int(1, a.length); a.splice(r, 0, a[0].map(() => '')); return `baris kosong di ${r} ${t.scope}/${t.name}`; }],
  ['baris-hapus', (ds, rng, t) => { const a = t.tabs[t.name]; if (a.length < 2) return null; const n = rng.int(1, Math.min(10, a.length - 1)); a.splice(rng.int(1, a.length - n), n); return `hapus ${n} baris ${t.scope}/${t.name}`; }],
  ['baris-pendek', (ds, rng, t) => { const a = t.tabs[t.name]; if (a.length < 2) return null; const r = rng.int(1, a.length - 1); { const k = rng.int(0, a[r].length); a[r] = a[r].map((v, i) => i < k ? v : ''); } return `baris terpotong (sel kanan kosong, getValues selalu persegi) ${t.scope}/${t.name}[${r}]`; }],
];

// Mutasi registri dan hubungan antar-data. Dibuat eksplisit karena butuh pengetahuan dummy.
const REL = [
  ['dt-galat', (ds) => { ds.__broken = ds.__broken || []; ds.__broken.push('D02'); return 'Sheet DT D02 tidak bisa dibuka'; }],
  ['dt-tanpa-sheet-id', (ds) => { ds.pusat.DAFTAR_DT[2][4] = ''; syncRegistry(ds); return 'DT D01 tanpa sheet_id'; }],
  ['kode-akses-dobel', (ds) => { ds.pusat.DAFTAR_DT[3][0] = ds.pusat.DAFTAR_DT[2][0]; syncRegistry(ds); return 'kode akses dobel D01/D02'; }],
  ['kode-akses-kosong', (ds) => { ds.pusat.DAFTAR_DT[3][0] = ''; syncRegistry(ds); return 'kode akses D02 kosong'; }],
  ['aktif-bukan-boolean', (ds, rng) => { const v = rng.pick(['no', 0, 'false', 'FALSE', false, '', null, 'ya', 2]); ds.pusat.DAFTAR_DT[rng.int(2, 3)][5] = v; return 'aktif=' + fmt(v); }],
  ['config', (ds, rng) => {
    const keys = ['rank_min_toko', 'asrt_growth', 'rank_w_ps', 'rank_w_fop', 'rank_w_asrt', 'rank_w_banded', 'rank_w_r2g', 'banded_spm', 'banded_minis', 'fop_weekly', 'fop_biweekly'];
    const k = rng.pick(keys), v = rng.pick([0, -1, 'abc', '', null, '1,5', 1e9, '#N/A', -0.5, '0', ' 3 ', 100]);
    const a = ds.pusat.GS_CONFIG, row = a.find(r => r[0] === k); if (row) row[1] = v; else a.push([k, v, '']);
    return `GS_CONFIG ${k}=${fmt(v)}`;
  }],
  ['target-nol', (ds, rng) => {
    const a = ds.pusat.GS_SCORECARD, idx = a.slice(1).map((r, i) => i + 1); const n = rng.int(1, 6), v = rng.pick([0, '', null, -3, 'x']);
    for (let i = 0; i < n; i++) a[rng.pick(idx)][3] = v; return `GS_SCORECARD target=${fmt(v)} pada ${n} baris`;
  }],
  ['target-tab-nol', (ds, rng) => {
    const tab = rng.pick(['GS_TARGET', 'GS_ASRT_TARGET']), a = ds.pusat[tab], v = rng.pick([0, '', null, -2]);
    for (let r = 1; r < a.length; r++) for (let c = 1; c < a[0].length; c++) if (typeof a[r][c] === 'number') a[r][c] = v; return `${tab} semua angka=${fmt(v)}`;
  }],
  ['asrt-baseline-nol', (ds, rng) => { const a = ds.pusat.GS_TREND_ASRT; const v = rng.pick([0, '', null]); a.forEach((r, i) => { if (i && r[2] >= '2025-10' && r[2] <= '2025-12') r[3] = v; }); return 'baseline Assortment Q4 2025 = ' + fmt(v); }],
  ['asrt-bulan-lubang', (ds, rng) => { const a = ds.pusat.GS_TREND_ASRT; const p = rng.pick(['2025-10', '2025-11', '2025-12', '2026-05']); ds.pusat.GS_TREND_ASRT = a.filter((r, i) => !i || r[2] !== p); return 'hapus periode ' + p + ' dari GS_TREND_ASRT'; }],
  ['toko-tanpa-salesman', (ds, rng) => {
    const d = ds.dts[rng.pick(Object.keys(ds.dts))], a = d.DMS_EXTRACT; if (!a || a.length < 2) return null; const c = a[0].indexOf('Salesman'); if (c < 0) return null;
    const p = rng.pick([0.1, 0.5, 1]); for (let r = 1; r < a.length; r++) if (rng.next() < p) a[r][c] = rng.pick(['', null, ' ']); return 'DMS Salesman kosong ' + p * 100 + '%';
  }],
  ['salesman-kembar', (ds, rng) => {
    const d = ds.dts[rng.pick(Object.keys(ds.dts))], a = d.DMS_EXTRACT; if (!a || a.length < 2) return null; const c = a[0].indexOf('Salesman');
    const v = rng.pick(['101', '201', 'Salesman Baru', 101]); for (let r = 1; r < a.length; r++) if (rng.next() < 0.3) a[r][c] = v; return 'DMS salesman acak -> ' + fmt(v);
  }],
  ['dms-kosong', (ds, rng) => { const k = rng.pick(Object.keys(ds.dts)); ds.dts[k].DMS_EXTRACT = [ds.dts[k].DMS_EXTRACT[0]]; return 'DMS kosong ' + k; }],
  ['sku-tanpa-pemetaan', (ds, rng) => { const k = rng.pick(Object.keys(ds.dts)); const a = ds.dts[k].NORMS_SKU || ds.dts[k].MASTER_PRODUK; const n = Math.floor(a.length / 2); a.splice(1, n); return 'hapus separuh pemetaan produk ' + k; }],
  ['toko-duplikat-kode', (ds, rng) => { const a = ds.pusat.GS_TOKO; if (a.length < 3) return null; const r = rng.int(2, a.length - 1); a[r][1] = a[1][1]; a[r][0] = a[1][0]; return 'GS_TOKO outlet_kode dobel di baris ' + r; }],
];

function fmt(v) { if (typeof v === 'string') return JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…(' + v.length + ')' : v); if (v instanceof Date) return 'Date(' + (isNaN(v) ? 'NaN' : v.toISOString().slice(0, 10)) + ')'; return String(v); }

export const MUTATION_NAMES = [...CELL, ...STRUCT, ...REL].map(m => m[0]);

/** Terapkan 1..maxN mutasi acak. force = nama mutasi tertentu (untuk reproduksi). */
export function mutateDataset(base, rng, { maxN = 3, force } = {}) {
  const ds = clone(base), log = [];
  const n = rng.int(1, maxN);
  for (let i = 0; i < n; i++) {
    const group = force && i === 0 ? null : rng.pick([CELL, CELL, CELL, STRUCT, STRUCT, REL, REL]);
    const all = [...CELL, ...STRUCT, ...REL];
    const m = force && i === 0 ? all.find(x => x[0] === force) : rng.pick(group);
    if (!m) throw new Error('mutasi tidak dikenal: ' + force);
    const isRel = REL.includes(m);
    const t = isRel ? null : pickTab(ds, rng);
    if (!isRel && !t) continue;
    let d = null;
    try { d = m[1](ds, rng, t); } catch (e) { d = 'GAGAL-TERAPKAN ' + m[0] + ': ' + e.message; }
    if (d) log.push(m[0] + ': ' + d);
  }
  return { ds, log };
}
