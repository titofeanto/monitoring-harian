// Uji skala browser (plan 025): data besar (2.000 salesman, 5.000 toko) harus tampil tanpa galat dan dalam batas waktu.
// Pakai: node tests/fuzz/scale.browser.mjs [--sales 2000] [--stores 5000]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer, okResponse } from './fuzzserve.mjs';
import { PAGES } from './browser.fuzz.mjs';

/** Gandakan elemen larik sampai `n`, dengan kode unik supaya tidak bentrok. Mengubah string yang berakhir angka/kode. */
const grow = (arr, n, fix) => { if (!arr || !arr.length) return arr || []; const out = []; for (let i = 0; i < n; i++) { const o = structuredClone(arr[i % arr.length]); fix(o, i); out.push(o); } return out; };

export function bigRank(rk, sales) {
  const o = structuredClone(rk);
  const mk = rows => rows.length ? grow(rows, sales, (r, i) => { if (r.kode) r.kode = String(1000 + i); if (r.nama) r.nama = 'Salesman Besar ' + i; r.rank = i + 1; r.rankDt = i + 1; }) : rows;
  Object.values(o.bu).forEach(b => ['fop', 'banded', 'asrt'].forEach(k => { b[k] = mk(b[k]); }));
  if (o.total && o.total.rows) o.total.rows = mk(o.total.rows);
  return o;
}
export function bigGs(gs, stores) {
  const o = structuredClone(gs);
  (o.mon.perDt || []).forEach(d => { if (!d.groups) return; ['SPM', 'MINIS'].forEach(g => { d.groups[g] = grow(d.groups[g], Math.round(stores / 2), (r, i) => { r.outlet_kode = 'B' + (10000 + i); r.outlet_nama = 'Toko Besar ' + i; }); }); });
  o.outlets = grow(o.outlets, stores, (r, i) => { if (r.outlet_kode) r.outlet_kode = 'B' + (20000 + i); if (r.outlet_nama) r.outlet_nama = 'Toko Besar ' + i; });
  o.ps.stores = grow(o.ps.stores, stores, (r, i) => { r.outlet_kode = 'B' + (30000 + i); r.outlet_nama = 'Toko PS Besar ' + i; });
  return o;
}

export function bigHadir(h, sales) {
  const o = structuredClone(h), base = o.sales.filter(x => x[0] === 'D01'), rows = o.rows.filter(r => r[0] === 'D01' && r[1] === base[0][1]);
  const ids = Array.from({ length: sales }, (_, i) => String(5000 + i));
  o.sales = o.sales.concat(ids.map(id => ['D01', id, 'Salesman Besar ' + id]));
  o.rows = o.rows.concat(ids.flatMap(id => rows.map(r => ['D01', id, r[2], r[3], r[4], r[5]])));
  return o;
}
export function bigStok(st, n) {
  const o = structuredClone(st);
  o.harga = grow(o.harga, n, (r, i) => { r.sku = String(800000 + i); r.bc = '899' + (1000000 + i); r.nama = 'Barang Besar ' + i; });
  o.stok = grow(o.stok, n, (r, i) => { r[1] = String(800000 + i); });
  o.jual = grow(o.jual, n, (r, i) => { r[1] = String(800000 + i); });
  return o;
}

export async function runScale(browser, server, { sales = 2000, stores = 5000, maxMs = 12000 } = {}) {
  const found = [];
  const cases = [
    ['ranking', 'ranking', q => bigRank(okResponse(q), sales)],
    ['great-sales', 'great-sales', q => bigGs(okResponse(q), stores)],
    ['kehadiran', 'kehadiran', q => bigHadir(okResponse(q), sales)],
    ['cek-stok', 'cek-stok', q => bigStok(okResponse(q), stores)],
  ];
  for (const [id, , make] of cases) {
    const def = PAGES.find(p => p.id === id), sc = 'scale|' + id;
    server.scenarios.set(sc, q => (q.get('view') === 'status' ? { body: okResponse(q) } : { body: make(q) }));
    const page = await browser.newPage();
    const t0 = Date.now();
    await page.goto(`${server.fresh()}/${def.file}?sc=${encodeURIComponent(sc)}&fast=1&ls=${encodeURIComponent(JSON.stringify({ mh_code: def.code }))}`);
    const ok = await page.waitFor("(function(){var a=document.getElementById('appScreen');return a&&!a.hidden&&document.body.innerText.length>300})()", maxMs + 5000);
    const ms = Date.now() - t0;
    if (!ok) found.push({ page: id, rule: 'tidak tampil dalam batas', detail: ms + ' ms' });
    else if (ms > maxMs) found.push({ page: id, rule: 'lambat', detail: ms + ' ms (> ' + maxMs + ')' });
    // interaksi berat: pindah tab, cari
    for (const t of def.tabs) { const t1 = Date.now(); await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(t)});if(e)e.click()})()`).catch(() => {}); await page.sleep(50); const d = Date.now() - t1; if (d > 3000) found.push({ page: id, rule: 'pindah tab lambat', detail: t + ' ' + d + ' ms' }); }
    page.errors.forEach(e => found.push({ page: id, rule: 'galat konsol', detail: e.slice(0, 200) }));
    found.push({ page: id, rule: 'info', detail: 'tampil ' + ms + ' ms', info: true });
    await page.close();
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!hasChrome) { console.log('Chrome tidak ada'); process.exit(0); }
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? +a[i + 1] : d; };
  const server = await startFuzzServer(8845), browser = await launch();
  const found = await runScale(browser, server, { sales: opt('--sales', 2000), stores: opt('--stores', 5000) });
  await browser.close(); server.close();
  found.forEach(f => console.log((f.info ? 'info ' : 'TEMUAN ') + f.page + ' :: ' + f.rule + ' :: ' + f.detail));
  process.exit(found.some(f => !f.info) ? 1 : 0);
}
