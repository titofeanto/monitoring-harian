/**
 * Upload Data Monitoring Harian — tool update data mentah per DT.
 *
 * Proyek Apps Script TERPISAH dari API baca (google-apps-script/Code.gs), tapi
 * terpasang di Sheet PUSAT yang sama supaya bisa membaca tab DAFTAR_DT. Tujuannya:
 * upload file mentah (.xlsx / .csv) -> dicek -> ditulis ke tab yang sesuai di Sheet
 * DT yang dipilih, lalu tiap kotak menampilkan indikator merah / kuning / hijau
 * (belum ada, perlu update, sudah update). Tidak perlu tempel manual lagi.
 *
 * SETUP: lihat README.md di folder ini. Ringkasnya: Deploy > Web app,
 * Execute as: Me, Who has access: Only myself. Drive API (v3) sudah aktif lewat
 * appsscript.json (dibutuhkan untuk membaca .xlsx: dikonversi sementara jadi
 * Google Sheet lalu dihapus lagi).
 *
 * Per Sheet DT, tool ini menambah tab bantu (tidak dibaca API live):
 *   (Log) Riwayat Upload   1 baris terbaru per kotak
 *   (Backup) <TAB>         isi tab SEBELUM upload terakhir (1 generasi), tersembunyi
 */

// URL Web App API baca (sama dengan assets/config.js). Dipakai untuk menghapus
// cache 5 menit API setelah upload, supaya hasilnya langsung terlihat di web app.
const API_URL = 'https://script.google.com/macros/s/AKfycbzu8lO0vIulHD3ihJv4k7jAPT1WiCblCx7Su3eV93ymMd_awmDXUu3sa32aDXT3mssdiA/exec';
const REG_TAB = 'DAFTAR_DT';
const LOG_TAB = '(Log) Riwayat Upload';
const LOG_HEADER = ['Box Key', 'Label', 'Waktu Upload (Server)', 'Jumlah Baris', 'Info Tambahan', 'Tanggal Pembanding (ISO)', 'Nilai Pembanding'];
const BACKUP_PREFIX = '(Backup) ';
const HASIL_TAB = 'HASIL_PERHITUNGAN';
const WRITE_CHUNK = 5000;
const DROP_RATIO = 0.5;

/**
 * Daftar kotak. required = daftar grup nama kolom (tiap grup = nama alternatif).
 * mode: replace = ganti seluruh tab; raw = tempel apa adanya (header dicari di maxScan
 * baris pertama); upsert = ganti hanya baris yang periodenya ada di file.
 * kind menentukan aturan indikator di statusFor_.
 */
const SPECS = [
  {
    key: 'DMS_EXTRACT', label: 'Extract DMS (MTD)', group: 'daily', kind: 'dms', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'Extract DMS bulan berjalan. Harus kumulatif dari tanggal 1 sampai hari ini, bukan cuma data hari baru.',
    replaceWarn: 'Mengganti TOTAL isi DMS_EXTRACT. File yang cuma berisi 1-2 hari akan menghapus tanggal lainnya.',
    required: [['Salesman', 'DSR Code (Hygiene)'], ['GSV'], ['Sub_division', 'Category'], ['Outlet', 'Kode Outlet Bersih'],
      ['SKUCode', 'SKU Code'], ['TotalQuantity(PCS)', 'TotalQuantity (PCS)'], ['INVDate', 'InvDate', 'Tanggal']],
    dateCol: ['INVDate', 'InvDate', 'Tanggal'], sumCol: ['GSV'], configKey: 'tanggal_data', distCol: ['DistID'],
    // INVDate tetap teks dd/MM/yyyy (web app membaca harinya dari teks itu, dan Sheets tidak boleh menebak dd/MM vs MM/dd).
    textCols: [['Outlet', 'Kode Outlet Bersih'], ['SKUCode', 'SKU Code'], ['Salesman', 'DSR Code (Hygiene)'], ['INVDate', 'InvDate', 'Tanggal']],
    // Export DMS memakai format angka Inggris ("-780,048.00") sebagai teks; diubah jadi angka asli.
    numCols: [['GSV'], ['TotalQuantity(PCS)', 'TotalQuantity (PCS)'], ['Case'], ['Dozen'], ['Pieces'], ['Weight'], ['PriceCase'], ['Discount'], ['Tax'], ['Net']],
    longCodeCols: [['Outlet', 'Kode Outlet Bersih']],
  },
  {
    key: 'NGDMS_ASRT', label: 'Report NGDMS (Assortment)', group: 'daily', kind: 'report', mode: 'raw', maxScan: 25, accept: '.xlsx',
    desc: 'Report "NGDMS CR E2E and E2S Salesman View", apa adanya termasuk baris tahun/bulan di atas header.',
    replaceWarn: 'Mengganti total isi NGDMS_ASRT.',
    required: [['Salesman'], ['E2E Target'], ['E2S Target'], ['E2E Achieved'], ['E2S Achieved']],
    needsDate: true, dateOptional: true, dateLabel: 'Report ditarik tanggal (kosongkan = otomatis dari file)', staleDays: 2,
    configKey: 'ngdms_tanggal_data', distCol: ['Distributor'],
  },
  {
    key: 'TARGET', label: 'Target SS & Assortment', group: 'monthly', kind: 'periode', mode: 'upsert', accept: '.xlsx,.csv',
    desc: 'Target per DSR per periode. Baris periode yang sama ditimpa, periode lain (bulan sebelumnya) tetap aman.',
    required: [['periode'], ['kode_dsr'], ['target_ss_bw'], ['target_ss_pc'], ['target_ss_hc'], ['target_ss_fo']],
    upsertCol: ['periode'], textCols: [['periode']],
  },
  {
    key: 'NORMS_SKU', label: 'Norms SKU (SOQ)', group: 'monthly', kind: 'monthly', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'File target SOQ bulan ini.',
    replaceWarn: 'Mengganti total isi NORMS_SKU.',
    required: [['OutletCode'], ['LEVEL-9'], ['PACKTYPE'], ['SUB DIVISION2'], ['Target SOQ (in pcs)', 'Target SOQ', 'SOQ']],
    textCols: [['OutletCode'], ['LEVEL-9']], longCodeCols: [['OutletCode']],
  },
  {
    key: 'OUTLET_MASTER', label: 'Outlet Master', group: 'ref', kind: 'ref', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'Export Outlet Master DMS.',
    replaceWarn: 'Mengganti total isi OUTLET_MASTER.',
    required: [['Outlet Code'], ['Outlet Name'], ['Salesman'], ['PJP Day'], ['Outlet Type Desc']],
    textCols: [['Outlet Code']], longCodeCols: [['Outlet Code']],
  },
  {
    key: 'SKU_FOKUS', label: 'SKU Fokus', group: 'ref', kind: 'ref', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'SKU Fokus per channel.', replaceWarn: 'Mengganti total isi SKU_FOKUS.',
    required: [['channel'], ['LEVEL-9']], textCols: [['LEVEL-9']],
  },
  {
    key: 'DSR', label: 'Daftar DSR', group: 'ref', kind: 'ref', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'kode_dsr, nama_dsr, channel.', replaceWarn: 'Mengganti total isi DSR.',
    required: [['kode_dsr'], ['nama_dsr'], ['channel']],
  },
  {
    key: 'KPI', label: 'KPI', group: 'ref', kind: 'ref', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'Komponen KPI, bobot, tier, jasper.', replaceWarn: 'Mengganti total isi KPI.',
    required: [['id'], ['nama'], ['tipe'], ['bobot']],
  },
  {
    key: 'MASTER_PRODUK', label: 'Master Produk', group: 'ref', kind: 'ref', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'Product Hierarchy (SKUCode, LEVEL-9, BU, nama_basepack).', replaceWarn: 'Mengganti total isi MASTER_PRODUK.',
    required: [['SKUCode'], ['LEVEL-9'], ['BU'], ['nama_basepack']], textCols: [['SKUCode'], ['LEVEL-9']],
  },
  {
    key: 'HARI_LIBUR', label: 'Hari Libur', group: 'ref', kind: 'libur', mode: 'replace', accept: '.xlsx,.csv',
    desc: 'Libur nasional + cuti bersama setahun (tanggal, keterangan, jenis). Isi ulang tiap awal tahun.',
    replaceWarn: 'Mengganti total isi HARI_LIBUR.',
    required: [['tanggal']], dateCol: ['tanggal'],
  },
];

