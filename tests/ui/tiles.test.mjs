// Uji browser (plan 030): wadah .kpis/.tiles dengan 3-8 tile tidak menyisakan slot kosong di 390, 768, 1280.
// Jumlah tile disuntik ke wadah dengan kelas CSS asli (tests/ui/tiles-harness.html); fixture Ringkasan asli hanya menghasilkan 3 tile.
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
const PORT = 8882;

async function measure(n, cls, w) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'tile-prof-'));
  try {
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--window-size=1300,900', '--virtual-time-budget=4000', '--dump-dom', `http://localhost:${PORT}/tests/ui/tiles-harness.html?n=${n}&cls=${cls}&w=${w}`], { timeout: 60000, maxBuffer: 20e6 });
    const m = /<pre id="res">(\{.*?\})<\/pre>/.exec(stdout.slice(stdout.lastIndexOf('<pre id="res"')));
    assert.ok(m, `n=${n} ${cls} ${w}: hasil tidak ada`);
    return JSON.parse(m[1]);
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}

test('3 sampai 8 tile terisi penuh di tiap baris (kiri dan kanan rata) di 390, 768, 1280', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const jobs = [];   // .tiles belum dipakai di markup mana pun, jadi hanya .kpis
    for (const cls of ['kpis']) for (const w of [390, 768, 1280]) for (const n of [3, 4, 5, 6, 7, 8]) jobs.push([cls, w, n]);
    const out = [];
    for (let i = 0; i < jobs.length; i += 6) out.push(...await Promise.all(jobs.slice(i, i + 6).map(([cls, w, n]) => measure(n, cls, w).then(r => [cls, w, n, r]))));
    for (const [cls, w, n, r] of out) {
      const id = `${cls} lebar ${w} n=${n}`;
      assert.equal(r.hscroll, false, id + ': gulir mendatar');
      assert.ok(r.rows.every(x => x.minW >= 90), id + ': tile terlalu sempit ' + JSON.stringify(r.rows));
      assert.ok(r.rows.every(x => Math.abs(x.left) < 1.5 && Math.abs(x.right) < 1.5), id + ': ada slot kosong ' + JSON.stringify(r.rows));
    }
  } finally { srv.close(); }
});
