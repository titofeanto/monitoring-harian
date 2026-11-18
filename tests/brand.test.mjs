// Merek Jendela Jasper (plan 031): manifest, ikon, tautan ikon di semua HTML, nama dan tagline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const HTML = ['index.html', 'great-sales.html', 'cek-stok.html', 'kehadiran.html', 'ranking.html', 'admin-status.html'];
const png = f => { const b = fs.readFileSync(path.join(root, f)); assert.equal(b.subarray(1, 4).toString(), 'PNG', f + ' bukan PNG'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

test('manifest: JSON valid, nama merek, ikon ada dan berukuran benar', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Jendela Jasper');
  assert.ok(m.short_name.length <= 12, 'short_name maksimal 12 karakter');
  assert.equal(m.description, 'Monitoring Pencapaian Sales Harian');
  assert.match(m.theme_color, /^#[0-9A-Fa-f]{6}$/); assert.match(m.background_color, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'ada ikon maskable');
  for (const i of m.icons) {
    const [w, h] = i.sizes.split('x').map(Number), d = png(i.src);
    assert.deepEqual(d, { w, h }, `${i.src} harus ${i.sizes}`);
  }
});

test('ikon PNG: 192, 512, maskable 512, apple-touch 180, favicon 32 dan 48; SVG ada', () => {
  const want = { 'ikon-192.png': 192, 'ikon-512.png': 512, 'ikon-maskable-512.png': 512, 'apple-touch-icon-180.png': 180, 'favicon-32.png': 32, 'favicon-48.png': 48 };
  for (const [f, n] of Object.entries(want)) assert.deepEqual(png('assets/brand/' + f), { w: n, h: n }, f);
  for (const f of ['ikon.svg', 'ikon-maskable.svg', 'ikon-mono.svg', 'favicon.svg']) assert.match(read('assets/brand/' + f), /<svg[^>]+viewBox="0 0 512 512"/, f);
});

for (const f of HTML) {
  test(`${f}: rel=icon dan apple-touch-icon menunjuk berkas yang ada, nama baru di title dan meta`, () => {
    const h = read(f);
    const icons = [...h.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)];
    assert.ok(icons.some(i => i[1] === 'icon'), 'rel=icon');
    assert.ok(icons.some(i => i[1] === 'apple-touch-icon'), 'apple-touch-icon');
    for (const i of icons) assert.ok(fs.existsSync(path.join(root, i[2])), `${f}: ${i[2]} tidak ada`);
    assert.match(h, /<title>[^<]*Jendela Jasper<\/title>/);
    assert.match(h, /name="application-name" content="Jendela Jasper"/);
    if (/apple-mobile-web-app-title/.test(h)) assert.match(h, /apple-mobile-web-app-title" content="Jendela Jasper"/);
    assert.ok(!/Tifa/.test(h), 'tidak ada nama lama');
  });
}

test('config: MH_APP_NAME dan MH_APP_TAGLINE terisi', () => {
  const win = {}; vm.runInNewContext(read('assets/config.js'), { window: win });
  assert.equal(win.MH_APP_NAME, 'Jendela Jasper');
  assert.equal(win.MH_APP_TAGLINE, 'Monitoring Pencapaian Sales Harian');
});

test('berkas logo ada dan layar login merujuk logo gelap', () => {
  for (const f of ['logo-gelap.png', 'logo-horizontal.png', 'logo-emblem.png']) assert.ok(png('assets/brand/' + f).w >= 400, f);
  const d = png('assets/brand/logo-gelap.png');
  for (const f of HTML.slice(0, 5)) { const h = read(f); assert.match(h, new RegExp(`class="lg-logo" src="assets/brand/logo-gelap.png" width="${d.w}" height="${d.h}" alt="Jendela Jasper"`), f); }
});