// ====================== PURE HELPERS (dites di luar Apps Script) ======================

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function normHdr_(c) { return String(c === null || c === undefined ? '' : c).replace(/\s+/g, ' ').trim().toLowerCase(); }

/** Date / 'yyyy-MM-dd...' / 'dd/MM/yyyy' -> 'yyyy-MM-dd', selain itu ''. */
function normDate_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
  if (m) return m[3] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[1]);
  return '';
}

/** Nilai sel periode: 'YYYY-MM' (Date hasil auto-convert Sheets ikut dikembalikan ke teks). */
function normPeriode_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.getFullYear() + '-' + pad2_(v.getMonth() + 1);
  const s = String(v === null || v === undefined ? '' : v).trim();
  const m = /^(\d{4})-(\d{1,2})/.exec(s);
  return m ? m[1] + '-' + pad2_(+m[2]) : s;
}

const BULAN_ID_SHORT_ = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtDateID_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? (+m[3]) + ' ' + BULAN_ID_SHORT_[+m[2]] + ' ' + m[1] : String(iso || '');
}
function fmtPeriodeID_(p) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(p || ''));
  return m ? BULAN_ID_SHORT_[+m[2]] + ' ' + m[1] : String(p || '');
}

function isoToUtc_(iso) { const p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function utcToIso_(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate()); }
function daysBetween_(fromIso, toIso) { return Math.round((isoToUtc_(toIso) - isoToUtc_(fromIso)) / 86400000); }

/** Tanggal data yang seharusnya sudah ada: hari ini kalau hari kerja, kalau Minggu/libur mundur ke hari kerja terakhir. */
function expectedDate_(todayIso, libur) {
  let ms = isoToUtc_(todayIso);
  for (let i = 0; i < 14; i++) {
    const iso = utcToIso_(ms);
    if (new Date(ms).getUTCDay() !== 0 && !(libur && libur[iso])) return iso;
    ms -= 86400000;
  }
  return todayIso;
}

function colIdx_(headerRow, alts) {
  const want = alts.map(normHdr_);
  for (let c = 0; c < headerRow.length; c++) if (want.indexOf(normHdr_(headerRow[c])) >= 0) return c;
  return -1;
}

/** Cari baris header di maxScan baris pertama. Hasil: {ok, rowIdx, missing:[nama pertama grup yang tidak ketemu]}. */
function findHeader_(rows, spec) {
  const maxScan = Math.min(spec.maxScan || 3, rows.length);
  let best = { ok: false, rowIdx: -1, found: -1, missing: spec.required.map(g => g[0]) };
  for (let r = 0; r < maxScan; r++) {
    const missing = spec.required.filter(g => colIdx_(rows[r], g) < 0).map(g => g[0]);
    const found = spec.required.length - missing.length;
    if (!missing.length) return { ok: true, rowIdx: r, missing: [] };
    if (found > best.found) best = { ok: false, rowIdx: r, found: found, missing: missing };
  }
  return best;
}

