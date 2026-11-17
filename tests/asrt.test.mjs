import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { dmsHeader, row } from './helpers/fixtures.mjs';

const g = loadGs();
const MOQ = 3;
const produk = () => [['SKUCode', 'LEVEL-9'], ['S1', 'BP1'], ['S2', 'BP1'], ['S3', 'BP2']];
const master = (...rows) => [['Outlet Code', 'Outlet Name', 'Outlet Type Desc'], ...rows];
const run = (rows, om, dt = '') => g.computeAsrt_([dmsHeader(), ...rows], produk(), om, dt, MOQ);

test('base pack qty bersih >= 3 = 1 line; qty 2 = 0 line', () => {
  const om = master(['A1', 'Toko A', 'LOCAL SUPERMARKET'], ['A2', 'Toko B', 'LOCAL SUPERMARKET']);
  const out = run([row('A1', 'S1', 3, '2026-11-03'), row('A2', 'S1', 2, '2026-11-03')], om);
  assert.equal(out.channels.SPM.lines, 1);
  const byOutlet = Object.fromEntries(out.channels.SPM.low.map(x => [x.outlet, x.lines]));
  assert.equal(byOutlet.A1, 1);
  assert.equal(byOutlet.A2, 0);
});

test('dua SKU base pack sama dijumlah sebelum dibanding MOQ', () => {
  const om = master(['A1', 'Toko A', 'LOCAL SUPERMARKET']);
  const out = run([row('A1', 'S1', 2, '2026-11-03'), row('A1', 'S2', 1, '2026-11-04')], om);
  assert.equal(out.channels.SPM.lines, 1);
});

test('retur mengurangi qty bersih (3 - 1 = 2 bukan line)', () => {
  const om = master(['A1', 'Toko A', 'LOCAL SUPERMARKET']);
  const out = run([row('A1', 'S1', 3, '2026-11-03'), row('A1', 'S1', -1, '2026-11-04')], om);
  assert.equal(out.channels.SPM.lines, 0);
  assert.equal(out.channels.SPM.outlets, 1); // qty bersih masih positif
});

test('asrtChannelOf_: SUPERMARKET/SPM, MINIS, LAIN, kosong', () => {
  assert.equal(g.asrtChannelOf_('Local Supermarket'), 'SPM');
  assert.equal(g.asrtChannelOf_('Toko SPM Besar'), 'SPM');
  assert.equal(g.asrtChannelOf_('Local Minis'), 'MINIS');
  assert.equal(g.asrtChannelOf_('Warung'), 'LAIN');
  assert.equal(g.asrtChannelOf_(''), '');
  assert.equal(g.asrtChannelOf_(null), '');
});

test('kode outlet master berawalan kode DT dipotong', () => {
  const om = master(['5001A1', 'Toko A', 'LOCAL MINIS']);
  const out = run([row('A1', 'S1', 3, '2026-11-03')], om, '5001');
  assert.equal(out.unmapped.length, 0);
  assert.equal(out.channels.MINIS.lines, 1);
});

test('outlet tidak ada di master masuk unmapped, tidak masuk channel', () => {
  const om = master(['A1', 'Toko A', 'LOCAL SUPERMARKET']);
  const out = run([row('A1', 'S1', 3, '2026-11-03'), row('B7', 'S1', 3, '2026-11-03')], om);
  assert.equal(out.unmapped.length, 1);
  assert.equal(out.unmapped[0].outlet, 'B7');
  assert.equal(out.channels.SPM.outlets, 1);
  assert.equal(out.channels.SPM.lines, 1);
});
