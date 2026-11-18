// Uji ringan pemeriksa tata letak (plan 024): dua halaman x tiga lebar tanpa gulir mendatar atau elemen keluar layar, dan target sentuh perbaikan plan 024.
// Audit penuh: node tests/ui/layout-audit.mjs. Dilewati bila Chrome tidak ada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from './serve.mjs';
import { auditOne, PAGES } from './layout-audit.mjs';

const has = fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const PORT = 8821;
const page = id => PAGES.find(p => p.id === id);

test('Tanpa gulir mendatar dan elemen keluar layar: Skor dan Ranking di 390, 768, 1280', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const runs = await Promise.all([['gs-skor', 390, 844], ['gs-skor', 768, 1024], ['gs-skor', 1280, 800], ['rank-total', 390, 844], ['rank-total', 768, 1024], ['rank-total', 1280, 800]]
      .map(([id, w, h]) => auditOne(PORT, page(id), w, h, 'light')));
    for (const r of runs) {
      assert.equal(r.fail, undefined, r.page + ' ' + r.w + ': ' + r.fail);
      assert.equal(r.hscroll, false, `${r.page} ${r.w}: gulir mendatar (${r.scrollWidth})`);
      assert.deepEqual(r.overflow, [], `${r.page} ${r.w}: elemen keluar layar`);
      assert.deepEqual(r.errs, [], `${r.page} ${r.w}: galat konsol`);
      assert.equal(r.side.ok, true, `${r.page} ${r.w}: sidebar/menu`);
    }
  } finally { srv.close(); }
});

test('Target sentuh di HP: info status >= 40 px (tombol ikon DESIGN.md), "Cara baca" dan tautan banner >= 44 px', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT + 1, 'light');
  try {
    const r = await auditOne(PORT + 1, page('gs-skor'), 390, 844, 'light');
    const bad = r.touch.map(t => t.sel);
    assert.ok(!r.touch.some(t => t.sel === 'button#syncInfo' && (t.w < 40 || t.h < 40)), 'tombol info < 40 px');
    for (const s of ['details.how>summary', '#wajibBanner>button.linkbtn']) assert.ok(!bad.includes(s), s + ' masih < 44 px: ' + JSON.stringify(r.touch.filter(t => t.sel === s)));
    assert.deepEqual(r.contrast.filter(c => c.sel === '#wajibBanner>button.linkbtn'), [], 'kontras tautan banner < 4.5');
  } finally { srv.close(); }
});

// Plan 027: gulir mendatar nol, target sentuh 44 px, grid dua kolom di layar lebar, tile tanpa slot kosong.
test('Plan 027: HP 390 tanpa target sentuh < 44 px, teks < 12 px, kontras < 4,5 dan header <= 110 px', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT + 50, 'light');
  try {
    const ids = ['gs-fop', 'gs-toko', 'gs-banded', 'mh-ring', 'mh-sim', 'stok', 'hadir', 'rank-kpi'];
    const runs = await Promise.all(ids.map(id => auditOne(PORT + 50, page(id), 390, 844, 'light')));
    for (const r of runs) {
      assert.equal(r.fail, undefined, r.page + ': ' + r.fail);
      assert.equal(r.hscroll, false, `${r.page}: gulir mendatar`);
      assert.deepEqual(r.touch, [], `${r.page}: target sentuh < 44 px`);
      assert.deepEqual(r.small, [], `${r.page}: teks < 12 px`);
      assert.deepEqual(r.contrast, [], `${r.page}: kontras < 4,5`);
      assert.ok(r.headFrac * r.h <= 110, `${r.page}: header ${Math.round(r.headFrac * r.h)} px > 110`);
    }
  } finally { srv.close(); }
});

test('Plan 027: layar 1280 memakai grid dua kolom (FOP, Cek Stok) dan tile Ringkasan tanpa slot kosong', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT + 51, 'light');
  try {
    const [fop, stok, ring] = await Promise.all(['gs-fop', 'stok', 'mh-ring'].map(id => auditOne(PORT + 51, page(id), 1280, 800, 'light')));
    assert.equal(fop.grid.rk, 2, 'FOP: .rk-list harus 2 kolom di 1280');
    assert.equal(stok.grid.cs, 2, 'Cek Stok: #csList harus 2 kolom di 1280');
    assert.ok(ring.grid.tiles.length > 0, 'tile Ringkasan tidak ditemukan');
    assert.deepEqual(ring.grid.tiles.filter(t => t.empty), [], 'tile Ringkasan menyisakan slot kosong');
    for (const r of [fop, stok, ring]) assert.equal(r.hscroll, false, `${r.page}: gulir mendatar`);
  } finally { srv.close(); }
});

test('Plan 027: nol gulir mendatar di 8 lebar untuk satu halaman padat (Kehadiran)', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT + 52, 'light');
  try {
    const runs = await Promise.all([[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1536, 864]].map(([w, h]) => auditOne(PORT + 52, page('hadir'), w, h, 'light')));
    for (const r of runs) { assert.equal(r.fail, undefined, r.fail); assert.equal(r.hscroll, false, `hadir ${r.w}: gulir mendatar`); }
  } finally { srv.close(); }
});
