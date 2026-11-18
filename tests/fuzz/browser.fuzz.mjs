// Fuzz browser (plan 025): Chrome headless + CDP, tiap halaman dimuat dengan respons server rusak/dimutasi.
// Pakai: node tests/fuzz/browser.fuzz.mjs [--only halaman] [--seeds N] [--conc 4]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer, okResponse, CODES } from './fuzzserve.mjs';
import { makeRng } from '../dummy/prng.mjs';

export const PAGES = [
  { id: 'index', file: 'index.html', code: CODES.tmk, tabs: ['#tab-ring', '#tab-sim', '#tab-fruit'] },
  { id: 'index-pusat', file: 'index.html', code: CODES.pusat, tabs: ['#tab-ring', '#tab-sim', '#tab-fruit'] },
  { id: 'great-sales', file: 'great-sales.html', code: CODES.pusat, tabs: ['skor', 'fop', 'banded', 'toko', 'asrt', 'ps'].map(t => `[data-tab="${t}"]`) },
  { id: 'ranking', file: 'ranking.html', code: CODES.pusat, tabs: ['[data-mode="kpi"]', '[data-mode="total"]'] },
  { id: 'cek-stok', file: 'cek-stok.html', code: CODES.pusat, tabs: [] },
  { id: 'kehadiran', file: 'kehadiran.html', code: CODES.pusat, tabs: [] },
];

export const BAD_TEXT = /(^|[^\w])(NaN|undefined|Infinity)([^\w]|$)|\[object Object\]|(^|[^\w])null([^\w]|$)/;
export const PAYLOADS = ['<img src=x onerror="window.__pwn=1">', '"><script>window.__pwn=1</script>', "'; DROP TABLE x;--", '😀🏪 Toko', '‮abc‬ RTL', 'Z'.repeat(3000), 'a\u0000b\nc\td', '  spasi  ganda  ', '=HYPERLINK("http://x","y")'];

/** Mutasi JSON berbenih. mode: nulls | numstr | html | long | drop | empty | negnum | allnull */
export function mutJson(obj, rng, mode) {
  const P = { nulls: 0.12, allnull: 0.5, numstr: 0.4, html: 0.25, long: 0.1, drop: 0.08, empty: 0.25, negnum: 0.2 }[mode];
  const rec = v => {
    if (Array.isArray(v)) return mode === 'empty' && rng.next() < P ? [] : v.map(rec);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { if (mode === 'drop' && rng.next() < P) continue; o[k] = rec(v[k]); } return mode === 'empty' && rng.next() < P / 3 ? {} : o; }
    if (rng.next() >= P) return v;
    if (mode === 'nulls' || mode === 'allnull') return null;
    if (mode === 'numstr' && typeof v === 'number') return rng.pick([String(v), String(v).replace('.', ','), '1.234,5', 'abc', '', ' ']);
    if (mode === 'html' && typeof v === 'string') return rng.pick(PAYLOADS);
    if (mode === 'long' && typeof v === 'string') return 'Z'.repeat(3000);
    if (mode === 'negnum' && typeof v === 'number') return rng.pick([-v, 0, 1e12, -1, 0.5]);
    return v;
  };
  return rec(structuredClone(obj));
}

const BROKEN = {
  html404: () => ({ status: 404, ct: 'text/html', body: '<!doctype html><html><body>Halaman tidak ditemukan</body></html>' }),
  html500: () => ({ status: 500, ct: 'text/html', body: '<html><body>Error 500 <img src=x onerror="window.__pwn=1"></body></html>' }),
  html200: () => ({ status: 200, ct: 'text/html', body: '<html><body>Masuk dulu ke Google <script>window.__pwn=1</script></body></html>' }),
  empty: () => ({ body: '' }),
  trunc: q => ({ body: JSON.stringify(okResponse(q)).slice(0, 4000) }),
  no_data: () => ({ body: { error: 'no_data', message: 'Data belum diupload.' } }),
  bad_code: () => ({ body: { error: 'invalid_code' } }),
  missing_code: () => ({ body: { error: 'missing_code' } }),
  server_error: () => ({ body: { error: 'server_error', message: '<img src=x onerror="window.__pwn=1">' } }),
  server_error_nomsg: () => ({ body: { error: 'server_error' } }),
  unknown_dt: () => ({ body: { error: 'unknown_dt' } }),
  array: () => ({ body: [] }), obj: () => ({ body: {} }), json_null: () => ({ body: 'null' }), json_str: () => ({ body: '"abc"' }), json_num: () => ({ body: '5' }), json_true: () => ({ body: 'true' }),
  netfail: () => ({ drop: true }),
  flaky: (q, n, ) => n <= 3 ? { drop: true } : { body: okResponse(q) },
  e500: () => ({ status: 500, ct: 'application/json', body: '{"error":"x"}' }),
};
export const BROKEN_NAMES = Object.keys(BROKEN);
export const MUT_MODES = ['nulls', 'allnull', 'numstr', 'html', 'long', 'drop', 'empty', 'negnum'];

export function registerScenario(server, id, kind, seed = 1) {
  if (BROKEN[kind]) server.scenarios.set(id, BROKEN[kind]);
  else { const mode = kind.replace(/^mut-/, ''); const rng = makeRng(seed); server.scenarios.set(id, q => ({ body: mutJson(okResponse(q), rng.sub(q.toString()), mode) })); }
}

