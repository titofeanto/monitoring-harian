// Regresi bug browser dari fuzz (plan 025), memakai Chrome headless lewat CDP. Dilewati bila Chrome tidak ada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip } from './fuzz/testkit.mjs';
import { CODES } from './fuzz/fuzzserve.mjs';
import { BAD_TEXT } from './fuzz/browser.fuzz.mjs';

const env = setup(8851);   // satu Chrome + satu server untuk berkas ini dan semua kasus yang diimpor di bawah
const server = new Proxy({}, { get: (_, k) => env.server[k] }), browser = new Proxy({}, { get: (_, k) => env.browser[k] });
import './fuzz/cases.kode.mjs';
import './fuzz/cases.segarkan.mjs';
import './fuzz/cases.cache.mjs';
import './fuzz/cases.respons.mjs';

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
