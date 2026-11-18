// Fuzz server (plan 025): mutasi dataset dummy lalu panggil semua respons doGet dan periksa invarian.
// Pakai: FUZZ_N=1000 FUZZ_SEED=1 node tests/fuzz/server.fuzz.mjs   (keluar 1 bila ada pelanggaran)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadGs } from '../helpers/load-gs.mjs';
import { buildDummy, ACCESS } from '../dummy/dataset.mjs';
import { makeSpreadsheetApp } from '../dummy/fakeSpreadsheet.mjs';
import { makeRng } from '../dummy/prng.mjs';
import { mutateDataset } from './mutate.mjs';

const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } static [Symbol.hasInstance](x) { return Object.prototype.toString.call(x) === '[object Date]'; } }   // Date dari sel mutasi berasal dari realm lain (vm): instanceof harus tetap benar

export const BAD_STR = /^(NaN|undefined|Infinity|-Infinity|\[object Object\])$|\b(NaN|undefined|Infinity)\b|\[object Object\]|GMT[+-]\d{4}/;   // GMT+0900: String(Date) bocor
export const FORBIDDEN_RANK_KEYS = ['outlet', 'sku', 'omzet', 'kode_akses', 'toko_kode'];

/** Telusuri objek sebelum JSON.stringify. Mengembalikan daftar { path, why }. */
export function walk(obj, opts = {}) {
  const out = [], seen = new Set();
  (function rec(v, p) {
    if (out.length > 20) return;
    if (typeof v === 'number') { if (!isFinite(v)) out.push({ path: p, why: 'angka tidak terbatas: ' + v }); return; }
    if (typeof v === 'string') { if (!opts.skipStrings && BAD_STR.test(v) && !(opts.allow || []).some(a => v.includes(a))) out.push({ path: p, why: 'string "' + v.slice(0, 60) + '"' }); return; }
    if (v === undefined) { if (p.endsWith(']')) out.push({ path: p, why: 'undefined di larik' }); return; }   // properti undefined hilang di JSON.stringify: aman
    if (v && typeof v === 'object') {
      if (seen.has(v)) { out.push({ path: p, why: 'siklus' }); return; }
      seen.add(v);
      if (Array.isArray(v)) v.forEach((x, i) => rec(x, p + '[' + i + ']'));
      else Object.keys(v).forEach(k => {
        if (opts.rank && FORBIDDEN_RANK_KEYS.includes(k)) out.push({ path: p + '.' + k, why: 'kunci terlarang' });
        rec(v[k], p + '.' + k);
      });
      seen.delete(v);
    }
  })(obj, '$');
  return out;
}

function makeServer(ds) {
  const app = makeSpreadsheetApp(ds);
  const open = app.openById;
  app.openById = id => {
    const bad = (ds.__broken || []).map(k => ds.registry.find(r => r.dt_kode === k)).filter(Boolean).map(r => r.sheet_id);
    if (bad.includes(id)) throw new Error('Sheet tidak bisa dibuka: ' + id);
    return open(id);
  };
  const trace = [];
  const J = { stringify: (o, ...a) => { const s = JSON.stringify(o, ...a); trace.push({ o, s }); return s; }, parse: JSON.parse };
  const ctx = loadGs({ SpreadsheetApp: app, globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FixedDate, JSON: J } });
  return { ctx, trace };
}

