// Uji browser: papan Total di halaman Ranking (plan 023): urutan, nilai kembar, lembar detail, Esc, Per KPI, chip DT, tanpa gulir mendatar.
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
const PORT = 8803;

async function dom(url, w = 1000) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-prof-'));
  try {
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, `--window-size=${w},900`, '--virtual-time-budget=8000', '--dump-dom', `http://localhost:${PORT}${url}`], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
const list = html => { const i = html.indexOf('id="rkList"'); const seg = i < 0 ? '' : html.slice(i, html.indexOf('rk-side aft', i));
  const out = []; const re = /<div class="rk tap rk-total[^"]*"[^>]*data-sel="(\d+)"[\s\S]*?aria-label="Peringkat (\d+)"[\s\S]*?<div class="nm">([^<]+)/g; let m;
  while ((m = re.exec(seg))) out.push([m[3].trim(), +m[2]]); return out; };
const click = (...s) => '&click=' + encodeURIComponent(s.join('|'));

test('Total: urut skor, nilai kembar berbagi nomor, titik KPI, chip DT memakai rankDt', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const h = await dom('/ranking.html?fx=dummy-rank');
    assert.match(h, /data-mode="total" aria-pressed="true"/);
    const a = list(h);
    assert.equal(a.length, 5);
    assert.deepEqual(a.map(r => r[1]), [1, 1, 3, 4, 5]);                      // dua DSR kembar sama-sama peringkat 1
    assert.deepEqual(a.slice(2).map(r => r[0]), ['Salesman Timika 2', 'Salesman Timika 3', 'Salesman Sorong 2']);
    assert.equal((h.match(/class="kdots"/g) || []).length >= 5, true);
    assert.match(h, /Belum diperingkat \(kurang dari 8 toko\)/);              // DSR 203 di lipatan
    const one = list(await dom('/ranking.html?fx=dummy-rank' + click('[data-dt="D02"]')));
    assert.deepEqual(one.map(r => r[1]), [1, 2]);                              // rankDt: Sorong 1 lalu Sorong 2
    assert.deepEqual(one.map(r => r[0]), ['Salesman Sorong 1', 'Salesman Sorong 2']);
  } finally { srv.close(); }
});

test('Ketuk baris membuka lembar dengan lima KPI; Esc menutup; Per KPI menampilkan papan lama', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const open = await dom('/ranking.html?fx=dummy-rank' + click('[data-sel="102"]'), 800);
    assert.match(open, /<aside class="sheet card open" id="rkSheet" role="dialog" aria-labelledby="shT"/);
    assert.match(open, /<h2 id="shT">Salesman Timika 2/);
    for (const n of ['Perfect Store', 'Weekly FOP', 'Assortment', 'Banded', 'R2G']) assert.ok(open.includes(n), n);
    assert.equal((open.match(/class="kpi-row/g) || []).length, 5);
    assert.match(open, /#3 dari 5/);
    assert.match(open, /Selisih ke peringkat di atas<\/small><b>\+7,3 poin/);
    assert.match(open, /toko tanpa baseline/);
    assert.match(open, /Poin paling menentukan/);
    const closed = await dom('/ranking.html?fx=dummy-rank' + click('[data-sel="102"]', 'key:Escape'), 800);
    assert.match(closed, /<aside class="sheet card" id="rkSheet"/);            // tanpa kelas open
    const kpi = await dom('/ranking.html?fx=dummy-rank' + click('[data-mode="kpi"]'), 800);
    assert.match(kpi, /data-mode="kpi" aria-pressed="true"/);
    assert.match(kpi, /id="rkBu"/);
  } finally { srv.close(); }
});

test('DSR belum diperingkat: lembar tetap bisa dibuka', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const h = await dom('/ranking.html?fx=dummy-rank' + click('.rk-side.aft summary', '[data-sel="203"]'), 800);
    assert.match(h, /<h2 id="shT">Salesman Sorong 3/);
    assert.match(h, /belum diperingkat/);
  } finally { srv.close(); }
});

test('tanpa gulir mendatar di 390, 768, 1280', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const u = '/ranking.html?fx=dummy-rank&probe=1' + click('[data-sel="101"]');
    const sw = html => /data-sw="(\d+)\/(\d+)"/.exec(html).slice(1).map(Number);
    const f = sw(await dom('/__frame?w=390&h=1600&u=' + encodeURIComponent(u), 500)); assert.ok(f[0] <= f[1], '390: ' + f);
    for (const w of [768, 1280]) { const r = sw(await dom(u, w)); assert.ok(r[0] <= r[1], w + ': ' + r); }
  } finally { srv.close(); }
});
