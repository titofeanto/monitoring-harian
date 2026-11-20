// Membungkus dataset dummy menjadi SpreadsheetApp palsu untuk loadGs (tests/helpers/load-gs.mjs).
// Hanya metode baca yang dipakai Code.gs untuk jalur GET: getSheetByName, getDataRange().getValues(), getLastRow(),
// getRange(r,c,n,m).getValues(), getSpreadsheetTimeZone(). Tulis minimal untuk muatKategori_: clearContents, setValues,
// setFrozenRows, getMaxRows, insertRowsAfter, insertSheet.

export function makeSheet(aoa) {
  const copy = () => aoa.map(r => r.slice());
  return {
    getDataRange: () => ({ getValues: copy }),
    getLastRow: () => aoa.length,
    getLastColumn: () => (aoa[0] || []).length,
    getRange: (r, c, n, m) => ({
      getValues: () => aoa.slice(r - 1, r - 1 + n).map(row => { const o = []; for (let i = 0; i < m; i++) o.push(row[c - 1 + i] === undefined ? '' : row[c - 1 + i]); return o; }),
      setValues: v => { v.forEach((row, i) => { const t = aoa[r - 1 + i] || (aoa[r - 1 + i] = []); row.forEach((x, j) => { t[c - 1 + j] = typeof x === 'string' ? x.replace(/^'/, '') : x; }); }); },
    }),
    clearContents: () => { aoa.length = 0; },
    setFrozenRows: () => {},
    getMaxRows: () => Math.max(1000, aoa.length),
    insertRowsAfter: () => {},
  };
}

export function makeSpreadsheet(tabs, tz = 'Asia/Jayapura') {
  const sheets = {};
  Object.keys(tabs).forEach(n => { sheets[n] = makeSheet(tabs[n]); });
  return {
    getSheetByName: n => sheets[n] || null, getSpreadsheetTimeZone: () => tz,
    insertSheet: n => { tabs[n] = []; sheets[n] = makeSheet(tabs[n]); return sheets[n]; },
  };
}

/** dataset = keluaran buildDummy. Sheet pusat = getActiveSpreadsheet; sheet DT dicari lewat sheet_id registri. */
export function makeSpreadsheetApp(dataset) {
  const pusat = makeSpreadsheet(dataset.pusat);
  const byId = {};
  dataset.registry.filter(r => r.peran === 'dt' && r.sheet_id).forEach(r => { byId[r.sheet_id] = makeSpreadsheet(dataset.dts[r.dt_kode]); });
  return {
    getActiveSpreadsheet: () => pusat,
    openById: id => { if (!byId[id]) throw new Error('Sheet tidak ditemukan: ' + id); return byId[id]; },
  };
}
