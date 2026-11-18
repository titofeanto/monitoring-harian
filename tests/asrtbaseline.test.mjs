import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';
import { makeSpreadsheet } from './dummy/fakeSpreadsheet.mjs';

const g = loadGs();
const T = (o, p, l, d = 'D1') => ({ dist_kode: d, outlet_kode: o, periode: p, lines: l });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);

test('1. tiga bulan ada: baseline = rata-rata', () => {
  const b = g.asrtBaseline_([T('A', '2025-10', 8), T('A', '2025-11', 10), T('A', '2025-12', 12)]);
  near(b['D1|A'].baseline, 10); assert.equal(b['D1|A'].bulan, 3);
});

test('2. dua bulan ada: rata-rata dua bulan', () => {
  const b = g.asrtBaseline_([T('A', '2025-10', 8), T('A', '2025-12', 12)]);
  near(b['D1|A'].baseline, 10); assert.equal(b['D1|A'].bulan, 2);
});

test('3. nol bulan Q4: tanpa baseline, keluar dari target', () => {
  const b = g.asrtBaseline_([T('A', '2026-01', 9), T('B', '2025-10', 4)]);
  assert.equal('D1|A' in b, false);
  const tgt = g.asrtTargetPerToko_(b, 0.15);
  const s = g.asrtScoreForStores_(['D1|A', 'D1|B'], { 'D1|A': 9, 'D1|B': 5 }, tgt);
  assert.equal(s.tanpaBaseline, 1); assert.equal(s.tokoTarget, 1);
  near(s.target, 4.6); assert.equal(s.aktual, 5);
});

test('4. bulan lubang tidak dihitung nol', () => {
  const b = g.asrtBaseline_([T('A', '2025-10', 6), T('A', '2025-12', 6)]);
  near(b['D1|A'].baseline, 6);
});

test('5. target = baseline x 1.15; 12 naik, 11 belum', () => {
  const b = g.asrtBaseline_([T('A', '2025-11', 10)]);
  const tgt = g.asrtTargetPerToko_(b, 0.15);
  near(tgt['D1|A'], 11.5);
  assert.equal(g.asrtScoreForStores_(['D1|A'], { 'D1|A': 12 }, tgt).tokoNaik, 1);
  assert.equal(g.asrtScoreForStores_(['D1|A'], { 'D1|A': 11 }, tgt).tokoNaik, 0);
  near(g.readGsCfg_(makeSpreadsheet({})).asrt_growth, 0.15);
});

test('6. asrt_growth di GS_CONFIG = 0,2 -> target 12', () => {
  const ss = makeSpreadsheet({ GS_CONFIG: [['key', 'value', 'ket'], ['asrt_growth', '0,2', '']] });
  const cfg = g.readGsCfg_(ss);
  near(cfg.asrt_growth, 0.2);
  const tgt = g.asrtTargetPerToko_(g.asrtBaseline_([T('A', '2025-11', 10)]), cfg.asrt_growth);
  near(tgt['D1|A'], 12);
});

test('7. tab GS_TREND_ASRT tidak ada / kosong -> aktif:false tanpa galat', () => {
  assert.equal(g.asrtTrendInfo_(makeSpreadsheet({}), 0.15).aktif, false);
  const kosong = makeSpreadsheet({ GS_TREND_ASRT: [['dist_kode', 'outlet_kode', 'periode', 'lines']] });
  assert.equal(g.asrtTrendInfo_(kosong, 0.15).aktif, false);
  const ada = makeSpreadsheet({ GS_TREND_ASRT: [['dist_kode', 'outlet_kode', 'periode', 'lines'], ['D1', 'A', '2025-10', 10]] });
  const info = g.asrtTrendInfo_(ada, 0.15);
  assert.equal(info.aktif, true); near(info.target['D1|A'], 11.5);
});

test('8. pct null saat tidak ada target', () => {
  const s = g.asrtScoreForStores_(['D1|A'], { 'D1|A': 5 }, {});
  assert.equal(s.pct, null); assert.equal(s.target, 0); assert.equal(s.tanpaBaseline, 1);
});
