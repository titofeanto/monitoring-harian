// Percobaan interaktif trial-and-error (plan 025, bagian C): login, pindah halaman lewat sidebar, buka/tutup laci cepat,
// ganti DT cepat, cari/urut dengan input aneh, buka/tutup lembar detail, keluar-masuk, ubah ukuran jendela, tombol Kembali,
// hash aneh, reload saat laci terbuka. Setiap langkah memeriksa: tanpa galat konsol, tanpa kata buruk, tanpa injeksi.
// Pakai: node tests/fuzz/explore.fuzz.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer, CODES } from './fuzzserve.mjs';
import { PAGES, BAD_TEXT, state } from './browser.fuzz.mjs';

export const WEIRD_QUERIES = [' ', '   ', '.*(', '(', '[', '\\', '+', '?', '*', '$^', 'a'.repeat(500), '<img src=x onerror="window.__pwn=1">', '😀', '‮abc', '%', '%E0%A4%A', 'null', 'undefined'];
export const WEIRD_HASHES = ['#../', '#<script>window.__pwn=1</script>', '#fop%', '#%E0%A4%A', '#' + 'x'.repeat(2000), '#__proto__', '#constructor', '#%00', '#skor#fop', '#ranking'];

export async function runExplore(browser, server) {
  const found = []; const add = (page, step, detail) => found.push({ page, step, detail: String(detail).slice(0, 240) });
  const ls = code => encodeURIComponent(JSON.stringify({ mh_code: code }));
  const origin = server.fresh();   // satu origin supaya login tersimpan lintas halaman
  const urlOf = (def, hash = '', extra = '') => `${origin}/${def.file}?sc=ok&fast=1${extra}${hash}`;
  const appUp = (page, ms = 8000) => page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", ms);
  const check = async (def, step, page, errFrom = 0) => {
    page.errors.slice(errFrom).forEach(e => add(def.id, step, 'galat: ' + e));
    const t = await page.eval('document.body.innerText'), m = BAD_TEXT.exec(t);
    if (m) add(def.id, step, 'teks buruk "' + m[0].trim() + '": ' + t.slice(Math.max(0, t.indexOf(m[0]) - 40), t.indexOf(m[0]) + 40).replace(/\s+/g, ' '));
    if (await page.eval('!!window.__pwn')) add(def.id, step, 'skrip tereksekusi');
    return page.errors.length;
  };

  for (const def of PAGES.filter(p => p.id !== 'index-pusat')) {
    const page = await browser.newPage({ width: 390, height: 844 }); let ec = 0;
    await page.goto(urlOf(def, '', '&ls=' + ls(def.code)));
    if (!await appUp(page)) { add(def.id, 'masuk', JSON.stringify(await state(page))); await page.close(); continue; }
    await page.sleep(300); ec = await check(def, 'setelah masuk', page);

    // laci buka/tutup cepat (tombol menu, scrim, Escape, tombol tutup)
    await page.eval(`(function(){var m=document.getElementById('menuBtn'),x=document.getElementById('navClose'),sc=document.getElementById('navScrim');
      for(var i=0;i<40;i++){ m&&m.click(); if(i%3===0) x&&x.click(); else if(i%3===1) sc&&sc.click(); else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); }})()`);
    await page.sleep(300);
    const drawer = await page.eval("({open: document.getElementById('menuBtn').getAttribute('aria-expanded'), nav: document.getElementById('tabsNav').className, scrim: !document.getElementById('navScrim').hidden})");
    if (drawer.open === 'true' !== drawer.scrim) add(def.id, 'laci cepat', 'aria-expanded dan scrim tidak sinkron ' + JSON.stringify(drawer));
    ec = await check(def, 'laci cepat', page, ec);

    // ganti DT cepat (chip)
    const chips = await page.eval("document.querySelectorAll('#dtChips .chip, #dtChips button').length");
    if (chips > 1) {
      await page.eval(`(function(){var c=document.querySelectorAll('#dtChips .chip, #dtChips button');for(var i=0;i<30;i++)c[i%c.length].click();})()`);
      await page.sleep(1200); ec = await check(def, 'ganti DT cepat', page, ec);
      if (!(await state(page)).app) add(def.id, 'ganti DT cepat', 'layar app hilang ' + JSON.stringify(await state(page)));
    }

    // cari/urut dengan input aneh pada semua kolom isian dan pilihan urut
    const qs = await page.eval(`[].map.call(document.querySelectorAll('input[data-q], input[type=search], input[type=text], select[data-sort], select[data-sortlist]'), function(e,i){return i})`);
    for (const q of WEIRD_QUERIES) {
      await page.eval(`(function(){[].forEach.call(document.querySelectorAll('input[data-q], input[type=search], input[type=text]:not(#codeInput)'), function(e){e.value=${JSON.stringify(q)};e.dispatchEvent(new Event('input',{bubbles:true}));});})()`);
      await page.sleep(60);
    }
    await page.eval(`(function(){[].forEach.call(document.querySelectorAll('select[data-sort], select[data-sortlist]'), function(s){for(var i=0;i<s.options.length;i++){s.selectedIndex=i;s.dispatchEvent(new Event('change',{bubbles:true}));}});})()`);
    await page.sleep(200); ec = await check(def, 'cari/urut aneh (' + qs.length + ' kontrol)', page, ec);
    await page.eval(`[].forEach.call(document.querySelectorAll('input[data-q], input[type=search], input[type=text]:not(#codeInput)'), function(e){e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));})`);

    // lembar detail buka/tutup berulang
    const sheetSel = await page.eval(`['[data-store]','.rk.tap','[data-sel]','tr[data-i]'].filter(function(s){return document.querySelector(s)})[0]||''`);
    if (sheetSel) {
      for (let i = 0; i < 15; i++) {
        await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sheetSel)});if(e)e.click()})()`); await page.sleep(40);
        await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await page.sleep(30);
      }
      const open = await page.eval("(function(){var m=document.getElementById('storeModal')||document.getElementById('dsrModal')||document.querySelector('dialog[open], .modal:not([hidden])');return !!m&&!m.hidden&&(m.open!==false)&&m.getClientRects().length>0})()");
      const lock = await page.eval("getComputedStyle(document.body).overflow");
      if (open) add(def.id, 'lembar buka/tutup 15x', 'lembar masih terbuka setelah Escape');
      if (lock === 'hidden') add(def.id, 'lembar buka/tutup 15x', 'gulir halaman terkunci (overflow hidden) setelah ditutup');
      ec = await check(def, 'lembar detail', page, ec);
    }

    // ubah ukuran 360 <-> 1280 saat lembar terbuka
    if (sheetSel) { await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sheetSel)});if(e)e.click()})()`); await page.sleep(100); }
    for (const w of [1280, 360, 1280, 360, 768, 360]) { await page.setViewport(w, w > 700 ? 800 : 700); await page.sleep(80); }
    const hs = await page.eval('document.documentElement.scrollWidth - innerWidth');
    if (hs > 1) add(def.id, 'ubah ukuran jendela saat lembar terbuka', 'gulir mendatar ' + hs + 'px pada 360');
    ec = await check(def, 'ubah ukuran', page, ec);
    await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await page.setViewport(390, 844);

    // pindah ke semua halaman lewat sidebar + tombol Kembali
    const links = await page.eval(`[].map.call(document.querySelectorAll('#tabsNav a.side-i'), function(a){return a.getAttribute('href')})`);
    for (const href of links) {
      const t = href.split('#')[0]; const other = PAGES.find(p => p.file === t); if (!other) { add(def.id, 'sidebar', 'tautan ke halaman tak dikenal ' + href); continue; }
      await page.eval(`(function(){var a=document.querySelector('#tabsNav a.side-i[href="${href}"]');a&&a.click();})()`);
      await page.sleep(500);
      const ok = await appUp(page, 7000);
      if (!ok) { add(def.id, 'sidebar -> ' + href, 'halaman tujuan tidak masuk: ' + JSON.stringify(await state(page))); }
      await page.sleep(250);
      const e0 = page.errors.length; page.errors.forEach(e => add(def.id, 'sidebar -> ' + href, 'galat: ' + e)); page.errors.length = 0;
      await page.eval('history.back()'); await page.sleep(500);
      if (!await appUp(page, 7000)) add(def.id, 'Kembali dari ' + href, 'halaman asal tidak masuk: ' + JSON.stringify(await state(page)));
      page.errors.forEach(e => add(def.id, 'Kembali dari ' + href, 'galat: ' + e)); page.errors.length = 0; ec = 0;
    }

    // keluar -> masuk lagi
    await page.eval("document.getElementById('menuBtn').click()"); await page.sleep(100);
    await page.eval("document.getElementById('sideLogout').click()"); await page.sleep(100);
    await page.eval("document.getElementById('logoutBtn').click()"); await page.sleep(700);
    let st = await state(page);
    if (!st.login) add(def.id, 'keluar', 'layar login tidak tampil: ' + JSON.stringify(st));
    await page.waitFor("!document.getElementById('loginScreen').hidden", 4000);
    await page.eval(`(function(){var i=document.getElementById('codeInput');i.value=${JSON.stringify(def.code)};document.getElementById('loginForm').requestSubmit();})()`);
    if (!await appUp(page, 8000)) add(def.id, 'masuk lagi setelah keluar', JSON.stringify(await state(page)));
    page.errors.forEach(e => add(def.id, 'keluar-masuk', 'galat: ' + e)); page.errors.length = 0;

    // reload saat laci terbuka
    await page.eval("document.getElementById('menuBtn').click()"); await page.sleep(150);
    await page.eval('location.reload()'); await page.sleep(300);
    if (!await appUp(page, 8000)) add(def.id, 'reload saat laci terbuka', JSON.stringify(await state(page)));
    const dr = await page.eval("document.getElementById('menuBtn').getAttribute('aria-expanded')");
    if (dr === 'true') add(def.id, 'reload saat laci terbuka', 'laci masih terbuka setelah reload');
    page.errors.forEach(e => add(def.id, 'reload', 'galat: ' + e)); page.errors.length = 0;
    await page.close();

    // hash aneh (halaman baru tiap hash)
    for (const h of WEIRD_HASHES) {
      const p2 = await browser.newPage();
      await p2.goto(urlOf(def, h, '&ls=' + ls(def.code)));
      const up = await appUp(p2, 8000); await p2.sleep(250);
      if (!up) add(def.id, 'hash ' + h.slice(0, 30), 'tidak masuk: ' + JSON.stringify(await state(p2)));
      await check(def, 'hash ' + h.slice(0, 30), p2);
      await p2.close();
    }
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasChrome) { console.log('Chrome tidak ada'); process.exit(0); }
  const server = await startFuzzServer(8844), browser = await launch();
  const found = await runExplore(browser, server);
  await browser.close(); server.close();
  const g = new Map(); found.forEach(f => { const k = f.page + ' :: ' + f.step + ' :: ' + f.detail.slice(0, 120); g.set(k, (g.get(k) || 0) + 1); });
  console.log('temuan unik=' + g.size); g.forEach((n, k) => console.log(`[${n}x] ${k}`));
  process.exit(g.size ? 1 : 0);
}
