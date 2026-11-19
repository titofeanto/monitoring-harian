// Merek Jendela Jasper (plan 031): manifest, ikon, tautan ikon di semua HTML, nama dan tagline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const HTML = ['index.html', 'great-sales.html', 'cek-stok.html', 'kehadiran.html', 'ranking.html', 'admin-status.html'];
const clean = u => u.split('?')[0];
// Baca PNG 8-bit tanpa interlace (RGB atau RGBA) menjadi fungsi piksel(x, y) -> [r,g,b,a].
const decode = f => {
  const b = fs.readFileSync(path.join(root, f)); let o = 8, idat = [], w, h, ct;
  while (o < b.length) { const n = b.readUInt32BE(o), t = b.subarray(o + 4, o + 8).toString(), d = b.subarray(o + 8, o + 8 + n); if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; assert.equal(d[8], 8); assert.equal(d[12], 0); } if (t === 'IDAT') idat.push(d); o += 12 + n; }
  assert.ok(ct === 2 || ct === 6, f + ': tipe warna ' + ct);
  const bpp = ct === 6 ? 4 : 3, st = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * st);
  for (let y = 0; y < h; y++) { const ft = raw[y * (st + 1)], row = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let i = 0; i < st; i++) { const a = i >= bpp ? px[y * st + i - bpp] : 0, u = y ? px[(y - 1) * st + i] : 0, c = i >= bpp && y ? px[(y - 1) * st + i - bpp] : 0;
      let v = row[i]; if (ft === 1) v += a; else if (ft === 2) v += u; else if (ft === 3) v += (a + u) >> 1; else if (ft === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      px[y * st + i] = v & 255; } }
  return { w, h, at: (x, y) => { const k = y * st + x * bpp; return [px[k], px[k + 1], px[k + 2], ct === 6 ? px[k + 3] : 255]; } };
};
const png = f => { const b = fs.readFileSync(path.join(root, f)); assert.equal(b.subarray(1, 4).toString(), 'PNG', f + ' bukan PNG'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

test('manifest: JSON valid, nama merek, ikon ada dan berukuran benar', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Jendela Jasper');
  assert.ok(m.short_name.length <= 12, 'short_name maksimal 12 karakter');
  assert.equal(m.description, 'Monitoring Pencapaian Sales Harian');
  assert.match(m.theme_color, /^#[0-9A-Fa-f]{6}$/); assert.match(m.background_color, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'ada ikon maskable');
  assert.ok(m.icons.some(i => i.purpose === 'any' && i.sizes === '512x512'), 'ada ikon any 512');
  assert.ok(m.icons.some(i => i.purpose === 'any' && i.sizes === '192x192'), 'ada ikon any 192');
  assert.equal(m.icons.find(i => i.purpose === 'maskable').src.split('?')[0], 'assets/brand/ikon-maskable-512.png');
  for (const i of m.icons) {
    const [w, h] = i.sizes.split('x').map(Number), d = png(clean(i.src));
    assert.deepEqual(d, { w, h }, `${i.src} harus ${i.sizes}`);
  }
});

test('ikon PNG: 512, 192, maskable 512, apple-touch 180, favicon 48, 32, 16', () => {
  const want = { 'ikon-192.png': 192, 'ikon-512.png': 512, 'ikon-maskable-512.png': 512, 'apple-touch-icon-180.png': 180, 'favicon-48.png': 48, 'favicon-32.png': 32, 'favicon-16.png': 16, 'ikon-monogram-56.png': 56, 'ikon-monogram-112.png': 112, 'ikon-resmi-1024.png': 1024, 'ikon-monogram.png': 1024 };
  for (const [f, n] of Object.entries(want)) assert.deepEqual(png('assets/brand/' + f), { w: n, h: n }, f);
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/favicon.ico')), 'favicon.ico');
});

test('sumber resmi ada (JPEG persegi >= 2000 px)', () => {
  const b = fs.readFileSync(path.join(root, 'assets/brand/sumber/ikon-resmi-2000.jpg'));
  assert.equal(b[0], 0xFF); assert.equal(b[1], 0xD8);
  let o = 2, w = 0, h = 0;
  while (o < b.length) { const m = b[o + 1], n = b.readUInt16BE(o + 2); if (m >= 0xC0 && m <= 0xC3) { h = b.readUInt16BE(o + 5); w = b.readUInt16BE(o + 7); break; } o += 2 + n; }
  assert.ok(w >= 2000 && w === h, `sumber ${w}x${h}`);
});

test('piksel ikon: sudut ikon any transparan, tengah monogram tidak transparan, maskable penuh putih di tepi', () => {
  for (const f of ['ikon-512.png', 'ikon-192.png']) {
    const d = decode('assets/brand/' + f);
    for (const [x, y] of [[0, 0], [d.w - 1, 0], [0, d.h - 1], [d.w - 1, d.h - 1]]) assert.equal(d.at(x, y)[3], 0, `${f} sudut (${x},${y}) harus transparan`);
    assert.equal(d.at(d.w >> 1, d.h >> 1)[3], 255, f + ' tengah buram');
    assert.equal(d.at(d.w >> 1, 2)[3], 255, f + ' tepi atas tengah buram');
  }
  const mk = decode('assets/brand/ikon-maskable-512.png');
  for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511], [256, 3]]) assert.deepEqual(mk.at(x, y).slice(0, 3), [255, 255, 255], `maskable (${x},${y}) putih penuh`);
  assert.equal(mk.at(256, 256)[3], 255);
  // seluruh monogram (piksel berwarna) di dalam lingkaran zona aman 80% (jari-jari 204,8)
  let far = 0;
  for (let y = 0; y < 512; y += 1) for (let x = 0; x < 512; x += 1) { const p = mk.at(x, y); if (Math.min(p[0], p[1], p[2]) < 200 && Math.hypot(x - 255.5, y - 255.5) > 204.8) far++; }
  assert.equal(far, 0, 'monogram maskable keluar zona aman');
  const ap = decode('assets/brand/apple-touch-icon-180.png');
  assert.equal(ap.at(0, 0)[3], 255, 'apple-touch tanpa transparansi'); assert.deepEqual(ap.at(0, 0).slice(0, 3), [255, 255, 255]);
  const tile = decode('assets/brand/ikon-resmi-1024.png');
  assert.deepEqual(tile.at(60, 512), [255, 255, 255, 255], 'latar ubin putih murni');
});

