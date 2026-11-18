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
  await page.goto(`${server.fresh()}/${file}?sc=${scenario}&fast=1&ls=${encodeURIComponent(JSON.stringify(code ? { mh_code: code } : {}))}${extra}`);
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

// Injeksi HTML lewat data Sheet (stored XSS): nilai di jalur ini dari sel Sheet apa adanya dan tidak boleh dirender sebagai HTML.
import { sweepOne } from './fuzz/xss.sweep.mjs';
import { PAGES } from './fuzz/browser.fuzz.mjs';
const XSS_SINKS = [
  ['kehadiran', '$.rows[][3]'], ['great-sales', '$.live.tanggal'], ['great-sales', '$.live.history[].tanggal'], ['great-sales', '$.live.summary.mon.tanggal'],
  ['great-sales', '$.live.kpis[].level'], ['cek-stok', '$.harga[].mulai'],
];
for (const [id, p] of XSS_SINKS) {
  test(`injeksi HTML: ${id} ${p} tidak dirender sebagai HTML`, { skip }, async () => {
    const r = await sweepOne(browser, server, PAGES.find(x => x.id === id), p);
    assert.equal(r.hit, null, JSON.stringify(r.hit));
  });
}