const CALLS = [
  ['gs-pusat', { view: 'gs', code: ACCESS.pusat }, {}],
  ['gs-pusat-dt1', { view: 'gs', code: ACCESS.pusat, dt: 'D01' }, {}],
  ['gs-pusat-dt2', { view: 'gs', code: ACCESS.pusat, dt: 'D02' }, {}],
  ['gs-dt', { view: 'gs', code: ACCESS.tmk }, {}],
  ['gs-dt2', { view: 'gs', code: ACCESS.srg }, {}],
  ['rank', { view: 'rank', code: ACCESS.pusat }, { rank: true }],
  ['rank-dt', { view: 'rank', code: ACCESS.tmk }, { rank: true }],
  ['stok', { view: 'stok', code: ACCESS.pusat }, {}],
  ['stok-dt', { view: 'stok', code: ACCESS.srg }, {}],
  ['hadir', { view: 'hadir', code: ACCESS.pusat }, {}],
  ['hadir-dt', { view: 'hadir', code: ACCESS.tmk }, {}],
  ['cek', { code: ACCESS.pusat, dt: 'D01', cek: '1' }, { skipStrings: true }],
  ['raw-dt', { code: ACCESS.tmk }, { skipStrings: true, raw: true }],
  ['raw-pusat-list', { code: ACCESS.pusat }, {}],
  ['status', { view: 'status' }, {}],
];
// parameter aneh untuk doGet
const WEIRD = [
  ['kode-kosong', { view: 'gs', code: '' }], ['kode-spasi', { view: 'gs', code: '   ' }], ['kode-10000', { view: 'gs', code: 'a'.repeat(10000) }],
  ['kode-kontrol', { view: 'gs', code: 'a\u0000b\n\t' }], ['kode-array', { view: 'gs', code: ['a', 'b'] }], ['kode-array-benar', { view: 'rank', code: [ACCESS.pusat, 'x'] }],
  ['kode-objek', { view: 'gs', code: { a: 1 } }], ['kode-angka', { view: 'gs', code: 123 }], ['kode-proto', { view: 'gs', code: '__proto__' }], ['kode-constructor', { view: 'gs', code: 'constructor' }],
  ['dt-injeksi', { view: 'gs', code: ACCESS.pusat, dt: "D01'; DROP" }], ['dt-array', { view: 'gs', code: ACCESS.pusat, dt: ['D01', 'D02'] }], ['dt-proto', { view: 'gs', code: ACCESS.pusat, dt: '__proto__' }],
  ['dt-dt-lain', { view: 'gs', code: ACCESS.tmk, dt: 'D02' }], ['dt-panjang', { view: 'stok', code: ACCESS.pusat, dt: 'D'.repeat(10000) }],
  ['view-aneh', { view: 'xyz', code: ACCESS.tmk }], ['view-array', { view: ['gs', 'rank'], code: ACCESS.pusat }], ['view-proto', { view: '__proto__', code: ACCESS.pusat }],
  ['admin-salah', { admin: 'x', code: ACCESS.pusat }], ['admin-clearCache-bad', { admin: 'clearCache', code: 'salah' }], ['admin-clearCache-dt', { admin: 'clearCache', code: ACCESS.tmk }],
  ['admin-snapshot-dt', { admin: 'snapshot', code: ACCESS.tmk }], ['admin-snapshot-array', { admin: ['snapshot'], code: ACCESS.pusat }],
  ['tanpa-parameter', undefined], ['parameter-null', null], ['view-status-kode', { view: 'status', code: 'x' }],
];
const PRIVATE_ADMIN_ERR = new Set(['invalid_code', 'missing_code']);

function runCall(srv, name, param, opts, ds, violations, tag) {
  const { ctx, trace } = srv;
  trace.length = 0;
  let res;
  const t0 = Date.now();
  try { res = ctx.doGet({ parameter: param }); } catch (e) { violations.push({ tag, call: name, rule: 'doGet melempar', detail: String(e && e.stack || e).slice(0, 300) }); return null; }
  const ms = Date.now() - t0;
  if (ms > 3000) violations.push({ tag, call: name, rule: 'lambat', detail: ms + ' ms' });
  let txt; try { txt = res.getContent(); } catch (e) { violations.push({ tag, call: name, rule: 'getContent melempar', detail: String(e) }); return null; }
  let obj; try { obj = JSON.parse(txt); } catch (e) { violations.push({ tag, call: name, rule: 'bukan JSON', detail: String(txt).slice(0, 100) }); return null; }
  const final = trace.filter(t => t.s === txt).pop();
  const src = final ? final.o : obj;
  if (src && typeof src === 'object' && src.error) {
    if (src.error === 'server_error' && !String(src.message || '').trim()) violations.push({ tag, call: name, rule: 'server_error tanpa pesan', detail: txt.slice(0, 120) });
    return { obj, src, isError: true };
  }
  // dt-mentah: NaN dari sel yang memang diisi pengguna hanya lewat apa adanya; cek penelusuran penuh dilewati untuk string
  const w = walk(src, { skipStrings: !!opts.skipStrings, rank: !!opts.rank });
  w.slice(0, 5).forEach(v => violations.push({ tag, call: name, rule: v.why, detail: v.path }));
  return { obj, src, isError: false };
}

/** Kumpulkan jalur JSON (indeks larik dinormalkan jadi []) yang bernilai null, atau larik/objek kosong, pada respons server nyata (dataset dummy bermutasi).
 *  Dipakai fuzz browser agar mutasi "null" dan "kosong" hanya mengenai bidang yang memang bisa begitu dari server. Mengembalikan { nulls: {view: Set}, empties: {view: Set} }. */
