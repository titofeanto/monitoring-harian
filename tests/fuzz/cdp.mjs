// Pengendali Chrome minimal lewat Chrome DevTools Protocol (tanpa dependensi). Dipakai fuzz browser (plan 025).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const hasChrome = fs.existsSync(CHROME);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fz-prof-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise((res, rej) => {
    let buf = ''; const t = setTimeout(() => rej(new Error('Chrome tidak siap')), 20000);
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(buf); if (m) { clearTimeout(t); res(+m[1]); } });
    proc.on('exit', () => rej(new Error('Chrome keluar')));
  });
  const pages = [];
  const browser = {
    port,
    async newPage({ width = 390, height = 844 } = {}) {
      const info = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const p = await openPage(info.webSocketDebuggerUrl, info.id, port);
      await p.setViewport(width, height);
      pages.push(p); return p;
    },
    async close() {
      for (const p of pages) await p.close().catch(() => {});
      proc.kill('SIGKILL');
      await sleep(50); fs.rmSync(prof, { recursive: true, force: true });
    },
  };
  return browser;
}

async function openPage(wsUrl, id, port) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws gagal')); });
  let n = 0; const waiting = new Map(), errors = [], listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push('exception: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text)); }
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    listeners.forEach(f => f(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++n; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  const page = {
    errors, send,
    on: f => listeners.push(f),
    async setViewport(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }); },
    async goto(url) { const loaded = new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired') { r(); } }; listeners.push(f); setTimeout(r, 15000); }); await send('Page.navigate', { url }); await loaded; },
    /** Jalankan ekspresi di halaman; hasil JSON-able. Galat ekspresi dilempar. */
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, ms = 8000) { const t0 = Date.now(); for (;;) { let v; try { v = await page.eval(expr); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return false; await sleep(60); } },
    sleep,
    async close() { try { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${id}`); } catch (e) { /* sudah tertutup */ } },
  };
  return page;
}
