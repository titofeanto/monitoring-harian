import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.mjs';

const HEADER = ['kode_akses', 'peran', 'dt_kode', 'nama_dt', 'sheet_id', 'aktif'];
const sheetApp = rows => ({
  getActiveSpreadsheet: () => ({
    getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [HEADER, ...rows] }) }),
  }),
});
const REG = [['PUSAT-KODE-RAHASIA', 'pusat', '', 'Pusat', '', 'TRUE'], ['DT-KODE-RAHASIA', 'dt', 'DT1', 'DT Satu', 'sid1', 'TRUE']];

function setup(rows = REG) {
  const warns = [], logs = [];
  const g = loadGs({
    SpreadsheetApp: sheetApp(rows),
    globals: { console: { warn: m => warns.push(m), log() {}, error() {} }, Logger: { log: m => logs.push(m) } },
  });
  return { g, warns, logs };
}
const bad = g => g.doGet({ parameter: { code: 'salah' } });

test('tarpit: 19 salah tanpa sleep, ke-20 menahan 2 detik', () => {
  const { g } = setup();
  for (let i = 0; i < 19; i++) bad(g);
  assert.ok(!g.__slept);
  bad(g);
  assert.ok(g.__slept >= 2000);
});

test('kode benar saat counter 30: balasan normal, tanpa sleep', () => {
  const { g } = setup();
  for (let i = 0; i < 30; i++) bad(g);
  const before = g.__slept;
  const out = g.doGet({ parameter: { admin: 'clearCache', code: 'PUSAT-KODE-RAHASIA' } });
  assert.equal(JSON.parse(out.getContent()).ok, true);
  assert.equal(g.__slept, before);
});

test('console.warn tepat sekali setelah 50 salah, tetap sekali di 60', () => {
  const { g, warns } = setup();
  for (let i = 0; i < 49; i++) bad(g);
  assert.equal(warns.length, 0);
  bad(g);
  assert.equal(warns.length, 1);
  for (let i = 0; i < 10; i++) bad(g);
  assert.equal(warns.length, 1);
});

test('auditKodeAkses: tandai pendek/angka, tidak mencetak nilai kode', () => {
  const { g, logs } = setup([...REG, ['1234', 'dt', 'DT2', 'DT Dua', 'sid2', 'TRUE']]);
  g.auditKodeAkses();
  const all = logs.join('\n');
  const l = logs.find(x => x.startsWith('dt DT2'));
  assert.match(l, /pendek/);
  assert.match(l, /hanya angka/);
  assert.ok(!all.includes('1234'));
  assert.ok(!all.includes('RAHASIA'));
});
