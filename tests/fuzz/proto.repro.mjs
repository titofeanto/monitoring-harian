// Reproduksi temuan T-01 (belum diperbaiki, docs/temuan-bug.md): teks kunci prototipe ('constructor', '__proto__', 'toString',
// 'hasOwnProperty') di kolom kode/nama membuat peta objek biasa di Code.gs salah: NaN, "[object Object]", atau TypeError dalam respons.
// Pakai: node tests/fuzz/proto.repro.mjs   (keluar 1 bila ada pelanggaran)
import { loadGs } from '../helpers/load-gs.mjs';
import { buildDummy, ACCESS } from '../dummy/dataset.mjs';
import { makeSpreadsheetApp } from '../dummy/fakeSpreadsheet.mjs';
import { walk } from './server.fuzz.mjs';

const base = buildDummy({ seed: 2026 });
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
class FD extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } static [Symbol.hasInstance](x) { return Object.prototype.toString.call(x) === '[object Date]'; } }
const targets = [['dts.D01', 'DMS_EXTRACT'], ['dts.D01', 'OUTLET_MASTER'], ['dts.D01', 'MASTER_PRODUK'], ['dts.D01', 'DSR'], ['pusat', 'GS_TOKO'], ['pusat', 'GS_BANDED_SKU'], ['pusat', 'HARGA_PL'], ['pusat', 'STOK_GUDANG']];
let n = 0;
for (const v of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) for (const [sc, tab] of targets) {
  const hdr = (sc === 'pusat' ? base.pusat : base.dts.D01)[tab][0];
  for (let c = 0; c < hdr.length; c++) {
    if (!/kode|code|salesman|outlet|sku|bu|level|channel|sub/i.test(String(hdr[c]))) continue;
    const ds = structuredClone(base); (sc === 'pusat' ? ds.pusat : ds.dts.D01)[tab].slice(1).forEach(r => { r[c] = v; });
    const trace = []; const J = { stringify: (o, ...x) => { const t = JSON.stringify(o, ...x); trace.push({ o, t }); return t; }, parse: JSON.parse };
    const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FD, JSON: J } });
    for (const p of [{ view: 'gs', code: ACCESS.pusat }, { view: 'rank', code: ACCESS.pusat }, { view: 'stok', code: ACCESS.pusat }]) {
      const txt = ctx.doGet({ parameter: p }).getContent(); const f = trace.filter(t => t.t === txt).pop(); const w = walk(f ? f.o : JSON.parse(txt));
      if (w.length) { n++; console.log(`${v} @ ${tab}.${hdr[c]} (${p.view}): ${w[0].why} ${w[0].path.slice(0, 70)}`); }
    }
  }
}
console.log('pelanggaran:', n);
process.exit(n ? 1 : 0);
