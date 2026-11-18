// Uji browser: halaman Ranking bersama (plan 019). Semua DT = peringkat gabungan; satu DT = peringkat dalam DT; item Ranking ada di menu semua halaman.
// Dilewati bila Chrome tidak ada.
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

async function dom(port, url) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rank-prof-'));
  try {
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--window-size=1200,900', '--virtual-time-budget=6000', '--dump-dom', `http://localhost:${port}${url}`], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
// [nama, nomor peringkat yang tampil] dari tiap baris daftar utama
const rows = html => { const l = /id="rkList">([\s\S]*?)<\/div><button|id="rkList">([\s\S]*)$/.exec(html); const out = [];
  const re = /<div class="rk(?: pod)?(?: mine)?"><div class="rk-h">(?:<svg[^>]*aria-label="Peringkat (\d+)"|<span class="si rkn off" aria-label="Peringkat (\d+)")[\s\S]*?<div class="nm">([^<]+)/g; let m;
  while ((m = re.exec(l ? l[0] : ''))) out.push([m[3].trim(), +(m[1] || m[2])]); return out; };

test('Semua DT: peringkat gabungan; ketuk DT: hanya DT itu dengan rankDt; ketuk Semua DT: kembali gabungan', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8801, 'light');
  try {
    const all = await dom(8801, '/ranking.html?fx=rank');
    assert.match(all, /<h1[^>]*id="greetBig"[^>]*>Ranking</);
    const a = rows(all);
    assert.deepEqual(a.slice(0, 4), [['Andi Pratama', 1], ['Gita Lestari', 2], ['Hendra Kusuma', 3], ['Budi Santoso', 4]]);   // gabungan DA + DB
    assert.match(all, /DT Anda/);                                  // akun DA: baris DA bertanda
    assert.match(all, /aria-current="page"[^>]*>\s*<svg[^>]*>.*?<\/svg><span class="side-l">Ranking/s);

    const one = await dom(8801, '/ranking.html?fx=rank&click=' + encodeURIComponent('[data-dt="DB"]'));
    const b = rows(one);
    assert.deepEqual(b.slice(0, 3), [['Gita Lestari', 1], ['Hendra Kusuma', 2], ['Indra Gunawan', 3]]);   // rankDt DB, tanpa salesman DA
    assert.ok(b.every(r => !/Andi|Budi|Citra/.test(r[0])));
    assert.ok(!/DT Anda/.test(one.slice(one.indexOf('id="rkList"'))), 'DB bukan DT akun');

    const back = await dom(8801, '/ranking.html?fx=rank&click=' + encodeURIComponent('[data-dt="DB"]|[data-dt=""]'));
    assert.deepEqual(rows(back).slice(0, 2), [['Andi Pratama', 1], ['Gita Lestari', 2]]);
  } finally { srv.close(); }
});

test('menu: item Ranking ada di Great Sales dan Cek Stok; #ranking di Great Sales mengalihkan', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8802, 'light');
  try {
    for (const p of ['/great-sales.html?fx=gs-live#skor', '/cek-stok.html?fx=gs-live']) {
      const html = await dom(8802, p);
      assert.match(html, /<a class="side-i" href="ranking.html"/, p);
    }
    assert.ok(!/data-tab="ranking"|id="tab-ranking"/.test(await dom(8802, '/great-sales.html?fx=gs-live#skor')));
    const red = await dom(8802, '/great-sales.html?fx=rank#ranking');
    assert.match(red, /id="rkCard"/);
  } finally { srv.close(); }
});
