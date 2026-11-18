// Uji skala server (plan 025): DMS diperbesar sampai N baris per DT; setiap respons harus selesai < 3 detik.
import { loadGs } from '../helpers/load-gs.mjs';
import { buildDummy, ACCESS } from '../dummy/dataset.mjs';
import { makeSpreadsheetApp } from '../dummy/fakeSpreadsheet.mjs';
import { walk } from './server.fuzz.mjs';

const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } static [Symbol.hasInstance](x) { return Object.prototype.toString.call(x) === '[object Date]'; } }   // Date dari sel mutasi berasal dari realm lain (vm): instanceof harus tetap benar

/** Perbesar DMS_EXTRACT tiap DT jadi `rows` baris (baris asli diulang; tanggal dan qty tetap). */
export function scaledDataset(rows) {
  const ds = buildDummy({ seed: 2026 });
  Object.values(ds.dts).forEach(d => {
    const head = d.DMS_EXTRACT[0], body = d.DMS_EXTRACT.slice(1), out = [head];
    for (let i = 0; out.length <= rows; i++) out.push(body[i % body.length].slice());
    d.DMS_EXTRACT = out;
  });
  return ds;
}

/** Waktu (ms) tiap respons pada ctx baru; kembalikan { nama: ms } dan daftar pelanggaran walker. */
export function timeCalls(ds) {
  const out = {}, bad = [];
  const calls = { 'gs-pusat': { view: 'gs', code: ACCESS.pusat }, 'gs-dt': { view: 'gs', code: ACCESS.tmk }, rank: { view: 'rank', code: ACCESS.pusat }, 'dt-mentah': { code: ACCESS.tmk }, stok: { view: 'stok', code: ACCESS.pusat } };
  for (const [name, param] of Object.entries(calls)) {
    const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FixedDate } });
    const t = Date.now(); const txt = ctx.doGet({ parameter: param }).getContent(); out[name] = Date.now() - t;
    const o = JSON.parse(txt); if (o.error) bad.push(name + ': ' + o.error + ' ' + (o.message || ''));
  }
  return { out, bad };
}

if (process.argv[1] && process.argv[1].endsWith('scale.mjs')) {
  const rows = +process.env.SCALE_ROWS || 5000;
  const r = timeCalls(scaledDataset(rows));
  console.log(rows, 'baris DMS per DT:', JSON.stringify(r.out), r.bad.join('; '));
}
