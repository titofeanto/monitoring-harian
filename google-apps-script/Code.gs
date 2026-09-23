/**
 * Monitoring Harian — API baca-saja data mentah, banyak DT.
 *
 * Skrip ini terpasang di Sheet PUSAT (hanya pemilik). Tab DAFTAR_DT berisi
 * satu baris per kode akses:
 *   kode_akses | peran (dt / pusat) | dt_kode | nama_dt | sheet_id | aktif
 * Tiap DT punya Sheet data mentah sendiri (sheet_id), diisi admin DT itu.
 * Sheet DT harus dibagikan ke akun pemilik skrip ini.
 *
 * Deploy sebagai Web App: Execute as Me, Who has access Anyone.
 *
 * Endpoint:
 *   GET ?code=<kode DT>                  -> data mentah Sheet DT itu
 *   GET ?code=<kode pusat>               -> daftar DT
 *   GET ?code=<kode pusat>&dt=<dt_kode>  -> data mentah satu DT
 *   tambah &cek=1                        -> jumlah baris per tab saja
 *
 * Skrip tidak menghitung apa pun: halaman web yang menghitung semua
 * pencapaian dan insentif.
 */

const REG_TAB = 'DAFTAR_DT';

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
const CACHE_KEY = 'raw_v3';
const CHUNK = 90000; // batas satu item CacheService 100 KB

function doGet(e) {
  try {
    const p = e.parameter || {};
    const code = String(p.code || '').trim();
    if (!code) return jsonOut({ error: 'missing_code' });

    const reg = readRegistry_();
    const me = reg.find(r => r.kode_akses === code);
    if (!me) return jsonOut({ error: 'invalid_code' });

    if (me.peran === 'pusat') {
      const dts = reg.filter(r => r.peran === 'dt' && r.sheet_id);
      const want = String(p.dt || '').trim();
      if (!want) return jsonOut({ mode: 'pusat', dts: dts.map(r => ({ kode: r.dt_kode, nama: r.nama_dt })) });
      const r = dts.find(x => x.dt_kode === want);
      if (!r) return jsonOut({ error: 'unknown_dt' });
      return jsonOut(respond_(r, p));
    }
    if (!me.sheet_id) return jsonOut({ error: 'server_error', message: 'sheet_id kosong di DAFTAR_DT' });
    return jsonOut(respond_(me, p));
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) });
  }
}

/** Baris aktif tab DAFTAR_DT di Sheet pusat. */
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

function respond_(r, p) {
  const payload = getPayload_(r.sheet_id);
  // ?cek=1: ringkasan jumlah baris saja, untuk mengecek Sheet tanpa mengunduh semua data.
  if (p.cek) {
    const rows = {};
    Object.keys(payload.tabs).forEach(n => { rows[n] = Math.max(0, payload.tabs[n].length - 1); });
    return { dt: r.dt_kode, builtAt: payload.builtAt, ms: payload.ms, bytes: JSON.stringify(payload).length, rows: rows };
  }
  const configOut = Object.assign({}, payload.config);
  delete configOut.kode_akses;
  return { mode: 'dt', dt: { kode: r.dt_kode, nama: r.nama_dt }, builtAt: payload.builtAt, config: configOut, tabs: payload.tabs };
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getPayload_(sheetId) {
  const key = CACHE_KEY + '_' + sheetId;
  const cached = cacheGet_(key);
  if (cached) return cached;

  const t0 = Date.now();
  const ss = SpreadsheetApp.openById(sheetId);
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
  cachePut_(key, payload);
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
function cachePut_(key, payload) {
  try {
    const s = JSON.stringify(payload), parts = {};
    const n = Math.ceil(s.length / CHUNK);
    for (let i = 0; i < n; i++) parts[key + '_' + i] = s.slice(i * CHUNK, (i + 1) * CHUNK);
    parts[key + '_n'] = String(n);
    CacheService.getScriptCache().putAll(parts, CACHE_TTL_SEC);
  } catch (err) {
    // Terlalu besar untuk cache: tidak apa-apa, request berikutnya membaca Sheet lagi.
  }
}

function cacheGet_(key) {
  const cache = CacheService.getScriptCache();
  const n = +cache.get(key + '_n');
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
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
  readRegistry_().filter(r => r.sheet_id).forEach(r => {
    const key = CACHE_KEY + '_' + r.sheet_id;
    const n = +cache.get(key + '_n') || 0;
    const keys = [key + '_n'];
    for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    cache.removeAll(keys);
  });
}

/**
 * Jalankan manual dari editor untuk mengecek semua tab terbaca, tanpa deploy.
 * Lihat hasilnya di Execution log: jumlah baris per tab dan header-nya.
 */
function testRead() {
  clearCache();
  readRegistry_().filter(r => r.sheet_id).forEach(r => {
    const p = getPayload_(r.sheet_id);
    Logger.log('== ' + r.dt_kode + ' ' + r.nama_dt);
    Object.keys(p.tabs).forEach(name => {
      Logger.log(name + ': ' + Math.max(0, p.tabs[name].length - 1) + ' baris');
    });
  });
}
