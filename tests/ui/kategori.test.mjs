// Uji browser: halaman Kategori (plan 034). Pivot, buka-tutup, Weekly/Monthly, filter, keadaan kosong dan galat, angka lawan hitungan independen.
// Dilewati bila Chrome tidak ada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './serve.mjs';
import { buildDummy } from '../dummy/dataset.mjs';
import { auditOne, PAGES } from './layout-audit.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const has = fs.existsSync(CHROME);
const skip = !has && 'Chrome tidak ada';

async function dom(port, url, budget = 7000) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'kat-prof-'));
  try {
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--window-size=1200,900', '--virtual-time-budget=' + budget, '--dump-dom', `http://localhost:${port}${url}`], { timeout: 90000, maxBuffer: 30e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
const heads = html => { const t = /<table class="kt-pivot">[\s\S]*?<\/thead>/.exec(html)[0]; return [...t.matchAll(/<th[^>]*scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]); };
const bodyRows = html => (/<table class="kt-pivot">[\s\S]*?<\/table>/.exec(html)[0].match(/<tr class="kt-l\d"/g) || []).length;
const totCells = html => { const r = /<tr class="kt-tot">([\s\S]*?)<\/tr>/.exec(html)[1]; return [...r.matchAll(/<td(?: class="[^"]*")?>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim()); };
const nf0 = v => Math.round(v).toLocaleString('id-ID');

test('halaman termuat: kepala, kolom pivot urut PBI, tanpa galat, menu aktif', { skip }, async () => {
  const srv = await startServer(8831, 'light');
  try {
    const h = await dom(8831, '/kategori.html?fx=dummy-kategori');
    assert.match(h, /Radar Weekly Report/); assert.match(h, /NOV 2026 - WEEK 46/); assert.match(h, /Periode hitung s\/d 15 Nov 2026/);
    assert.deepEqual(heads(h).slice(1), ['ABS FY LY', 'ABS YTD LY', 'ABS YTD TY', 'Contr LY', 'Contr TY', 'Growth SP', 'Growth A2A', 'AVG FY LY', 'AVG SP LY', 'AVG YTD TY', 'RR 13', 'RR 5', 'L3W', 'L2W', 'LW']);
    assert.match(h, /aria-current="page"[^>]*>\s*<svg[^>]*>.*?<\/svg><span class="side-l">Dashboard Performa/s);
    assert.ok(!/id="__errs"/.test(h));
    assert.match(h, /Stok gudang per kategori/); assert.match(h, /belum tersedia/);
  } finally { srv.close(); }
});

test('buka-tutup baris mengubah jumlah baris; Weekly/Monthly mengganti header L3W/L3M', { skip }, async () => {
  const srv = await startServer(8832, 'light');
  try {
    const click = s => '&click=' + encodeURIComponent(s);
    const base = bodyRows(await dom(8832, '/kategori.html?fx=dummy-kategori'));
    assert.equal(base, 4 + 8, 'empat division terbuka, delapan category');
    const closed = bodyRows(await dom(8832, '/kategori.html?fx=dummy-kategori' + click('.kt-ex[data-k="d:FOODS"]')));
    assert.equal(closed, base - 2);
    const opened = bodyRows(await dom(8832, '/kategori.html?fx=dummy-kategori' + click('.kt-ex[data-k^="c:FOODS"][data-k$="Minuman"]')));
    assert.equal(opened, base + 2);   // Minuman punya dua brand
    const m = await dom(8832, '/kategori.html?fx=dummy-kategori' + click('[data-basis="monthly"]'));
    assert.match(m, /Radar Monthly Report/); assert.deepEqual(heads(m).slice(-3), ['L3M', 'L2M', 'LM']);
  } finally { srv.close(); }
});

test('filter Category mempersempit By Outlet', { skip }, async () => {
  const srv = await startServer(8833, 'light');
  try {
    const all = bodyRows(await dom(8833, '/kategori.html?fx=dummy-kategori#byout'));
    const one = bodyRows(await dom(8833, '/kategori.html?fx=dummy-kategori&set=ktCat%3DPerawatan%20Mulut#byout'));
    assert.ok(one > 0 && one < all, `${one} < ${all}`);
    const h = await dom(8833, '/kategori.html?fx=dummy-kategori&set=ktCat%3DPerawatan%20Mulut#byout');
    assert.match(h, /Salesman \/ Outlet/);
  } finally { srv.close(); }
});

test('angka pivot sama dengan hitungan independen dari tab dummy (ABS YTD TY, FY LY, Growth A2A, RR 13)', { skip }, async () => {
  const ds = buildDummy({ seed: 2026 }), B = ds.pusat.GS_KAT_BULAN.slice(1), W = ds.pusat.GS_KAT_MINGGU.slice(1);
  const sum = (rows, f, i) => rows.filter(f).reduce((s, r) => s + r[i], 0);
  const ty = sum(B, r => r[0].startsWith('2026'), 6) + sum(W, r => r[0] >= '2026-11-01' && r[1] <= '2026-11-15', 7);
  const fy = sum(B, r => r[0].startsWith('2025'), 6);
  const r13 = sum(W, r => r[0] >= '2026-08-17' && r[1] <= '2026-11-15', 7);
  const avgTy = ty / 319 * 7, avgFy = fy / 365 * 7, a2a = avgTy / avgFy - 1;
  const srv = await startServer(8834, 'light');
  try {
    const c = totCells(await dom(8834, '/kategori.html?fx=dummy-kategori'));
    assert.equal(c[0], nf0(fy)); assert.equal(c[2], nf0(ty));
    assert.equal(c[7], (a2a < 0 ? '▼ ' : '▲ ') + (Math.abs(a2a) * 100).toFixed(1).replace('.', ',') + '%');
    assert.equal(c[13], nf0(r13 / 13));   // indeks termasuk kolom spasi
  } finally { srv.close(); }
});

test('keadaan kosong menyebut tab; galat jaringan menampilkan pesan dengan jalan keluar', { skip }, async () => {
  const srv = await startServer(8835, 'light');
  try {
    const e = await dom(8835, '/kategori.html?fx=dummy-kategori-kosong');
    assert.match(e, /Data Kategori belum diisi/); assert.match(e, /GS_KAT_MINGGU/); assert.match(e, /docs\/format-data-kategori\.md/);
    assert.ok(!/<table class="kt-pivot">/.test(e));
    const g = await dom(8835, '/kategori.html?fx=tidak-ada', 20000);
    assert.match(g, /Tidak bisa terhubung/); assert.match(g, /id="bootRetry"/);
  } finally { srv.close(); }
});

test('akun DT: hanya DT sendiri, tanpa filter distributor', { skip }, async () => {
  const srv = await startServer(8836, 'light');
  try {
    const h = await dom(8836, '/kategori.html?fx=dummy-kategori-tmk');
    assert.ok(!/id="ktDt"/.test(h)); assert.ok(!/Sorong/.test(h)); assert.match(h, /Dummy Timika/);
  } finally { srv.close(); }
});

test('data dari Sheet di-escape: nama toko berisi HTML tampil sebagai teks', { skip }, async () => {
  const srv = await startServer(8837, 'light');
  try {
    const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/dummy-kategori.json', import.meta.url), 'utf8'));
    fx.tokos[0].nama = '<img src=x onerror=alert(1)>'; fx.brands[0].brand = '"><script>window.__x=1</script>';
    const f = new URL('./fixtures/zz-kategori-xss.json', import.meta.url);
    fs.writeFileSync(f, JSON.stringify(fx));
    try {
      const h = await dom(8837, '/kategori.html?fx=zz-kategori-xss#byout');
      assert.ok(!/<img src=x/.test(h)); assert.ok(!/window\.__x=1<\/script>"/.test(h.replace(/<script[\s\S]*?<\/script>/g, '')));
      assert.match(h, /&lt;img src=x onerror/);
    } finally { fs.rmSync(f, { force: true }); }
  } finally { srv.close(); }
});

test('tanpa gulir mendatar di level halaman: 360, 390, 768, 1280 (tiap tab)', { skip }, async () => {
  const srv = await startServer(8838, 'light');
  try {
    const runs = [];
    for (const id of ['kat-bycat', 'kat-byout', 'kat-insight', 'kat-logika']) for (const [w, h] of [[360, 800], [390, 844], [768, 1024], [1280, 800]]) runs.push(auditOne(8838, PAGES.find(p => p.id === id), w, h, 'light'));
    for (const r of await Promise.all(runs)) {
      assert.equal(r.fail, undefined, r.page + ' ' + r.w + ': ' + r.fail);
      assert.equal(r.hscroll, false, `${r.page} ${r.w}: gulir mendatar (${r.scrollWidth})`);
      assert.deepEqual(r.overflow, [], `${r.page} ${r.w}: elemen keluar layar`);
      assert.deepEqual(r.errs, [], `${r.page} ${r.w}: galat konsol`);
    }
  } finally { srv.close(); }
});
