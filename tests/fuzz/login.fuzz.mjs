// Fuzz layar login dan tombol (plan 025): kode akses aneh, klik ganda, tombol segarkan, localStorage rusak/tidak ada, jaringan gagal.
// Pakai: node tests/fuzz/login.fuzz.mjs [--only halaman]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer, CODES } from './fuzzserve.mjs';
import { PAGES, state, BAD_TEXT } from './browser.fuzz.mjs';

const PAGES_LOGIN = PAGES.filter(p => p.id !== 'index-pusat');   // index diuji dengan kode DT dan pusat lewat daftar kode di bawah
export const CODE_CASES = [
  ['kosong', '', 'tolak'], ['spasi', '   ', 'tolak'], ['panjang10000', 'a'.repeat(10000), 'salah'], ['khusus', '<script>window.__pwn=1</script>"\';--', 'salah'],
  ['kontrol', 'a\u0000b\u0007c', 'salah'], ['emoji', '😀🏪', 'salah'], ['rtl', '‮abc', 'salah'], ['huruf-besar', CODES.pusat.toUpperCase(), 'salah'],
  ['spasi-ujung', '  ' + CODES.pusat + '  ', 'masuk'], ['tab-newline', CODES.pusat + '\n', 'masuk'], ['benar', CODES.pusat, 'masuk'],
];

async function fillSubmit(page, code) {
  await page.eval(`(function(){var i=document.getElementById('codeInput');i.value=${JSON.stringify(code)};i.dispatchEvent(new Event('input',{bubbles:true}));
    var f=document.getElementById('loginForm'); if(f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));})()`);
}
const reqCount = (server, sc) => server.log.filter(l => l.sc === sc).length;