export function collectNullPaths({ seed = 11, n = 40 } = {}) {
  const base = buildDummy({ seed: 2026 }), out = { gs: new Set(), rank: new Set(), stok: new Set(), hadir: new Set() }, emp = { gs: new Set(), rank: new Set(), stok: new Set(), hadir: new Set() };
  const views = [['gs', { view: 'gs', code: ACCESS.pusat }], ['rank', { view: 'rank', code: ACCESS.pusat }], ['stok', { view: 'stok', code: ACCESS.pusat }], ['hadir', { view: 'hadir', code: ACCESS.pusat }]];
  const rng = makeRng(seed);
  for (let i = -1; i < n; i++) {
    const ds = i < 0 ? structuredClone(base) : mutateDataset(base, rng.sub('np' + i), {}).ds;
    const srv = makeServer(ds);
    views.forEach(([v, param]) => {
      srv.trace.length = 0;
      const txt = srv.ctx.doGet({ parameter: param }).getContent();
      const f = srv.trace.filter(t => t.s === txt).pop(); if (!f || (f.o && f.o.error)) return;
      (function rec(x, p) { if (x === null) out[v].add(p); else if (Array.isArray(x)) { if (!x.length) emp[v].add(p); x.forEach(y => rec(y, p + '[]')); } else if (x && typeof x === 'object') { if (!Object.keys(x).length) emp[v].add(p); Object.keys(x).forEach(k => rec(x[k], p + '.' + k)); } })(f.o, '$');
    });
  }
  return { nulls: out, empties: emp };
}

export function runFuzz({ seed = 1, n = 300, log = () => {} } = {}) {
  const base = buildDummy({ seed: 2026 });
  const violations = [], stats = { iter: 0, calls: 0, errors: {}, mutations: {} };
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const { ds, log: mlog } = mutateDataset(base, rng.sub('it' + i), {});
    mlog.forEach(l => { const k = l.split(':')[0]; stats.mutations[k] = (stats.mutations[k] || 0) + 1; });
    const tag = `seed=${seed} iter=${i} [${mlog.join(' | ')}]`;
    const srv = makeServer(ds);
    stats.iter++;
    CALLS.forEach(([name, param, opts]) => {
      const r = runCall(srv, name, param, opts, ds, violations, tag); stats.calls++;
      if (r && r.isError) { const k = name + ':' + r.src.error + (r.src.message ? ' ' + String(r.src.message).slice(0, 70) : ''); stats.errors[k] = (stats.errors[k] || 0) + 1; }
    });
    // kode salah: hanya {error}
    ['salah', ' ', ACCESS.pusat.toUpperCase(), ACCESS.pusat + 'x'].forEach(c => {
      const r = runCall(srv, 'kode-salah:' + c, { view: 'gs', code: c }, {}, ds, violations, tag); stats.calls++;
      if (r && (!r.isError || Object.keys(r.obj).join() !== 'error')) violations.push({ tag, call: 'kode-salah', rule: 'kode salah tidak hanya {error}', detail: JSON.stringify(r.obj).slice(0, 100) });
    });
    // parameter aneh (bukan setiap iterasi: tiap parameter aneh punya mutasi sendiri)
    if (i % 5 === 0) WEIRD.forEach(([name, param]) => { runCall(srv, 'weird:' + name, param, { skipStrings: true }, ds, violations, tag); stats.calls++; });
  }
  return { violations, stats };
}

function dedupe(vs) { const m = new Map(); vs.forEach(v => { const k = v.rule.replace(/\d+/g, '#') + '|' + v.detail.replace(/\[\d+\]/g, '[]'); if (!m.has(k)) m.set(k, { ...v, count: 0 }); m.get(k).count++; }); return [...m.values()]; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const n = +process.env.FUZZ_N || 300, seed = +process.env.FUZZ_SEED || 1;
  const t = Date.now();
  const { violations, stats } = runFuzz({ seed, n });
  console.log(`iterasi=${stats.iter} panggilan=${stats.calls} detik=${((Date.now() - t) / 1000).toFixed(1)} pelanggaran=${violations.length}`);
  console.log('galat terstruktur:', JSON.stringify(stats.errors));
  if (process.env.FUZZ_MUT) console.log('mutasi:', JSON.stringify(stats.mutations));
  dedupe(violations).forEach(v => console.log(`\n[${v.count}x] ${v.call} :: ${v.rule} @ ${v.detail}\n   ${v.tag.slice(0, 400)}`));
  process.exit(violations.length ? 1 : 0);
}
