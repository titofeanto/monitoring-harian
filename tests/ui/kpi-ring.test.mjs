// Uji helper cincin/baris KPI (tanpa DOM) dan uji browser: ketuk panah membuka rincian. Browser dilewati bila Chrome tidak ada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './serve.mjs';

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../../assets/util.js', import.meta.url), 'utf8'), ctx);
const { ring, toneOf, kpiRow, barItem } = ctx.window.MHUtil;

test('ring: persen di luar 0-100 dibatasi untuk gambar, label teks memakai angka asli', () => {
  const r = ring(1.25, 'ok', 'FOP');
  assert.match(r, />125%</);
  assert.match(r, /aria-label="FOP: 125%"/);
  const C = 2 * Math.PI * 42;
  assert.ok(r.includes(`stroke-dasharray="${C.toFixed(1)} ${C.toFixed(1)}"`));
  assert.ok(ring(-0.2, 'bad', 'x').includes('stroke-dasharray="0.0 '));
  assert.match(ring(0.456, 'mid', 'x'), />46%</);
});
test('ring: NaN atau bukan angka tidak menggambar cincin', () => {
  assert.equal(ring(NaN, 'ok', 'x'), '');
  assert.equal(ring(undefined, 'ok', 'x'), '');
});
test('toneOf: kelas yang ada dipakai, bila tidak hijau hanya >= 100%', () => {
  assert.equal(toneOf(0.5, 'okc'), 'ok');
  assert.equal(toneOf(0.9, 'amb'), 'mid');
  assert.equal(toneOf(1, ''), 'ok');
  assert.equal(toneOf(0.99, ''), 'bad');
  assert.equal(toneOf(NaN, 'okc'), '');
});
test('kpiRow: tanpa target tidak ada cincin dan panah; dengan rincian ada tombol aria-expanded', () => {
  const a = kpiRow({ id: 'a', name: 'X', p: NaN, big: '5', detail: '<i>d</i>' });
  assert.doesNotMatch(a, /class="ring"|kpi-toggle/);
  const b = kpiRow({ id: 'b', name: 'Y', p: 0.5, tone: 'bad', big: '5', target: '10', sisa: '5', detail: barItem({ name: 'BU', p: 0.5, tone: 'bad', sisa: '1', left: '1', right: '2' }) });
  assert.match(b, /aria-expanded="false"/);
  assert.match(b, /aria-controls="kd-b"/);
  assert.match(b, /id="kd-b" hidden/);
  assert.match(b, /Sisa Target 5/);
});

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function dom(port, click) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-prof-'));
  try {
    const u = `http://localhost:${port}/great-sales.html?fx=gs-live${click ? '&click=' + encodeURIComponent(click) : ''}#skor`;
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, '--virtual-time-budget=6000', '--dump-dom', u], { timeout: 60000, maxBuffer: 20e6 });
    return stdout;
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}
test('ketuk panah KPI membuka rincian dan mengubah aria-expanded', { skip: !fs.existsSync(CHROME) && 'Chrome tidak ada' }, async () => {
  const srv = await startServer(8789, 'light');
  try {
    const before = await dom(8789, '');
    assert.match(before, /data-kt="sk-FOP_SPM" aria-expanded="false"/);
    assert.match(before, /id="kd-sk-FOP_SPM" hidden/);
    const after = await dom(8789, '[data-kt="sk-FOP_SPM"]');
    assert.match(after, /data-kt="sk-FOP_SPM" aria-expanded="true"/);
    assert.doesNotMatch(after, /id="kd-sk-FOP_SPM" hidden/);
  } finally { srv.close(); }
});
