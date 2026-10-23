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
 * Endpoint baca (GET):
 *   GET ?code=<kode DT>                  -> data mentah Sheet DT itu
 *   GET ?code=<kode pusat>               -> daftar DT
 *   GET ?code=<kode pusat>&dt=<dt_kode>  -> data mentah satu DT
 *   tambah &cek=1                        -> jumlah baris per tab saja
 *   tambah &view=gs                      -> KPI Great Sales (tab GS_* di Sheet pusat,
 *                                           diisi tool upload); kode DT hanya melihat toko DT-nya
 *
 * Endpoint tulis (POST, body JSON):
 *   {action:'simpanHasil', code, dt?, periode:'YYYY-MM', rows:[...]}
 *   Menulis HANYA ke tab HASIL_PERHITUNGAN (audit trail hasil hitung web
 *   app, dipakai juga sebagai riwayat aktual bulanan untuk rekap kuartal
 *   SS). Baris lama dengan periode yang sama ditimpa (upsert), tab lain
 *   tidak pernah disentuh dari endpoint ini.
 *
 * Skrip sendiri tidak menghitung pencapaian/insentif: halaman web yang
 * menghitung, skrip ini hanya membaca data mentah dan menyimpan hasilnya
 * balik ke Sheet supaya bisa dicek manual.
 */

const REG_TAB = 'DAFTAR_DT';
const HASIL_TAB = 'HASIL_PERHITUNGAN';
const HASIL_HEADER = [
  'periode', 'kode_dsr', 'nama_dsr',
  'ss_bw_target', 'ss_bw_aktual', 'ss_pc_target', 'ss_pc_aktual', 'ss_hc_target', 'ss_hc_aktual', 'ss_fo_target', 'ss_fo_aktual',
  'ss_target', 'ss_aktual', 'ach_ss',
  'asrt_target', 'asrt_aktual', 'ach_asrt',
  'eco_pjp', 'eco_tx', 'ach_eco',
  'skor', 'band', 'insentif_jasper', 'insentif_add', 'insentif_sku', 'insentif_total',
  'disimpan_pada',
];
const HASIL_MAX_ROWS = 500; // batas wajar jumlah DSR per DT dalam satu simpan

// Tab tabel biasa: header di baris 1. Dikirim sebagai array 2D (baris 1 = header).
const TABLE_TABS = ['TARGET', 'DMS_EXTRACT', 'NORMS_SKU', 'SKU_FOKUS', 'DSR', 'OUTLET_MASTER', 'KPI', 'MASTER_PRODUK', 'HARI_LIBUR'];
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
    // Setup sementara: muat extract DMS + NGDMS mentah dari gist ke Sheet DT.
    // Hanya jalan dengan kode akses peran pusat; kode DT biasa ditolak.
    if (e.parameter && e.parameter.admin === 'loadRaw') {
      const regA = readRegistry_();
      const meA = regA.find(x => x.kode_akses === String(e.parameter.code || '').trim());
      if (!meA || meA.peran !== 'pusat') return jsonOut({ error: 'invalid_code' });
      const r = regA.find(x => x.dt_kode === String(e.parameter.dt || ''));
      if (!r || !r.sheet_id) return jsonOut({ error: 'unknown_dt' });
      return jsonOut(loadRaw_(r.sheet_id, e.parameter.url));
    }
    // &admin=clearCache&dt=<dt_kode> (atau tanpa dt untuk semua DT): paksa baca ulang Sheet
    // sebelum cache 5 menit habis sendiri. Hanya jalan dengan kode akses peran pusat.
    if (e.parameter && e.parameter.admin === 'clearCache') {
      const regC = readRegistry_();
      const meC = regC.find(x => x.kode_akses === String(e.parameter.code || '').trim());
      if (!meC || meC.peran !== 'pusat') return jsonOut({ error: 'invalid_code' });
      const targets = regC.filter(x => x.peran === 'dt' && x.sheet_id && (!e.parameter.dt || x.dt_kode === e.parameter.dt));
      targets.forEach(x => cacheClearKey_(CACHE_KEY + '_' + x.sheet_id));
      return jsonOut({ ok: true, cleared: targets.map(x => x.dt_kode) });
    }
    const p = e.parameter || {};
    const code = String(p.code || '').trim();
    if (!code) return jsonOut({ error: 'missing_code' });

    const reg = readRegistry_();
    const me = reg.find(r => r.kode_akses === code);
    if (!me) return jsonOut({ error: 'invalid_code' });
    if (p.view === 'gs') return jsonOut(respondGs_(me, reg, String(p.dt || '').trim()));

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
  tabs.HASIL_PERHITUNGAN = readHasilTab_(ss);

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

