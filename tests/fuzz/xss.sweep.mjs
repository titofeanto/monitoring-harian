// Sapuan injeksi HTML (plan 025): untuk setiap jalur string unik di respons dummy, isi SEMUA simpul jalur itu dengan
// payload HTML, muat halaman, buka semua tab dan lembar detail, lalu periksa apakah payload dieksekusi/dirender sebagai HTML.
// Pakai: node tests/fuzz/xss.sweep.mjs [--only halaman] [--conc 5]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer, okResponse } from './fuzzserve.mjs';
import { PAGES } from './browser.fuzz.mjs';

export const XSS = '<img src=x onerror="window.__pwn=1"><b id="__fzb">x</b>';
const OPEN = ['[data-store]', '.rk.tap', '[data-sel]', '[data-i]', '[data-dt]', '.chip', 'summary', '.kpi-toggle', '[data-ch]'];

function viewOf(def) { return { 'great-sales': 'gs', ranking: 'rank', 'cek-stok': 'stok', kehadiran: 'hadir' }[def.id] || ''; }
function requestFor(def, dt = '') { const q = new URLSearchParams({ code: def.code }); if (viewOf(def)) q.set('view', viewOf(def)); if (dt) q.set('dt', dt); return q; }

const tuple = v => Array.isArray(v) && v.length <= 40 && v.length > 0 && v.every(x => x === null || typeof x !== 'object');   // baris tabel [kode, nama, ...]: tiap kolom jalurnya sendiri
const sub = (v, i, p) => p + (tuple(v) ? '[' + i + ']' : '[]');
/** Jalur string unik (indeks larik dinormalkan jadi []; kolom baris tabel pakai indeks kolom). */
export function stringPaths(obj) {
  const out = new Map();
  (function rec(v, p) { if (typeof v === 'string') { if (!out.has(p)) out.set(p, v); } else if (Array.isArray(v)) v.forEach((x, i) => rec(x, sub(v, i, p))); else if (v && typeof v === 'object') Object.keys(v).forEach(k => rec(v[k], p + '.' + k)); })(obj, '$');
  return out;
}
export function inject(obj, target) {
  const rec = (v, p) => typeof v === 'string' ? (p === target ? XSS : v) : Array.isArray(v) ? v.map((x, i) => rec(x, sub(v, i, p))) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map(k => [k, rec(v[k], p + '.' + k)])) : v;
  return rec(obj, '$');
}

export async function sweepOne(browser, server, def, target) {
  const id = `xss|${def.id}|${target}|${Math.random().toString(36).slice(2, 6)}`;
  server.scenarios.set(id, q => ({ body: inject(okResponse(q), target) }));
  const page = await browser.newPage();
  try {
    await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(id)}&fast=1&ls=${encodeURIComponent(JSON.stringify({ mh_code: def.code }))}`);
    await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", 6000);
    await page.sleep(250);
    const check = () => page.eval('({pwn: !!window.__pwn, b: !!document.getElementById("__fzb"), img: document.querySelectorAll(\'img[src="x"]\').length})');
    let r = await check();
    const hit = r => r.pwn || r.b || r.img;
    for (const t of def.tabs) { if (hit(r)) break; await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(t)});if(e)e.click()})()`).catch(() => {}); await page.sleep(100); r = await check(); }
    for (const s of OPEN) { if (hit(r)) break; await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(e)e.click()})()`).catch(() => {}); await page.sleep(100); r = await check(); }
    return { def: def.id, target, hit: hit(r) ? r : null, errors: page.errors.length };
  } finally { await page.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasChrome) { console.log('Chrome tidak ada'); process.exit(0); }
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const only = opt('--only', ''), conc = +opt('--conc', 5);
  const server = await startFuzzServer(8842), browser = await launch();
  const jobs = [];
  for (const def of PAGES) { if (only && def.id !== only) continue; if (def.id === 'index-pusat') continue;
    const paths = stringPaths(okResponse(requestFor(def)));
    if (def.id === 'index') { /* DT tunggal: jalur dari data mentah */ }
    for (const p of paths.keys()) jobs.push([def, p]); }
  let i = 0; const results = [];
  await Promise.all(Array.from({ length: conc }, async () => { while (i < jobs.length) { const [d, p] = jobs[i++]; try { results.push(await sweepOne(browser, server, d, p)); } catch (e) { results.push({ def: d.id, target: p, harness: e.message }); } } }));
  await browser.close(); server.close();
  const hits = results.filter(r => r.hit);
  console.log(`jalur diuji=${results.length} sink HTML=${hits.length}`);
  hits.sort((x, y) => (x.def + x.target).localeCompare(y.def + y.target)).forEach(h => console.log(h.def, h.target, JSON.stringify(h.hit)));
  results.filter(r => r.harness).slice(0, 5).forEach(h => console.log('HARNESS', h.def, h.target, h.harness));
  process.exit(hits.length ? 1 : 0);
}