function maxDateOf_(values) {
  let max = '';
  for (let i = 0; i < values.length; i++) { const d = normDate_(values[i]); if (d && d > max) max = d; }
  return max;
}
function sumOf_(values) {
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    s += typeof v === 'number' ? v : (parseFloat(String(v === null || v === undefined ? '' : v).replace(/,/g, '.')) || 0);
  }
  return s;
}
function distinctPeriodes_(values) {
  const set = {};
  values.forEach(v => { const p = normPeriode_(v); if (p) set[p] = true; });
  return Object.keys(set).sort();
}
function countLongNumbers_(values) {
  let n = 0;
  values.forEach(v => { if (typeof v === 'number' && v > 1e14) n++; });
  return n;
}

/** Fakta sebuah tab/file dari array 2D (kolom data dibaca langsung, bukan baca ulang dari Sheet). */
function factsFromRows_(rows, spec) {
  const f = { exists: true, rows: 0, headerOk: false, missing: [], dataDate: '', sumValue: null, periodes: [], longNumbers: 0 };
  const nonEmpty = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
  if (!nonEmpty.length) return f;
  const h = findHeader_(nonEmpty, spec);
  f.headerOk = h.ok; f.missing = h.missing;
  if (!h.ok) return f;
  const data = nonEmpty.slice(h.rowIdx + 1);
  f.rows = data.length;
  const hdr = nonEmpty[h.rowIdx];
  const col = alts => { const i = colIdx_(hdr, alts); return i < 0 ? [] : data.map(r => r[i]); };
  if (spec.dateCol) f.dataDate = maxDateOf_(col(spec.dateCol));
  if (spec.sumCol) f.sumValue = sumOf_(col(spec.sumCol));
  if (spec.upsertCol) f.periodes = distinctPeriodes_(col(spec.upsertCol));
  (spec.longCodeCols || []).forEach(g => { f.longNumbers += countLongNumbers_(col(g)); });
  return f;
}

/**
 * Indikator satu kotak. f = fakta tab sekarang, log = catatan upload terakhir lewat tool (atau null),
 * ctx = {today, expected, periode, config:{ngdms_tanggal_data}}.
 * level: red = belum ada / salah, amber = perlu update, green = sudah update.
 */
function statusFor_(spec, f, log, ctx) {
  if (!f.exists || f.rows <= 0) return { level: 'red', text: 'Kosong, belum pernah diisi' };
  if (!f.headerOk) return { level: 'red', text: 'Header tidak sesuai, kolom tidak ketemu: ' + f.missing.join(', ') };
  switch (spec.kind) {
    case 'dms': {
      if (!f.dataDate) return { level: 'amber', text: 'Tanggal INVDate tidak terbaca' };
      if (ctx.periode && f.dataDate.slice(0, 7) !== ctx.periode) {
        return { level: 'red', text: 'Isinya bulan ' + fmtPeriodeID_(f.dataDate.slice(0, 7)) + ', padahal CONFIG periode ' + fmtPeriodeID_(ctx.periode) };
      }
      if (f.dataDate < ctx.expected) return { level: 'amber', text: 'Belum update hari ini, data baru s.d. ' + fmtDateID_(f.dataDate), dataDate: f.dataDate };
      return { level: 'green', text: 'Sudah update, data s.d. ' + fmtDateID_(f.dataDate), dataDate: f.dataDate };
    }
    case 'report': {
      const d = normDate_(log && log.compare) || normDate_(ctx.config && ctx.config.ngdms_tanggal_data);
      if (!d) return { level: 'amber', text: 'Tanggal report belum diketahui' };
      const lag = daysBetween_(d, ctx.expected);
      if (lag > (spec.staleDays || 0)) return { level: 'amber', text: 'Report tanggal ' + fmtDateID_(d) + ', terlambat ' + lag + ' hari', dataDate: d };
      return { level: 'green', text: 'Report tanggal ' + fmtDateID_(d), dataDate: d };
    }
    case 'periode': {
      if (ctx.periode && f.periodes.indexOf(ctx.periode) < 0) {
        return { level: 'red', text: 'Belum ada target periode ' + fmtPeriodeID_(ctx.periode) + ' (ada: ' + (f.periodes.map(fmtPeriodeID_).join(', ') || '-') + ')' };
      }
      return { level: 'green', text: 'Target periode ' + fmtPeriodeID_(ctx.periode) + ' sudah ada' };
    }
    case 'monthly': {
      if (!log || !log.ts) return { level: 'amber', text: 'Terisi, tapi belum pernah diupload lewat tool ini (kapan updatenya tidak diketahui)' };
      const m = normDate_(log.ts).slice(0, 7);
      if (ctx.periode && m < ctx.periode) return { level: 'amber', text: 'Belum diupdate untuk ' + fmtPeriodeID_(ctx.periode) + ' (upload terakhir ' + fmtPeriodeID_(m) + ')' };
      return { level: 'green', text: 'Sudah diupdate bulan ini' };
    }
    case 'libur': {
      const year = ctx.today.slice(0, 4);
      if (!f.dataDate || f.dataDate.slice(0, 4) < year) return { level: 'amber', text: 'Daftar libur tahun ' + year + ' belum diisi' };
      return { level: 'green', text: 'Libur tahun ' + year + ' sudah ada (' + f.rows + ' tanggal)' };
    }
    default:
      return { level: 'green', text: 'Terisi (' + f.rows + ' baris)' };
  }
}

