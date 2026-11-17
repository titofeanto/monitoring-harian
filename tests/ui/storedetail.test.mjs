// Uji fungsi murni storeCard di assets/gs.js (diambil lewat penanda store:start/end).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../assets/gs.js', import.meta.url), 'utf8');
const m = /\/\* store:start \*\/([\s\S]*?)\/\* store:end \*\//.exec(src);
assert.ok(m, 'penanda store tidak ditemukan di gs.js');
const storeCard = new Function(m[1] + '; return storeCard;')();
const J = x => JSON.parse(JSON.stringify(x));

const SKU = [
  { channel: 'SPM', sku_kode: 'S1', sku_nama: 'Sabun Satu' }, { channel: 'SPM', sku_kode: 'S2', sku_nama: 'Sabun Dua' },
  { channel: 'SPM', sku_kode: 'S3', sku_nama: 'Sabun Tiga' }, { channel: 'MINIS', sku_kode: 'M1', sku_nama: 'Mini Satu' },
];
const toko = (x = {}) => Object.assign({
  outlet_kode: 'X-1', outlet_nama: 'Toko Satu', dist_nama: 'DT A', remark: 'LOCAL SPM', weeks: 2, status: 'BIWEEKLY', weekNow: 0, lastWeek: 46,
  bTotal: 3, bBought: 2, bMonth: 1, bSkus: ['S1'], bShare: 0.33, bHit: 0, bMiss: ['S3'], wks: [45, 46], needMore: 1, open: 2, risk: 'BIASA',
  monthWeeks: [{ w: 45, from: '2026-11-02', to: '2026-11-08', workdays: 6 }], curWeek: 48, qLabel: 'Q4 2026',
}, x);
const PS = [{ outlet_kode: 'X-1', status: 'PS LITE', total_kpi: '4/5', cotc: '1', npd: '0', sos: '', sstd: 1, banded: 0, s_cotc: 1, s_npd: 0.25, s_sos: '', s_sstd: '1', s_banded: 0 }];

test('toko dengan PS: lima komponen, ok sesuai 1/0 dan kosong jadi null', () => {
  const c = J(storeCard(toko(), 'SPM', PS, SKU));
  assert.deepEqual(c.ps.parts.map(p => p.label), ['COTC', 'NPD', 'SOS', 'SSTD', 'Banded']);
  assert.deepEqual(c.ps.parts.map(p => p.ok), [true, false, null, true, false]);
  assert.deepEqual(c.ps.parts.map(p => p.skor), [1, 0.25, null, 1, 0]);
  assert.equal(c.ps.status, 'PS LITE');
});

test('toko tanpa PS: ps null; kode dicocokkan sebagai teks', () => {
  assert.equal(storeCard(toko({ outlet_kode: 'X-9' }), 'SPM', PS, SKU).ps, null);
  assert.equal(storeCard(toko(), 'SPM', [], SKU).ps, null);
  assert.equal(storeCard(toko(), 'SPM', undefined, SKU).ps, null);
  const num = storeCard(toko({ outlet_kode: 1516 }), 'SPM', [{ outlet_kode: ' 1516 ', status: 'PS FULL' }], SKU);
  assert.equal(num.ps.status, 'PS FULL');
});

test('bMiss jadi {kode, nama}; kode di luar bandedSku tetap ada dengan nama = kode', () => {
  const c = J(storeCard(toko({ bMiss: ['S3', 'ZZ'] }), 'SPM', PS, SKU));
  assert.deepEqual(c.banded.bMiss, [{ kode: 'S3', nama: 'Sabun Tiga' }, { kode: 'ZZ', nama: 'ZZ' }]);
});

test('bSkus (dibeli bulan ini) tidak ikut bMiss dan menandai SKU yang sudah dibeli', () => {
  const c = J(storeCard(toko(), 'SPM', PS, SKU));
  assert.ok(!c.banded.bMiss.some(x => x.kode === 'S1'));
  assert.deepEqual(c.banded.bSkus, [{ kode: 'S1', nama: 'Sabun Satu' }]);
  assert.deepEqual(c.banded.bought.map(x => [x.kode, x.bulanIni]), [['S1', true], ['S2', false]]);   // S3 belum dibeli; M1 channel lain
});

test('fop meneruskan risk, wks, monthWeeks tanpa mengubah', () => {
  const o = toko();
  const c = J(storeCard(o, 'SPM', PS, SKU));
  assert.equal(c.fop.risk, 'BIASA');
  assert.deepEqual(c.fop.wks, [45, 46]);
  assert.deepEqual(c.fop.monthWeeks, J(o.monthWeeks));
  assert.equal(c.fop.needMore, 1); assert.equal(c.fop.open, 2); assert.equal(c.fop.curWeek, 48);
});

test('server lama (tanpa risk, wks, monthWeeks, bandedSku) tidak membuat galat', () => {
  const lama = { outlet_kode: 'X-1', outlet_nama: 'Toko', remark: 'LOCAL SPM', weeks: 1, status: 'MONTHLY', weekNow: 0, lastWeek: 45, bTotal: 3, bBought: 1, bMonth: 1, bSkus: ['S1'], bShare: 0.33, bHit: 0, bMiss: ['S2', 'S3'] };
  const c = J(storeCard(lama, 'SPM', undefined, undefined));
  assert.equal(c.fop.risk, undefined);
  assert.equal(c.fop.monthWeeks, undefined);
  assert.equal(c.ps, null);
  assert.deepEqual(c.banded.bMiss.map(x => x.nama), ['S2', 'S3']);
  assert.deepEqual(c.banded.bought, [{ kode: 'S1', nama: 'S1', bulanIni: true }]);
});
