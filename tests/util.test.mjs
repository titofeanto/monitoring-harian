// Uji helper esc() bersama di assets/util.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/util.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const { esc } = ctx.window.MHUtil;

test('esc meng-escape & < > " dan kutip tunggal', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});
test('esc: null/undefined jadi string kosong, 0 tetap "0"', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('isMedal: rank [1,1,3,3,3,3,7] hanya 5 baris pertama bermedali', () => {
  const { isMedal } = ctx.window.MHUtil;
  const out = [1, 1, 3, 3, 3, 3, 7].map((r, i) => isMedal(r, i));
  assert.deepEqual(out, [true, true, true, true, true, false, false]);
});
test('isMedal: rank [1,2,3,4] tiga medali', () => {
  const { isMedal } = ctx.window.MHUtil;
  assert.deepEqual([1, 2, 3, 4].map((r, i) => isMedal(r, i)), [true, true, true, false]);
});

test('kpiTone: >=1 ok, 0,7-0,99 mid, <0,7 bad, null/NaN abu', () => {
  const { kpiTone } = ctx.window.MHUtil;
  assert.deepEqual([1.2, 1, 0.99, 0.7, 0.69, 0, null, undefined, NaN].map(kpiTone), ['ok', 'ok', 'mid', 'mid', 'bad', 'bad', '', '', '']);
});