/** Peringatan lintas kotak: periode CONFIG ketinggalan, hasil bulan lalu belum disimpan. */
function globalChecks_(ctx, hasilPeriodes) {
  const out = [];
  const cur = ctx.today.slice(0, 7);
  if (!ctx.periode) {
    out.push({ level: 'red', text: 'CONFIG periode kosong atau tidak terbaca.' });
  } else if (ctx.periode < cur) {
    out.push({ level: 'amber', text: 'CONFIG periode masih ' + fmtPeriodeID_(ctx.periode) + ', bulan sekarang ' + fmtPeriodeID_(cur) + '. Ganti periode (dan hk_total) di tab CONFIG setelah hasil bulan lama disimpan.' });
    if (hasilPeriodes.indexOf(ctx.periode) < 0) {
      out.push({ level: 'red', text: 'Hasil ' + fmtPeriodeID_(ctx.periode) + ' belum disimpan ke HASIL_PERHITUNGAN. Klik "Simpan hasil ke Sheet" di web app SEBELUM ganti periode, kalau tidak bulan itu tidak bisa direkap kuartal.' });
    }
  }
  return out;
}

/**
 * Peringatan validitas upload (tidak memblokir): tanggal mundur, jumlah baris / nilai anjlok,
 * bulan tidak cocok CONFIG, kode outlet jadi angka. prev = fakta tab SEBELUM ditimpa, nw = fakta file baru.
 */
function uploadWarnings_(spec, nw, prev, ctx, newCompareIso, prevLog) {
  const w = [];
  const prevRows = prev && prev.exists && prev.headerOk ? prev.rows : 0;
  if (spec.mode === 'replace' || spec.mode === 'raw') {
    if (prevRows >= 10 && nw.rows < prevRows * DROP_RATIO) {
      w.push('Jumlah baris TURUN DRASTIS: ' + nw.rows + ' baris, sebelumnya ' + prevRows + '. Kemungkinan file tidak lengkap / terpotong.');
    }
  }
  if (spec.kind === 'dms') {
    if (prev && prev.dataDate && nw.dataDate && nw.dataDate <= prev.dataDate) {
      w.push('Tanggal data terakhir file ini (' + fmtDateID_(nw.dataDate) + ') TIDAK LEBIH BARU dari isi sebelumnya (' + fmtDateID_(prev.dataDate) + '). Kemungkinan file lama terupload lagi.');
    }
    if (nw.dataDate && ctx.periode && nw.dataDate.slice(0, 7) !== ctx.periode) {
      w.push('File berisi bulan ' + fmtPeriodeID_(nw.dataDate.slice(0, 7)) + ', sedangkan CONFIG periode ' + fmtPeriodeID_(ctx.periode) + '. Samakan dulu periode di tab CONFIG.');
    }
    if (prev && prev.sumValue > 0 && nw.sumValue !== null && nw.sumValue < prev.sumValue * DROP_RATIO && prev.dataDate && nw.dataDate && nw.dataDate.slice(0, 7) === prev.dataDate.slice(0, 7)) {
      w.push('Total GSV TURUN DRASTIS padahal bulan sama: ' + nw.sumValue.toFixed(0) + ', sebelumnya ' + prev.sumValue.toFixed(0) + '.');
    }
    if (!nw.dataDate) w.push('Kolom tanggal (INVDate) tidak terbaca, indikator "hari ini" tidak bisa dihitung.');
  }
  if (spec.kind === 'report' && newCompareIso && prevLog && prevLog.compare && newCompareIso <= prevLog.compare) {
    w.push('Tanggal report (' + fmtDateID_(newCompareIso) + ') TIDAK LEBIH BARU dari upload sebelumnya (' + fmtDateID_(prevLog.compare) + ').');
  }
  if (spec.kind === 'periode' && ctx.periode && nw.periodes.indexOf(ctx.periode) < 0) {
    w.push('File tidak berisi periode ' + fmtPeriodeID_(ctx.periode) + ' (isi: ' + (nw.periodes.map(fmtPeriodeID_).join(', ') || '-') + '). Target bulan berjalan tetap tidak ada.');
  }
  if (nw.longNumbers > 0) {
    w.push(nw.longNumbers + ' kode outlet tersimpan sebagai ANGKA di file sumber, digit belakangnya mungkin sudah hilang. Export ulang dengan kolom kode berformat teks.');
  }
  return w;
}

/**
 * Export DMS sering berupa SATU kolom berisi baris ber-pemisah ";" (sel tunggal per baris).
 * Kalau semua baris tak kosong hanya punya sel pertama dan isinya mengandung ";", pecah per ";".
 */
function unpackDelimited_(rows) {
  const ne = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
  if (!ne.length) return rows;
  const single = ne.every(r => String(r[0] === null || r[0] === undefined ? '' : r[0]) !== '' && r.slice(1).every(c => c === '' || c === null || c === undefined));
  if (!single || String(ne[0][0]).indexOf(';') < 0) return rows;
  return ne.map(r => String(r[0]).split(';'));
}

/** "-780,048.00" -> -780048; nilai lain dibiarkan. */
function englishNumber_(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) || /^-?\d+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  return v;
}

/** rows[0] = header. Ubah kolom numCols dari teks angka Inggris jadi angka asli. */
function applyNumCols_(rows, spec) {
  if (!spec.numCols || !rows.length) return rows;
  const idx = spec.numCols.map(g => colIdx_(rows[0], g)).filter(i => i >= 0);
  for (let r = 1; r < rows.length; r++) idx.forEach(i => { if (i < rows[r].length) rows[r][i] = englishNumber_(rows[r][i]); });
  return rows;
}

