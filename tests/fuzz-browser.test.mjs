// Regresi bug browser dari fuzz (plan 025), memakai Chrome headless lewat CDP. Dilewati bila Chrome tidak ada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, hasChrome } from './fuzz/cdp.mjs';
import { startFuzzServer, CODES } from './fuzz/fuzzserve.mjs';
import { BAD_TEXT } from './fuzz/browser.fuzz.mjs';

const skip = !hasChrome && 'Chrome tidak ada';
let server, browser;
before(async () => { if (skip) return; server = await startFuzzServer(8851); browser = await launch(); });
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(file, code, extra = '', scenario = 'ok') {
  const page = await browser.newPage();
  await page.goto(`${server.base}/${file}?sc=${scenario}&fast=1&ls=${encodeURIComponent(JSON.stringify(code ? { mh_code: code } : {}))}${extra}`);
  await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", 8000);
  await page.sleep(300);
  return page;
}

test('Monitoring Harian (kode pusat): kartu DT, Total, dan per DSR tidak menampilkan NaN pada Assortment/ECO', { skip }, async () => {
  const page = await open('index.html', CODES.pusat);
  try {
    const text = await page.eval('document.getElementById("p-ring").innerText');
    assert.match(text, /Total semua DT/);
    assert.match(text, /Salesman Timika 1/, 'kartu per DSR ikut tampil');
    assert.doesNotMatch(text, BAD_TEXT, text.slice(0, 400));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