function cacheClearKey_(key) {
  const cache = CacheService.getScriptCache();
  const n = +cache.get(key + '_n') || 0;
  const keys = [key + '_n'];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
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
 * Isi tab DMS_EXTRACT dan NGDMS_ASRT satu Sheet DT dari JSON {ngdms, extract}
 * (masing-masing array 2D, baris pertama header). Menimpa isi lama, sesuai
 * aturan "hapus isi lama, tempel yang baru" di PANDUAN.
 */
function loadRaw_(sheetId, url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: 'fetch_failed', code: res.getResponseCode() };
  const data = JSON.parse(res.getContentText('UTF-8'));
  const ss = SpreadsheetApp.openById(sheetId);
  const put = (name, aoa) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    const w = aoa.reduce((m, r) => Math.max(m, r.length), 1);
    const rows = aoa.map(r => r.concat(new Array(w - r.length).fill('')));
    if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
    if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), Math.min(6, sh.getMaxColumns())).setNumberFormat('@');
    sh.getRange(1, 1, rows.length, w).setValues(rows);
  };
  // Hanya timpa tab yang memang dikirim di payload — bagian yang tidak dikirim
  // (misal ngdms saat cuma update extract) dibiarkan, tidak dikosongkan.
  const result = { ok: true };
  if (data.extract) { put('DMS_EXTRACT', data.extract); result.extractRows = data.extract.length - 1; }
  if (data.ngdms) { put('NGDMS_ASRT', data.ngdms); result.ngdmsRows = data.ngdms.length - 1; }
  if (data.hariLibur) { put('HARI_LIBUR', data.hariLibur); result.hariLiburRows = data.hariLibur.length - 1; }
  cacheClearKey_(CACHE_KEY + '_' + sheetId); // biar perubahan langsung terlihat, tidak nunggu cache habis
  return result;
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

function doPost(e) {
  try {
    let body;
    try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); }
    catch (err) { return jsonOut({ error: 'bad_request', message: 'Body bukan JSON valid.' }); }

    if (body.action !== 'simpanHasil') return jsonOut({ error: 'unknown_action' });

    const target = resolveTarget_(String(body.code || '').trim(), String(body.dt || '').trim());
    if (target.error) return jsonOut(target);

    const periode = String(body.periode || '').trim();
    if (!/^\d{4}-\d{2}$/.test(periode)) return jsonOut({ error: 'bad_request', message: 'periode harus format YYYY-MM.' });
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows || !rows.length) return jsonOut({ error: 'bad_request', message: 'rows kosong.' });
    if (rows.length > HASIL_MAX_ROWS) return jsonOut({ error: 'bad_request', message: 'rows terlalu banyak (maks ' + HASIL_MAX_ROWS + ').' });

    const saved = upsertHasil_(target.sheet_id, periode, rows);
    clearCacheFor_(target.sheet_id);
    return jsonOut({ ok: true, dt: target.dt_kode, periode: periode, saved: saved });
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) });
  }
}

/** Sama seperti logika akses GET (kode DT langsung, atau kode pusat + &dt=), dipakai bersama doGet/doPost. */
function resolveTarget_(code, dtWanted) {
  if (!code) return { error: 'missing_code' };
  const reg = readRegistry_();
  const me = reg.find(r => r.kode_akses === code);
  if (!me) return { error: 'invalid_code' };
  if (me.peran === 'pusat') {
    if (!dtWanted) return { error: 'bad_request', message: 'Kode pusat wajib menyertakan dt.' };
    const r = reg.find(x => x.peran === 'dt' && x.dt_kode === dtWanted && x.sheet_id);
    if (!r) return { error: 'unknown_dt' };
    return r;
  }
  if (!me.sheet_id) return { error: 'server_error', message: 'sheet_id kosong di DAFTAR_DT' };
  return me;
}

