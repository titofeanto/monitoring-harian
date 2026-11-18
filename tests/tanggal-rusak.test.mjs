// Plan 030 / T-02: sel tanggal berisi teks bukan tanggal dibuang di server dan dihitung di catatan.tanggalRusak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { buildDummy, ACCESS } from './dummy/dataset.mjs';
import { makeSpreadsheetApp } from './dummy/fakeSpreadsheet.mjs';

const BAD = ['abc', '31/31/2026', '2026-13-01', '', '<b>x</b>'];
const call = (ds, parameter) => JSON.parse(loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' } } }).doGet({ parameter }).getContent());

test('KEHADIRAN.tanggal rusak: baris dibuang, catatan.tanggalRusak = jumlah tanpa-tanggal-sah; baris sah tidak berubah', () => {
  const base = call(buildDummy({ seed: 2026 }), { view: 'hadir', code: ACCESS.pusat });
  const ds = buildDummy({ seed: 2026 });
  const ok = ds.pusat.KEHADIRAN[1];
  BAD.forEach((t, i) => ds.pusat.KEHADIRAN.push([ok[0], 'X' + i, t, '08:00', 0, 1]));
  const r = call(ds, { view: 'hadir', code: ACCESS.pusat });
  assert.equal(r.catatan.tanggalRusak, BAD.length);
  assert.deepEqual(r.rows, base.rows);
  assert.equal(base.catatan.tanggalRusak, 0);
  assert.ok(r.rows.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x[2])));
  assert.ok(!/undefined|NaN/.test(JSON.stringify(r.rows)));
});

test('GS_BULANAN.periode rusak: baris tidak masuk rekap, catatan.tanggalRusak benar', () => {
  const base = call(buildDummy({ seed: 2026 }), { view: 'gs', code: ACCESS.pusat });
  const ds = buildDummy({ seed: 2026 });
  const h = ds.pusat.GS_BULANAN, tpl = h[1];
  BAD.forEach(t => { const row = tpl.slice(); row[0] = t; h.push(row); });
  const r = call(ds, { view: 'gs', code: ACCESS.pusat });
  assert.equal(r.mon.catatan.tanggalRusak, BAD.length);
  assert.equal(base.mon.catatan.tanggalRusak, 0);
  assert.deepEqual(r.mon.recap, base.mon.recap);
  assert.ok(!/undefined|NaN/.test(JSON.stringify(r.mon.recap)));
});

test('DMS INVDate rusak: baris dibuang dari data DT, catatan.tanggalRusak benar, tanggal sah (termasuk dd/mm/yyyy) tetap', () => {
  const base = call(buildDummy({ seed: 2026 }), { code: ACCESS.tmk });
  const ds = buildDummy({ seed: 2026 });
  const dms = ds.dts.D01.DMS_EXTRACT, hdr = dms[0], c = hdr.indexOf('INVDate');
  assert.ok(c >= 0);
  BAD.forEach(t => { const row = dms[1].slice(); row[c] = t; dms.push(row); });
  const good = dms[1].slice(); good[c] = '17/11/2026'; dms.push(good);
  const r = call(ds, { code: ACCESS.tmk });
  assert.equal(r.catatan.tanggalRusak, BAD.filter(t => t !== '').length);   // sel kosong dibiarkan (bukan tanggal salah ketik)
  assert.equal(r.tabs.DMS_EXTRACT.length, base.tabs.DMS_EXTRACT.length + 1 + 1);   // + baris kosong-tanggal + baris dd/mm/yyyy
  assert.equal(base.catatan.tanggalRusak, 0);
  const dc = r.tabs.DMS_EXTRACT[0].indexOf('INVDate');
  assert.ok(r.tabs.DMS_EXTRACT.slice(1).every(x => x[dc] === '' || /\d/.test(String(x[dc])) && !/abc|<b>|2026-13|31\/31/.test(String(x[dc]))));
});
