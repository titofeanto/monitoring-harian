// Uji fungsi murni mergeBySku di assets/gs.js (diambil lewat penanda bysku:start/end).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../assets/gs.js', import.meta.url), 'utf8');
const m = /\/\* bysku:start \*\/([\s\S]*?)\/\* bysku:end \*\//.exec(src);
assert.ok(m, 'penanda bysku tidak ditemukan di gs.js');
const mergeBySku = new Function(m[1] + '; return mergeBySku;')();
const J = x => JSON.parse(JSON.stringify(x));

test('dua DT dengan SKU sama dijumlah', () => {
  const r = J(mergeBySku([
    [{ sku_kode: 'A', sku_nama: 'Aa', bought: 2, total: 4, month: 1 }],
    [{ sku_kode: 'A', sku_nama: 'Aa', bought: 3, total: 5, month: 2 }],
  ]));
  assert.deepEqual(r, [{ sku_kode: 'A', sku_nama: 'Aa', bought: 5, total: 9, month: 3 }]);
});

test('SKU yang hanya ada di satu DT tetap muncul', () => {
  const r = J(mergeBySku([
    [{ sku_kode: 'A', sku_nama: 'Aa', bought: 2, total: 4, month: 1 }],
    [{ sku_kode: 'B', sku_nama: 'Bb', bought: 1, total: 5, month: 0 }],
    undefined,
  ]));
  assert.deepEqual(r.map(x => x.sku_kode).sort(), ['A', 'B']);
});

test('urut bought menaik, seri diurut kode', () => {
  const r = mergeBySku([[
    { sku_kode: 'C', sku_nama: 'c', bought: 5, total: 6, month: 0 },
    { sku_kode: 'B', sku_nama: 'b', bought: 1, total: 6, month: 0 },
    { sku_kode: 'A', sku_nama: 'a', bought: 1, total: 6, month: 0 },
  ]]);
  assert.deepEqual(r.map(x => x.sku_kode), ['A', 'B', 'C']);
});

test('input kosong atau tanpa bySku (server lama)', () => {
  assert.deepEqual(mergeBySku([undefined, null]), []);
  assert.deepEqual(mergeBySku(), []);
});
