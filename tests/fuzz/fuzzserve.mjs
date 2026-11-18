// Server uji fuzz browser (plan 025): menyajikan repo, mengarahkan semua fetch ke script.google.com ke /__api yang
// berperilaku sesuai "skenario" (respons rusak, lambat, terputus), dan mencatat setiap permintaan.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/ui/fixtures', f + '.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
import { loadGs } from '../helpers/load-gs.mjs';
import { buildDummy } from '../dummy/dataset.mjs';
import { makeSpreadsheetApp } from '../dummy/fakeSpreadsheet.mjs';
let RAW_SRG = null;
/** Data mentah DT Sorong (D02) dari kode server asli; fixture dummy-mh.json hanya memuat Timika. */
function rawSrg() {
  if (RAW_SRG) return RAW_SRG;
  const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
  class FD extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const ds = buildDummy({ seed: 2026 });
  const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FD } });
  return (RAW_SRG = JSON.parse(ctx.doGet({ parameter: { code: 'dummy-dt-srg' } }).getContent()));
}
export const CODES = { pusat: 'dummy-pusat', tmk: 'dummy-dt-tmk', srg: 'dummy-dt-srg' };

/** Respons "normal" seperti server asli, dari fixture dummy. */
export function okResponse(q) {
  const code = (q.get('code') || '').trim(), view = q.get('view') || '', dt = q.get('dt') || '';
  if (view === 'status') return { mode: 'status', aktif: false, blokir: false, judul: '', pesan: '', ts: '' };
  if (!code) return { error: 'missing_code' };
  const who = Object.entries(CODES).find(([, v]) => v === code);
  if (!who) return { error: 'invalid_code' };
  if (view === 'gs') return FX(who[0] === 'pusat' ? (dt === 'D02' ? 'dummy-gs-srg' : dt === 'D01' ? 'dummy-gs-tmk' : 'dummy-gs-pusat') : who[0] === 'tmk' ? 'dummy-gs-tmk' : 'dummy-gs-srg');
  if (view === 'rank') return FX('dummy-rank');
  if (view === 'stok') return FX('dummy-stok');
  if (view === 'hadir') return FX('dummy-hadir');
  if (who[0] === 'pusat' && !dt) return { mode: 'pusat', dts: [{ kode: 'D01', nama: 'Dummy Timika' }, { kode: 'D02', nama: 'Dummy Sorong' }] };
  return who[0] === 'srg' || dt === 'D02' ? rawSrg() : FX('dummy-mh');
}

const STUB = `<script>
(function () {
  var q = new URLSearchParams(location.search), sc = q.get('sc') || 'ok';
  try { if (q.get('nols') === '1') Object.defineProperty(window, 'localStorage', { get: function () { throw new DOMException('akses ditolak', 'SecurityError'); } });
    else if (q.get('nols') === '2') Storage.prototype.setItem = function () { throw new DOMException('penuh', 'QuotaExceededError'); };
    if (q.get('noidb') === '1') Object.defineProperty(window, 'indexedDB', { get: function () { throw new DOMException('akses ditolak', 'SecurityError'); } }); } catch (e) {}
  try { if (!sessionStorage.getItem('__fz')) { sessionStorage.setItem('__fz', '1'); var ls = q.get('ls'); if (ls) { var o = JSON.parse(ls); Object.keys(o).forEach(function (k) { localStorage.setItem(k, o[k]); }); } } } catch (e) {}
  if (q.get('fast')) { var st = window.setTimeout; window.setTimeout = function (f, ms) { return st.apply(window, [f, ms > 300 ? ms / 40 : ms].concat([].slice.call(arguments, 2))); }; }
  var of = window.fetch;
  window.fetch = function (u, o) {
    var s = String(u && u.url || u);
    if (s.indexOf('script.google.com') >= 0) { var i = s.indexOf('?'); return of('/__api?sc=' + encodeURIComponent(sc) + '&' + (i >= 0 ? s.slice(i + 1) : ''), o && o.method === 'POST' ? o : undefined); }
    if (s.indexOf('http') === 0 && s.indexOf(location.origin) !== 0) return Promise.reject(new TypeError('Failed to fetch'));
    return of(u, o);
  };
})();
</script>`;

export async function startFuzzServer(port) {
  const scenarios = new Map(), hits = new Map(), log = [];
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__api') {
      const sc = url.searchParams.get('sc') || 'ok', q = new URLSearchParams(url.searchParams); q.delete('sc');
      const n = (hits.get(sc) || 0) + 1; hits.set(sc, n); log.push({ sc, n, method: req.method, q: q.toString(), t: Date.now() });
      let h = scenarios.get(sc); if (!h) h = () => ({ body: okResponse(q) });
      let out; try { out = await h(q, n, req); } catch (e) { out = { status: 500, body: 'handler galat ' + e.message }; }
      if (out.drop) { req.socket.destroy(); return; }
      if (out.delay) await new Promise(r => setTimeout(r, out.delay));
      const body = typeof out.body === 'string' ? out.body : JSON.stringify(out.body);
      res.writeHead(out.status || 200, { 'content-type': out.ct || 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
      res.end(body); return;
    }
    let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('tidak ada'); return; }
    let body = fs.readFileSync(file); const ext = path.extname(file);
    if (ext === '.html') body = Buffer.from(body.toString('utf8').replace(/<head>/i, '<head>' + STUB));
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  await new Promise(ok => srv.listen(port, ok));
  return { port, srv, scenarios, hits, log, base: 'http://localhost:' + port, close: () => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(); } };
}