/** Distributor di file harus sama dengan kode DT (hanya dicek kalau dt_kode berupa angka). */
function distMismatch_(rows, spec, dtKode) {
  if (!spec.distCol || !/^\d+$/.test(String(dtKode))) return '';
  const c = colIdx_(rows[0], spec.distCol);
  if (c < 0) return '';
  const found = {};
  rows.slice(1).forEach(r => { const v = String(r[c] === null || r[c] === undefined ? '' : r[c]).trim(); if (v) found[v] = true; });
  const bad = Object.keys(found).filter(v => v !== String(dtKode));
  return bad.length ? 'File ini berisi distributor ' + bad.join(', ') + ', bukan DT ' + dtKode + '. Pilih DT yang benar atau ganti file. Upload DIBATALKAN, data tidak diubah.' : '';
}

/** "Execution Date & Time: 22/10/2026 06:05:27" di sheet mana pun -> 'yyyy-MM-dd'. */
function findExecutionDate_(sheets) {
  const names = Object.keys(sheets);
  for (let i = 0; i < names.length; i++) {
    const rows = sheets[names[i]];
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const m = /Execution Date\s*&\s*Time\s*:\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i.exec(String(rows[r][c]));
        if (m) return normDate_(m[1]);
      }
    }
  }
  return '';
}

/** Tahun/bulan di baris judul atas header NGDMS (sama cara baca dengan app.js parseNgdms) -> 'YYYY-MM'. */
function reportPeriod_(rows, headerRowIdx) {
  let year = '', month = '';
  for (let i = 0; i < headerRowIdx; i++) {
    rows[i].forEach(c => {
      const t = String(c === null || c === undefined ? '' : c).trim();
      if (!year && /^\d{4}$/.test(t)) year = t;
      else if (year && !month && /^\d{1,2}$/.test(t)) month = pad2_(+t);
    });
  }
  return year && month ? year + '-' + month : '';
}

// ====================== WEB APP ENTRY ======================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Upload Data - Monitoring Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function publicSpecs_() {
  return SPECS.map(s => ({
    key: s.key, label: s.label, group: s.group, desc: s.desc, accept: s.accept, replaceWarn: s.replaceWarn || '',
    needsDate: !!s.needsDate, dateOptional: !!s.dateOptional, dateLabel: s.dateLabel || '', mode: s.mode,
  }));
}

/** Dipanggil Index.html saat dibuka: daftar DT dari DAFTAR_DT + daftar kotak. */
function getInit() {
  const dts = readRegistry_().filter(r => r.peran === 'dt' && r.sheet_id).map(r => ({ kode: r.dt_kode, nama: r.nama_dt }));
  return { dts: dts, specs: publicSpecs_(), today: todayIso_() };
}

function getStatus(dtKode) {
  const r = resolveDt_(dtKode);
  const ss = SpreadsheetApp.openById(r.sheet_id);
  const config = readConfigMap_(ss);
  const libur = readLiburMap_(ss);
  const today = todayIso_();
  const ctx = { today: today, expected: expectedDate_(today, libur), periode: normPeriode_(config.periode), config: config };
  const logMap = readLogMap_(ss);
  const boxes = SPECS.map(spec => {
    const f = readFacts_(ss, spec);
    const lg = logMap[spec.key] || null;
    const st = statusFor_(spec, f, lg, ctx);
    return {
      key: spec.key, level: st.level, text: st.text, rows: f.rows,
      lastUpload: lg && lg.ts ? lg.ts.getTime() : null, lastRows: lg ? lg.rows : null, lastInfo: lg ? lg.info : '',
      hasBackup: !!ss.getSheetByName(BACKUP_PREFIX + spec.key) && !!logMap['bk:' + spec.key],
      backupTs: logMap['bk:' + spec.key] && logMap['bk:' + spec.key].ts ? logMap['bk:' + spec.key].ts.getTime() : null,
      backupRows: logMap['bk:' + spec.key] ? logMap['bk:' + spec.key].rows : null,
    };
  });
  return {
    dt: { kode: r.dt_kode, nama: r.nama_dt }, today: today, expected: ctx.expected, periode: ctx.periode,
    global: globalChecks_(ctx, readHasilPeriodes_(ss)), boxes: boxes,
  };
}

