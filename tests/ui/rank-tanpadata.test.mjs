// Uji browser (plan 030): KPI tanpa data di lembar detail DSR tampil abu "Belum ada data", bukan 0% atau NaN.
// Fixture: dummy-rank-tanpadata (tanpa GS_TREND_ASRT = Assortment kosong semua DSR; DSR 202 tanpa PS).
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
const PORT = 8881;
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/dummy-rank-tanpadata.json', import.meta.url), 'utf8'));

async function dom(url, w = 1000) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rtd-prof-'));
  try {
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, `--window-size=${w},900`, '--virtual-time-budget=8000', '--dump-dom', `http://localhost:${PORT}${url}`], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
const sheetOf = h => { const i = h.indexOf('id="rkSheet"'); assert.ok(i > 0, 'lembar detail terbuka'); return h.slice(i, h.indexOf('sheet-scrim', i)); };
const sel = k => '&click=' + encodeURIComponent('[data-sel="' + k + '"]');

test('fixture: Assortment tanpaData semua DSR, PS tanpaData hanya DSR 202', () => {
  assert.ok(fx.total.rows.every(r => r.kpi.asrt.tanpaData && r.kpi.asrt.pct === null));
  assert.deepEqual(fx.total.rows.filter(r => r.kpi.ps.tanpaData).map(r => r.kode), ['202']);
});

test('lembar detail: KPI kosong abu "Belum ada data", tanpa 0% atau NaN; skor total tetap tampil (4 KPI)', { skip: !has && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(PORT, 'light');
  try {
    const s = sheetOf(await dom('/ranking.html?fx=dummy-rank-tanpadata' + sel('101')));
    assert.equal((s.match(/Belum ada data/g) || []).length, 1);          // hanya Assortment
    assert.match(s, /class="nodata">Belum ada data</);
    assert.ok(!/NaN|undefined|null/.test(s), 'tanpa NaN/undefined/null');
    assert.match(s, /Assortment/);
    const asrt = s.slice(s.indexOf('id="sh-asrt'), s.indexOf('id="sh-asrt') + 700);
    assert.ok(!/\b0%/.test(asrt), 'Assortment tidak 0%');
    assert.match(s, /\d+,\d/);                                            // skor total tampil
    const t = sheetOf(await dom('/ranking.html?fx=dummy-rank-tanpadata' + sel('202')));
    assert.equal((t.match(/Belum ada data/g) || []).length, 2);          // PS dan Assortment
    assert.ok(!/NaN|undefined|null/.test(t));
  } finally { srv.close(); }
});
