// Uji browser: klik judul kolom tabel mengubah urutan baris (tabel Riwayat rank di Great Sales). Dilewati bila Chrome tidak ada.
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

async function dom(port, click) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sort-prof-'));
  try {
    const u = `http://localhost:${port}/great-sales.html?fx=gs-live${click ? '&click=' + encodeURIComponent(click) : ''}#skor`;
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--virtual-time-budget=6000', '--dump-dom', u], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
const firstCells = html => { const m = /id="secHist"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html); return m ? [...m[1].matchAll(/<tr[^>]*><td[^>]*>([^<]*)</g)].map(x => x[1]) : []; };

test('klik judul kolom Tanggal mengurutkan ulang baris dan mengisi aria-sort', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8781, 'light');
  try {
    const a = firstCells(await dom(8781, ''));
    const bHtml = await dom(8781, '#secHist th button[data-srt="0"]');
    const b = firstCells(bHtml);
    assert.equal(a.length, 2);
    assert.deepEqual(b, a.slice().reverse());
    assert.match(bHtml, /aria-sort="ascending"/);
  } finally { srv.close(); }
});
