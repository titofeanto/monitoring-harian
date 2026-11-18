// Uji browser: Ganti akun / Keluar ada di dasar laci, memakai dialog konfirmasi (bukan window.confirm).
// Batal dan Esc tidak menghapus apa pun; Keluar menjalankan handler logout halaman. Dilewati bila Chrome tidak ada.
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

async function dom(port, page, fx, click) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'out-prof-'));
  try {
    const u = `http://localhost:${port}/${page}.html?fx=${fx}${click ? '&click=' + encodeURIComponent(click) : ''}`;
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--window-size=600,900', '--virtual-time-budget=8000', '--dump-dom', u], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
const tag = (html, id) => { const m = new RegExp('<[^>]*id="' + id + '"[^>]*>').exec(html); return m ? m[0] : ''; };
const hidden = (html, id) => /\shidden(?:[\s=>])/.test(tag(html, id));
const dlgOpen = html => /\sopen(?:[\s=>])/.test(tag(html, 'logoutDlg'));

test('tombol Keluar ada di dasar laci; dialog terbuka; Batal dan Esc tidak keluar; Keluar membuka layar login', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8791, 'light');
  try {
    const html = await dom(8791, 'index', 'mh-demo', '#menuBtn');
    assert.equal((html.match(/id="logoutBtn"/g) || []).length, 1, 'satu tombol logoutBtn');
    assert.match(html, /<div class="side-foot">[\s\S]*id="sideLogout"[\s\S]*Ganti akun \/ Keluar/);
    assert.equal(dlgOpen(html), false);
    assert.doesNotMatch(await fs.promises.readFile(new URL('../../assets/nav.js', import.meta.url), 'utf8'), /window\.confirm|[^.\w]confirm\(/);

    const opened = await dom(8791, 'index', 'mh-demo', '#menuBtn|#sideLogout');
    assert.equal(dlgOpen(opened), true);
    assert.match(opened, /Keluar dari akun ini\?/);
    assert.equal(hidden(opened, 'appScreen'), false);

    const cancel = await dom(8791, 'index', 'mh-demo', '#menuBtn|#sideLogout|#logoutCancel');
    assert.equal(dlgOpen(cancel), false);
    assert.equal(hidden(cancel, 'appScreen'), false, 'Batal: tetap masuk');
    assert.equal(hidden(cancel, 'loginScreen'), true);

    const esc = await dom(8791, 'index', 'mh-demo', '#menuBtn|#sideLogout|key:Escape');
    assert.equal(dlgOpen(esc), false);
    assert.equal(hidden(esc, 'appScreen'), false, 'Esc: tetap masuk');

    const out = await dom(8791, 'index', 'mh-demo', '#menuBtn|#sideLogout|#logoutBtn');
    assert.equal(dlgOpen(out), false);
    assert.equal(hidden(out, 'appScreen'), true, 'Keluar: layar app tersembunyi');
    assert.equal(hidden(out, 'loginScreen'), false, 'Keluar: layar login tampil');
  } finally { srv.close(); }
});