for (const f of HTML) {
  test(`${f}: rel=icon dan apple-touch-icon menunjuk berkas yang ada, nama baru di title dan meta`, () => {
    const h = read(f);
    const icons = [...h.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)];
    assert.ok(icons.some(i => i[1] === 'icon'), 'rel=icon');
    assert.ok(icons.some(i => i[1] === 'apple-touch-icon'), 'apple-touch-icon');
    for (const i of icons) assert.ok(fs.existsSync(path.join(root, clean(i[2]))), `${f}: ${i[2]} tidak ada`);
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
  for (const f of HTML.slice(0, 5)) { const h = read(f); assert.match(h, new RegExp(`class="lg-logo" src="assets/brand/logo-gelap.png\\?v=2" width="${d.w}" height="${d.h}" alt="Jendela Jasper"`), f); }
});

test('palet resmi (plan 032): token CSS, manifest, theme-color, lembar ikon', () => {
  const css = read('assets/style.css');
  assert.match(css, /--logo-navy:#10365B; --logo-blue:#174C7E; --logo-amber:#F5A623; --logo-gold:#FDBB45; --logo-ivory:#F7F1E5; --logo-gray:#747D87;/);
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.theme_color, '#10365B'); assert.equal(m.background_color, '#FFFFFF');
  for (const f of HTML) assert.match(read(f), /<meta name="theme-color" content="#10365B">/, f);
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/ikon-lembar.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/sumber/lembar-logo-v2.jpg')));
  assert.ok(!fs.existsSync(path.join(root, 'assets/brand/favicon.svg')), 'favicon.svg lama diarsipkan');
});
