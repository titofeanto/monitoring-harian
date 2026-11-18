import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip } from './testkit.mjs';
import { CODES } from './fuzzserve.mjs';
import { PAGES } from './browser.fuzz.mjs';

const env = setup();
const server = new Proxy({}, { get: (_, k) => env.server[k] }), browser = new Proxy({}, { get: (_, k) => env.browser[k] });
// Respons JSON yang bukan objek (T-03): pesan galat lugas, bukan TypeError mentah
const LOGIN_PAGES = PAGES.filter(p => p.id !== 'index-pusat');
const BODIES = { json_null: 'null', json_number: '5', json_string: '"abc"', json_array: '[1,2]', json_true: 'true' };

for (const def of LOGIN_PAGES) for (const [kind, body] of Object.entries(BODIES)) {
  test(`respons ${kind}: ${def.id} menampilkan pesan server bermasalah, bukan TypeError`, { skip }, async () => {
    const sc = `resp|${kind}|${def.id}`; server.scenarios.set(sc, () => ({ body }));
    const page = await browser.newPage();
    try {
      await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1`);
      await page.waitFor("!document.getElementById('loginScreen').hidden", 5000);
      await page.eval(`(function(){document.getElementById('codeInput').value=${JSON.stringify(def.code || CODES.tmk)};document.getElementById('loginForm').requestSubmit();})()`);
      await page.waitFor("document.getElementById('loginErr').textContent.length>0", 15000);
      const msg = await page.eval("document.getElementById('loginErr').textContent");
      assert.match(msg, /Server Apps Script bermasalah: respons tidak dikenali/);
      assert.doesNotMatch(msg, /Cannot read|TypeError/);
      assert.equal(await page.eval("document.getElementById('loginBtn').disabled"), false);
    } finally { await page.close(); }
  });
}
