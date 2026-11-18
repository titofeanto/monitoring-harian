// Respons lambat 8 detik (plan 025): layar muat tetap tampil, tombol Masuk menunjukkan "Memeriksa kode…" dan tidak bisa ditembak ganda, lalu data tampil tanpa galat.
// Pakai: node tests/fuzz/slow.fuzz.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer, okResponse } from './fuzzserve.mjs';
import { PAGES, state } from './browser.fuzz.mjs';

export async function runSlow(browser, server, delay = 8000) {
  const found = [];
  for (const def of PAGES.filter(p => p.id !== 'index-pusat')) {
    const sc = 'slow|' + def.id; server.scenarios.set(sc, q => ({ delay: q.get('view') === 'status' ? 0 : delay, body: okResponse(q) }));
    // a. kode tersimpan: layar "Memuat" dulu, lalu app
    let page = await browser.newPage();
    await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&ls=${encodeURIComponent(JSON.stringify({ mh_code: def.code }))}`);
    await page.sleep(1500);
    let st = await state(page);
    if (st.app || st.login) found.push({ page: def.id, rule: 'kode tersimpan + respons lambat: layar muat tidak tampil', detail: JSON.stringify(st).slice(0, 150) });
    const ok = await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", delay + 8000);
    if (!ok) found.push({ page: def.id, rule: 'respons 8 dtk: app tidak pernah tampil', detail: JSON.stringify(await state(page)).slice(0, 150) });
    page.errors.forEach(e => found.push({ page: def.id, rule: 'galat konsol (respons lambat)', detail: e.slice(0, 160) }));
    await page.close();
    // b. login manual: tombol "Memeriksa kode…", klik ganda diabaikan
    page = await browser.newPage();
    await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc + '|m')}`);
    server.scenarios.set(sc + '|m', q => ({ delay: q.get('view') === 'status' ? 0 : delay, body: okResponse(q) }));
    await page.waitFor("!document.getElementById('loginScreen').hidden", 5000);
    const n0 = server.log.filter(l => l.sc === sc + '|m' && /code=/.test(l.q)).length;
    await page.eval(`(function(){document.getElementById('codeInput').value=${JSON.stringify(def.code)};var f=document.getElementById('loginForm');for(var i=0;i<5;i++)f.requestSubmit();})()`);
    await page.sleep(1500);
    st = await state(page);
    if (!st.btnDis || !/Memeriksa kode/.test(st.btn)) found.push({ page: def.id, rule: 'login lambat: tombol tidak menunjukkan Memeriksa kode', detail: JSON.stringify(st).slice(0, 150) });
    const sent = server.log.filter(l => l.sc === sc + '|m' && /code=/.test(l.q)).length - n0;
    if (sent > 1) found.push({ page: def.id, rule: 'login lambat: submit 5x mengirim ' + sent + ' permintaan', detail: '' });
    await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", delay + 8000);
    page.errors.forEach(e => found.push({ page: def.id, rule: 'galat konsol (login lambat)', detail: e.slice(0, 160) }));
    await page.close();
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasChrome) { console.log('Chrome tidak ada'); process.exit(0); }
  const server = await startFuzzServer(8846), browser = await launch();
  const found = await runSlow(browser, server, 8000);
  await browser.close(); server.close();
  console.log('temuan=' + found.length); found.forEach(f => console.log(f.page + ' :: ' + f.rule + ' :: ' + f.detail));
  process.exit(found.length ? 1 : 0);
}
