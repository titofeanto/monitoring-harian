import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip } from './testkit.mjs';
import { CODES, okResponse } from './fuzzserve.mjs';
import { PAGES, state } from './browser.fuzz.mjs';

const env = setup();
const server = new Proxy({}, { get: (_, k) => env.server[k] }), browser = new Proxy({}, { get: (_, k) => env.browser[k] });
// Tombol Segarkan ditekan berulang (plan 025)
const dataReqs = (sc) => server.log.filter(l => l.sc === sc && /(^|&)code=/.test(l.q)).length;
const LOGIN_PAGES = PAGES.filter(p => p.id !== 'index-pusat');

for (const def of LOGIN_PAGES) {
  test(`Segarkan ditekan 10x: ${def.id} hanya satu permintaan data berjalan`, { skip }, async () => {
    const sc = 'segarkan|' + def.id; server.scenarios.set(sc, q => ({ delay: 500, body: okResponse(q) }));
    const page = await browser.newPage();
    try {
      await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1&ls=${encodeURIComponent(JSON.stringify({ mh_code: def.id === 'index' ? CODES.tmk : def.code }))}`);
      await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", 8000);
      await page.sleep(900);
      const n0 = dataReqs(sc);
      await page.eval(`(function(){var b=document.getElementById('refreshBtn');for(var i=0;i<10;i++)b.click();})()`);
      await page.sleep(1800);
      assert.equal(dataReqs(sc) - n0, 1, 'permintaan data setelah 10 klik Segarkan');
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  });
}