/** Tab HASIL_PERHITUNGAN, dibuat otomatis dengan header kalau belum ada. */
function ensureHasilTab_(ss) {
  let sh = ss.getSheetByName(HASIL_TAB);
  if (!sh) {
    sh = ss.insertSheet(HASIL_TAB);
    sh.getRange(1, 1, 1, HASIL_HEADER.length).setValues([HASIL_HEADER]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Isi tab HASIL_PERHITUNGAN sebagai array 2D, dibuat dulu kalau belum ada. */
function readHasilTab_(ss) {
  const sh = ensureHasilTab_(ss);
  return sh.getDataRange().getValues().filter(row => row.some(c => c !== ''));
}

/**
 * Timpa (upsert) baris HASIL_PERHITUNGAN untuk satu periode: baris lama
 * dengan periode itu dibuang, baris baru dari web app ditulis. Periode
 * lain (bulan-bulan sebelumnya) tidak disentuh, jadi jadi riwayat bulanan
 * untuk rekap kuartal. Dikunci supaya dua penyimpanan bersamaan tidak
 * saling menimpa.
 */
function upsertHasil_(sheetId, periode, rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ensureHasilTab_(ss);
    const values = sh.getDataRange().getValues();
    const header = values[0].map(h => String(h).trim());
    const col = n => header.indexOf(n);
    const pCol = col('periode');
    const kept = values.slice(1).filter(r => String(r[pCol]) !== periode);

    const now = new Date().toISOString();
    const fresh = rows.map(row => HASIL_HEADER.map(key => {
      if (key === 'periode') return periode;
      if (key === 'disimpan_pada') return now;
      const v = row[key];
      return v === undefined || v === null ? '' : v;
    }));

    const all = kept.concat(fresh);
    sh.clearContents();
    sh.getRange(1, 1, 1, HASIL_HEADER.length).setValues([HASIL_HEADER]);
    if (all.length) sh.getRange(2, 1, all.length, HASIL_HEADER.length).setValues(all);
    return fresh.length;
  } finally {
    lock.releaseLock();
  }
}

/** Bersihkan cache satu Sheet DT saja (dipanggil setelah menyimpan hasil). */
function clearCacheFor_(sheetId) {
  const cache = CacheService.getScriptCache();
  const key = CACHE_KEY + '_' + sheetId;
  const n = +cache.get(key + '_n') || 0;
  const keys = [key + '_n'];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
}

/**
 * KPI Great Sales: scorecard (riwayat per tanggal) + daftar toko snapshot terakhir dari tab
 * GS_SCORECARD / GS_OUTLET di Sheet pusat. Kode DT (atau kode pusat + &dt=) hanya menerima toko
 * distributornya sendiri; daftar SKU Banded selalu ikut karena berlaku untuk semua DT.
 */
function respondGs_(me, reg, dtWanted) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const read = name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
    return v.slice(1).filter(r => r.some(c => c !== '')).map(r => {
      const o = {}; h.forEach((k, i) => { o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : r[i]; }); return o;
    });
  };
  const scorecard = read('GS_SCORECARD');
  if (!scorecard.length) return { error: 'no_data', message: 'Data Great Sales belum diupload.' };
  let outlets = read('GS_OUTLET');
  let scope = null;
  if (me.peran === 'dt') scope = me;
  else if (dtWanted) scope = reg.find(x => x.peran === 'dt' && x.dt_kode === dtWanted) || null;
  if (scope) {
    const word = (scope.nama_dt.toUpperCase().replace(/^(PT|CV)\.?\s+/, '').split(/\s+/)[0] || '');
    const mine = o => String(o.dist_kode) === scope.dt_kode || (word.length >= 4 && String(o.dist_nama).toUpperCase().indexOf(word) >= 0);
    outlets = outlets.filter(o => o.jenis === 'BANDED_SKU' || mine(o));
  }
  // Perfect Stores: snapshot per toko + target per DT (GS_TARGET) + riwayat mingguan. DT hanya melihat distributornya sendiri.
  let psStores = read('GS_PS'), psTargets = read('GS_TARGET'), psHist = read('GS_PS_HIST');
  if (scope) {
    const own = o => String(o.dist_kode) === scope.dt_kode;
    psStores = psStores.filter(own); psTargets = psTargets.filter(own); psHist = psHist.filter(own);
  }
  // Assortment per channel dari DMS Extract tiap DT dalam cakupan, plus target (GS_ASRT_TARGET).
  const asrtDts = reg.filter(x => x.peran === 'dt' && x.sheet_id && (!scope || x.dt_kode === scope.dt_kode));
  const asrt = { moq: ASRT_MOQ, perDt: [], targets: readAsrtTargets_(ss).filter(t => !scope || t.dist_kode === scope.dt_kode) };
  asrtDts.forEach(x => {
    try { asrt.perDt.push(asrtForDt_(x)); } catch (err) { asrt.perDt.push({ dist_kode: x.dt_kode, dist_nama: x.nama_dt, error: String(err) }); }
  });
  const dts = me.peran === 'pusat' ? reg.filter(r => r.peran === 'dt' && r.sheet_id).map(r => ({ kode: r.dt_kode, nama: r.nama_dt })) : null;
  return { mode: 'gs', peran: me.peran, scope: scope ? { kode: scope.dt_kode, nama: scope.nama_dt } : null, dts: dts, scorecard: scorecard, outlets: outlets, ps: { stores: psStores, targets: psTargets, hist: psHist }, asrt: asrt };
}