/** Upload satu kotak: base64 file + tanggal (hanya kotak needsDate). */
function processUpload(dtKode, key, base64, filename, dateStr) {
  const spec = SPECS.filter(s => s.key === key)[0];
  if (!spec) throw new Error('Kotak tidak dikenal: ' + key);
  if (spec.needsDate && !spec.dateOptional && !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) {
    throw new Error('Tanggal wajib diisi (' + (spec.dateLabel || 'tanggal data') + ').');
  }
  const r = resolveDt_(dtKode);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const isCsv = /\.csv$/i.test(filename || '');
    let sheets;
    if (isCsv) {
      const text = Utilities.newBlob(Utilities.base64Decode(base64)).getDataAsString('UTF-8');
      const first = text.split(/\r?\n/)[0] || '';
      const semi = first.split(';').length > first.split(',').length;
      sheets = { csv: Utilities.parseCsv(text, semi ? ';' : ',') };
    } else {
      sheets = xlsxBase64ToSheets_(base64, filename);
    }
    Object.keys(sheets).forEach(n => { sheets[n] = unpackDelimited_(sheets[n]); });
    const picked = pickSheet_(sheets, spec);
    if (spec.needsDate) {
      const detected = findExecutionDate_(sheets);
      if (detected && dateStr && detected !== dateStr) {
        throw new Error('Tanggal yang Anda isi (' + fmtDateID_(dateStr) + ') beda dari Execution Date di file (' + fmtDateID_(detected) + '). Kosongkan tanggal supaya otomatis, atau pakai file yang benar.');
      }
      if (!dateStr) dateStr = detected;
      if (!dateStr) throw new Error('Execution Date tidak ditemukan di file, isi tanggal secara manual.');
    }
    const ss = SpreadsheetApp.openById(r.sheet_id);
    const config = readConfigMap_(ss);
    const today = todayIso_();
    const ctx = { today: today, expected: expectedDate_(today, readLiburMap_(ss)), periode: normPeriode_(config.periode), config: config };

    let rows = picked.rows;
    if (spec.mode !== 'raw') rows = rows.slice(picked.header.rowIdx); // buang baris judul di atas header
    rows = rows.filter(row => row.some(c => c !== '' && c !== null && c !== undefined));
    if (spec.mode !== 'raw') {
      const mism = distMismatch_(rows, spec, r.dt_kode);
      if (mism) throw new Error(mism);
      applyNumCols_(rows, spec);
    } else {
      const mism = distMismatch_(rows.slice(picked.header.rowIdx), spec, r.dt_kode);
      if (mism) throw new Error(mism);
    }
    const nw = factsFromRows_(rows, spec);
    if (nw.rows <= 0) {
      throw new Error('Tidak ada baris data yang terbaca dari file ini (0 baris). Upload DIBATALKAN, data di tab ' + spec.key + ' tidak diubah.');
    }
    const prev = readFacts_(ss, spec);
    const prevLog = readLogMap_(ss)[spec.key] || null;
    const warnings = uploadWarnings_(spec, nw, prev, ctx, spec.needsDate ? dateStr : '', prevLog);
    if (spec.kind === 'report') {
      const rp = reportPeriod_(rows, picked.header.rowIdx);
      if (rp && ctx.periode && rp !== ctx.periode) warnings.push('Report berisi periode ' + fmtPeriodeID_(rp) + ', sedangkan CONFIG periode ' + fmtPeriodeID_(ctx.periode) + '.');
    }

    backupTab_(ss, spec.key, prevLog);
    let written;
    if (spec.mode === 'upsert') written = upsertByPeriode_(ss, spec, rows, nw.periodes);
    else written = writeTab_(ss, spec, rows, isCsv);

    let compare = '';
    if (spec.kind === 'dms') compare = nw.dataDate;
    else if (spec.needsDate) compare = dateStr;
    if (spec.configKey && compare) setConfigValue_(ss, spec.configKey, compare);
    const info = infoLine_(spec, nw, compare);
    recordLog_(ss, spec.key, spec.label, written, info, compare);
    const cacheCleared = clearWebCache_(r.dt_kode);
    return { ok: true, key: key, rowsWritten: written, info: info, warnings: warnings, cacheCleared: cacheCleared, sheetUsed: picked.name };
  } finally {
    lock.releaseLock();
  }
}

function infoLine_(spec, nw, compare) {
  if (spec.kind === 'dms' && nw.dataDate) return 'Data s.d. ' + fmtDateID_(nw.dataDate);
  if (spec.needsDate && compare) return 'Report tanggal ' + fmtDateID_(compare);
  if (spec.kind === 'periode') return 'Periode ' + nw.periodes.map(fmtPeriodeID_).join(', ');
  return '';
}

/** Kembalikan tab ke isi SEBELUM upload terakhir (1 generasi). */
function restoreFromBackup(dtKode, key) {
  const spec = SPECS.filter(s => s.key === key)[0];
  if (!spec) throw new Error('Kotak tidak dikenal: ' + key);
  const r = resolveDt_(dtKode);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(r.sheet_id);
    const bk = ss.getSheetByName(BACKUP_PREFIX + key);
    const sh = ss.getSheetByName(key);
    if (!bk || !sh) throw new Error('Belum ada backup untuk kotak ini. Backup dibuat otomatis mulai upload berikutnya.');
    const lastRow = bk.getLastRow(), lastCol = bk.getLastColumn();
    if (lastRow < 1 || lastCol < 1) throw new Error('Backup kotak ini kosong, tidak ada yang bisa dipulihkan.');
    sh.clearContents();
    ensureGrid_(sh, lastRow, lastCol);
    bk.getRange(1, 1, lastRow, lastCol).copyTo(sh.getRange(1, 1));
    const logMap = readLogMap_(ss);
    const bl = logMap['bk:' + key];
    if (bl) {
      upsertLogRow_(ss, [key, bl.label, bl.ts, bl.rows, bl.info, bl.compare, '']);
      deleteLogRow_(ss, 'bk:' + key);
    }
    const spec2 = SPECS.filter(s => s.key === key)[0];
    if (spec2.configKey && bl && bl.compare) setConfigValue_(ss, spec2.configKey, bl.compare);
    clearWebCache_(r.dt_kode);
    return { ok: true, rowsWritten: bl ? bl.rows : null };
  } finally {
    lock.releaseLock();
  }
}

// ====================== REGISTRY, CONFIG, LOG ======================

function todayIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function readRegistry_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REG_TAB);
  if (!sh) throw new Error('Tab tidak ditemukan: ' + REG_TAB);
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  const col = n => h.indexOf(n);
  return v.slice(1).map(r => ({
    kode_akses: String(r[col('kode_akses')] || '').trim(),
    peran: String(r[col('peran')] || 'dt').trim().toLowerCase(),
    dt_kode: String(r[col('dt_kode')] || '').trim(),
    nama_dt: String(r[col('nama_dt')] || '').trim(),
    sheet_id: String(r[col('sheet_id')] || '').trim(),
    aktif: String(r[col('aktif')]).toUpperCase() !== 'FALSE',
  })).filter(r => r.kode_akses && r.aktif);
}

function resolveDt_(dtKode) {
  const r = readRegistry_().filter(x => x.peran === 'dt' && x.sheet_id && x.dt_kode === String(dtKode || '').trim())[0];
  if (!r) throw new Error('DT tidak ditemukan di DAFTAR_DT: ' + dtKode);
  return r;
}

