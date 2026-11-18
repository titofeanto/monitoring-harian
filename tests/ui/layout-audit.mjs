// Pemeriksa tata letak semua halaman x lebar x tema (plan 024). Dijalankan manual; satu tes ringan memanggil auditOne.
// Pakai: node tests/ui/layout-audit.mjs [--out berkas.json] [--only halaman] [--widths 390,768] [--themes light,dark]
// Tiap halaman dimuat dalam iframe selebar target (Chrome headless tidak mau lebih sempit dari ~500 px), lalu audit-probe.js mengukur dokumen iframe.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const WIDTHS = [[360, 800], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [1280, 800], [1536, 864]];
export const PAGES = [
  ...['skor', 'fop', 'banded', 'toko', 'asrt', 'ps'].map(t => ({ id: 'gs-' + t, url: `/great-sales.html?fx=dummy-gs-pusat#${t}` })),
  { id: 'rank-total', url: '/ranking.html?fx=dummy-rank' },
  { id: 'rank-sheet', url: '/ranking.html?fx=dummy-rank&click=' + encodeURIComponent('[data-sel="102"]') },
  { id: 'rank-kpi', url: '/ranking.html?fx=dummy-rank&click=' + encodeURIComponent('[data-mode="kpi"]') },
  ...['ring', 'sim', 'fruit'].map(t => ({ id: 'mh-' + t, url: `/index.html?fx=dummy-mh#${t}` })),
  { id: 'stok', url: '/cek-stok.html?fx=dummy-stok' },
  { id: 'hadir', url: '/kehadiran.html?fx=dummy-hadir' },
  { id: 'admin', url: '/admin-status.html?fx=dummy-mh' },
];

export async function auditOne(port, page, w, h, theme) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-prof-'));
  try {
    const u = `http://localhost:${port}/__auditframe?w=${w}&h=${h}&u=${encodeURIComponent(page.url)}`;
    const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + prof, `--window-size=${Math.max(w, 500)},${Math.max(h, 500)}`, '--virtual-time-budget=12000', '--dump-dom', u], { timeout: 90000, maxBuffer: 30e6 });
    const m = stdout.match(/<script type="application\/json" id="audit">([\s\S]*?)<\/script>/);
    if (!m) return { page: page.id, w, h, theme, fail: 'tanpa hasil audit' };
    return { page: page.id, w, h, theme, ...JSON.parse(m[1]) };
  } catch (e) { return { page: page.id, w, h, theme, fail: String(e.message).slice(0, 200) }; }
  finally { fs.rmSync(prof, { recursive: true, force: true }); }
}

const CATS = ['hscroll', 'overflow', 'ellipsis', 'touch', 'small', 'contrast', 'side', 'errs'];
export function count(r, c) { return c === 'hscroll' ? (r.hscroll ? 1 : 0) : c === 'side' ? (r.side && !r.side.ok ? 1 : 0) : (r[c] || []).length; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  const out = opt('--out') || path.join(process.env.TMPDIR || os.tmpdir(), 'layout-audit.json');
  const only = opt('--only'), ws = opt('--widths') ? opt('--widths').split(',').map(Number) : null, themes = (opt('--themes') || 'light,dark').split(',');
  const jobs = [];
  const ports = { light: 8811, dark: 8812 };
  const servers = {};
  for (const t of themes) servers[t] = await startServer(ports[t], t);
  for (const t of themes) for (const p of PAGES) { if (only && !p.id.startsWith(only)) continue; for (const [w, h] of WIDTHS) if (!ws || ws.includes(w)) jobs.push([p, w, h, t]); }
  const results = []; let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < jobs.length) { const [p, w, h, t] = jobs[next++]; results.push(await auditOne(ports[t], p, w, h, t)); process.stderr.write('.'); } }));
  Object.values(servers).forEach(s => s.close());
  results.sort((x, y) => (x.page + x.theme + x.w).localeCompare(y.page + y.theme + y.w, undefined, { numeric: true }));
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const tot = Object.fromEntries(CATS.map(c => [c, results.reduce((s, r) => s + count(r, c), 0)]));
  console.log('\nberkas:', out, '| uji:', results.length, '| gagal:', results.filter(r => r.fail).length);
  console.table(tot);
  const byW = {}; for (const r of results) { byW[r.w] ||= Object.fromEntries(CATS.map(c => [c, 0])); for (const c of CATS) byW[r.w][c] += count(r, c); }
  console.table(byW);
}