// ====================== ASSORTMENT PER CHANNEL (dari DMS Extract) ======================
// Satu "line" = satu base pack (LEVEL-9 di MASTER_PRODUK) yang terbeli satu toko dalam bulan data.
// Dihitung kalau qty bersih (pembelian dikurangi retur) bulan itu minimal ASRT_MOQ pcs. Base pack yang sama
// tidak dihitung dua kali di toko yang sama, jadi assortment hanya naik kalau toko membeli base pack baru.
// Channel toko dari OUTLET_MASTER (Outlet Type Desc). Toko di extract yang tidak ada di OUTLET_MASTER dilaporkan.

const ASRT_MOQ = 3;
const ASRT_TARGET_TAB = 'GS_ASRT_TARGET';
const ASRT_CH = { SPM: 'LOCAL SUPERMARKET', MINIS: 'LOCAL MINIS' };

function asrtChannelOf_(typeDesc) {
  const t = String(typeDesc || '').toUpperCase();
  if (t.indexOf('SUPERMARKET') >= 0 || /\bSPM\b/.test(t)) return 'SPM';
  if (t.indexOf('MINIS') >= 0) return 'MINIS';
  return t ? 'LAIN' : '';
}

/** 'dd/MM/yyyy' atau 'yyyy-MM-dd' -> 'yyyy-MM-dd' ('' kalau tidak terbaca). */
function asrtIso_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}

function asrtNum_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * Pure. dms / produk / outletMaster = array 2D (baris 1 = header). Hasil:
 * {bulan, tanggalData, channels:{SPM|MINIS|LAIN:{outlets, lines, perOutlet, low:[...]}}, unmapped:[...]}.
 * outlets = toko yang transaksi di bulan data (qty bersih positif), lines = jumlah (toko x base pack) yang tercapai.
 */
