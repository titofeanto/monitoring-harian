import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip } from './fuzz/testkit.mjs';
import { CODES, okResponse } from './fuzz/fuzzserve.mjs';
import { PAGES, state } from './fuzz/browser.fuzz.mjs';

const env = setup(8854);
const server = new Proxy({}, { get: (_, k) => env.server[k] }), browser = new Proxy({}, { get: (_, k) => env.browser[k] });
// Salinan data di localStorage dari versi lama/bentuk lain tidak boleh membuat halaman macet di "Memuat" selamanya.
const BAD_CACHES = {
  'cek-stok': [{ code: CODES.pusat, data: 'x', at: 1 }, { code: CODES.pusat, data: { mode: 'stok' }, at: 1 }, { code: CODES.pusat, data: { mode: 'stok', dts: [] }, at: 1 }],
  kehadiran: [{ code: CODES.pusat, data: { mode: 'hadir' }, at: 1 }, { code: CODES.pusat, data: { mode: 'hadir', dts: [], rows: [] }, at: 1 }, { code: CODES.pusat, data: { mode: 'hadir', dts: [{ kode: 'D01' }] }, at: 1 }],
  ranking: [{ code: CODES.pusat, data: [], at: 1 }, { code: CODES.pusat, data: { mode: 'rank' }, at: 1 }, { code: CODES.pusat, data: 5, at: 1 }],
  'great-sales': [{ code: CODES.pusat, view: '', data: 5, at: 1 }, { code: CODES.pusat, view: '', data: { mode: 'gs', live: {}, scorecard: [{}] }, at: 1 }],
};
const CACHE_KEYS = { 'cek-stok': 'mh_stok_cache', kehadiran: 'mh_hadir_cache', ranking: 'mh_rank_cache', 'great-sales': 'mh_gs_cache' };
for (const [id, list] of Object.entries(BAD_CACHES)) {
  list.forEach((bad, n) => test(`salinan lama bentuk salah #${n + 1}: ${id} pulih ke data jaringan`, { skip }, async () => {
    const def = PAGES.find(p => p.id === id); const page = await browser.newPage();
    try {
      const ls = { mh_code: def.code, [CACHE_KEYS[id]]: JSON.stringify(bad) };
      await page.goto(`${server.fresh()}/${def.file}?sc=ok&fast=1&ls=${encodeURIComponent(JSON.stringify(ls))}`);
      const ok = await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden&&document.body.innerText.length>400})()", 8000);
      assert.ok(ok, 'halaman macet: ' + JSON.stringify(await (await import('./fuzz/browser.fuzz.mjs')).state(page)));
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  }));
}
