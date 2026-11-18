// Regresi bug yang ditemukan fuzz (plan 025). Satu tes per bug; lihat docs/temuan-bug.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { buildDummy, ACCESS } from './dummy/dataset.mjs';
import { makeSpreadsheetApp } from './dummy/fakeSpreadsheet.mjs';
import { walk } from './fuzz/server.fuzz.mjs';

const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const base = buildDummy({ seed: 2026 });

/** Panggil doGet pada salinan dataset yang sudah diubah `mut(ds)`. Mengembalikan objek respons SEBELUM JSON.stringify
 *  (stringify mengubah NaN/Infinity jadi null dan menyembunyikan bug). */
function call(mut, parameter) {
  const ds = structuredClone(base); if (mut) mut(ds);
  const trace = [];
  const J = { stringify: (o, ...a) => { const t = JSON.stringify(o, ...a); trace.push({ o, t }); return t; }, parse: JSON.parse };
  const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FixedDate, JSON: J } });
  const txt = ctx.doGet({ parameter }).getContent();
  const f = trace.filter(t => t.t === txt).pop();
  return f ? f.o : JSON.parse(txt);
}
const noBad = (o, what) => assert.deepEqual(walk(o), [], what);
const renameHeader = (tab, from, to = 'x_' + from) => ds => { const h = ds.pusat[tab][0]; h[h.indexOf(from)] = to; };

test('gsTgl_: bulan di luar 1-12 tidak menjadi "undefined"', () => {
  const ctx = loadGs({ SpreadsheetApp: {} });
  for (const iso of ['2026-13-01', '2026-00-10', '2026-99-99']) assert.doesNotMatch(ctx.gsTgl_(iso), /undefined/, iso);
  assert.equal(ctx.gsTgl_('2026-11-12'), '12 Nov 2026');
});

test('header/kolom berganti nama: respons tidak memuat string "undefined" (bandedSku, stok, scorecard)', () => {
  noBad(call(renameHeader('GS_BANDED_SKU', 'sku_kode'), { view: 'gs', code: ACCESS.pusat }), 'GS_BANDED_SKU.sku_kode');
  noBad(call(renameHeader('GS_SCORECARD', 'tanggal'), { view: 'gs', code: ACCESS.pusat }), 'GS_SCORECARD.tanggal');
  noBad(call(renameHeader('JUAL_SKU', 'mulai'), { view: 'stok', code: ACCESS.pusat }), 'JUAL_SKU.mulai');
  noBad(call(renameHeader('SKU_FLAG', 'barcode'), { view: 'stok', code: ACCESS.pusat }), 'SKU_FLAG.barcode');
  noBad(call(renameHeader('HARGA_PL', 'brand'), { view: 'stok', code: ACCESS.pusat }), 'HARGA_PL.brand');
});

test('HARGA_PL: harga bukan angka (abc, #N/A, kolom hilang) menjadi null, bukan NaN', () => {
  const setCol = (c, v) => ds => { const a = ds.pusat.HARGA_PL, i = a[0].indexOf(c); a.slice(1).forEach(r => { r[i] = v; }); };
  for (const v of ['abc', '#N/A', '#DIV/0!', ' ', null]) for (const c of ['h_new', 'h_old', 's_new', 's_old']) {
    const o = call(setCol(c, v), { view: 'stok', code: ACCESS.pusat });
    noBad(o, c + '=' + v);
  }
  const o = call(renameHeader('HARGA_PL', 'h_old'), { view: 'stok', code: ACCESS.pusat });
  assert.equal(o.harga[0].hOld, null);
  const ok = call(setCol('h_new', 12500), { view: 'stok', code: ACCESS.pusat });
  assert.equal(ok.harga[0].hNew, 12500);
});

test('GS_TOKO tanpa kolom outlet_kode: monitoring tidak memuat toko berkode "undefined"', () => {
  const o = call(renameHeader('GS_TOKO', 'outlet_kode'), { view: 'gs', code: ACCESS.pusat });
  noBad(o, 'GS_TOKO.outlet_kode');
});

test('kolom hilang di tab GS_*: nilai kosong, bukan "undefined" (akar: pembaca tab tidak mengisi kolom wajib)', () => {
  const gs = { view: 'gs', code: ACCESS.pusat };
  for (const [tab, col] of [['GS_BULANAN', 'periode'], ['GS_BULANAN', 'data_sampai'], ['GS_BULANAN', 'disimpan'], ['GS_BULANAN_ASRT', 'periode'], ['GS_PS', 'tanggal'], ['GS_PS', 'status'],
    ['GS_PS_HIST', 'tanggal'], ['GS_TARGET', 'target_full'], ['GS_MANUAL', 'waktu'], ['GS_MANUAL', 'tanggal'], ['GS_OUTLET', 'detail'], ['GS_TOKO', 'outlet_nama'], ['GS_TOKO', 'dist_kode']])
    noBad(call(renameHeader(tab, col), gs), tab + '.' + col);
});
