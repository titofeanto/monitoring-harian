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

/** Panggil doGet pada salinan dataset yang sudah diubah `mut(ds)`. Mengembalikan objek respons. */
function call(mut, parameter) {
  const ds = structuredClone(base); if (mut) mut(ds);
  const ctx = loadGs({ SpreadsheetApp: makeSpreadsheetApp(ds), globals: { Session: { getScriptTimeZone: () => 'Asia/Jayapura' }, Date: FixedDate } });
  return JSON.parse(ctx.doGet({ parameter }).getContent());
}
const noBad = (o, what) => assert.deepEqual(walk(o), [], what);
const renameHeader = (tab, from, to = 'x_' + from) => ds => { const h = ds.pusat[tab][0]; h[h.indexOf(from)] = to; };

test('gsTgl_: bulan di luar 1-12 tidak menjadi "undefined"', () => {
  const ctx = loadGs({ SpreadsheetApp: {} });
  for (const iso of ['2026-13-01', '2026-00-10', '2026-99-99']) assert.doesNotMatch(ctx.gsTgl_(iso), /undefined/, iso);
  assert.equal(ctx.gsTgl_('2026-11-12'), '12 Nov 2026');
});
