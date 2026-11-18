// Regresi T-01: teks nama-prototipe sebagai kode dari Sheet tidak boleh merusak respons (NaN, [object Object], TypeError).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { buildDummy, ACCESS } from './dummy/dataset.mjs';
import { makeSpreadsheetApp } from './dummy/fakeSpreadsheet.mjs';
import { walk } from './fuzz/server.fuzz.mjs';

const base = buildDummy({ seed: 2026 });
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
class FD extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } static [Symbol.hasInstance](x) { return Object.prototype.toString.call(x) === '[object Date]'; } }
const WORDS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
const TARGETS = [['dts.D01', 'DMS_EXTRACT'], ['dts.D01', 'OUTLET_MASTER'], ['dts.D01', 'MASTER_PRODUK'], ['dts.D01', 'DSR'], ['pusat', 'GS_TOKO'], ['pusat', 'GS_BANDED_SKU'], ['pusat', 'HARGA_PL'], ['pusat', 'STOK_GUDANG'], ['pusat', 'KEHADIRAN']];
const VIEWS = [{ view: 'gs', code: ACCESS.pusat }, { view: 'rank', code: ACCESS.pusat }, { view: 'stok', code: ACCESS.pusat }, { view: 'hadir', code: ACCESS.pusat }];

function run(ds, parameter) {
  const trace = []; const J = { stringify: (o, ...x) => { const t = JSON.stringify(o, ...x); trace.push({ o, t }); return t; }, parse: JSON.parse };
  const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FD, JSON: J } });
  const txt = ctx.doGet({ parameter }).getContent(); const f = trace.filter(t => t.t === txt).pop();
  return f ? f.o : JSON.parse(txt);
}

test('data normal: tidak berubah antar dua pemanggilan (jaminan dasar perbandingan)', () => {
  for (const p of VIEWS) assert.equal(JSON.stringify(run(structuredClone(base), p)), JSON.stringify(run(structuredClone(base), p)));
});

for (const word of WORDS) for (const [sc, tab] of TARGETS) {
  test(`kode kolom ${tab} berisi "${word}": respons gs/rank/stok/hadir bersih`, () => {
    const hdr = (sc === 'pusat' ? base.pusat : base.dts.D01)[tab][0];
    for (let c = 0; c < hdr.length; c++) {
      if (!/kode|code|salesman|outlet|sku|bu|level|channel|sub/i.test(String(hdr[c]))) continue;
      const ds = structuredClone(base); (sc === 'pusat' ? ds.pusat : ds.dts.D01)[tab].slice(1).forEach(r => { r[c] = word; });
      for (const p of VIEWS) assert.deepEqual(walk(run(ds, p)), [], `${word} @ ${tab}.${hdr[c]} (${p.view})`);
    }
  });
}