export async function runLoginFuzz(browser, server, only = '') {
  const found = [];
  const add = (page, rule, detail) => found.push({ page, rule, detail: String(detail).slice(0, 220) });
  for (const def of PAGES_LOGIN) {
    if (only && def.id !== only) continue;
    const loginUrl = (sc, extra = '') => `${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1${extra}`;
    // 1. kode akses aneh, berurutan di satu halaman: layar login harus tetap hidup setelah tiap galat
    {
      const sc = `code|${def.id}`; const page = await browser.newPage();
      await page.goto(loginUrl(sc)); await page.waitFor("!document.getElementById('loginScreen').hidden", 4000);
      for (const [name, code, expect] of CODE_CASES) {
        const before = server.log.length;
        await fillSubmit(page, code);
        await page.sleep(expect === 'tolak' ? 250 : 900);
        if (expect !== 'tolak') await page.waitFor(`(function(){var a=document.getElementById('appScreen');var b=document.getElementById('loginBtn');return (a&&!a.hidden)||(b&&!b.disabled&&document.getElementById('loginErr').textContent)})()`, 6000);
        const st = await state(page), sent = server.log.slice(before).filter(l => l.sc === sc);
        const sentCodes = sent.map(l => new URLSearchParams(l.q).get('code'));
        if (expect === 'tolak' && sent.length) add(def.id, `kode ${name}: permintaan terkirim`, JSON.stringify(sentCodes));
        if (expect === 'masuk') { if (!st.app) add(def.id, `kode ${name}: tidak masuk`, JSON.stringify(st)); else if (sentCodes.some(c => c !== CODES.pusat && def.id !== 'index')) add(def.id, `kode ${name}: tidak di-trim`, JSON.stringify(sentCodes)); }
        if (expect === 'salah' && st.app) add(def.id, `kode ${name}: masuk padahal salah`, JSON.stringify(st));
        if (expect !== 'masuk' && !st.login) add(def.id, `kode ${name}: layar login hilang`, JSON.stringify(st));
        if (expect === 'salah' && (st.btnDis || /Memeriksa kode/.test(st.btn))) add(def.id, `kode ${name}: tombol Masuk macet`, JSON.stringify(st));
        if (expect === 'salah' && !st.err) add(def.id, `kode ${name}: tanpa pesan galat`, JSON.stringify(st));
        const inj = await page.eval('({pwn:!!window.__pwn})'); if (inj.pwn) add(def.id, `kode ${name}: eksekusi skrip`, '');
        if (expect === 'masuk') break;
      }
      page.errors.forEach(e => add(def.id, 'galat konsol saat uji kode', e));
      await page.close();
    }
    // 2. klik cepat 10x tombol Masuk: hanya satu permintaan
    {
      const sc = `dbl|${def.id}`; server.scenarios.set(sc, q => ({ delay: 600, body: okResponseSafe(q) }));
      const page = await browser.newPage(); await page.goto(loginUrl(sc)); await page.waitFor("!document.getElementById('loginScreen').hidden", 4000);
      await page.eval(`document.getElementById('codeInput').value=${JSON.stringify(def.code)}`);
      const n0 = reqCount(server, sc);
      await page.eval(`(function(){var b=document.getElementById('loginBtn');for(var i=0;i<10;i++)b.click();})()`);
      await page.sleep(2500);
      const sent = server.log.filter(l => l.sc === sc).length - n0;
      const dtCalls = def.id === 'index-pusat' ? 3 : 1;
      if (sent > dtCalls) add(def.id, 'klik cepat 10x Masuk: lebih dari satu permintaan', sent + ' permintaan');
      // 3. tombol segarkan 10x
      if (await page.eval("!!document.getElementById('refreshBtn')") && (await state(page)).app) {
        const m = reqCount(server, sc);
        await page.eval(`(function(){var b=document.getElementById('refreshBtn');for(var i=0;i<10;i++)b.click();})()`);
        await page.sleep(2500);
        const extra = reqCount(server, sc) - m;
        if (extra > dtCalls) add(def.id, 'klik cepat 10x Segarkan: banyak permintaan paralel', extra + ' permintaan');
      }
      page.errors.forEach(e => add(def.id, 'galat konsol saat klik cepat', e));
      await page.close();
    }
    // 4. penyimpanan rusak
    const LSBAD = [
      ['mh_code objek', { mh_code: '{"a":1}' }], ['mh_code array', { mh_code: '[1,2]' }], ['mh_code kosong', { mh_code: '' }], ['mh_code spasi', { mh_code: '   ' }], ['mh_code panjang', { mh_code: 'x'.repeat(4000) }],
      ['cache JSON rusak', { mh_code: def.code, mh_gs_cache: '{bad', mh_stok_cache: '{bad', mh_hadir_cache: '{bad', mh_rank_cache: '{bad', mh_cache: '{bad' }], ['cache null', { mh_code: def.code, mh_gs_cache: 'null', mh_rank_cache: 'null', mh_stok_cache: 'null', mh_hadir_cache: 'null' }],
      ['cache bentuk salah', { mh_code: def.code, mh_gs_cache: JSON.stringify({ code: def.code, view: '', data: 5 }), mh_rank_cache: JSON.stringify({ code: def.code, data: [] }), mh_stok_cache: JSON.stringify({ code: def.code, data: 'x' }), mh_hadir_cache: JSON.stringify({ code: def.code, data: { mode: 'hadir' } }) }],
      ['tab tersimpan aneh', { mh_code: def.code, mh_gs_tab: '<script>', mh_gs_bnd_view: '[1' }],
    ];
    for (const [name, ls] of LSBAD) {
      const sc = `ls|${def.id}|${name}`; const page = await browser.newPage();
      await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1&ls=${encodeURIComponent(JSON.stringify(ls))}`);
      await page.waitFor(`(function(){var a=document.getElementById('appScreen'),l=document.getElementById('loginScreen'),b=document.getElementById('bootActions');return (a&&!a.hidden)||(l&&!l.hidden&&!document.documentElement.classList.contains('has-code'))||(b&&!b.hidden)})()`, 6000);
      await page.sleep(300);
      const st = await state(page);
      if (!st.app && !st.login && !st.bootFail) add(def.id, `penyimpanan "${name}": macet`, JSON.stringify(st));
      page.errors.forEach(e => add(def.id, `penyimpanan "${name}": galat konsol`, e));
      await page.close();
    }
    // 5. tanpa localStorage (SecurityError), setItem penuh, tanpa IndexedDB
    for (const [name, extra] of [['localStorage melempar', '&nols=1'], ['setItem penuh', '&nols=2'], ['IndexedDB melempar', '&noidb=1']]) {
      const sc = `nols|${def.id}|${name}`; const page = await browser.newPage();
      await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1${extra}`);
      await page.waitFor("!document.getElementById('loginScreen').hidden", 4000);
      await fillSubmit(page, def.code);
      const ok = await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", 7000);
      if (!ok) add(def.id, `${name}: tidak bisa masuk`, JSON.stringify(await state(page)));
      page.errors.forEach(e => add(def.id, `${name}: galat konsol`, e));
      await page.close();
    }
    // 6. jaringan gagal terus lalu pulih: layar tidak mati, login ulang bisa
    {
      const sc = `net|${def.id}`; let up = false; server.scenarios.set(sc, q => up ? { body: okResponseSafe(q) } : { drop: true });
      const page = await browser.newPage();
      await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1`); await page.waitFor("!document.getElementById('loginScreen').hidden", 4000);
      await fillSubmit(page, def.code);
      await page.waitFor("(function(){var b=document.getElementById('loginBtn');return b&&!b.disabled&&document.getElementById('loginErr').textContent})()", 8000);
      let st = await state(page);
      if (!st.err || st.btnDis) add(def.id, 'jaringan gagal: tanpa pesan atau tombol macet', JSON.stringify(st));
      if (BAD_TEXT.test(st.err)) add(def.id, 'jaringan gagal: pesan memuat kata buruk', st.err);
      up = true; await fillSubmit(page, def.code);
      const ok = await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", 7000);
      if (!ok) add(def.id, 'setelah jaringan pulih: tidak bisa masuk', JSON.stringify(await state(page)));
      page.errors.forEach(e => add(def.id, 'jaringan gagal: galat konsol', e));
      await page.close();
    }
  }
  return found;
}
import { okResponse } from './fuzzserve.mjs';
const okResponseSafe = q => okResponse(q);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasChrome) { console.log('Chrome tidak ada'); process.exit(0); }
  const a = process.argv.slice(2), only = a.includes('--only') ? a[a.indexOf('--only') + 1] : '';
  const server = await startFuzzServer(8843), browser = await launch();
  const found = await runLoginFuzz(browser, server, only);
  await browser.close(); server.close();
  const g = new Map(); found.forEach(f => { const k = f.page + ' :: ' + f.rule + ' :: ' + f.detail.slice(0, 100); g.set(k, (g.get(k) || 0) + 1); });
  console.log('temuan unik=' + g.size); g.forEach((n, k) => console.log(`[${n}x] ${k}`));
  process.exit(g.size ? 1 : 0);
}