/** Tab CONFIG: kolom key | value. Nilai Date dikembalikan sebagai 'yyyy-MM-dd'. */
function readConfigMap_(ss) {
  const sh = ss.getSheetByName('CONFIG');
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(row => {
    const k = String(row[0] || '').trim();
    if (k) out[k] = row[1] instanceof Date ? normDate_(row[1]) : row[1];
  });
  return out;
}

function setConfigValue_(ss, key, value) {
  const sh = ss.getSheetByName('CONFIG');
  if (!sh) return;
  const last = sh.getLastRow();
  const keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0] || '').trim()) : [];
  const idx = keys.indexOf(key);
  const rowNo = idx >= 0 ? idx + 2 : last + 1;
  if (idx < 0) sh.getRange(rowNo, 1).setValue(key);
  sh.getRange(rowNo, 2).setNumberFormat('@').setValue(String(value));
}

function readLiburMap_(ss) {
  const out = {};
  const sh = ss.getSheetByName('HARI_LIBUR');
  if (!sh || sh.getLastRow() < 2) return out;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const c = colIdx_(hdr, ['tanggal']);
  if (c < 0) return out;
  sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { const d = normDate_(r[0]); if (d) out[d] = true; });
  return out;
}

function readHasilPeriodes_(ss) {
  const sh = ss.getSheetByName(HASIL_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const c = colIdx_(hdr, ['periode']);
  if (c < 0) return [];
  return distinctPeriodes_(sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]));
}

function ensureLogSheet_(ss) {
  let sh = ss.getSheetByName(LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(LOG_TAB);
    sh.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readLogMap_(ss) {
  const out = {};
  const sh = ss.getSheetByName(LOG_TAB);
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEADER.length).getValues().forEach(r => {
    if (!r[0]) return;
    out[r[0]] = { label: r[1], ts: r[2] instanceof Date ? r[2] : null, rows: r[3], info: r[4] || '', compare: normDate_(r[5]) || String(r[5] || '') };
  });
  return out;
}

function upsertLogRow_(ss, rowVals) {
  const sh = ensureLogSheet_(ss);
  const last = sh.getLastRow();
  const keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => r[0]) : [];
  const idx = keys.indexOf(rowVals[0]);
  const padded = rowVals.slice(); while (padded.length < LOG_HEADER.length) padded.push('');
  sh.getRange(1, 6, Math.max(sh.getLastRow(), 2), 1).setNumberFormat('@'); // tanggal pembanding tetap teks
  sh.getRange(idx >= 0 ? idx + 2 : last + 1, 1, 1, LOG_HEADER.length).setValues([padded]);
}

function deleteLogRow_(ss, key) {
  const sh = ss.getSheetByName(LOG_TAB);
  if (!sh || sh.getLastRow() < 2) return;
  const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]);
  const idx = keys.indexOf(key);
  if (idx >= 0) sh.deleteRow(idx + 2);
}

function recordLog_(ss, key, label, rows, info, compareIso) {
  try { upsertLogRow_(ss, [key, label, new Date(), rows, info || '', compareIso || '']); } catch (e) { /* log hanya bantu tampilan */ }
}

// ====================== BACA FILE ======================

/** .xlsx (base64) -> Google Sheet sementara -> {namaSheet: array2D}, lalu file sementara dihapus. */
function xlsxBase64ToSheets_(base64, filename) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), MimeType.MICROSOFT_EXCEL, filename || 'upload.xlsx');
  const file = Drive.Files.create({ name: 'TMP_IMPORT_' + new Date().getTime() + '_' + (filename || ''), mimeType: MimeType.GOOGLE_SHEETS }, blob);
  try {
    const tmp = SpreadsheetApp.openById(file.id);
    const tz = tmp.getSpreadsheetTimeZone();
    const out = {};
    tmp.getSheets().forEach(sh => {
      out[sh.getName()] = sh.getDataRange().getValues().map(row => row.map(c => {
        if (!(c instanceof Date)) return c;
        const hasTime = c.getHours() + c.getMinutes() + c.getSeconds() > 0;
        return Utilities.formatDate(c, tz, hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
      }));
    });
    return out;
  } finally {
    try { Drive.Files.remove(file.id); } catch (e) { /* bukan fatal */ }
  }
}

/** Sheet pertama (urutan file) yang headernya cocok. Kalau tidak ada, error dengan kolom yang kurang. */
function pickSheet_(sheets, spec) {
  const names = Object.keys(sheets);
  let best = null;
  for (let i = 0; i < names.length; i++) {
    const rows = sheets[names[i]].filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
    if (!rows.length) continue;
    const h = findHeader_(rows, spec);
    if (h.ok) return { name: names[i], rows: rows, header: h };
    if (!best || h.missing.length < best.missing.length) best = { name: names[i], missing: h.missing };
  }
  throw new Error('File yang diupload sepertinya BUKAN file untuk kotak "' + spec.label + '" atau formatnya berubah. ' +
    (best ? 'Kolom tidak ketemu: ' + best.missing.join(', ') + '. ' : 'File kosong. ') +
    'Upload DIBATALKAN, data di tab ' + spec.key + ' tidak diubah.');
}

// ====================== TULIS KE SHEET DT ======================

function ensureGrid_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

function padRows_(rows, w) {
  return rows.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; });
}