const sel = (p, expr) => p.eval(expr);
/** Teks yang tampil di tiap tab halaman (innerText hanya elemen terlihat), plus pemeriksaan injeksi. */
export async function inspect(page, def) {
  const texts = [await page.eval('document.body.innerText')];
  for (const s of def.tabs) {
    const ok = await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return false;e.click();return true})()`).catch(() => false);
    if (!ok) continue; await page.sleep(120);
    texts.push(await page.eval('document.body.innerText'));
  }
  const inj = await page.eval('({pwn: !!window.__pwn, img: document.querySelectorAll(\'img[src="x"]\').length, scr: [].filter.call(document.querySelectorAll("script"), function(s){return /__pwn/.test(s.textContent)}).length})');
  return { text: texts.join('\n'), inj };
}

export async function state(page) {
  return page.eval(`(function(){var v=function(id){var e=document.getElementById(id);return !!e&&!e.hidden&&e.getClientRects().length>0};
    var ba=document.getElementById('bootActions');
    return {app:v('appScreen'),login:v('loginScreen'),bootFail:!!ba&&!ba.hidden&&ba.getClientRects().length>0,hasCode:document.documentElement.classList.contains('has-code'),
      err:(document.getElementById('loginErr')||{}).textContent||'',btn:(document.getElementById('loginBtn')||{}).textContent||'',btnDis:!!(document.getElementById('loginBtn')||{}).disabled,
      boot:(document.getElementById('bootMsg')||{}).textContent||''}})()`);
}

/** Muat halaman dengan kode tersimpan, tunggu stabil, kembalikan temuan. */
export async function runLoad(browser, server, def, kind, seed, extra = '') {
  const id = `${def.id}|${kind}|${seed}|${extra}|${Math.random().toString(36).slice(2, 6)}`;
  registerScenario(server, id, kind, seed);
  const page = await browser.newPage();
  const found = [];
  try {
    const ls = { mh_code: def.code };
    await page.goto(`${server.base}/${def.file}?sc=${encodeURIComponent(id)}&fast=1&ls=${encodeURIComponent(JSON.stringify(ls))}${extra}`);
    await page.waitFor(`(function(){var a=document.getElementById('appScreen'),l=document.getElementById('loginScreen'),b=document.getElementById('bootActions');return (a&&!a.hidden)||(l&&!l.hidden&&!document.documentElement.classList.contains('has-code'))||(b&&!b.hidden)})()`, 7000);
    await page.sleep(400);
    const st = await state(page);
    if (!st.app && !st.login && !st.bootFail) found.push({ rule: 'macet: tidak ada layar app/login/gagal', detail: JSON.stringify(st).slice(0, 160) });
    if (st.app) {
      const { text, inj } = await inspect(page, def);
      const m = BAD_TEXT.exec(text); if (m) { const i = text.indexOf(m[0]); found.push({ rule: 'teks buruk "' + m[0].trim() + '"', detail: text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ') }); }
      if (inj.pwn || inj.img || inj.scr) found.push({ rule: 'injeksi HTML', detail: JSON.stringify(inj) });
    } else {
      const inj = await page.eval('({pwn: !!window.__pwn, img: document.querySelectorAll(\'img[src="x"]\').length})');
      if (inj.pwn || inj.img) found.push({ rule: 'injeksi HTML (layar galat)', detail: JSON.stringify(inj) });
      const t = await page.eval('document.body.innerText'); const m = BAD_TEXT.exec(t);
      if (m) found.push({ rule: 'teks buruk di layar galat "' + m[0].trim() + '"', detail: t.slice(Math.max(0, t.indexOf(m[0]) - 40), t.indexOf(m[0]) + 40).replace(/\s+/g, ' ') });
    }
    page.errors.forEach(e => found.push({ rule: 'galat konsol/tak tertangani', detail: e.slice(0, 200) }));
    return { id, def: def.id, kind, seed, found, st };
  } finally { await page.close(); }
}

async function pool(items, conc, fn) { let i = 0; const out = []; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { const it = items[i++]; try { out.push(await fn(it)); } catch (e) { out.push({ id: String(it), found: [{ rule: 'harness', detail: String(e.message) }] }); } } })); return out; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasChrome) { console.log('Chrome tidak ada'); process.exit(0); }
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const only = opt('--only', ''), seeds = +opt('--seeds', 3), conc = +opt('--conc', 4);
  const server = await startFuzzServer(8841), browser = await launch();
  const jobs = [];
  for (const def of PAGES) { if (only && def.id !== only) continue;
    for (const k of BROKEN_NAMES) jobs.push([def, k, 1]);
    for (const m of MUT_MODES) for (let s = 1; s <= seeds; s++) jobs.push([def, 'mut-' + m, s]); }
  const res = await pool(jobs, conc, ([d, k, s]) => runLoad(browser, server, d, k, s));
  await browser.close(); server.close();
  const groups = new Map();
  res.forEach(r => r.found.forEach(f => { const key = r.def + ' :: ' + f.rule + ' :: ' + f.detail.slice(0, 90); if (!groups.has(key)) groups.set(key, { n: 0, ex: r }); groups.get(key).n++; }));
  console.log(`pemuatan=${res.length} temuan unik=${groups.size}`);
  [...groups].forEach(([k, v]) => console.log(`[${v.n}x] ${k}\n     contoh: kind=${v.ex.kind} seed=${v.ex.seed}`));
  process.exit(groups.size ? 1 : 0);
}
