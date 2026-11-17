// Tangkapan layar halaman lewat Chrome headless dengan data fixture.
// Pakai: node tests/ui/shot.mjs <halaman> <tab> [fx=gs-live] [lebar=390] [tema=light|dark] [tinggi=1800]
// Hasil: $TMPDIR/shots/<halaman>-<tab>-<lebar>-<tema>[-<fx>].png
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const [page, tab = 'skor', fx = 'gs-live', width = '390', theme = 'light', height = '1800'] = process.argv.slice(2);
if (!page) { console.error('pakai: node tests/ui/shot.mjs <halaman> <tab> [fx] [lebar] [tema] [tinggi]'); process.exit(2); }
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = path.join(process.env.TMPDIR || os.tmpdir(), 'shots');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${page}-${tab}-${width}-${theme}${fx === 'gs-live' ? '' : '-' + fx}.png`);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-prof-'));
const srv = await startServer(8780, theme);
try {
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + prof, `--window-size=${Math.max(+width, 500)},${height}`, '--virtual-time-budget=6000', '--hide-scrollbars', '--screenshot=' + out];
  const target = `/${page}.html?fx=${fx}#${tab}`;
  args.push(+width < 500 ? `http://localhost:8780/__frame?w=${width}&h=${height}&u=${encodeURIComponent(target)}` : 'http://localhost:8780' + target);
  await promisify(execFile)(CHROME, args, { timeout: 60000 });
  console.log(out, fs.statSync(out).size + ' bytes');
} finally {
  srv.close();
  fs.rmSync(prof, { recursive: true, force: true });
}
