// Membuat fixture UI dari KODE SERVER ASLI (google-apps-script/Code.gs lewat loadGs) yang membaca dataset dummy.
// Rumus tidak pernah ditulis dua kali: yang keluar di sini persis respons doGet produksi, hanya sumbernya Sheet palsu.
// Pakai: npm run dummy  ->  tests/ui/fixtures/dummy-*.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGs } from '../helpers/load-gs.mjs';
import { buildDummy, ACCESS } from './dataset.mjs';
import { makeSpreadsheetApp } from './fakeSpreadsheet.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui/fixtures');
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);   // 2026-11-18 12:00 WIT, tetap supaya hasil identik

// Date dengan "sekarang" tetap: new Date() dan Date.now() di Code.gs selalu 2026-11-18.
class FixedDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}

function serverFor(ds) {
  return loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FixedDate } });
}
const call = (ds, parameter) => JSON.parse(serverFor(ds).doGet({ parameter }).getContent());   // ctx baru per panggilan: cache bersih

/** Mengembalikan { 'dummy-xxx.json': objek }. Tidak menulis berkas. */
export function buildAll(seed = 2026) {
  const ds = buildDummy({ seed });
  return {
    ds,
    files: {
      'dummy-gs-pusat.json': call(ds, { view: 'gs', code: ACCESS.pusat }),
      'dummy-gs-tmk.json': call(ds, { view: 'gs', code: ACCESS.tmk }),
      'dummy-gs-srg.json': call(ds, { view: 'gs', code: ACCESS.srg }),
      'dummy-rank.json': call(ds, { view: 'rank', code: ACCESS.pusat }),
      'dummy-stok.json': call(ds, { view: 'stok', code: ACCESS.pusat }),
      'dummy-hadir.json': call(ds, { view: 'hadir', code: ACCESS.pusat }),
      'dummy-mh.json': call(ds, { code: ACCESS.tmk }),   // data mentah Monitoring Harian DT Timika
    },
    // Varian jalur kosong: Assortment tanpaData di semua DSR, DSR 202 tanpa PS. Fixture utama di atas tidak berubah.
    varian: { 'dummy-rank-tanpadata.json': call(buildDummy({ seed, tanpaData: true }), { view: 'rank', code: ACCESS.pusat }) },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, varian } = buildAll();
  const secrets = Object.values(ACCESS);
  for (const [name, obj] of Object.entries(Object.assign({}, files, varian))) {
    if (obj.error) throw new Error(name + ': server mengembalikan galat ' + obj.error + ' ' + (obj.message || ''));
    const txt = JSON.stringify(obj);
    if (secrets.some(s => txt.includes(s)) || txt.includes('kode_akses')) throw new Error(name + ': memuat kode akses');
    if (txt.length > 2 * 1024 * 1024) throw new Error(name + ': lebih dari 2 MB');
    fs.writeFileSync(path.join(OUT, name), txt + '\n');
    console.log(name, txt.length + ' bytes');
  }
}