/** Salin isi tab SEBELUM ditimpa ke "(Backup) <tab>" (tersembunyi), plus catatan upload lamanya. */
function backupTab_(ss, key, prevLog) {
  try {
    const sh = ss.getSheetByName(key);
    if (!sh) return;
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;
    let bk = ss.getSheetByName(BACKUP_PREFIX + key);
    if (!bk) { bk = ss.insertSheet(BACKUP_PREFIX + key); bk.hideSheet(); }
    bk.clearContents();
    ensureGrid_(bk, lastRow, lastCol);
    sh.getRange(1, 1, lastRow, lastCol).copyTo(bk.getRange(1, 1));
    const nowFacts = prevLog || { label: key, ts: null, rows: lastRow - 1, info: '', compare: '' };
    upsertLogRow_(ss, ['bk:' + key, nowFacts.label, nowFacts.ts || '', nowFacts.rows, nowFacts.info, nowFacts.compare]);
  } catch (e) { /* jaring pengaman tambahan, jangan menggagalkan upload yang valid */ }
}

function textColIndexes_(spec, header, isCsv) {
  const groups = (spec.textCols || []).slice();
  if (isCsv && spec.dateCol) groups.push(spec.dateCol); // CSV: tanggal dd/MM/yyyy jangan ditebak Sheets
  return groups.map(g => colIdx_(header, g)).filter(i => i >= 0);
}

/** Ganti seluruh isi tab. rows[0] = header (raw: baris judul di atas header ikut). Mengembalikan jumlah baris data. */
function writeTab_(ss, spec, rows, isCsv) {
  const sh = ss.getSheetByName(spec.key) || ss.insertSheet(spec.key);
  const w = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const all = padRows_(rows, w);
  const h = findHeader_(all, spec);
  const hdrIdx = h.ok ? h.rowIdx : 0;
  sh.clearContents();
  ensureGrid_(sh, all.length, w);
  sh.getRange(1, 1, all.length, w).setNumberFormat('General');
  textColIndexes_(spec, all[hdrIdx], isCsv).forEach(ci => sh.getRange(1, ci + 1, all.length, 1).setNumberFormat('@'));
  for (let i = 0; i < all.length; i += WRITE_CHUNK) {
    const chunk = all.slice(i, i + WRITE_CHUNK);
    sh.getRange(i + 1, 1, chunk.length, w).setValues(chunk);
  }
  return all.length - hdrIdx - 1;
}

/** TARGET: buang baris lama yang periodenya ada di file, tambahkan baris baru. Periode lain tidak disentuh. */
function upsertByPeriode_(ss, spec, rows, newPeriodes) {
  const sh = ss.getSheetByName(spec.key) || ss.insertSheet(spec.key);
  const fileHdr = rows[0].map(c => String(c).trim());
  let oldVals = sh.getLastRow() >= 1 && sh.getLastColumn() >= 1 ? sh.getDataRange().getValues() : [];
  oldVals = oldVals.filter(r => r.some(c => c !== ''));
  let hdr = oldVals.length ? oldVals[0].map(c => String(c).trim()) : fileHdr.slice();
  fileHdr.forEach(h => { if (hdr.indexOf(h) < 0) hdr.push(h); });
  const pOld = colIdx_(hdr, spec.upsertCol);
  const kept = oldVals.slice(1).filter(r => newPeriodes.indexOf(normPeriode_(r[pOld])) < 0)
    .map(r => hdr.map((h, i) => (i < r.length ? r[i] : '')));
  const fresh = rows.slice(1).map(r => hdr.map(h => { const i = fileHdr.indexOf(h); return i >= 0 && i < r.length ? r[i] : ''; }));
  const all = [hdr].concat(kept, fresh);
  sh.clearContents();
  ensureGrid_(sh, all.length, hdr.length);
  sh.getRange(1, 1, all.length, hdr.length).setNumberFormat('General');
  textColIndexes_(spec, hdr, false).forEach(ci => sh.getRange(1, ci + 1, all.length, 1).setNumberFormat('@'));
  sh.getRange(1, 1, all.length, hdr.length).setValues(all);
  return fresh.length;
}

/** Hapus cache 5 menit API baca supaya web app langsung melihat data baru. Gagal = tidak fatal. */
function clearWebCache_(dtKode) {
  try {
    const pusat = readRegistry_().filter(r => r.peran === 'pusat')[0];
    if (!pusat) return false;
    const url = API_URL + '?admin=clearCache&code=' + encodeURIComponent(pusat.kode_akses) + '&dt=' + encodeURIComponent(dtKode);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    return res.getResponseCode() === 200 && JSON.parse(res.getContentText()).ok === true;
  } catch (e) {
    return false;
  }
}

// ====================== READ FAKTA TAB (untuk indikator) ======================

/** Fakta tab sekarang. Hanya kolom yang perlu (tanggal / GSV / periode) yang dibaca penuh, supaya tab besar tetap cepat. */
function readFacts_(ss, spec) {
  const f = { exists: false, rows: 0, headerOk: false, missing: [], dataDate: '', sumValue: null, periodes: [], longNumbers: 0 };
  const sh = ss.getSheetByName(spec.key);
  if (!sh) return f;
  f.exists = true;
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return f;
  const head = sh.getRange(1, 1, Math.min(spec.maxScan || 3, lastRow), lastCol).getValues();
  const h = findHeader_(head, spec);
  f.headerOk = h.ok; f.missing = h.missing;
  if (!h.ok) { f.rows = Math.max(0, lastRow - 1); return f; }
  const first = h.rowIdx + 2; // baris sheet pertama setelah header
  f.rows = Math.max(0, lastRow - first + 1);
  if (f.rows === 0) return f;
  const hdr = head[h.rowIdx];
  const read = alts => {
    const c = colIdx_(hdr, alts);
    return c < 0 ? [] : sh.getRange(first, c + 1, f.rows, 1).getValues().map(r => r[0]);
  };
  if (spec.dateCol) f.dataDate = maxDateOf_(read(spec.dateCol));
  if (spec.sumCol) f.sumValue = sumOf_(read(spec.sumCol));
  if (spec.upsertCol) f.periodes = distinctPeriodes_(read(spec.upsertCol));
  return f;
}
