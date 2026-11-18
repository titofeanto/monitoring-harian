// Uji layar login bersama (plan 026) di lima halaman, Chrome headless lewat CDP. Dilewati bila Chrome tidak ada.
// Label ada, tombol tampilkan/sembunyikan mengubah tipe kolom, Enter mengirim, klik ganda satu permintaan,
// galat menampilkan pesan dan mempertahankan kolom, tidak ada gulir mendatar di 360/390/768.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, hasChrome } from '../fuzz/cdp.mjs';
import { startFuzzServer, CODES, okResponse } from '../fuzz/fuzzserve.mjs';

const skip = !hasChrome && 'Chrome tidak ada';
const FILES = ['index.html', 'great-sales.html', 'cek-stok.html', 'kehadiran.html', 'ranking.html'];
let server, browser;
before(async () => { if (skip) return; server = await startFuzzServer(8861); browser = await launch(); });
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(file, sc, w = 390) {
  const page = await browser.newPage({ width: w, height: 800 });
  await page.goto(`${server.fresh()}/${file}?sc=${encodeURIComponent(sc)}&fast=1`);
  assert.ok(await page.waitFor("!document.getElementById('loginScreen').hidden && !!document.getElementById('codeInput')", 5000), file + ': layar login tampil');
  return page;
}
const key = (page, k, code) => page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: 13, text: '\r' }).then(() => page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: 13 }));
const typeInto = async (page, text) => { await page.eval("document.getElementById('codeInput').focus()"); await page.send('Input.insertText', { text }); };
const reqs = sc => server.log.filter(l => l.sc === sc && /(^|&)code=/.test(l.q)).length;

for (const file of FILES) {
  test(`login ${file}: label, nama aplikasi, atribut kolom, tombol tampil/sembunyi`, { skip }, async () => {
    const page = await open(file, 'ui|' + file);
    try {
      const r = await page.eval(`(function(){var i=document.getElementById('codeInput'),l=document.querySelector('label[for=codeInput]'),e=document.getElementById('codeToggle'),b=document.getElementById('loginBtn');
        var out={label:l&&l.textContent.trim(),logo:(function(){var g=document.querySelector('img.lg-logo');return g&&{alt:g.alt,w:g.getAttribute('width'),h:g.getAttribute('height'),ok:g.complete&&g.naturalWidth>0}})(),tag:document.querySelector('[data-app-tagline]').textContent,type0:i.type,ac:i.autocomplete,im:i.inputMode,cap:i.getAttribute('autocapitalize'),sp:i.spellcheck,h:i.getBoundingClientRect().height,eh:e.getBoundingClientRect().height,bh:b.getBoundingClientRect().height,ph:i.placeholder};
        e.click(); out.type1=i.type; out.pressed1=e.getAttribute('aria-pressed'); out.txt1=e.textContent; e.click(); out.type2=i.type; out.txt2=e.textContent; return out;})()`);
      assert.equal(r.label, 'Kode akses');
      assert.equal(r.logo.alt, 'Jendela Jasper', 'logo punya alt');
      assert.ok(r.logo.w && r.logo.h && r.logo.ok, 'logo punya ukuran eksplisit dan termuat');
      assert.equal(r.tag, 'Monitoring Pencapaian Sales Harian');
      assert.equal(r.type0, 'password'); assert.equal(r.type1, 'text'); assert.equal(r.type2, 'password');
      assert.equal(r.pressed1, 'true'); assert.equal(r.txt1, 'Sembunyikan'); assert.equal(r.txt2, 'Tampilkan');
      assert.equal(r.ac, 'current-password'); assert.equal(r.im, 'text'); assert.equal(r.cap, 'off'); assert.equal(r.sp, false);
      assert.ok(r.h >= 48 && r.eh >= 44 && r.bh >= 48, `ukuran sentuh: kolom ${r.h}, tombol mata ${r.eh}, Masuk ${r.bh}`);
      assert.equal(r.ph, '', 'label bukan placeholder');
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  });

  test(`login ${file}: tidak ada gulir mendatar di 360, 390, 768`, { skip }, async () => {
    for (const w of [360, 390, 768]) {
      const page = await open(file, 'ui|' + file, w);
      try {
        const m = await page.eval('({sw:document.documentElement.scrollWidth,iw:innerWidth})');
        assert.ok(m.sw <= m.iw, `${file} @${w}: scrollWidth ${m.sw} > ${m.iw}`);
      } finally { await page.close(); }
    }
  });
}

test('login: Enter mengirim, galat tampil dengan penyebab dan langkah, kolom tidak dikosongkan', { skip }, async () => {
  const sc = 'ui|galat'; const page = await open('great-sales.html', sc);
  try {
    await typeInto(page, 'kode-salah');
    await key(page, 'Enter', 'Enter');
    assert.ok(await page.waitFor("document.getElementById('loginErr').textContent.length>0 && !document.getElementById('loginBtn').disabled", 6000), 'galat tampil');
    const r = await page.eval(`({err:document.getElementById('loginErr').textContent,val:document.getElementById('codeInput').value,inv:document.getElementById('codeInput').getAttribute('aria-invalid'),role:document.getElementById('loginErr').getAttribute('role'),btn:document.getElementById('loginBtn').textContent})`);
    assert.equal(reqs(sc), 1, 'Enter mengirim satu permintaan');
    assert.match(r.err, /Kode tidak cocok\. Periksa huruf besar\/kecil atau minta kode baru\./);
    assert.equal(r.val, 'kode-salah'); assert.equal(r.inv, 'true'); assert.equal(r.role, 'alert'); assert.equal(r.btn, 'Masuk');
  } finally { await page.close(); }
});

test('login: klik ganda cepat hanya satu permintaan, tombol berteks "Memeriksa kode…" dan nonaktif', { skip }, async () => {
  const sc = 'ui|ganda'; server.scenarios.set(sc, q => ({ delay: 700, body: okResponse(q) }));
  const page = await open('ranking.html', sc);
  try {
    await typeInto(page, CODES.pusat);
    const st = await page.eval(`(function(){var b=document.getElementById('loginBtn');b.click();b.click();b.click();return {dis:b.disabled,txt:b.textContent};})()`);
    assert.equal(st.dis, true); assert.match(st.txt, /Memeriksa kode/);
    assert.ok(await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden})()", 8000), 'masuk');
    assert.equal(reqs(sc), 1, 'satu permintaan walau diklik tiga kali');
  } finally { await page.close(); }
});
