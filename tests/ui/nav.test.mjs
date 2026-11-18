// Uji browser: navigasi samping. Di bawah 900 px sidebar jadi laci (tombol menu, klik item, Esc); di 900 px ke atas sidebar tampil tetap.
// Chrome headless tidak mau lebih sempit dari ~500 px, jadi "HP" diuji di 600 px (masih < 900). Dilewati bila Chrome tidak ada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './serve.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const has = fs.existsSync(CHROME);

async function dom(port, page, width, click, hash = 'skor') {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-prof-'));
  try {
    const u = `http://localhost:${port}/${page}.html?fx=gs-live${click ? '&click=' + encodeURIComponent(click) : ''}#${hash}`;
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, `--window-size=${width},900`, '--virtual-time-budget=6000', '--dump-dom', u], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
const attr = (html, id, name) => { const m = new RegExp('<[^>]*id="' + id + '"[^>]*>').exec(html); const a = m && new RegExp('\\s' + name + '(?:="([^"]*)")?[\\s>]').exec(m[0] + ' '); return a ? (a[1] == null ? '' : a[1]) : null; };
const navOpen = html => /<nav[^>]*id="tabsNav"[^>]*class="[^"]*\bopen\b/.test(html) || /<nav[^>]*class="[^"]*\bopen\b[^"]*"[^>]*id="tabsNav"/.test(html);
const panelShown = (html, id) => attr(html, id, 'hidden') === null;

test('HP (600 px): tombol menu membuka laci, item Banded membuka panel dan menutup laci, Esc menutup', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8782, 'light');
  try {
    const closed = await dom(8782, 'great-sales', 600, '');
    assert.equal(attr(closed, 'menuBtn', 'aria-expanded'), 'false');
    assert.equal(navOpen(closed), false);
    assert.notEqual(attr(closed, 'tabsNav', 'inert'), null, 'laci tertutup harus inert');

    const opened = await dom(8782, 'great-sales', 600, '#menuBtn');
    assert.equal(attr(opened, 'menuBtn', 'aria-expanded'), 'true');
    assert.equal(navOpen(opened), true);
    assert.equal(attr(opened, 'tabsNav', 'inert'), null);
    assert.equal(attr(opened, 'navScrim', 'hidden'), null, 'scrim tampil');

    const picked = await dom(8782, 'great-sales', 600, '#menuBtn|#tabsNav [data-tab="banded"]');
    assert.equal(panelShown(picked, 'tab-banded'), true);
    assert.equal(panelShown(picked, 'tab-skor'), false);
    assert.equal(attr(picked, 'menuBtn', 'aria-expanded'), 'false');
    assert.equal(navOpen(picked), false);
    assert.match(picked, /<h1[^>]*id="greetBig"[^>]*>Banded</);
    assert.match(picked, /data-tab="banded"[^>]*aria-current="page"|aria-current="page"[^>]*data-tab="banded"/);

    const esc = await dom(8782, 'great-sales', 600, '#menuBtn|key:Escape');
    assert.equal(attr(esc, 'menuBtn', 'aria-expanded'), 'false');
    assert.equal(navOpen(esc), false);

    const scrim = await dom(8782, 'great-sales', 600, '#menuBtn|#navScrim');
    assert.equal(navOpen(scrim), false);
  } finally { srv.close(); }
});

test('desktop (1200 px): sidebar terlihat tanpa klik, tombol menu tersembunyi, tidak inert', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8783, 'light');
  try {
    const html = await dom(8783, 'great-sales', 1200, '');
    assert.equal(attr(html, 'tabsNav', 'inert'), null);
    for (const t of ['skor', 'fop', 'banded', 'asrt', 'ps', 'toko']) assert.match(html, new RegExp('data-tab="' + t + '"'));
    for (const f of ['index.html', 'cek-stok.html', 'kehadiran.html']) assert.match(html, new RegExp('href="' + f.replace('.', '\\.') + '"'));
    // klik item bekerja tanpa membuka laci
    const fop = await dom(8783, 'great-sales', 1200, '#tabsNav [data-tab="fop"]');
    assert.equal(panelShown(fop, 'tab-fop'), true);
  } finally { srv.close(); }
});

test('halaman lain: item aktif benar dan tautan Great Sales memakai hash tab', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8784, 'light');
  try {
    const stok = await dom(8784, 'cek-stok', 1200, '', '');
    assert.match(stok, /<a[^>]*href="cek-stok\.html"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="cek-stok\.html"/);
    assert.match(stok, /href="great-sales\.html#banded"/);
    assert.match(stok, /<h1[^>]*id="greetBig"[^>]*>Cek Stok/);
    const hadir = await dom(8784, 'kehadiran', 1200, '', '');
    assert.match(hadir, /<a[^>]*href="kehadiran\.html"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="kehadiran\.html"/);
  } finally { srv.close(); }
});
