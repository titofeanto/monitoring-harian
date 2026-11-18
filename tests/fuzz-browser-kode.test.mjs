import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip } from './fuzz/testkit.mjs';
import { CODES, okResponse } from './fuzz/fuzzserve.mjs';
import { PAGES, state } from './fuzz/browser.fuzz.mjs';

const env = setup(8852);
const server = new Proxy({}, { get: (_, k) => env.server[k] }), browser = new Proxy({}, { get: (_, k) => env.browser[k] });
// Kode akses kosong/spasi (plan 025)
const dataReqs = (sc) => server.log.filter(l => l.sc === sc && /(^|&)code=/.test(l.q)).length;
const LOGIN_PAGES = PAGES.filter(p => p.id !== 'index-pusat');

for (const def of LOGIN_PAGES) {
  test(`kode akses kosong/spasi: ${def.id} tidak mengirim permintaan dan memberi pesan`, { skip }, async () => {
    const sc = 'kosong|' + def.id; const page = await browser.newPage();
    try {
      await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1`);
      await page.waitFor("!document.getElementById('loginScreen').hidden", 5000);
      for (const code of ['', '   ']) {
        await page.eval(`(function(){document.getElementById('codeInput').value=${JSON.stringify(code)};document.getElementById('loginForm').requestSubmit();})()`);
        await page.sleep(300);
        assert.equal(dataReqs(sc), 0, `kode "${code}" tidak boleh dikirim`);
        assert.match(await page.eval("document.getElementById('loginErr').textContent"), /Isi kode akses/);
        assert.equal(await page.eval("document.getElementById('loginBtn').disabled"), false);
      }
    } finally { await page.close(); }
  });
}
