/**
 * Monitoring Harian — API baca-saja data mentah dari Google Sheet.
 *
 * Deploy sebagai Web App: Deploy > New deployment > Web app.
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Endpoint: GET <url exec>?code=<kode akses tim>
 *
 * Sheet hanya berisi data mentah (target, extract DMS, norms SKU, SKU Fokus,
 * report NGDMS, dan master pendukung). Skrip ini tidak menghitung apa pun:
 * ia mengirim isi tab apa adanya, dan halaman web yang menghitung semua
 * pencapaian dan insentif.
 */

// Tab tabel biasa: header di baris 1. Dikirim sebagai array 2D (baris 1 = header).
const TABLE_TABS = ['TARGET', 'DMS_EXTRACT', 'NORMS_SKU', 'SKU_FOKUS', 'DSR', 'OUTLET_MASTER', 'KPI', 'MASTER_PRODUK'];
// Tab yang ditempel apa adanya dari report; halaman mencari baris header sendiri.
const RAW_TABS = ['NGDMS_ASRT'];

// Extract DMS bisa punya puluhan kolom. Hanya kolom ini yang dikirim supaya respons tetap kecil.
const DMS_COLUMNS = ['Salesman', 'DSR Code (Hygiene)', 'Sub_division', 'Category', 'GSV', 'Outlet', 'Kode Outlet Bersih',
  'Outlet Name', 'OutletName', 'SubChannel', 'Sub Channel', 'SKUCode', 'SKU Code', 'TotalQuantity(PCS)',
  'TotalQuantity (PCS)', 'INVDate', 'InvDate', 'Tanggal'];

// Cache mengurangi beban baca Sheet saat beberapa orang buka bersamaan.
const CACHE_TTL_SEC = 300;
const CACHE_KEY = 'raw_v2';
const CHUNK = 90000; // batas satu item CacheService 100 KB

