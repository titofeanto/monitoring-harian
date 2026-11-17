// Server uji tampilan: menyajikan akar repo di http://localhost:8780 tanpa dependensi.
// Untuk halaman HTML, skrip di awal <head> mengalihkan SEMUA panggilan fetch ke script.google.com ke berkas
// fixture lokal (?fx=nama, bawaan gs-live), jadi uji tidak pernah menyentuh Apps Script produksi.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8780;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const STUB = `<script>
localStorage.setItem('mh_code', 'demo'); localStorage.removeItem('mh_gs_cache'); localStorage.removeItem('mh_gs_tab');
const FX = '/tests/ui/fixtures/' + (new URLSearchParams(location.search).get('fx') || 'gs-live') + '.json';
const of = window.fetch;
window.fetch = (u, o) => String(u).includes('script.google.com') ? of(FX) : of(u, o);
// ?click=<selector>: ketuk elemen itu sekali setelah halaman terisi (untuk memotret modal dsb.)
const CLICK = new URLSearchParams(location.search).get('click');
if (CLICK) { let n = 0; const t = setInterval(() => { const el = document.querySelector(CLICK); if (el || ++n > 40) { clearInterval(t); if (el) el.click(); } }, 150); }
</script>`;

// theme 'light' | 'dark' memaksa tema lewat penulisan ulang CSS (Chrome headless mengikuti tema sistem, bukan pengaturan blink).
export function startServer(port = PORT, theme = '') {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Chrome headless tidak mau lebih sempit dari ~500 px; halaman lebar HP dibungkus iframe supaya media query memakai lebar sebenarnya.
    if (url.pathname === '/__frame') {
      const w = +url.searchParams.get('w') || 390, h = +url.searchParams.get('h') || 1800, u = url.searchParams.get('u') || '/';
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888"><iframe src="' + u.replace(/"/g, '') + '" width="' + w + '" height="' + h + '" style="border:0;display:block"></iframe>');
      return;
    }
    let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('tidak ada'); return; }
    let body = fs.readFileSync(file);
    const ext = path.extname(file);
    if (ext === '.html') body = Buffer.from(body.toString('utf8').replace(/<head>/i, '<head>' + STUB));
    if (ext === '.css' && theme) body = Buffer.from(body.toString('utf8').split('@media (prefers-color-scheme:dark)').join(theme === 'dark' ? '@media all' : '@media not all'));
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise(ok => srv.listen(port, () => ok(srv)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(() => console.log('http://localhost:' + PORT));
}