function computeAsrt_(dms, produk, outletMaster, dtKode, moq) {
  const need = moq || ASRT_MOQ;
  const col = (hdr, alts) => { const h = hdr.map(x => String(x).replace(/\s+/g, ' ').trim().toLowerCase()); for (let i = 0; i < alts.length; i++) { const k = h.indexOf(alts[i].toLowerCase()); if (k >= 0) return k; } return -1; };
  const sku2bp = {};
  if (produk.length) {
    const cS = col(produk[0], ['SKUCode']), cB = col(produk[0], ['LEVEL-9']);
    if (cS >= 0 && cB >= 0) produk.slice(1).forEach(r => { const a = String(r[cS]).trim(), b = String(r[cB]).trim(); if (a && b) sku2bp[a] = b; });
  }
  const chOf = {}, nameOf = {}, registered = {};
  let masterRows = 0;
  if (outletMaster.length) {
    const h = outletMaster[0], cC = col(h, ['Outlet Code']), cN = col(h, ['Outlet Name']), cT = col(h, ['Outlet Type Desc']);
    outletMaster.slice(1).forEach(r => {
      let c = String(r[cC] === undefined ? '' : r[cC]).trim(); if (!c) return;
      if (dtKode && c.indexOf(dtKode) === 0 && c.length > dtKode.length) c = c.slice(dtKode.length);
      chOf[c] = asrtChannelOf_(r[cT]); nameOf[c] = String(r[cN] === undefined ? '' : r[cN]).trim();
      masterRows++;
      if (chOf[c]) registered[chOf[c]] = (registered[chOf[c]] || 0) + 1;
    });
  }
  const out = { bulan: '', tanggalData: '', channels: { SPM: null, MINIS: null, LAIN: null }, unmapped: [], noProduk: 0, rows: 0, masterRows: masterRows };
  if (!dms.length) return out;
  const cO = col(dms[0], ['Outlet', 'Kode Outlet Bersih']), cON = col(dms[0], ['Outlet Name', 'OutletName']), cK = col(dms[0], ['SKUCode', 'SKU Code']),
    cQ = col(dms[0], ['TotalQuantity(PCS)', 'TotalQuantity (PCS)']), cD = col(dms[0], ['INVDate', 'InvDate', 'Tanggal']), cG = col(dms[0], ['GSV']), cS = col(dms[0], ['Salesman', 'DSR Code (Hygiene)']);
  if (cO < 0 || cK < 0 || cQ < 0) return out;
  const body = dms.slice(1);
  let maxIso = '';
  body.forEach(r => { const d = cD >= 0 ? asrtIso_(r[cD]) : ''; if (d > maxIso) maxIso = d; });
  const bulan = maxIso.slice(0, 7);
  out.bulan = bulan; out.tanggalData = maxIso;
  const net = {}, seen = {}, gsv = {};
  body.forEach(r => {
    const d = cD >= 0 ? asrtIso_(r[cD]) : '';
    if (bulan && d && d.slice(0, 7) !== bulan) return; // hanya bulan data terbaru
    const o = String(r[cO]).trim(); if (!o) return;
    out.rows++;
    const nm = cON >= 0 ? String(r[cON]).trim() : '';
    const rec = seen[o] = seen[o] || { nama: nm, sm: cS >= 0 ? String(r[cS]).trim() : '', gsv: 0, last: '' };
    if (!rec.nama) rec.nama = nm;
    if (cG >= 0) rec.gsv += asrtNum_(r[cG]);
    if (d > rec.last) rec.last = d;
    const bp = sku2bp[String(r[cK]).trim()];
    if (!bp) { out.noProduk++; return; }
    const k = o + '|' + bp;
    net[k] = (net[k] || 0) + asrtNum_(r[cQ]);
  });
  const lines = {}, active = {};
  Object.keys(net).forEach(k => {
    const o = k.slice(0, k.indexOf('|'));
    if (net[k] > 0) active[o] = true;
    if (net[k] >= need) lines[o] = (lines[o] || 0) + 1;
  });
  const agg = {};
  Object.keys(seen).forEach(o => {
    const ch = chOf[o];
    if (ch === undefined) { out.unmapped.push({ outlet: o, nama: seen[o].nama, salesman: seen[o].sm, gsv: Math.round(seen[o].gsv), terakhir: seen[o].last, lines: lines[o] || 0 }); return; }
    if (!ch) return;
    const a = agg[ch] = agg[ch] || { outlets: 0, lines: 0, list: [] };
    if (!active[o]) return;
    a.outlets++; a.lines += lines[o] || 0;
    a.list.push({ outlet: o, nama: nameOf[o] || seen[o].nama, lines: lines[o] || 0 });
  });
  Object.keys(agg).forEach(ch => {
    const a = agg[ch];
    a.list.sort((x, y) => x.lines - y.lines);
    out.channels[ch] = { outlets: a.outlets, lines: a.lines, perOutlet: a.outlets ? a.lines / a.outlets : 0, low: a.list.slice(0, 10), registered: registered[ch] || 0 };
  });
  Object.keys(registered).forEach(ch => { if (!out.channels[ch]) out.channels[ch] = { outlets: 0, lines: 0, perOutlet: 0, low: [], registered: registered[ch] }; });
  out.unmapped.sort((x, y) => y.gsv - x.gsv);
  return out;
}

function readAsrtTargets_(ss) {
  const sh = ss.getSheetByName(ASRT_TARGET_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(r => String(r[0]).trim()).map(r => ({
    dist_kode: String(r[0]).trim(), dist_nama: String(r[1]).trim(), channel: String(r[2]).trim(), target_lines: asrtNum_(r[3]),
  }));
}

/** Assortment satu DT (cache 5 menit). MASTER_PRODUK dibaca penuh karena payload hanya memuat SKU yang dipakai norms/fokus. */
function asrtForDt_(r) {
  const payload = getPayload_(r.sheet_id);
  const key = 'asrt_v2_' + r.sheet_id + '_' + payload.builtAt;
  const hit = cacheGet_(key);
  if (hit) return hit;
  const ss = SpreadsheetApp.openById(r.sheet_id);
  const sh = ss.getSheetByName('MASTER_PRODUK');
  const produk = sh ? sh.getDataRange().getValues() : [];
  const res = computeAsrt_(payload.tabs.DMS_EXTRACT || [], produk, payload.tabs.OUTLET_MASTER || [], r.dt_kode, ASRT_MOQ);
  res.dist_kode = r.dt_kode; res.dist_nama = r.nama_dt;
  cachePut_(key, res);
  return res;
}