function doGet(e) {
  try {
    const code = String((e.parameter && e.parameter.code) || '').trim();
    if (!code) return jsonOut({ error: 'missing_code' });

    const payload = getPayload_();
    if (code !== String(payload.config.kode_akses || '').trim()) {
      return jsonOut({ error: 'invalid_code' });
    }
    // ?cek=1: ringkasan jumlah baris saja, untuk mengecek Sheet tanpa mengunduh semua data.
    if (e.parameter.cek) {
      const rows = {};
      Object.keys(payload.tabs).forEach(n => { rows[n] = Math.max(0, payload.tabs[n].length - 1); });
      return jsonOut({ builtAt: payload.builtAt, ms: payload.ms, bytes: JSON.stringify(payload).length, rows: rows });
    }
    const configOut = Object.assign({}, payload.config);
    delete configOut.kode_akses;
    return jsonOut({ builtAt: payload.builtAt, config: configOut, tabs: payload.tabs });
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getPayload_() {
  const cached = cacheGet_();
  if (cached) return cached;

  const t0 = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const tabs = {};
  TABLE_TABS.forEach(name => {
    let aoa = readTab_(ss, name, tz);
    if (name === 'DMS_EXTRACT') aoa = pickColumns_(aoa, DMS_COLUMNS);
    tabs[name] = aoa;
  });
  RAW_TABS.forEach(name => { tabs[name] = readTab_(ss, name, tz); });
  tabs.MASTER_PRODUK = trimProduk_(tabs.MASTER_PRODUK, [tabs.NORMS_SKU, tabs.SKU_FOKUS]);

  const payload = { config: readConfig_(ss, tz), tabs: tabs, builtAt: new Date().toISOString(), ms: Date.now() - t0 };
  cachePut_(payload);
  return payload;
}

/** Isi tab sebagai array 2D. Tanggal jadi teks yyyy-MM-dd, baris kosong dibuang. */
function readTab_(ss, name, tz) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Tab tidak ditemukan: ' + name);
  return sh.getDataRange().getValues()
    .map(row => row.map(c => cell_(c, tz)))
    .filter(row => row.some(c => c !== ''));
}

function cell_(c, tz) {
  if (c instanceof Date) return Utilities.formatDate(c, tz, 'yyyy-MM-dd');
  if (c === null || c === undefined) return '';
  return c;
}

function pickColumns_(aoa, wanted) {
  if (!aoa.length) return aoa;
  const hdr = aoa[0].map(h => String(h).trim());
  const idx = hdr.map((h, i) => wanted.indexOf(h) >= 0 ? i : -1).filter(i => i >= 0);
  return aoa.map(row => idx.map(i => row[i]));
}

/**
 * MASTER_PRODUK berisi puluhan ribu SKU. Halaman hanya butuh basepack yang
 * dipakai di NORMS_SKU dan SKU_FOKUS, jadi baris lain tidak dikirim.
 */
function trimProduk_(produk, users) {
  if (produk.length < 2) return produk;
  const used = {};
  users.forEach(t => {
    if (!t.length) return;
    const i = t[0].map(h => String(h).trim()).indexOf('LEVEL-9');
    if (i >= 0) t.slice(1).forEach(r => { used[String(r[i]).trim()] = true; });
  });
  const j = produk[0].map(h => String(h).trim()).indexOf('LEVEL-9');
  if (j < 0) return produk;
  return [produk[0]].concat(produk.slice(1).filter(r => used[String(r[j]).trim()]));
}

/** Tab CONFIG: kolom key dan value, header di baris 1. */
function readConfig_(ss, tz) {
  const obj = {};
  readTab_(ss, 'CONFIG', tz).slice(1).forEach(row => {
    const k = String(row[0] || '').trim();
    if (k) obj[k] = row[1];
  });
  return obj;
}

/* Cache dipecah per 90 KB karena satu item CacheService maksimal 100 KB. */
function cachePut_(payload) {
  try {
    const s = JSON.stringify(payload), parts = {};
    const n = Math.ceil(s.length / CHUNK);
    for (let i = 0; i < n; i++) parts[CACHE_KEY + '_' + i] = s.slice(i * CHUNK, (i + 1) * CHUNK);
    parts[CACHE_KEY + '_n'] = String(n);
    CacheService.getScriptCache().putAll(parts, CACHE_TTL_SEC);
  } catch (err) {
    // Terlalu besar untuk cache: tidak apa-apa, request berikutnya membaca Sheet lagi.
  }
}

function cacheGet_() {
  const cache = CacheService.getScriptCache();
  const n = +cache.get(CACHE_KEY + '_n');
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(CACHE_KEY + '_' + i);
  const got = cache.getAll(keys);
  if (keys.some(k => got[k] == null)) return null;
  try { return JSON.parse(keys.map(k => got[k]).join('')); } catch (err) { return null; }
}

/**
 * Jalankan manual dari editor Apps Script (pilih fungsi ini, klik Run) untuk
 * memaksa data dibaca ulang sebelum cache 5 menit habis. Berguna setelah
 * menempel extract DMS baru.
 */
function clearCache() {
  const cache = CacheService.getScriptCache();
  const n = +cache.get(CACHE_KEY + '_n') || 0;
  const keys = [CACHE_KEY + '_n'];
  for (let i = 0; i < n; i++) keys.push(CACHE_KEY + '_' + i);
  cache.removeAll(keys);
}

/**
 * Jalankan manual dari editor untuk mengecek semua tab terbaca, tanpa deploy.
 * Lihat hasilnya di Execution log: jumlah baris per tab dan header-nya.
 */
function testRead() {
  clearCache();
  const p = getPayload_();
  Logger.log('CONFIG: ' + JSON.stringify(Object.keys(p.config)));
  Object.keys(p.tabs).forEach(name => {
    const t = p.tabs[name];
    Logger.log(name + ': ' + Math.max(0, t.length - 1) + ' baris · header ' + JSON.stringify(t[0] || []));
  });
  Logger.log('Ukuran respons: ' + Math.round(JSON.stringify(p).length / 1024) + ' KB');
}

/* ═══════════════════════════════════════════════════════════════
   SETUP SEKALI: isi Sheet kosong dengan template data mentah.
   Isi TEMPLATE_URL, pilih fungsi importTemplate, klik Run.
   Semua tab dibuat ulang: jangan jalankan lagi setelah data asli diisi.
   ═══════════════════════════════════════════════════════════════ */
const TEMPLATE_URL = '';

function importTemplate() {
  if (!TEMPLATE_URL) throw new Error('TEMPLATE_URL masih kosong.');
  const res = UrlFetchApp.fetch(TEMPLATE_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Template tidak bisa diambil (HTTP ' + res.getResponseCode() + '). Link mungkin sudah dihapus.');
  }
  const data = JSON.parse(res.getContentText('UTF-8'));
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  data.tabs.forEach((t, i) => {
    const sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name, i);
    sh.clear();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
    const w = t.rows.reduce((m, r) => Math.max(m, r.length), 1);
    const rows = t.rows.map(r => r.concat(new Array(w - r.length).fill('')));
    if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
    if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());

    // Kolom kode (kode outlet 18 digit, LEVEL-9, kode DSR) disimpan sebagai teks supaya digitnya utuh.
    t.text.forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));
    sh.getRange(1, 1, rows.length, w).setValues(rows);

    sh.getRange(t.header, 1, 1, w).setFontWeight('bold').setFontColor('#ffffff')
      .setBackground(t.main ? '#1f4e79' : '#595959');
    sh.setFrozenRows(t.header);
    sh.setTabColor(t.main ? '#1f4e79' : '#a6a6a6');
    sh.setColumnWidths(1, w, t.name === 'NGDMS_ASRT' ? 110 : 160);
    Object.keys(t.lists).forEach(c => {
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(t.lists[c], true).setAllowInvalid(false).build();
      sh.getRange(2, +c, sh.getMaxRows() - 1, 1).setDataValidation(rule);
    });
  });
  if (ss.getSheetByName('PANDUAN')) {
    ss.getSheetByName('PANDUAN').setColumnWidth(2, 480).setColumnWidth(4, 520);
  }

  // Hapus tab bawaan (Sheet1 / Lembar1) yang bukan bagian template.
  ss.getSheets().forEach(sh => { if (!data.tabs.some(t => t.name === sh.getName())) ss.deleteSheet(sh); });
  ss.setActiveSheet(ss.getSheetByName('PANDUAN'));
  Logger.log('Template terpasang: ' + data.tabs.map(t => t.name + ' ' + Math.max(0, t.rows.length - 1)).join(', '));
}
