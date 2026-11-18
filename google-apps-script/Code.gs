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
 *   tambah &view=stok                    -> Cek Stok & harga naik (tab STOK_GUDANG per DT + HARGA_PL
 *                                           di Sheet pusat, diisi tool upload); kode DT hanya melihat stok DT-nya
 *
 * Endpoint tulis (POST, body JSON):
 *   {action:'simpanHasil', code, dt?, periode:'YYYY-MM', rows:[...]}
 *   Menulis HANYA ke tab HASIL_PERHITUNGAN (audit trail hasil hitung web
 *   app, dipakai juga sebagai riwayat aktual bulanan untuk rekap kuartal
 *   SS). Baris lama dengan periode yang sama ditimpa (upsert), tab lain
 *   tidak pernah disentuh dari endpoint ini.
 *
 *   {action:'simpanStok', token, dt, tanggal:'YYYY-MM-DD', rows:[[sku,karton,lusin,pcs,isi],...]}
 *   Dikirim otomatis oleh SBA Logbook App tiap stock distributor diunggah. Menggantikan HANYA baris DT itu
 *   di tab STOK_GUDANG. Tanpa token (repo SBA publik): dijaga validasi. DT yang tidak ada di DAFTAR_DT, laporan
 *   yang lebih lama dari yang tersimpan, dan laporan dengan jumlah SKU < 50% dari sebelumnya diabaikan
 *   (balasan skipped). Isi tab sebelum ditimpa disalin ke tab tersembunyi "(Backup) STOK_GUDANG".
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
    // &admin=clearCache&dt=<dt_kode> (atau tanpa dt untuk semua DT): paksa baca ulang Sheet
    // sebelum cache 5 menit habis sendiri. Hanya jalan dengan kode akses peran pusat.
    if (e.parameter && e.parameter.admin === 'clearCache') {
      const regC = readRegistry_();
      const meC = regC.find(x => x.kode_akses === String(e.parameter.code || '').trim());
      if (!meC || meC.peran !== 'pusat') { noteBadCode_(); return jsonOut({ error: 'invalid_code' }); }
      const targets = regC.filter(x => x.peran === 'dt' && x.sheet_id && (!e.parameter.dt || x.dt_kode === e.parameter.dt));
      targets.forEach(x => cacheClearKey_(CACHE_KEY + '_' + x.sheet_id));
      return jsonOut({ ok: true, cleared: targets.map(x => x.dt_kode) });
    }
    // &admin=snapshot&dt=<dt_kode>: simpan rekap bulanan dari DMS Extract DT itu (dipanggil tool upload setelah upload DMS).
    if (e.parameter && e.parameter.admin === 'snapshot') {
      const regS = readRegistry_();
      const meS = regS.find(x => x.kode_akses === String(e.parameter.code || '').trim());
      if (!meS || meS.peran !== 'pusat') { noteBadCode_(); return jsonOut({ error: 'invalid_code' }); }
      const lockS = LockService.getScriptLock();
      lockS.waitLock(30000);
      try {
        const ssS = SpreadsheetApp.getActiveSpreadsheet();
        const tokoS = readObjs_(ssS, 'GS_TOKO'), skuS = readObjs_(ssS, 'GS_BANDED_SKU').map(b => ({ channel: str_(b.channel), sku_kode: str_(b.sku_kode), sku_nama: str_(b.sku_nama) }));
        const cfgS = readGsCfg_(ssS);
        const outS = regS.filter(x => x.peran === 'dt' && x.sheet_id && (!e.parameter.dt || x.dt_kode === e.parameter.dt)).map(x => snapshotDt_(ssS, x, tokoS, skuS, cfgS));
        return jsonOut({ ok: true, saved: outS });
      } finally { lockS.releaseLock(); }
    }
    if (((e.parameter || {}).view) === 'status') return jsonOut(readStatus_()); // publik: dibaca semua aplikasi untuk spanduk maintenance
    const p = e.parameter || {};
    const code = String(p.code || '').trim();
    if (!code) return jsonOut({ error: 'missing_code' });

    const reg = readRegistry_();
    const me = reg.find(r => r.kode_akses === code);
    if (!me) { noteBadCode_(); return jsonOut({ error: 'invalid_code' }); }
    if (p.view === 'gs') return jsonOut(respondGs_(me, reg, String(p.dt || '').trim()));
    if (p.view === 'stok') return jsonOut(respondStok_(me, reg, String(p.dt || '').trim()));
    if (p.view === 'hadir') return jsonOut(respondHadir_(me, reg, String(p.dt || '').trim()));
    if (p.view === 'rank') return jsonOut(respondRank_(me, reg));   // ranking bersama: peran apa pun, lintas DT (hanya bidang aman, lihat rankPublicRow_)

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

/** String aman: null/undefined (kolom hilang atau header berganti nama) jadi '' bukan teks "undefined". */
function str_(v) { return v === null || v === undefined ? '' : String(v); }

/** Angka dari sel; kosong, teks bukan angka, atau galat rumus (#N/A) jadi null, tidak pernah NaN. */
function numOrNull_(v) { if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null; const n = +v; return isFinite(n) ? n : null; }

/** Teks sel: Date (sel tanggal/jam yang diketik tangan jadi Date di Sheet) diformat dengan zona Sheet, bukan String(Date). */
function cellText_(v, ss, fmt) { return v instanceof Date ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), fmt) : str_(v); }

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Kode akses salah: hitung per 10 menit. Mulai ambang tarpit, balasan ditahan 2 detik (hanya jalur kode salah,
// pengguna dengan kode benar tidak terkena). Mulai ambang waspada, tulis peringatan ke log eksekusi sekali per jam.
const BAD_WINDOW_SEC = 600, BAD_TARPIT_AT = 20, BAD_ALERT_AT = 50;
function noteBadCode_() {
  const cache = CacheService.getScriptCache();
  const n = (+cache.get('bad_code') || 0) + 1;   // tidak atomik, cukup untuk hitungan kasar
  cache.put('bad_code', String(n), BAD_WINDOW_SEC);
  if (n >= BAD_ALERT_AT && !cache.get('bad_code_alert')) {
    cache.put('bad_code_alert', '1', 3600);
    console.warn('Kode akses salah: ' + n + ' percobaan dalam 10 menit terakhir.');
  }
  if (n >= BAD_TARPIT_AT) Utilities.sleep(2000);
}

/** Jalankan manual dari editor: cek kekuatan kode akses. Tidak pernah mencetak nilai kode. */
function auditKodeAkses() {
  const reg = readRegistry_(), seen = {};
  reg.forEach(r => { seen[r.kode_akses] = (seen[r.kode_akses] || 0) + 1; });
  reg.forEach(r => {
    const k = r.kode_akses, flags = [];
    if (k.length < 10) flags.push('pendek (' + k.length + ' karakter)');
    if (/^\d+$/.test(k)) flags.push('hanya angka');
    if (seen[k] > 1) flags.push('dipakai ' + seen[k] + ' baris');
    Logger.log((r.peran === 'pusat' ? 'pusat' : 'dt ' + r.dt_kode) + ': ' + (flags.length ? flags.join(', ') : 'ok (' + k.length + ' karakter)'));
  });
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

    if (body.action === 'simpanStok') return jsonOut(simpanStok_(body));
    if (body.action === 'cekKodeAdmin') return jsonOut(adminAuth_(String(body.kode || '')) || { ok: true });
    if (body.action === 'setStatus') return jsonOut(setStatus_(body));
    if (body.action === 'gantiKodeAdmin') return jsonOut(gantiKodeAdmin_(body));
    if (body.action === 'klaimKodeAdmin') return jsonOut(klaimKodeAdmin_(body));
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
  if (!me) { noteBadCode_(); return { error: 'invalid_code' }; }
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
 * Cek Stok: stok gudang per DT (STOK_GUDANG) + daftar harga lama/baru (HARGA_PL), digabung di halaman.
 * Kode DT hanya menerima stok DT-nya; kode pusat menerima semua DT (atau satu DT lewat &dt=).
 * Biaya beli / MAP tidak pernah disimpan di tab ini.
 */
function respondStok_(me, reg, dtWanted) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const harga = readObjs_(ss, 'HARGA_PL');
  if (!harga.length) return { error: 'no_data', message: 'Daftar harga belum diupload.' };
  let stok = readObjs_(ss, 'STOK_GUDANG');
  let dts = reg.filter(x => x.peran === 'dt' && x.sheet_id);
  if (me.peran === 'dt') dts = dts.filter(x => x.dt_kode === me.dt_kode);
  else if (dtWanted) dts = dts.filter(x => x.dt_kode === dtWanted);
  const ok = {}; dts.forEach(x => { ok[x.dt_kode] = true; });
  stok = stok.filter(r => ok[String(r.dt_kode)]);
  if (!stok.length) return { error: 'no_data', message: 'Stok gudang belum diupload untuk DT ini.' };
  const iso = v => v instanceof Date ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v);
  const tanggal = {};
  stok.forEach(r => { tanggal[String(r.dt_kode)] = iso(r.tanggal); });
  const jualObjs = readObjs_(ss, 'JUAL_SKU').filter(r => ok[String(r.dt_kode)]);
  return {
    mode: 'stok',
    dts: dts.filter(x => tanggal[x.dt_kode]).map(x => ({ kode: x.dt_kode, nama: x.nama_dt, tanggal: tanggal[x.dt_kode] })),
    stok: stok.map(r => [str_(r.dt_kode), str_(r.sku), +r.karton || 0, +r.lusin || 0, +r.pcs || 0, +r.isi || 1, +r.rpp || 0]),
    jual: jualObjs.map(r => [str_(r.dt_kode), str_(r.sku), str_(r.bkt), str_(r.mulai), str_(r.v)]),
    flags: readObjs_(ss, 'SKU_FLAG').map(r => [str_(r.barcode), str_(r.flag), str_(r.plu), str_(r.ket)]),
    harga: harga.map(r => ({ sku: str_(r.sku), bc: str_(r.barcode), brand: str_(r.brand), nama: str_(r.nama), kemasan: str_(r.kemasan),
      isi: +r.isi || 1, mulai: iso(r.mulai || ''), hNew: numOrNull_(r.h_new), hOld: numOrNull_(r.h_old),
      sNew: numOrNull_(r.s_new), sOld: numOrNull_(r.s_old) })),
    hargaTanggal: harga.length ? String(harga[0].tanggal_pl || '') : '',
    wcWarn: { ambang: STOK_WC_WARN, perDt: stokWcPerDt_(dts, stok, harga, jualObjs, tanggal, iso) },
  };
}

/**
 * Kehadiran salesman: kunjungan pertama per hari (tab KEHADIRAN) dan nama salesman (tab SALES_MASTER) di Sheet pusat.
 * Kode DT hanya melihat salesman DT-nya; kode pusat melihat semua DT (atau satu DT lewat &dt=).
 */
function respondHadir_(me, reg, dtWanted) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dts = reg.filter(x => x.peran === 'dt' && x.sheet_id);
  if (me.peran === 'dt') dts = dts.filter(x => x.dt_kode === me.dt_kode);
  else if (dtWanted) dts = dts.filter(x => x.dt_kode === dtWanted);
  const ok = {}; dts.forEach(x => { ok[x.dt_kode] = true; });
  const read = (name, n) => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().filter(r => r.some(c => c !== '') && ok[String(r[0])]);
  };
  const rows = read('KEHADIRAN', 6);
  if (!rows.length) return { error: 'no_data', message: 'Data kehadiran belum diupload untuk DT ini.' };
  return {
    mode: 'hadir',
    dts: dts.map(x => ({ kode: x.dt_kode, nama: x.nama_dt })),
    sales: read('SALES_MASTER', 3).map(r => [String(r[0]), String(r[1]), String(r[2] || '')]),
    rows: rows.map(r => [str_(r[0]), str_(r[1]), cellText_(r[2], ss, 'yyyy-MM-dd'), cellText_(r[3], ss, 'HH:mm'), +r[4] ? 1 : 0, +r[5] || 1]),
  };
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
      const o = {}; h.forEach((k, i) => { o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : r[i]; }); return fillCols_(o, name);
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
  // Weekly FOP & Banded: daftar toko monitoring + SKU banded + config, dihitung dari DMS Extract tiap DT dalam cakupan.
  const toko = read('GS_TOKO').filter(t => !scope || String(t.dist_kode) === scope.dt_kode);
  const bandedSku = read('GS_BANDED_SKU').map(b => ({ channel: str_(b.channel), sku_kode: str_(b.sku_kode), sku_nama: str_(b.sku_nama) }));
  const cfg = readGsCfg_(ss);
  const hist = read('GS_BULANAN').filter(h => !scope || String(h.dist_kode) === scope.dt_kode);
  const mon = { cfg: cfg, hasList: toko.length > 0, bandedSku: bandedSku, perDt: [], noDt: [], manual: read('GS_MANUAL').slice(-60), recap: monRecap_(hist, read('GS_BULANAN_ASRT').filter(a => !scope || String(a.dist_kode) === scope.dt_kode), bandedSku, cfg) };
  if (toko.length) {
    const kodes = {}; toko.forEach(t => { kodes[String(t.dist_kode)] = t.dist_nama; });
    asrtDts.forEach(x => {
      if (!kodes[String(x.dt_kode)]) return;
      try { mon.perDt.push(monForDt_(x, toko, bandedSku, cfg, hist)); } catch (err) { mon.perDt.push({ dist_kode: x.dt_kode, dist_nama: x.nama_dt, error: String(err) }); }
    });
    const have = {}; asrtDts.forEach(x => { have[String(x.dt_kode)] = true; });
    Object.keys(kodes).filter(k => !have[k]).forEach(k => mon.noDt.push({ dist_kode: k, dist_nama: kodes[k], stores: toko.filter(t => String(t.dist_kode) === k).length }));
  }
  // Ranking sales per BU (FOP, Banded, Assortment) dari DT dalam cakupan; DT yang gagal tidak menggagalkan yang lain.
  const rankRes = asrtDts.map(x => salesRankForDt_(x, toko, bandedSku, cfg, hist));
  const ranking = rankSales_(rankRes, cfg.rank_min_toko);
  ranking.perDt = rankRes.map(d => ({ dist_kode: d.dist_kode, dist_nama: d.dist_nama, stores: d.stores || 0, status: d.error ? 'error' : d.bulan ? 'ok' : 'tanpa_data', error: d.error || '' }));
  const dts = me.peran === 'pusat' ? reg.filter(r => r.peran === 'dt' && r.sheet_id).map(r => ({ kode: r.dt_kode, nama: r.nama_dt })) : null;
  return { mode: 'gs', peran: me.peran, scope: scope ? { kode: scope.dt_kode, nama: scope.nama_dt } : null, dts: dts, scorecard: scorecard, outlets: outlets, ps: { stores: psStores, targets: psTargets, hist: psHist }, asrt: asrt, mon: mon, ranking: ranking,
    live: computeGsLive_({ scorecard: scorecard, ps: { stores: psStores, targets: psTargets }, asrt: asrt, mon: mon, scoped: !!scope }) };
}

// ====================== KPI & SKOR GREAT SALES (satu sumber logika) ======================
const GS_BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const GS_ASRT_CH = [['SPM', 'LOCAL SUPERMARKET', 'ASRT_SPM'], ['MINIS', 'LOCAL MINIS', 'ASRT_MINIS']];

/** Parser angka sama dengan browser lama: koma dibuang, parseFloat, NaN jadi null. Bukan asrtNum_. */
function gsNum_(v) { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? null : n; }
/** '2026-11-12' -> '12 Nov 2026'. */
function gsTgl_(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m && GS_BULAN[+m[2]] ? (+m[3]) + ' ' + GS_BULAN[+m[2]] + ' ' + m[1] : String(iso || ''); }
function gsLevel_(aktual, target) {
  const a = gsNum_(aktual), t = gsNum_(target);
  if (a == null || !t) return 'amber';
  if (a >= t) return 'green';
  return a >= t * 0.8 ? 'amber' : 'red';
}
function gsSetKpi_(k, aktual, catatan) {
  k.aktual = aktual;
  k.poin = k.target ? k.bobot * Math.min(aktual / k.target, 1) : null;
  k.hilang = k.poin == null ? 0 : k.bobot - k.poin;
  k.catatan = catatan;
}

/**
 * Satu-satunya tempat KPI Great Sales dihitung dan diberi poin/level. Pure (tanpa layanan Apps Script); diuji di tests/gslive.test.mjs.
 * in_ = { scorecard, ps:{stores,targets}, asrt:{perDt,targets}, mon:{cfg,hasList,perDt,manual}, scoped }.
 * Per toko (FOP, Banded, Assortment) tidak dihitung ulang di sini: hasil monForDt_/asrtForDt_ dipakai apa adanya.
 */
function computeGsLive_(in_) {
  const scorecard = in_.scorecard || [], ps = in_.ps || {}, asrt = in_.asrt || {}, mon = in_.mon || {};
  // snapshot per tanggal: {tanggal: {kpi: baris}}
  const by = {};
  scorecard.forEach(r => { const t = str_(r.tanggal); (by[t] = by[t] || {})[r.kpi] = r; });
  const snaps = Object.keys(by).sort().map(t => ({ tanggal: t, rows: by[t] }));
  const cur = snaps[snaps.length - 1], prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  if (!cur) return null;

  const kp = Object.values(cur.rows).filter(r => ['SCORE', 'RANK', 'FOP_WEEK'].indexOf(r.kpi) < 0).map(r => {
    const bobot = gsNum_(r.bobot) || 0, poin = gsNum_(r.poin);
    return { kpi: r.kpi, label: r.label, target: gsNum_(r.target), aktual: gsNum_(r.aktual), bobot: bobot, poin: poin, hilang: poin == null ? 0 : bobot - poin, catatan: r.catatan };
  }).sort((a, b) => b.hilang - a.hilang);

  // Rank & %DR isian manual mingguan: entri terbaru dan sebelumnya (hanya yang punya rank).
  const man = (mon.manual || []).filter(x => gsNum_(x.rank) != null).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
  const mm = { cur: man[man.length - 1] || null, prev: man.length > 1 ? man[man.length - 2] : null };

  // PS dari upload mingguan
  let sm = null;
  const st = ps.stores || [];
  if (st.length) {
    const tg = (ps.targets || []).reduce((a, t) => ({ full: a.full + (gsNum_(t.target_full) || 0), lite: a.lite + (gsNum_(t.target_lite) || 0) }), { full: 0, lite: 0 });
    const full = st.filter(o => o.status === 'PS FULL').length, lite = st.filter(o => o.status === 'PS LITE').length;
    sm = { stores: st.length, full: full, lite: lite, perfect: full + lite, target: tg.full + tg.lite, tFull: tg.full, tLite: tg.lite, tanggal: String(st[0].tanggal) };
  }

  // Assortment per channel dari DMS Extract
  let as = null;
  const adts = (asrt.perDt || []).filter(d => !d.error);
  if (adts.length) {
    as = {};
    GS_ASRT_CH.forEach(c => {
      let lines = 0, outlets = 0, target = 0;
      adts.forEach(d => { const x = d.channels && d.channels[c[0]]; if (x) { lines += x.lines; outlets += x.outlets; } });
      (asrt.targets || []).forEach(t => { if (t.channel === c[1]) target += gsNum_(t.target_lines) || 0; });
      as[c[0]] = { lines: lines, outlets: outlets, target: target, pct: target > 0 ? lines / target : null, perOutlet: outlets ? lines / outlets : 0 };
    });
  }

  // Weekly FOP & Banded dari daftar toko monitoring
  const mdts = (mon.perDt || []).filter(d => !d.error && !d.noData && d.groups);
  const monLive = !!(mon.hasList && mdts.length);
  let ms = null;
  if (monLive) {
    ms = { bulan: '', tanggal: '', week: null, qLabel: '', qMonths: [], fop: {}, banded: {} };
    mdts.forEach(d => { if (d.tanggalData > ms.tanggal) { ms.tanggal = d.tanggalData; ms.bulan = d.bulan; ms.week = d.week; ms.qLabel = d.qLabel; ms.qMonths = d.qMonths || []; } });
    ['SPM', 'MINIS'].forEach(g => {
      const stores = [];
      mdts.forEach(d => (d.groups[g] || []).forEach(o => stores.push(o)));
      const w = stores.filter(o => o.status === 'WEEKLY').length, h = stores.filter(o => o.bHit).length;
      ms.fop[g] = { n: stores.length, weekly: w, pct: stores.length ? w / stores.length : null };
      ms.banded[g] = { n: stores.length, hit: h, pct: stores.length ? h / stores.length : null };
    });
  }

  // KPI yang dihitung ulang dari data kita, bukan angka HO
  let changed = false;
  if (sm && sm.target) {
    const k = kp.find(x => x.kpi === 'PS');
    if (k) { gsSetKpi_(k, sm.perfect / sm.target, 'Dihitung dari upload Perfect Stores ' + gsTgl_(sm.tanggal) + ': ' + sm.perfect + ' dari target ' + sm.target + ' toko perfect'); changed = true; }
  }
  if (as) GS_ASRT_CH.forEach(c => {
    const a = as[c[0]], k = kp.find(x => x.kpi === c[2]);
    if (k && a.pct != null) { gsSetKpi_(k, a.pct, 'Dihitung dari Extract DMS: ' + a.lines + ' lines dari target ' + a.target); changed = true; }
  });
  if (ms) [['FOP_SPM', 'fop', 'SPM'], ['FOP_MINIS', 'fop', 'MINIS'], ['BANDED_SPM', 'banded', 'SPM'], ['BANDED_MINIS', 'banded', 'MINIS']].forEach(c => {
    const k = kp.find(x => x.kpi === c[0]), a = ms[c[1]][c[2]];
    if (!k || a.pct == null) return;
    gsSetKpi_(k, a.pct, c[1] === 'fop' ? 'Dihitung dari Extract DMS ' + gsTgl_(ms.tanggal) + ': ' + a.weekly + ' dari ' + a.n + ' toko monitoring WEEKLY'
      : 'EVB ' + ms.qLabel + ' dari Extract DMS ' + gsTgl_(ms.tanggal) + ': ' + a.hit + ' dari ' + a.n + ' toko tercapai');
    changed = true;
  });
  const dr = kp.find(x => x.kpi === 'DR');
  if (dr) {
    dr.weekly = true;
    if (mm.cur && gsNum_(mm.cur.dr) != null) { gsSetKpi_(dr, gsNum_(mm.cur.dr), 'Isian manual ' + gsTgl_(mm.cur.tanggal)); changed = true; }
    else dr.catatan = (dr.catatan ? dr.catatan + ' · ' : '') + 'belum diisi di tool upload, memakai angka file';
  }
  if (changed) kp.sort((a, b) => b.hilang - a.hilang);
  kp.forEach(k => { k.level = gsLevel_(k.aktual, k.target); });

  const score = changed ? kp.reduce((a, x) => a + (x.poin || 0), 0) : null;
  const scoreHo = gsNum_(cur.rows.SCORE && cur.rows.SCORE.aktual);
  const recalculated = score != null && !in_.scoped;
  const fw = cur.rows.FOP_WEEK;
  return {
    tanggal: cur.tanggal,
    kpis: kp,
    score: score,
    scoreShown: recalculated ? score : scoreHo,
    recalculated: recalculated,
    rank: mm.cur ? gsNum_(mm.cur.rank) : gsNum_(cur.rows.RANK && cur.rows.RANK.aktual),
    prevRank: mm.cur ? (mm.prev ? gsNum_(mm.prev.rank) : null) : (prev ? gsNum_(prev.rows.RANK && prev.rows.RANK.aktual) : null),
    fopWeek: fw && fw.aktual !== undefined && fw.aktual !== null ? fw.aktual : '',
    history: snaps.map(s => ({ tanggal: s.tanggal, rank: s.rows.RANK ? s.rows.RANK.aktual : null, score: s.rows.SCORE ? (gsNum_(s.rows.SCORE.aktual) || 0) : null })),
    summary: { ps: sm, asrt: as, mon: ms },
    monLive: monLive,
  };
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

const ASRT_TREND_TAB = 'GS_TREND_ASRT';
const ASRT_BASE_FROM = '2025-10', ASRT_BASE_TO = '2025-12';

/** Baca GS_TREND_ASRT (dist_kode | outlet_kode | periode | lines). Tab tidak ada atau kosong = []. */
function readTrendAsrt_(ss) {
  const sh = ss.getSheetByName(ASRT_TREND_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(r => String(r[0]).trim() && String(r[1]).trim()).map(r => ({
    dist_kode: String(r[0]).trim(), outlet_kode: String(r[1]).trim(), periode: String(r[2]).trim().slice(0, 7), lines: asrtNum_(r[3]),
  }));
}

/** Pure. Baseline per toko = rata-rata lines bulan yang ADA barisnya di rentang [from, to]. -> { 'dist|outlet': {baseline, bulan} }. */
function asrtBaseline_(trendRows, from, to) {
  const lo = from || ASRT_BASE_FROM, hi = to || ASRT_BASE_TO, acc = {};
  (trendRows || []).forEach(r => {
    if (r.periode < lo || r.periode > hi) return;
    const k = r.dist_kode + '|' + r.outlet_kode, a = acc[k] = acc[k] || { sum: 0, per: {} };
    if (a.per[r.periode]) return; // satu baris per bulan; duplikat diabaikan
    a.per[r.periode] = 1; a.sum += r.lines;
  });
  const out = {};
  Object.keys(acc).forEach(k => { const n = Object.keys(acc[k].per).length; out[k] = { baseline: acc[k].sum / n, bulan: n }; });
  return out;
}

/** Pure. Target per toko = baseline x (1 + growth), hanya toko dengan baseline > 0. */
function asrtTargetPerToko_(baselineMap, growth) {
  const g = typeof growth === 'number' ? growth : GS_CFG_DEFAULT.asrt_growth, out = {};
  Object.keys(baselineMap || {}).forEach(k => { if (baselineMap[k].baseline > 0) out[k] = baselineMap[k].baseline * (1 + g); });
  return out;
}

/** Pure. Skor Assortment untuk sekumpulan toko. Hanya toko bertarget masuk target/aktual; tanpa pembatas per toko. */
function asrtScoreForStores_(storeKeys, linesByStore, targetMap) {
  const res = { target: 0, aktual: 0, tokoTarget: 0, tokoNaik: 0, tanpaBaseline: 0, pct: null };
  (storeKeys || []).forEach(k => {
    if (!(k in targetMap)) { res.tanpaBaseline++; return; }
    const l = linesByStore[k] || 0;
    res.target += targetMap[k]; res.aktual += l; res.tokoTarget++;
    if (l >= targetMap[k]) res.tokoNaik++;
  });
  res.pct = res.target > 0 ? res.aktual / res.target : null;
  return res;
}

/** Baseline + target dari tab tren. Tab kosong/tidak ada -> { aktif:false }. */
function asrtTrendInfo_(ss, growth) {
  const base = asrtBaseline_(readTrendAsrt_(ss));
  if (!Object.keys(base).length) return { aktif: false };
  return { aktif: true, baseline: base, target: asrtTargetPerToko_(base, growth) };
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

// ====================== RANKING SALES PER BU (FOP, Banded, Assortment) ======================
// Tiga papan peringkat terpisah per BU (Sub_division DMS), tanpa skor gabungan. Toko diatribusikan ke salesman yang
// qty bersih BU itu terbanyak di bulan data (seri: kode lebih kecil). computeSalesRank_ menghitung per salesman satu DT,
// rankSales_ menyusun papan dari banyak DT. Aturan FOP/Banded/Assortment sama dengan computeMon_/computeAsrt_,
// hanya dibatasi ke BU yang bersangkutan.

const RANK_BU = [['FOODS', 'Foods'], ['HOME CARE', 'Home Care'], ['PERSONAL CARE', 'Personal Care'], ['BEAUTY & WELLBEING', 'Beauty & Wellbeing']];

/** Nama BU dirapikan (huruf besar, spasi tunggal); '' kalau bukan salah satu dari empat BU. */
function rankBuOf_(v) {
  const s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
  return RANK_BU.some(b => b[0] === s) ? s : '';
}

/** Kode salesman DMS tanpa nol di depan ('021' -> '21'), sama dengan kodeOf di assets/app.js untuk kode angka. */
function rankSmCode_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
}

/** true kalau kode a lebih kecil dari b (angka dibandingkan sebagai angka). */
function rankCodeLess_(a, b) {
  return /^\d+$/.test(a) && /^\d+$/.test(b) ? +a < +b : a < b;
}

/**
 * Pure. Peringkat salesman per BU untuk Weekly FOP, Banded, Assortment, satu DT, bulan data terbaru.
 * in_ = { dms, produk, outletMaster, dsr, stores, bandedSku, cfg, hist, dtKode, moq }
 *   dms, produk, outletMaster, dsr = array 2D (baris 1 header) seperti tab Sheet DT
 *   stores = [{outlet_kode, outlet_nama, remark, status}] toko monitoring DT itu; bandedSku, cfg, hist seperti computeMon_
 * return { bulan, tanggalData,
 *   bu: { '<BU>': { label, sales: [{ kode, nama, tokoFop, fop:{n,weekly,pct,spmN,spmWeekly}, tokoBanded, banded:{n,hit,pct}, tokoAsrt, asrt:{toko,lines,perToko} }],
 *                   belumTransaksi } },
 *   catatan: { bandedTanpaBu, salesTanpaNama } }
 */
function computeSalesRank_(in_) {
  const col = (hdr, alts) => { const h = hdr.map(x => String(x).replace(/\s+/g, ' ').trim().toLowerCase()); for (let i = 0; i < alts.length; i++) { const k = h.indexOf(alts[i].toLowerCase()); if (k >= 0) return k; } return -1; };
  const dms = in_.dms || [], produk = in_.produk || [], outletMaster = in_.outletMaster || [], dsr = in_.dsr || [];
  const stores = in_.stores || [], bandedSku = in_.bandedSku || [], hist = in_.hist || [], cfg = in_.cfg || {};
  const moq = in_.moq || ASRT_MOQ, dtKode = in_.dtKode;
  const out = { bulan: '', tanggalData: '', bu: {}, catatan: { bandedTanpaBu: 0, salesTanpaNama: 0 }, total: { stores: [], names: {}, inactive: {} } };
  if (!dms.length) return out;
  const cO = col(dms[0], ['Outlet', 'Kode Outlet Bersih']), cK = col(dms[0], ['SKUCode', 'SKU Code']), cQ = col(dms[0], ['TotalQuantity(PCS)', 'TotalQuantity (PCS)']),
    cD = col(dms[0], ['INVDate', 'InvDate', 'Tanggal']), cS = col(dms[0], ['Salesman', 'DSR Code (Hygiene)']), cB = col(dms[0], ['Sub_division']);
  if (cO < 0 || cQ < 0 || cD < 0 || cS < 0 || cB < 0) return out;
  const body = dms.slice(1);
  let maxIso = '';
  body.forEach(r => { const d = asrtIso_(r[cD]); if (d > maxIso) maxIso = d; });
  if (!maxIso) return out;
  const bulan = maxIso.slice(0, 7);
  out.bulan = bulan; out.tanggalData = maxIso;

  // MASTER_PRODUK: basepack dan BU per SKU
  const sku2bp = {}, sku2bu = {};
  if (produk.length) {
    const pS = col(produk[0], ['SKUCode']), pB = col(produk[0], ['LEVEL-9']), pU = col(produk[0], ['BU']);
    produk.slice(1).forEach(r => {
      const a = pS >= 0 ? String(r[pS]).trim() : ''; if (!a) return;
      const b = pB >= 0 ? String(r[pB]).trim() : ''; if (b) sku2bp[a] = b;
      const u = pU >= 0 ? rankBuOf_(r[pU]) : ''; if (u) sku2bu[a] = u;
    });
  }
  // Identitas salesman: nama dari tab DSR, channel '-' = nonaktif
  const nameOf = {}, inactive = {};
  if (dsr.length) {
    const dK = col(dsr[0], ['kode_dsr']), dN = col(dsr[0], ['nama_dsr']), dC = col(dsr[0], ['channel']);
    dsr.slice(1).forEach(r => {
      const k = dK >= 0 ? rankSmCode_(r[dK]) : ''; if (!k) return;
      if (dN >= 0 && String(r[dN]).trim()) nameOf[k] = String(r[dN]).trim();
      if (dC >= 0 && String(r[dC]).trim() === '-') inactive[k] = true;
    });
  }
  // Channel toko dari OUTLET_MASTER (kode berawalan kode DT dipotong, seperti computeAsrt_)
  const chOf = {};
  if (outletMaster.length) {
    const cC = col(outletMaster[0], ['Outlet Code']), cT = col(outletMaster[0], ['Outlet Type Desc']);
    if (cC >= 0) outletMaster.slice(1).forEach(r => {
      let c = String(r[cC] === undefined ? '' : r[cC]).trim(); if (!c) return;
      if (dtKode && c.indexOf(dtKode) === 0 && c.length > dtKode.length) c = c.slice(dtKode.length);
      chOf[c] = asrtChannelOf_(cT >= 0 ? r[cT] : '');
    });
  }
  // Toko monitoring (aturan sama dengan computeMon_)
  const remarkOf = { SPM: monList_(cfg.remark_spm), MINIS: monList_(cfg.remark_minis) };
  const monitored = [];
  stores.forEach(s => {
    if (String(s.status || '').trim().toUpperCase() === 'INACTIVE') return;
    const r = String(s.remark || '').trim().toUpperCase();
    const g = remarkOf.SPM.indexOf(r) >= 0 ? 'SPM' : remarkOf.MINIS.indexOf(r) >= 0 ? 'MINIS' : '';
    if (g) monitored.push({ o: String(s.outlet_kode).trim(), g: g });
  });
  // EVB kuartal: SKU banded yang dibeli di bulan lain dalam kuartal yang sama (dari GS_BULANAN)
  const prior = {};
  hist.forEach(h => {
    if (String(h.periode) >= bulan || monQuarter_(h.periode) !== monQuarter_(bulan)) return;
    const o = String(h.outlet_kode).trim(); prior[o] = prior[o] || {};
    String(h.banded_sku || '').split(',').forEach(k => { k = k.trim(); if (k) prior[o][k] = true; });
  });

  // Satu putaran baris DMS bulan data
  const att = {}, wk = {}, bpNet = {}, skuNet = {};
  const attAll = {}, wkAll = {}, bpAll = {};   // gabungan semua BU, untuk skor total DSR (plan 022)
  const add = (root, a, b, c, q) => { const x = root[a] = root[a] || {}, y = x[b] = x[b] || {}; y[c] = (y[c] || 0) + q; };
  body.forEach(r => {
    const d = asrtIso_(r[cD]); if (!d || d.slice(0, 7) !== bulan) return;
    const o = String(r[cO]).trim(); if (!o) return;
    const q = asrtNum_(r[cQ]), k = cK >= 0 ? String(r[cK]).trim() : '';
    if (k) { const y = skuNet[o] = skuNet[o] || {}; y[k] = (y[k] || 0) + q; }
    const smAll = rankSmCode_(r[cS]);
    if (smAll) { const y = attAll[o] = attAll[o] || {}; y[smAll] = (y[smAll] || 0) + q; }
    { const y = wkAll[o] = wkAll[o] || {}, w = monIsoWeek_(d); y[w] = (y[w] || 0) + q; }
    if (k && sku2bp[k]) { const y = bpAll[o] = bpAll[o] || {}; y[sku2bp[k]] = (y[sku2bp[k]] || 0) + q; }
    const bu = rankBuOf_(r[cB]); if (!bu) return;
    const sm = rankSmCode_(r[cS]);
    if (sm) add(att, bu, o, sm, q);
    add(wk, bu, o, monIsoWeek_(d), q);
    if (k && sku2bp[k]) add(bpNet, bu, o, sku2bp[k], q);
  });

  const need = Math.max(1, Math.round(cfg.fop_weekly || 3));
  const tanpaBu = {}; bandedSku.forEach(b => { if (!sku2bu[String(b.sku_kode).trim()]) tanpaBu[String(b.sku_kode).trim()] = true; });
  out.catatan.bandedTanpaBu = Object.keys(tanpaBu).length;
  const namedSeen = {};

  RANK_BU.forEach(def => {
    const bu = def[0];
    if (!att[bu]) return;
    // atribusi: qty bersih terbanyak (harus positif), seri -> kode lebih kecil
    const owner = {};
    Object.keys(att[bu]).forEach(o => {
      let best = '', bq = 0;
      Object.keys(att[bu][o]).forEach(sm => { const q = att[bu][o][sm]; if (q > bq || (q === bq && q > 0 && rankCodeLess_(sm, best))) { best = sm; bq = q; } });
      if (best) owner[o] = best;
    });
    const sales = {};
    const entry = sm => sales[sm] = sales[sm] || { kode: sm, nama: nameOf[sm] || sm, tokoFop: 0, fop: { n: 0, weekly: 0, pct: null, spmN: 0, spmWeekly: 0 }, tokoBanded: 0, banded: { n: 0, hit: 0, pct: null }, tokoAsrt: 0, asrt: { toko: 0, lines: 0, perToko: 0 } };
    let belum = 0;
    monitored.forEach(m => {
      const sm = owner[m.o]; if (!sm) { belum++; return; }
      const e = entry(sm);
      // FOP: minggu ISO dari baris BU ini dengan qty bersih positif
      const ws = Object.keys((wk[bu] && wk[bu][m.o]) || {}).filter(w => wk[bu][m.o][w] > 0).length;
      e.tokoFop++; e.fop.n++;
      if (m.g === 'SPM') e.fop.spmN++;
      if (ws >= need) { e.fop.weekly++; if (m.g === 'SPM') e.fop.spmWeekly++; }
      // Banded: hanya SKU banded BU ini untuk channel toko
      const list = bandedSku.filter(b => b.channel === m.g && sku2bu[String(b.sku_kode).trim()] === bu);
      if (!list.length) return;
      const bought = list.filter(b => { const k = String(b.sku_kode).trim(); return ((skuNet[m.o] || {})[k] || 0) > 0 || (prior[m.o] && prior[m.o][k]); }).length;
      const thr = m.g === 'SPM' ? cfg.banded_spm : cfg.banded_minis;
      e.tokoBanded++; e.banded.n++;
      if (Math.round(bought / list.length * 1000) / 1000 >= thr) e.banded.hit++;
    });
    // Assortment: toko SPM/MINIS di OUTLET_MASTER, aktif = ada basepack BU ini dengan qty bersih positif
    Object.keys(owner).forEach(o => {
      if (chOf[o] !== 'SPM' && chOf[o] !== 'MINIS') return;
      const bps = (bpNet[bu] && bpNet[bu][o]) || {}, keys = Object.keys(bps);
      if (!keys.some(b => bps[b] > 0)) return;
      const e = entry(owner[o]);
      e.tokoAsrt++; e.asrt.toko++; e.asrt.lines += keys.filter(b => bps[b] >= moq).length;
    });
    const list = Object.keys(sales).filter(sm => !inactive[sm]).sort((a, b) => (rankCodeLess_(a, b) ? -1 : 1)).map(sm => {
      const e = sales[sm];
      e.fop.pct = e.fop.n ? e.fop.weekly / e.fop.n : null;
      e.banded.pct = e.banded.n ? e.banded.hit / e.banded.n : null;
      e.asrt.perToko = e.asrt.toko ? e.asrt.lines / e.asrt.toko : 0;
      if (!nameOf[sm]) namedSeen[sm] = true;
      return e;
    });
    out.bu[bu] = { label: def[1], sales: list, belumTransaksi: belum };
  });
  out.catatan.salesTanpaNama = Object.keys(namedSeen).length;

  // Atribusi TOTAL (semua BU digabung): salesman dengan qty bersih total terbanyak (seri: kode lebih kecil).
  // Per toko dikeluarkan hanya angka ringkas; PS dan target Assortment ditempel kemudian oleh computeDsrTotals_.
  const grpOf = {}; monitored.forEach(m => { grpOf[m.o] = m.g; });
  Object.keys(attAll).forEach(o => {
    let best = '', bq = 0;
    Object.keys(attAll[o]).forEach(sm => { const q = attAll[o][sm]; if (q > bq || (q === bq && q > 0 && rankCodeLess_(sm, best))) { best = sm; bq = q; } });
    if (!best) return;
    const g = grpOf[o] || '';
    const wks = Object.keys(wkAll[o] || {}).filter(w => wkAll[o][w] > 0).length;
    let bh = null;
    if (g) {
      const list = bandedSku.filter(b => b.channel === g);
      if (list.length) {
        const bought = list.filter(b => { const k = String(b.sku_kode).trim(); return ((skuNet[o] || {})[k] || 0) > 0 || (prior[o] && prior[o][k]); }).length;
        const thr = g === 'SPM' ? cfg.banded_spm : cfg.banded_minis;
        bh = Math.round(bought / list.length * 1000) / 1000 >= thr ? 1 : 0;
      }
    }
    const bps = bpAll[o] || {}, bk = Object.keys(bps);
    const ln = bk.some(b => bps[b] > 0) ? bk.filter(b => bps[b] >= moq).length : 0;
    out.total.stores.push({ o: o, sm: best, g: g, wk: wks, bh: bh, ln: ln });
    out.total.names[best] = nameOf[best] || best;
    if (inactive[best]) out.total.inactive[best] = true;
  });
  return out;
}

/**
 * Pure. perDt = array keluaran computeSalesRank_ (masing-masing boleh membawa dist_kode/dist_nama; yang punya `error` dilewati).
 * Salesman satu DT tidak digabung dengan DT lain (tiap baris papan membawa dt_kode). Hasil:
 * { bulan, tanggalData, minToko, catatan, bu: { '<BU>': { label, fop:[...], banded:[...], asrt:[...], belumCukup:{fop,banded,asrt}, belumTransaksi } } }
 * Baris papan: { rank, kode, nama, dt_kode, dt_nama, n, nilai, ... } (FOP: weekly, spm:{weekly,n}; Banded: hit; Assortment: lines, toko).
 * Urut: nilai menurun, lalu jumlah toko menurun, lalu nama. Seri nilai berbagi peringkat (1, 2, 2, 4).
 * Salesman dengan n < minToko tidak diberi peringkat (masuk belumCukup). n = 0 tidak ditampilkan di KPI itu.
 */
function rankSales_(perDt, minToko) {
  const min = typeof minToko === 'number' && !isNaN(minToko) ? minToko : 5;
  const out = { bulan: '', tanggalData: '', minToko: min, catatan: { bandedTanpaBu: 0, salesTanpaNama: 0 }, bu: {} };
  const pick = {
    fop: s => ({ n: s.tokoFop, nilai: s.fop.pct, ex: { weekly: s.fop.weekly, spm: { weekly: s.fop.spmWeekly, n: s.fop.spmN } } }),
    banded: s => ({ n: s.tokoBanded, nilai: s.banded.pct, ex: { hit: s.banded.hit } }),
    asrt: s => ({ n: s.tokoAsrt, nilai: s.asrt.perToko, ex: { lines: s.asrt.lines, toko: s.asrt.toko } }),
  };
  const raw = {};
  (perDt || []).forEach(d => {
    if (!d || d.error || !d.bu) return;
    if (d.tanggalData > out.tanggalData) { out.tanggalData = d.tanggalData; out.bulan = d.bulan; }
    out.catatan.bandedTanpaBu = Math.max(out.catatan.bandedTanpaBu, (d.catatan && d.catatan.bandedTanpaBu) || 0);
    out.catatan.salesTanpaNama += (d.catatan && d.catatan.salesTanpaNama) || 0;
    RANK_BU.forEach(def => {
      const b = d.bu[def[0]]; if (!b) return;
      const t = raw[def[0]] = raw[def[0]] || { label: def[1], rows: { fop: [], banded: [], asrt: [] }, belumTransaksi: 0 };
      t.belumTransaksi += b.belumTransaksi || 0;
      b.sales.forEach(s => Object.keys(pick).forEach(kpi => {
        const p = pick[kpi](s); if (!(p.n > 0)) return;
        t.rows[kpi].push(Object.assign({ rank: null, kode: s.kode, nama: s.nama, dt_kode: d.dist_kode || '', dt_nama: d.dist_nama || '', n: p.n, nilai: p.nilai }, p.ex));
      }));
    });
  });
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  RANK_BU.forEach(def => {
    const t = raw[def[0]]; if (!t) return;
    const res = { label: t.label, fop: [], banded: [], asrt: [], belumCukup: { fop: [], banded: [], asrt: [] }, belumTransaksi: t.belumTransaksi };
    Object.keys(pick).forEach(kpi => {
      const rows = t.rows[kpi].sort((a, b) => (same(a.nilai, b.nilai) ? 0 : b.nilai - a.nilai) || b.n - a.n || (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0));
      let prev = null;
      rows.forEach(r => {
        if (r.n < min) { res.belumCukup[kpi].push(r); return; }
        const i = res[kpi].length;
        r.rank = prev && same(prev.nilai, r.nilai) ? prev.rank : i + 1;
        res[kpi].push(r); prev = r;
      });
      rankWithinDt_(res[kpi]);
    });
    out.bu[def[0]] = res;
  });
  return out;
}

/**
 * Pure. rows = baris papan yang sudah berperingkat gabungan (rank != null), urut nilai menurun. Menambah `rankDt` pada tiap baris:
 * peringkat di antara baris DT yang sama saja (nilai sama berbagi peringkat: 1, 2, 2, 4). Baris tanpa rank (belum cukup toko) tidak disentuh.
 */
function rankWithinDt_(rows, field) {
  const f = field || 'nilai', per = {};
  (rows || []).forEach(r => {
    if (r.rank == null) return;
    const t = per[r.dt_kode] = per[r.dt_kode] || { n: 0, prev: null };
    t.n++;
    r.rankDt = t.prev && Math.abs(t.prev[f] - r[f]) < 1e-9 ? t.prev.rankDt : t.n;
    t.prev = r;
  });
  return rows;
}

// ====================== SKOR TOTAL PER DSR (5 KPI berbobot) ======================
// Ranking antar DSR dari lima KPI Great Sales: Perfect Store, Weekly FOP, Assortment, Banded, R2G. Semua BU digabung;
// toko diatribusikan ke salesman dengan qty bersih total terbanyak (computeSalesRank_().total). Skor total
// = jumlah(bobot x min(capaian, 1)) / jumlah bobot x 100, hanya atas KPI yang punya data (bobot dinormalisasi ulang).
// Bobot dari GS_CONFIG (rank_w_*). Perhitungan hanya di server; halaman hanya menampilkan.

const RANK_KPI = ['ps', 'fop', 'asrt', 'banded', 'r2g'];
const RANK_TOTAL_MIN_KPI = 3;

// ----- R2G: port rumus assets/app.js (buildModel/parseNgdms). Jika rumus Monitoring Harian berubah, ubah juga di sini. -----
const R2G_BU_MAP = { 'BEAUTY & WELLBE': 'bw', 'BEAUTY & WELLBEING': 'bw', 'PERSONAL CARE': 'pc', 'HOME CARE': 'hc', 'FOODS': 'fo', BW: 'bw', PC: 'pc', HC: 'hc', FO: 'fo' };
function r2gStr_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function r2gNum_(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/,/g, '').trim()); return isFinite(n) ? n : 0; }
function r2gKode_(v) { const n = parseInt(r2gStr_(v), 10); return isFinite(n) ? String(n) : ''; }
function r2gNorm_(s) { return r2gStr_(s).toUpperCase().replace(/\s+/g, ' '); }
function r2gHdr_(s) { return r2gStr_(s).replace(/\s+/g, ' ').toLowerCase(); }
function r2gBu_(s) { return R2G_BU_MAP[r2gStr_(s).toUpperCase()] || null; }
function r2gTable_(aoa) {
  const hdr = ((aoa || [])[0] || []).map(r2gStr_);
  return { hdr: hdr, rows: (aoa || []).slice(1), col: function () { for (let i = 0; i < arguments.length; i++) { const k = hdr.indexOf(arguments[i]); if (k >= 0) return k; } return -1; } };
}
function r2gAt_(r, i) { return i < 0 ? '' : r[i]; }

/** Pure. Sama dengan parseNgdms di assets/app.js. */
function r2gParseNgdms_(aoa) {
  const need = ['salesman', 'e2e target', 'e2s target', 'e2e achieved', 'e2s achieved'];
  let hi = -1, ix = {};
  for (let i = 0; i < Math.min((aoa || []).length, 20); i++) {
    const m = {}; (aoa[i] || []).forEach((c, j) => { const k = r2gHdr_(c); if (k && !(k in m)) m[k] = j; });
    if (need.every(k => k in m)) { hi = i; ix = m; break; }
  }
  if (hi < 0) return null;
  const get = (r, k) => ix[k] == null ? '' : r[ix[k]];
  const byCode = {};
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const kode = r2gKode_(get(r, 'salesman')); if (!kode) continue;
    const o = byCode[kode] = byCode[kode] || { kode: kode, nama: '', e2eT: 0, e2sT: 0, e2eA: 0, e2sA: 0 };
    if (!o.nama) o.nama = r2gStr_(get(r, 'salesman name'));
    o.e2eT += r2gNum_(get(r, 'e2e target')); o.e2sT += r2gNum_(get(r, 'e2s target'));
    o.e2eA += r2gNum_(get(r, 'e2e achieved')); o.e2sA += r2gNum_(get(r, 'e2s achieved'));
  }
  return { rows: Object.keys(byCode).map(k => byCode[k]) };
}

/**
 * Pure. R2G per DSR aktif satu DT, rumus identik dengan Monitoring Harian (assets/app.js buildModel):
 *  - SS: jumlah GSV baris DMS_EXTRACT yang BU-nya dikenal / jumlah target_ss_bw+pc+hc+fo periode aktif (tab TARGET)
 *  - E2E, E2S: achieved / target dari NGDMS_ASRT (cocok ke DSR lewat nama dulu, kode sebagai cadangan)
 *  - Pasti Laku (Everbilled + Redlines) dan Pasti Untung (Width + NPD): norms SKU tercapai / total (NORMS_SKU, qty DMS >= Target SOQ)
 * in_ = { tabs: {DSR, TARGET, DMS_EXTRACT, MASTER_PRODUK, OUTLET_MASTER, NORMS_SKU, NGDMS_ASRT}, config: {dt_kode, periode} }
 * -> { periode, dsr: { '<kode>': { kode, nama, ss:{target,aktual,pct}, e2e:{t,a,pct}, e2s:{t,a,pct}, pastiUntung:{tot,ach,pct}, pastiLaku:{tot,ach,pct}, pct, nKomp } } }
 * pct komponen = capaian apa adanya (null kalau tanpa target); pct R2G = rata-rata sederhana komponen yang punya target, tiap komponen dibatasi 1.
 */
function computeDsrR2g_(in_) {
  const T = (in_ && in_.tabs) || {}, cfg = (in_ && in_.config) || {};
  const dtKode = r2gStr_(cfg.dt_kode);
  const tD = r2gTable_(T.DSR), dK = tD.col('kode_dsr'), dN = tD.col('nama_dsr'), dC = tD.col('channel');
  const active = tD.rows.map(r => ({ kode: r2gKode_(r2gAt_(r, dK)), nama: r2gStr_(r2gAt_(r, dN)), ch: r2gStr_(r2gAt_(r, dC)) || 'GT' })).filter(d => d.kode && d.ch !== '-').sort((a, b) => +a.kode - +b.kode);
  const dsrByKode = k => active.find(d => d.kode === String(k));
  const byName = n => active.find(d => r2gNorm_(d.nama) === r2gNorm_(n));
  const out = { periode: '', dsr: {} };

  // TARGET: baris periode aktif (cfg.periode, atau periode terbaru di tab)
  const tT = r2gTable_(T.TARGET), tp = tT.col('periode'), perKey = v => r2gStr_(v).slice(0, 7);
  let periode = perKey(cfg.periode);
  if (!periode) periode = tT.rows.map(r => perKey(r2gAt_(r, tp))).sort().pop() || '';
  out.periode = periode;
  const tgt = {};
  tT.rows.forEach(r => {
    const per = perKey(r2gAt_(r, tp)), k = r2gKode_(r2gAt_(r, tT.col('kode_dsr'))); if (per !== periode || !k) return;
    tgt[k] = { bw: r2gNum_(r2gAt_(r, tT.col('target_ss_bw'))), pc: r2gNum_(r2gAt_(r, tT.col('target_ss_pc'))), hc: r2gNum_(r2gAt_(r, tT.col('target_ss_hc'))), fo: r2gNum_(r2gAt_(r, tT.col('target_ss_fo'))) };
  });
  const tgtSs = k => tgt[k] || { bw: 0, pc: 0, hc: 0, fo: 0 };
  const buCoverage = k => ['bw', 'pc', 'hc', 'fo'].filter(b => tgtSs(k)[b] > 0);

  // MASTER_PRODUK
  const tP = r2gTable_(T.MASTER_PRODUK), pS = tP.col('SKUCode'), pB = tP.col('LEVEL-9'), pU = tP.col('BU');
  const sku2base = {}, base2bu = {};
  tP.rows.forEach(r => {
    const sku = r2gStr_(r2gAt_(r, pS)), bp = r2gStr_(r2gAt_(r, pB)); if (!bp) return;
    if (sku) sku2base[sku] = bp;
    const bu = r2gBu_(r2gAt_(r, pU)); if (bu) base2bu[bp] = bu;
  });

  // OUTLET_MASTER -> pjp[kodeToko] = daftar pemilik
  const tO = r2gTable_(T.OUTLET_MASTER), oC = tO.col('Outlet Code'), oN = tO.col('Outlet Name'), oS = tO.col('Salesman');
  const pjp = {};
  tO.rows.forEach(r => {
    const full = r2gStr_(r2gAt_(r, oC)); if (!full) return;
    const suffix = dtKode && full.indexOf(dtKode) === 0 && full.length > dtKode.length ? full.slice(dtKode.length) : full;
    const rec = { kode: suffix, nama: r2gStr_(r2gAt_(r, oN)), sm: r2gStr_(r2gAt_(r, oS)) };
    pjp[suffix] = pjp[suffix] || [];
    if (!pjp[suffix].some(x => x.sm === rec.sm)) pjp[suffix].push(rec);
  });

  // DMS_EXTRACT: SS aktual (hanya baris ber-BU dikenal), pemilik per BU (baris terakhir menang), qty per basepack per toko
  const tE = r2gTable_(T.DMS_EXTRACT);
  const cK = tE.col('Salesman', 'DSR Code (Hygiene)'), cBu = tE.col('Sub_division', 'Category'), cG = tE.col('GSV'), cO = tE.col('Outlet', 'Kode Outlet Bersih'), cON = tE.col('Outlet Name', 'OutletName'), cSku = tE.col('SKUCode', 'SKU Code'), cQty = tE.col('TotalQuantity(PCS)', 'TotalQuantity (PCS)');
  const ssAct = {}, ownerByBu = {}, qtyBy = {}, outlets = {};
  if (cK >= 0 && cG >= 0) tE.rows.forEach(r => {
    const kode = r2gKode_(r[cK]); if (!kode) return;
    const d = dsrByKode(kode); if (!d) return;
    const b = r2gBu_(r2gAt_(r, cBu)), g = typeof r[cG] === 'number' ? r[cG] : parseFloat(r2gStr_(r[cG]).replace(/,/g, '.')) || 0;
    ssAct[kode] = ssAct[kode] || { bw: 0, pc: 0, hc: 0, fo: 0 }; if (b) ssAct[kode][b] += g;
    const ok = r2gStr_(r2gAt_(r, cO));
    if (ok) {
      const key = ok + '||' + kode;
      outlets[key] = outlets[key] || { kode: ok, nama: r2gStr_(r2gAt_(r, cON)), sm: d.nama };
      if (b) (ownerByBu[ok] = ownerByBu[ok] || {})[b] = kode;
    }
    if (cSku >= 0 && cQty >= 0 && ok) {
      const bp = sku2base[r2gStr_(r[cSku])];
      if (bp) { const q = r2gNum_(r[cQty]); qtyBy[ok] = qtyBy[ok] || {}; qtyBy[ok][bp] = (qtyBy[ok][bp] || 0) + q; }
    }
  });
  // Toko dari extract yang belum ada di Outlet Master ikut dihitung sebagai toko DSR itu
  Object.keys(outlets).forEach(key => {
    const o = outlets[key];
    pjp[o.kode] = pjp[o.kode] || [];
    if (!pjp[o.kode].some(x => x.sm === o.sm)) pjp[o.kode].push({ kode: o.kode, nama: o.nama, sm: o.sm });
  });
  function ownerFor(suffix, bu) {
    if (bu && ownerByBu[suffix] && ownerByBu[suffix][bu]) return ownerByBu[suffix][bu];
    const owners = (pjp[suffix] || []).map(o => byName(o.sm)).filter(Boolean);
    if (bu) { const m = owners.find(d => buCoverage(d.kode).indexOf(bu) >= 0); if (m) return m.kode; }
    return owners.length === 1 ? owners[0].kode : null;
  }

  // NGDMS_ASRT: cocokkan ke DSR lewat nama dulu, kode salesman sebagai cadangan
  const ng = r2gParseNgdms_(T.NGDMS_ASRT), asrt = {};
  if (ng) ng.rows.forEach(r => {
    const d = byName(r.nama) || dsrByKode(r.kode); if (!d) return;
    const o = asrt[d.kode] = asrt[d.kode] || { e2eT: 0, e2sT: 0, e2eA: 0, e2sA: 0 };
    o.e2eT += r.e2eT; o.e2sT += r.e2sT; o.e2eA += r.e2eA; o.e2sA += r.e2sA;
  });

  // NORMS_SKU: Pasti Laku = Everbilled + Redlines; Pasti Untung = Width + NPD
  const iq = {}; active.forEach(d => { iq[d.kode] = { pastiLaku: { tot: 0, ach: 0 }, pastiUntung: { tot: 0, ach: 0 } }; });
  const tN = r2gTable_(T.NORMS_SKU), nPt = tN.col('PACKTYPE'), nOut = tN.col('OutletCode'), nSku = tN.col('LEVEL-9'), nSub = tN.col('SUB DIVISION2'), nSoq = tN.col('Target SOQ (in pcs)', 'Target SOQ', 'SOQ');
  if (!(tN.rows.length && (nPt < 0 || nOut < 0 || nSoq < 0))) tN.rows.forEach(r => {
    const suffix = r2gStr_(r[nOut]).replace(/^B/i, ''); if (!suffix) return;
    const pt = r2gStr_(r[nPt]), sku = r2gStr_(r2gAt_(r, nSku)), soq = r2gNum_(r[nSoq]);
    const kode = ownerFor(suffix, r2gBu_(r2gAt_(r, nSub)) || base2bu[sku]);
    if (!kode || !iq[kode]) return;
    const qty = (qtyBy[suffix] && qtyBy[suffix][sku]) || 0, ach = soq > 0 && qty >= soq, b = iq[kode];
    if (pt === 'Everbilled' || pt === 'Redlines') { b.pastiLaku.tot++; if (ach) b.pastiLaku.ach++; }
    else if (pt === 'Width' || pt === 'NPD') { b.pastiUntung.tot++; if (ach) b.pastiUntung.ach++; }
  });

  active.forEach(d => {
    const k = d.kode, t = tgtSs(k), a = ssAct[k] || { bw: 0, pc: 0, hc: 0, fo: 0 }, as = asrt[k], q = iq[k];
    const sum = o => o.bw + o.pc + o.hc + o.fo;
    const ratio = (x, y) => y > 0 ? x / y : null;
    const ss = { target: sum(t), aktual: sum(a) }; ss.pct = ratio(ss.aktual, ss.target);
    const e2e = { t: as ? as.e2eT : 0, a: as ? as.e2eA : 0 }; e2e.pct = ratio(e2e.a, e2e.t);
    const e2s = { t: as ? as.e2sT : 0, a: as ? as.e2sA : 0 }; e2s.pct = ratio(e2s.a, e2s.t);
    const pu = { tot: q.pastiUntung.tot, ach: q.pastiUntung.ach }; pu.pct = ratio(pu.ach, pu.tot);
    const pl = { tot: q.pastiLaku.tot, ach: q.pastiLaku.ach }; pl.pct = ratio(pl.ach, pl.tot);
    const ada = [ss.pct, e2e.pct, e2s.pct, pu.pct, pl.pct].filter(v => v !== null);
    out.dsr[k] = { kode: k, nama: d.nama, ss: ss, e2e: e2e, e2s: e2s, pastiUntung: pu, pastiLaku: pl, nKomp: ada.length,
      pct: ada.length ? ada.reduce((s, v) => s + Math.min(v, 1), 0) / ada.length : null };
  });
  return out;
}

/** R2G satu DT dari payload Monitoring Harian (cache mengikuti builtAt payload). Gagal -> {} supaya KPI itu tanpa data, bukan galat. */
function r2gForDt_(r) {
  try {
    const payload = getPayload_(r.sheet_id);
    const key = 'r2g_v1_' + r.sheet_id + '_' + payload.builtAt;
    const hit = cacheGet_(key);
    if (hit) return hit;
    const res = computeDsrR2g_({ tabs: payload.tabs, config: payload.config });
    cachePut_(key, res);
    return res;
  } catch (err) {
    return { periode: '', dsr: {}, error: true };
  }
}

/** Pure. Target KPI dari snapshot terbaru GS_SCORECARD (kolom target); tidak ada -> 1 (100%). { fopSPM, fopMINIS, bandedSPM, bandedMINIS }. */
function rankTargetsFromScorecard_(scorecard) {
  const def = { fopSPM: 1, fopMINIS: 1, bandedSPM: 1, bandedMINIS: 1 };
  let last = '';
  (scorecard || []).forEach(r => { const t = String(r.tanggal); if (t > last) last = t; });
  const map = { FOP_SPM: 'fopSPM', FOP_MINIS: 'fopMINIS', BANDED_SPM: 'bandedSPM', BANDED_MINIS: 'bandedMINIS' };
  (scorecard || []).forEach(r => {
    if (String(r.tanggal) !== last || !(r.kpi in map)) return;
    const v = gsNum_(r.target); if (v != null && v > 0) def[map[r.kpi]] = v;
  });
  return def;
}

/**
 * Pure. Skor total per DSR (belum diperingkat).
 * in_ = { dts: [{ dist_kode, dist_nama, total:{stores:[{o,sm,g,wk,bh,ln}], names, inactive}, ps:{outlet:'PS FULL'|'PS LITE'|...},
 *                 asrtTarget:{'dist|outlet': targetLines}, r2g:{ '<kode>': hasil computeDsrR2g_ } }],
 *         cfg: {rank_w_*, fop_weekly}, targets: hasil rankTargetsFromScorecard_ }
 * -> baris { kode, nama, dt_kode, dt_nama, n, skor (0-100 atau null), peringkatLayak, kpiAda,
 *            kpi: { ps|fop|asrt|banded|r2g: { pct, capaian, skor (0-100, dibatasi), bobot, tanpaData, n, detail } } }
 */
function computeDsrTotals_(in_) {
  const cfg = in_.cfg || {}, tg = Object.assign({ fopSPM: 1, fopMINIS: 1, bandedSPM: 1, bandedMINIS: 1 }, in_.targets || {});
  const w = k => { const v = cfg['rank_w_' + k]; return typeof v === 'number' && isFinite(v) && v >= 0 ? v : GS_CFG_DEFAULT['rank_w_' + k]; };
  const need = Math.max(1, Math.round(cfg.fop_weekly || GS_CFG_DEFAULT.fop_weekly));
  const rows = [];
  (in_.dts || []).forEach(d => {
    if (!d || d.error || !d.total) return;
    const psMap = d.ps || {}, tmap = d.asrtTarget || {}, r2gAll = (d.r2g && d.r2g.dsr) || {};
    const per = {};
    (d.total.stores || []).forEach(s => { (per[s.sm] = per[s.sm] || []).push(s); });
    Object.keys(per).forEach(sm => {
      if (d.total.inactive && d.total.inactive[sm]) return;
      const mine = per[sm], mk = {};
      const kpi = {};
      const mkKpi = (key, capaian, pct, n, detail) => {
        const no = capaian === null || capaian === undefined || !isFinite(capaian);
        kpi[key] = { pct: no ? null : pct, capaian: no ? null : capaian, skor: no ? null : Math.min(capaian, 1) * 100, bobot: w(key), tanpaData: no, n: n, detail: detail };
      };
      // PS: Full = 1, Lite = 0,5; hanya toko yang ada di laporan PS DT ini
      const psS = mine.filter(s => psMap[s.o] !== undefined);
      const full = psS.filter(s => psMap[s.o] === 'PS FULL').length, lite = psS.filter(s => psMap[s.o] === 'PS LITE').length;
      const psV = psS.length ? (full + 0.5 * lite) / psS.length : null;
      mkKpi('ps', psV, psV, psS.length, { full: full, lite: lite });
      // FOP: toko monitoring milik DSR yang order >= fop_weekly minggu; target dari scorecard (rata-rata berbobot jumlah toko SPM/MINIS)
      const fS = mine.filter(s => s.g);
      const weekly = fS.filter(s => s.wk >= need).length;
      const fT = fS.length ? fS.reduce((a, s) => a + (s.g === 'SPM' ? tg.fopSPM : tg.fopMINIS), 0) / fS.length : null;
      const fV = fS.length ? weekly / fS.length : null;
      mkKpi('fop', fV === null ? null : fV / fT, fV, fS.length, { weekly: weekly, target: fT });
      // Banded: toko monitoring dengan daftar SKU banded channel-nya
      const bS = mine.filter(s => s.g && s.bh !== null && s.bh !== undefined);
      const hit = bS.filter(s => s.bh === 1).length;
      const bT = bS.length ? bS.reduce((a, s) => a + (s.g === 'SPM' ? tg.bandedSPM : tg.bandedMINIS), 0) / bS.length : null;
      const bV = bS.length ? hit / bS.length : null;
      mkKpi('banded', bV === null ? null : bV / bT, bV, bS.length, { hit: hit, target: bT });
      // Assortment: aktual / target (+15% vs baseline) atas toko bertarget milik DSR
      const keys = [], lines = {};
      mine.forEach(s => { const k = d.dist_kode + '|' + s.o; keys.push(k); lines[k] = s.ln; });
      const as = asrtScoreForStores_(keys, lines, tmap);
      mkKpi('asrt', as.pct, as.pct, as.tokoTarget, { lines: as.aktual, target: as.target, tokoNaik: as.tokoNaik, tanpaBaseline: as.tanpaBaseline });
      // R2G
      const rr = r2gAll[sm];
      const rV = rr && rr.pct !== null && rr.pct !== undefined ? rr.pct : null;
      mkKpi('r2g', rV, rV, rr ? rr.nKomp : 0, { komponen: rr ? { ss: { pct: rr.ss.pct }, e2e: { pct: rr.e2e.pct, a: rr.e2e.a, t: rr.e2e.t }, e2s: { pct: rr.e2s.pct, a: rr.e2s.a, t: rr.e2s.t },
        pastiUntung: { pct: rr.pastiUntung.pct, a: rr.pastiUntung.ach, t: rr.pastiUntung.tot }, pastiLaku: { pct: rr.pastiLaku.pct, a: rr.pastiLaku.ach, t: rr.pastiLaku.tot } } : null });
      // skor total: bobot dinormalisasi atas KPI yang punya data
      let sw = 0, sp = 0, ada = 0;
      RANK_KPI.forEach(k => { const x = kpi[k]; if (x.tanpaData) return; ada++; sw += x.bobot; sp += x.bobot * Math.min(x.capaian, 1); });
      const layak = ada >= RANK_TOTAL_MIN_KPI && sw > 0;
      mine.forEach(s => { if (s.g || psMap[s.o] !== undefined || (d.dist_kode + '|' + s.o) in tmap) mk[s.o] = 1; });
      rows.push({ kode: sm, nama: (d.total.names && d.total.names[sm]) || sm, dt_kode: d.dist_kode || '', dt_nama: d.dist_nama || '', n: Object.keys(mk).length,
        skor: layak ? sp / sw * 100 : null, peringkatLayak: layak, kpiAda: ada, kpi: kpi });
    });
  });
  return rows;
}

/**
 * Pure. Memberi peringkat: urut skor menurun, jumlah toko menurun, nama; skor kembar berbagi peringkat (1, 2, 2, 4).
 * DSR dengan n < minToko atau peringkatLayak=false masuk belumCukup (tanpa peringkat). rankDt = peringkat di DT yang sama.
 * -> { rows, belumCukup }
 */
function rankTotal_(rows, minToko) {
  const min = typeof minToko === 'number' && !isNaN(minToko) ? minToko : 5;
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  const ok = [], low = [];
  (rows || []).forEach(r => { (r.peringkatLayak && r.skor !== null && r.n >= min ? ok : low).push(r); });
  const cmpName = (a, b) => (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0);
  ok.sort((a, b) => (same(a.skor, b.skor) ? 0 : b.skor - a.skor) || b.n - a.n || cmpName(a, b));
  let prev = null;
  ok.forEach((r, i) => { r.rank = prev && same(prev.skor, r.skor) ? prev.rank : i + 1; prev = r; });
  low.forEach(r => { r.rank = null; });
  low.sort((a, b) => b.n - a.n || cmpName(a, b));
  rankWithinDt_(ok, 'skor');
  return { rows: ok, belumCukup: low };
}

/** Pure. KPI mana saja yang punya data pada minimal satu DSR (untuk kolom yang ditampilkan). */
function rankTotalAktif_(rows) {
  return RANK_KPI.filter(k => (rows || []).some(r => r.kpi && r.kpi[k] && !r.kpi[k].tanpaData));
}

/** Pure. Satu-satunya bentuk detail KPI yang boleh keluar: pct, skor, bobot, hitungan ringkas tingkat DSR. Tanpa toko, SKU, omzet. */
function rankKpiPublic_(kpi) {
  const o = {};
  RANK_KPI.forEach(k => {
    const x = (kpi || {})[k]; if (!x) return;
    const d = x.detail || {};
    const e = { pct: x.pct, skor: x.skor, bobot: x.bobot, tanpaData: !!x.tanpaData, n: x.n };
    if (k === 'ps') { e.full = d.full; e.lite = d.lite; }
    else if (k === 'fop') { e.weekly = d.weekly; e.target = d.target; }
    else if (k === 'banded') { e.hit = d.hit; e.target = d.target; }
    else if (k === 'asrt') { e.lines = d.lines; e.target = d.target === undefined ? undefined : Math.round(d.target * 10) / 10; e.tokoNaik = d.tokoNaik; e.tanpaBaseline = d.tanpaBaseline; }
    else if (k === 'r2g') {
      const c = d.komponen;
      e.komponen = c ? { ss: { pct: c.ss.pct }, e2e: { pct: c.e2e.pct, a: c.e2e.a, t: c.e2e.t }, e2s: { pct: c.e2s.pct, a: c.e2s.a, t: c.e2s.t },
        pastiUntung: { pct: c.pastiUntung.pct, a: c.pastiUntung.a, t: c.pastiUntung.t }, pastiLaku: { pct: c.pastiLaku.pct, a: c.pastiLaku.a, t: c.pastiLaku.t } } : null;
    }
    o[k] = e;
  });
  return o;
}

/**
 * Pure. Satu-satunya pintu data ranking lintas DT: hanya bidang ini yang boleh keluar ke akun mana pun.
 * Dilarang: nama/kode toko, SKU, omzet, kode akses. Tambah bidang baru HANYA setelah persetujuan pemilik.
 */
function rankPublicRow_(r) {
  const o = { rank: r.rank == null ? null : r.rank, rankDt: r.rankDt == null ? null : r.rankDt, kode: String(r.kode), nama: String(r.nama), dt_kode: String(r.dt_kode), dt_nama: String(r.dt_nama), n: +r.n || 0, nilai: r.nilai };
  if (r.weekly !== undefined) o.weekly = r.weekly;
  if (r.spm) o.spm = { weekly: r.spm.weekly, n: r.spm.n };
  if (r.hit !== undefined) o.hit = r.hit;
  if (r.lines !== undefined) o.lines = r.lines;
  if (r.toko !== undefined) o.toko = r.toko;   // jumlah toko aktif (angka), bukan daftar toko
  if (r.skor !== undefined) {   // baris skor total DSR (plan 022)
    delete o.nilai;
    o.skor = r.skor;
    o.kpi = rankKpiPublic_(r.kpi);
  }
  return o;
}

/** Ranking bersama semua DT untuk akun mana pun (sudah lolos kode akses di doGet). Tanpa filter cakupan, tapi hanya bidang aman. */
function respondRank_(me, reg) {
  const mine = me.peran === 'dt' ? me.dt_kode : '';
  const hit = cacheGet_('respondrank_v2');
  if (hit) return Object.assign({ mode: 'rank', peran: me.peran, me: { dt_kode: mine } }, hit);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const toko = readObjs_(ss, 'GS_TOKO');
  const bandedSku = readObjs_(ss, 'GS_BANDED_SKU').map(b => ({ channel: str_(b.channel), sku_kode: str_(b.sku_kode), sku_nama: str_(b.sku_nama) }));
  const cfg = readGsCfg_(ss);
  const hist = readObjs_(ss, 'GS_BULANAN');
  const dts = reg.filter(x => x.peran === 'dt' && x.sheet_id);
  const rankRes = dts.map(x => salesRankForDt_(x, toko, bandedSku, cfg, hist));
  const rk = rankSales_(rankRes, cfg.rank_min_toko);
  const bu = {};
  Object.keys(rk.bu).forEach(k => {
    const b = rk.bu[k];
    bu[k] = { label: b.label, fop: b.fop.map(rankPublicRow_), banded: b.banded.map(rankPublicRow_), asrt: b.asrt.map(rankPublicRow_),
      belumCukup: { fop: b.belumCukup.fop.map(rankPublicRow_), banded: b.belumCukup.banded.map(rankPublicRow_), asrt: b.belumCukup.asrt.map(rankPublicRow_) }, belumTransaksi: b.belumTransaksi };
  });
  const body = { tanggalData: rk.tanggalData, bulan: rk.bulan, minToko: rk.minToko,
    dts: rankRes.map(d => ({ kode: d.dist_kode, nama: d.dist_nama, status: d.error ? 'error' : d.bulan ? 'ok' : 'tanpa_data' })), bu: bu,
    total: rankTotalForRes_(ss, dts, rankRes, cfg) };
  if (!rankRes.some(d => d.error)) cachePut_('respondrank_v2', body);   // hasil dengan DT galat tidak disimpan, supaya pulih begitu DT itu normal
  return Object.assign({ mode: 'rank', peran: me.peran, me: { dt_kode: mine } }, body);
}

/** Skor total DSR (plan 022) untuk respons view=rank: gabungan hasil per DT + PS + target Assortment + R2G, lalu diperingkat. */
function rankTotalForRes_(ss, dts, rankRes, cfg) {
  const ps = readObjs_(ss, 'GS_PS'), latest = {};
  ps.forEach(r => { const k = String(r.dist_kode).trim() + '|' + String(r.outlet_kode).trim(); const t = String(r.tanggal); if (!(k in latest) || t >= latest[k].t) latest[k] = { t: t, st: String(r.status).trim() }; });
  const trend = asrtTrendInfo_(ss, cfg.asrt_growth);
  const targets = rankTargetsFromScorecard_(readObjs_(ss, 'GS_SCORECARD'));
  const byDt = {}; dts.forEach(x => { byDt[x.dt_kode] = x; });
  const inDts = rankRes.map(d => {
    if (d.error) return { error: true };
    const pre = String(d.dist_kode).trim() + '|', myPs = {}, myTarget = {};
    Object.keys(latest).forEach(k => { if (k.indexOf(pre) === 0) myPs[k.slice(pre.length)] = latest[k].st; });
    if (trend.aktif) Object.keys(trend.target).forEach(k => { if (k.indexOf(pre) === 0) myTarget[k] = trend.target[k]; });
    return { dist_kode: d.dist_kode, dist_nama: d.dist_nama, total: d.total, ps: myPs, asrtTarget: myTarget, r2g: byDt[d.dist_kode] ? r2gForDt_(byDt[d.dist_kode]) : {} };
  });
  const rows = computeDsrTotals_({ dts: inDts, cfg: cfg, targets: targets });
  const rk = rankTotal_(rows, cfg.rank_min_toko);
  const bobot = {}; RANK_KPI.forEach(k => { const v = cfg['rank_w_' + k]; bobot[k] = typeof v === 'number' && isFinite(v) && v >= 0 ? v : GS_CFG_DEFAULT['rank_w_' + k]; });
  return { bobot: bobot, aktif: rankTotalAktif_(rows), rows: rk.rows.map(rankPublicRow_), belumCukup: rk.belumCukup.map(rankPublicRow_) };
}

/** Fingerprint pendek input yang memengaruhi hasil tetapi bukan bagian kunci cache DMS (daftar toko, SKU banded, config, riwayat). */
function rankSig_(parts) {
  const s = JSON.stringify(parts); let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Ranking satu DT (cache 5 menit). Gagal -> { dist_kode, dist_nama, error } supaya DT lain tetap jalan. */
function salesRankForDt_(r, toko, bandedSku, cfg, hist) {
  try {
    const mine = toko.filter(t => String(t.dist_kode).trim() === String(r.dt_kode).trim());
    const myHist = (hist || []).filter(h => String(h.dist_kode) === String(r.dt_kode));
    const payload = getPayload_(r.sheet_id);
    const key = 'rank_v2_' + r.sheet_id + '_' + payload.builtAt + '_' + rankSig_([mine.map(t => [t.outlet_kode, t.remark, t.status]), bandedSku, cfg, myHist.length]);
    const hit = cacheGet_(key);
    if (hit) return hit;
    const sh = SpreadsheetApp.openById(r.sheet_id).getSheetByName('MASTER_PRODUK');
    const produk = sh ? sh.getDataRange().getValues() : [];
    const res = computeSalesRank_({ dms: payload.tabs.DMS_EXTRACT || [], produk: produk, outletMaster: payload.tabs.OUTLET_MASTER || [], dsr: payload.tabs.DSR || [],
      stores: mine, bandedSku: bandedSku, cfg: cfg, hist: myHist, dtKode: r.dt_kode, moq: ASRT_MOQ });
    res.dist_kode = r.dt_kode; res.dist_nama = r.nama_dt; res.stores = mine.length;
    cachePut_(key, res);
    return res;
  } catch (err) {
    return { dist_kode: r.dt_kode, dist_nama: r.nama_dt, error: String(err) };
  }
}

// ====================== WEEKLY FOP & BANDED (dari DMS Extract + daftar toko monitoring) ======================
// Daftar toko (GS_TOKO) dan SKU banded (GS_BANDED_SKU) diisi lewat tool upload dari file referensi.
// Toko yang dihitung = toko ACTIVE dengan REMARK yang ada di GS_CONFIG (remark_spm / remark_minis); toko lain
// (mis. OTHERS) tidak dihitung. Daftar yang sama dipakai untuk Weekly FOP dan Banded.
//  - Weekly FOP: minggu (ISO, dihitung per bulan data) yang qty bersihnya positif. 3 minggu = WEEKLY, 2 = BIWEEKLY, 1 = MONTHLY.
//    Minggu yang melewati pergantian bulan dihitung di kedua bulan, sama dengan kolom 05.2026 / 05.20261 di file HO.
//  - Banded: toko tercapai kalau SKU banded channel-nya yang sudah dibeli (qty bersih bulan data > 0) >= ambang
//    (banded_spm / banded_minis di GS_CONFIG).

const GS_CFG_DEFAULT = { remark_spm: 'LOCAL SPM', remark_minis: 'TOP 1000 LOCAL MINIS, LOCAL MINIS', banded_spm: 0.8, banded_minis: 0.7, fop_weekly: 3, fop_biweekly: 2, rank_min_toko: 5, asrt_growth: 0.15,
  // Bobot skor total DSR (plan 022): sama dengan bobot scorecard HO (PS 10; FOP 8+8; ASRT 8+8; BANDED 6+6; R2G 12). Dapat diubah lewat GS_CONFIG.
  rank_w_ps: 10, rank_w_fop: 16, rank_w_asrt: 16, rank_w_banded: 12, rank_w_r2g: 12 };

function monIsoWeek_(iso) {
  const p = iso.split('-'), ms = Date.UTC(+p[0], +p[1] - 1, +p[2]), d = new Date(ms);
  const day = d.getUTCDay() || 7;
  const thu = new Date(ms + (4 - day) * 86400000);
  const y0 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.ceil(((thu.getTime() - y0) / 86400000 + 1) / 7);
}

/** '2026-10' -> '2026-Q4'. */
function monQuarter_(p) { return String(p).slice(0, 4) + '-Q' + Math.ceil(+String(p).slice(5, 7) / 3); }

/**
 * Pure. Minggu ISO yang memuat minimal satu hari di bulan 'YYYY-MM', urut kalender:
 * [{ w, from, to, workdays }]. from/to = hari pertama/terakhir minggu itu DI DALAM bulan; workdays = hari Senin-Sabtu
 * di rentang itu (libur nasional tidak dikurangi).
 */
function monWeeksOfMonth_(bulan) {
  const y = +bulan.slice(0, 4), m = +bulan.slice(5, 7), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const res = [], idx = {};
  for (let d = 1; d <= last; d++) {
    const iso = bulan + '-' + (d < 10 ? '0' : '') + d, w = monIsoWeek_(iso), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!(w in idx)) { idx[w] = res.length; res.push({ w: w, from: iso, to: iso, workdays: 0 }); }
    const e = res[idx[w]]; e.to = iso; if (dow !== 0) e.workdays++;
  }
  return res;
}

function monList_(v) { return String(v === null || v === undefined ? '' : v).split(',').map(s => s.trim().toUpperCase()).filter(Boolean); }

/** Config GS_CONFIG (key | value | keterangan) digabung dengan nilai awal. */
function readGsCfg_(ss) {
  const cfg = {}; Object.keys(GS_CFG_DEFAULT).forEach(k => { cfg[k] = GS_CFG_DEFAULT[k]; });
  const sh = ss.getSheetByName('GS_CONFIG');
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      const k = String(r[0]).trim(); if (!(k in GS_CFG_DEFAULT) || String(r[1]).trim() === '') return;
      cfg[k] = typeof GS_CFG_DEFAULT[k] === 'number' ? asrtNum_(String(r[1]).replace(',', '.')) : String(r[1]).trim();
    });
  }
  return cfg;
}

/**
 * Pure. dms = array 2D (baris 1 = header); stores = [{outlet_kode, outlet_nama, remark, status, channel}] milik satu DT;
 * bandedSku = [{channel:'SPM'|'MINIS', sku_kode, sku_nama}]. Hasil per grup SPM / MINIS.
 */
function computeMon_(dms, stores, bandedSku, cfg, hist) {
  const col = (hdr, alts) => { const h = hdr.map(x => String(x).replace(/\s+/g, ' ').trim().toLowerCase()); for (let i = 0; i < alts.length; i++) { const k = h.indexOf(alts[i].toLowerCase()); if (k >= 0) return k; } return -1; };
  const remarkOf = { SPM: monList_(cfg.remark_spm), MINIS: monList_(cfg.remark_minis) };
  const groupOf = s => { const r = String(s.remark || '').trim().toUpperCase(); return remarkOf.SPM.indexOf(r) >= 0 ? 'SPM' : remarkOf.MINIS.indexOf(r) >= 0 ? 'MINIS' : ''; };
  const out = { bulan: '', tanggalData: '', week: null, qLabel: '', qMonths: [], groups: { SPM: [], MINIS: [] }, excluded: 0, inactive: 0, rows: 0 };
  const monitored = [];
  stores.forEach(s => {
    if (String(s.status || '').trim().toUpperCase() === 'INACTIVE') { out.inactive++; return; }
    const g = groupOf(s); if (!g) { out.excluded++; return; }
    monitored.push({ s: s, g: g });
  });
  if (!dms.length) { out.noData = true; return out; }
  const cO = col(dms[0], ['Outlet', 'Kode Outlet Bersih']), cK = col(dms[0], ['SKUCode', 'SKU Code']),
    cQ = col(dms[0], ['TotalQuantity(PCS)', 'TotalQuantity (PCS)']), cD = col(dms[0], ['INVDate', 'InvDate', 'Tanggal']);
  if (cO < 0 || cQ < 0 || cD < 0) { out.noData = true; return out; }
  const body = dms.slice(1);
  let maxIso = '';
  body.forEach(r => { const d = asrtIso_(r[cD]); if (d > maxIso) maxIso = d; });
  if (!maxIso) { out.noData = true; return out; }
  const bulan = maxIso.slice(0, 7);
  out.bulan = bulan; out.tanggalData = maxIso; out.week = monIsoWeek_(maxIso);
  out.monthWeeks = monWeeksOfMonth_(bulan);
  out.bySku = { SPM: [], MINIS: [] };
  const weekPos = out.monthWeeks.map(x => x.w), curPos = weekPos.indexOf(out.week);
  if (curPos < 0) throw new Error('computeMon_: minggu data ' + out.week + ' tidak ada di monthWeeks ' + bulan);
  // EVB kuartal: SKU banded yang pernah dibeli di bulan-bulan sebelumnya dalam kuartal yang sama (dari rekap GS_BULANAN) + bulan data ini.
  const prior = {}, qHave = {};
  (hist || []).forEach(h => {
    if (String(h.periode) >= bulan || monQuarter_(h.periode) !== monQuarter_(bulan)) return;
    qHave[h.periode] = true;
    const o = String(h.outlet_kode).trim(); prior[o] = prior[o] || {};
    String(h.banded_sku || '').split(',').forEach(k => { k = k.trim(); if (k) prior[o][k] = true; });
  });
  out.qLabel = monQuarter_(bulan).split('-')[1] + ' ' + bulan.slice(0, 4);
  out.qMonths = Object.keys(qHave).sort().concat(bulan);
  const wk = {}, sku = {};
  body.forEach(r => {
    const d = asrtIso_(r[cD]); if (!d || d.slice(0, 7) !== bulan) return;
    const o = String(r[cO]).trim(); if (!o) return;
    out.rows++;
    const q = asrtNum_(r[cQ]), w = monIsoWeek_(d);
    (wk[o] = wk[o] || {})[w] = ((wk[o] || {})[w] || 0) + q;
    if (cK >= 0) { const k = String(r[cK]).trim(); if (k) (sku[o] = sku[o] || {})[k] = ((sku[o] || {})[k] || 0) + q; }
  });
  const need = Math.max(1, Math.round(cfg.fop_weekly)), mid = Math.max(1, Math.round(cfg.fop_biweekly));
  const skusOf = g => bandedSku.filter(b => b.channel === g);
  monitored.forEach(m => {
    const o = str_(m.s.outlet_kode).trim();
    const ws = Object.keys(wk[o] || {}).filter(w => wk[o][w] > 0).map(Number);
    const n = ws.length;
    const list = skusOf(m.g), month = list.filter(b => ((sku[o] || {})[b.sku_kode] || 0) > 0);
    const bought = list.filter(b => ((sku[o] || {})[b.sku_kode] || 0) > 0 || (prior[o] && prior[o][b.sku_kode]));
    const thr = m.g === 'SPM' ? cfg.banded_spm : cfg.banded_minis;
    const share = list.length ? bought.length / list.length : null;
    // Minggu order (urut kalender) dan peluang WEEKLY: 'open' = minggu tersisa (dari minggu data terbaru) yang belum order.
    const wks = weekPos.filter(w => ws.indexOf(w) >= 0), needMore = Math.max(need - n, 0);
    let open = 0;
    for (let i = curPos; i < out.monthWeeks.length; i++) if (out.monthWeeks[i].workdays >= 1 && wks.indexOf(out.monthWeeks[i].w) < 0) open++;
    const risk = n >= need ? 'AMAN' : open < needMore ? 'GAGAL' : open === needMore ? 'KRITIS' : 'BIASA';
    out.groups[m.g].push({
      outlet_kode: o, outlet_nama: m.s.outlet_nama, remark: m.s.remark, weeks: n,
      status: n >= need ? 'WEEKLY' : n >= mid ? 'BIWEEKLY' : n >= 1 ? 'MONTHLY' : 'BELUM ORDER',
      weekNow: ws.indexOf(out.week) >= 0 ? 1 : 0, lastWeek: n ? Math.max.apply(null, ws) : '',
      bTotal: list.length, bBought: bought.length, bMonth: month.length, bSkus: month.map(b => b.sku_kode), bShare: share,
      bHit: share !== null && Math.round(share * 1000) / 1000 >= thr ? 1 : 0,
      bMiss: list.filter(b => bought.indexOf(b) < 0).map(b => b.sku_kode),
      wks: wks, needMore: needMore, open: open, risk: risk,
    });
  });
  // Ringkasan per SKU banded per channel: berapa toko yang sudah membelinya (bulan ini / kuartal) dari total toko.
  ['SPM', 'MINIS'].forEach(g => {
    const sts = out.groups[g];
    out.bySku[g] = skusOf(g).map(b => ({
      sku_kode: b.sku_kode, sku_nama: b.sku_nama, total: sts.length,
      bought: sts.length - sts.filter(x => x.bMiss.indexOf(b.sku_kode) >= 0).length,
      month: sts.filter(x => x.bSkus.indexOf(b.sku_kode) >= 0).length,
    })).sort((x, y) => x.bought - y.bought || (x.sku_kode < y.sku_kode ? -1 : x.sku_kode > y.sku_kode ? 1 : 0));
  });
  return out;
}

/** Hitungan satu DT dari DMS_EXTRACT-nya (tokonya sesuai dist_kode di GS_TOKO). */
function monForDt_(r, toko, bandedSku, cfg, hist) {
  const mine = toko.filter(t => String(t.dist_kode).trim() === String(r.dt_kode).trim());
  if (!mine.length) return { dist_kode: r.dt_kode, dist_nama: r.nama_dt, stores: 0 };
  const payload = getPayload_(r.sheet_id);
  const res = computeMon_(payload.tabs.DMS_EXTRACT || [], mine, bandedSku, cfg, (hist || []).filter(h => String(h.dist_kode) === String(r.dt_kode)));
  res.dist_kode = r.dt_kode; res.dist_nama = r.nama_dt; res.stores = mine.length;
  return res;
}


// ====================== REKAP BULANAN (disimpan otomatis) ======================
// Tiap upload DMS memicu admin=snapshot: hasil bulan data disimpan ke GS_BULANAN (per toko: minggu order, status FOP,
// SKU banded yang dibeli) dan GS_BULANAN_ASRT (assortment per DT x channel). final=1 kalau data sudah sampai hari kerja
// terakhir bulan itu (bukan Minggu, bukan HARI_LIBUR); selain itu draft yang ditimpa tiap upload. Snapshot yang datanya
// lebih lama dari yang tersimpan tidak menimpa. Bulan-bulan tersimpan dipakai untuk EVB kuartal (SKU banded yang pernah dibeli).

const BUL_TAB = 'GS_BULANAN';
const BUL_ASRT_TAB = 'GS_BULANAN_ASRT';
const BUL_HEADER = ['periode', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'grup', 'remark', 'minggu', 'status_fop', 'banded_sku', 'data_sampai', 'final', 'disimpan'];
const BUL_ASRT_HEADER = ['periode', 'dist_kode', 'dist_nama', 'channel', 'outlet_aktif', 'lines', 'terdaftar', 'data_sampai', 'final', 'disimpan'];

/** Hari kerja terakhir bulan 'YYYY-MM' (bukan Minggu, bukan di daftar libur). libur = array 2D tab HARI_LIBUR (baris 1 header). */
function monLastWorkingDay_(bulan, libur) {
  const off = {}; (libur || []).slice(1).forEach(r => { const d = asrtIso_(r[0]); if (d) off[d] = true; });
  const y = +bulan.slice(0, 4), m = +bulan.slice(5, 7), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = last; d >= 1; d--) {
    const iso = bulan + '-' + (d < 10 ? '0' : '') + d, dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && !off[iso]) return iso;
  }
  return bulan + '-01';
}

function readObjs_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  return v.slice(1).filter(r => r.some(c => c !== '')).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return fillCols_(o, name); });
}

/** Kolom wajib per tab Sheet pusat (sama dengan penulisnya di tool upload dan Code.gs ini). */
function tabCols_(name) {
  switch (name) {
    case 'GS_SCORECARD': return ['tanggal', 'kpi', 'label', 'target', 'bobot', 'aktual', 'poin', 'catatan'];
    case 'GS_TOKO': return ['tanggal', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'channel', 'subchannel', 'remark', 'status'];
    case 'GS_PS': return ['tanggal', 'periode', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'channel', 'status', 'total_kpi', 'cotc', 'npd', 'sos', 'sstd', 'banded', 's_cotc', 's_npd', 's_sos', 's_sstd', 's_banded'];
    case 'GS_PS_HIST': return ['tanggal', 'dist_kode', 'target', 'full', 'lite', 'perfect'];
    case 'GS_TARGET': return ['dist_kode', 'dist_nama', 'target_full', 'target_lite'];
    case 'GS_MANUAL': return ['tanggal', 'rank', 'dr', 'waktu'];
    case 'GS_OUTLET': return ['tanggal', 'jenis', 'dist_kode', 'dist_nama', 'outlet_kode', 'outlet_nama', 'channel', 'remark', 'v1', 'v2', 'v3', 'status', 'detail'];
    case 'GS_BANDED_SKU': return ['channel', 'sku_kode', 'sku_nama'];
    case 'GS_BULANAN': return BUL_HEADER;
    case 'GS_BULANAN_ASRT': return BUL_ASRT_HEADER;
    default: return [];
  }
}

/** Kolom wajib yang hilang (header berganti nama atau terhapus) diisi '' supaya hilir tidak menulis teks 'undefined'. */
function fillCols_(o, name) { tabCols_(name).forEach(k => { if (!(k in o)) o[k] = ''; }); return o; }

function writeObjs_(ss, name, header, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const all = [header].concat(rows);
  if (sh.getMaxRows() < all.length) sh.insertRowsAfter(sh.getMaxRows(), all.length - sh.getMaxRows());
  sh.getRange(1, 1, all.length, header.length).setNumberFormat('@');
  sh.getRange(1, 1, all.length, header.length).setValues(all.map(r => r.map(v => String(v === null || v === undefined ? '' : v))));
}

/** Pure. Baris snapshot dari hasil computeMon_ (mon) dan computeAsrt_ (asrt) satu DT. */
function snapshotRows_(r, mon, asrt, libur, stamp) {
  const bulan = (mon && mon.bulan) || (asrt && asrt.bulan) || '';
  const sampai = (mon && mon.tanggalData) || (asrt && asrt.tanggalData) || '';
  if (!bulan || !sampai) return null;
  const lastWd = monLastWorkingDay_(bulan, libur), final = sampai >= lastWd ? 1 : 0;
  const stores = [];
  if (mon) ['SPM', 'MINIS'].forEach(g => mon.groups[g].forEach(o => {
    stores.push([bulan, r.dt_kode, r.nama_dt, o.outlet_kode, o.outlet_nama, g, o.remark, o.weeks, o.status, (o.bSkus || []).join(','), sampai, final, stamp]);
  }));
  const as = [];
  if (asrt) ['SPM', 'MINIS'].forEach(g => { const c = asrt.channels && asrt.channels[g]; if (c) as.push([bulan, r.dt_kode, r.nama_dt, g, c.outlets, c.lines, c.registered || 0, sampai, final, stamp]); });
  return { bulan: bulan, sampai: sampai, final: final, lastWd: lastWd, stores: stores, asrt: as };
}

/** Simpan snapshot satu DT. Hasil: {dist_kode, dist_nama, status: 'final'|'draft'|'dilewati'|'kosong'|'error', ...}. */
function snapshotDt_(ss, r, toko, bandedSku, cfg) {
  const info = { dist_kode: r.dt_kode, dist_nama: r.nama_dt };
  try {
    const payload = getPayload_(r.sheet_id), dms = payload.tabs.DMS_EXTRACT || [];
    if (dms.length < 2) { info.status = 'kosong'; return info; }
    const mine = toko.filter(t => String(t.dist_kode).trim() === String(r.dt_kode).trim());
    const hist = readObjs_(ss, BUL_TAB).filter(h => String(h.dist_kode) === String(r.dt_kode));
    const mon = mine.length ? computeMon_(dms, mine, bandedSku, cfg, hist) : null;
    const asrt = asrtForDt_(r);
    const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    const snap = snapshotRows_(r, mon && !mon.noData ? mon : null, asrt, payload.tabs.HARI_LIBUR, stamp);
    if (!snap) { info.status = 'kosong'; return info; }
    Object.assign(info, { periode: snap.bulan, dataSampai: snap.sampai, hariKerjaTerakhir: snap.lastWd, stores: snap.stores.length, asrtRows: snap.asrt.length });
    const old = readObjs_(ss, BUL_TAB).filter(h => String(h.periode) === snap.bulan && String(h.dist_kode) === String(r.dt_kode));
    const oldSampai = old.reduce((a, h) => String(h.data_sampai) > a ? String(h.data_sampai) : a, '');
    const oldAsrt = readObjs_(ss, BUL_ASRT_TAB).filter(h => String(h.periode) === snap.bulan && String(h.dist_kode) === String(r.dt_kode));
    const oldSampai2 = oldAsrt.reduce((a, h) => String(h.data_sampai) > a ? String(h.data_sampai) : a, oldSampai);
    if (oldSampai2 && oldSampai2 > snap.sampai) { info.status = 'dilewati'; info.tersimpanSampai = oldSampai2; return info; }
    const keep = (name, header) => readObjs_(ss, name).filter(h => !(String(h.periode) === snap.bulan && String(h.dist_kode) === String(r.dt_kode))).map(h => header.map(k => h[k]));
    writeObjs_(ss, BUL_TAB, BUL_HEADER, keep(BUL_TAB, BUL_HEADER).concat(snap.stores));
    writeObjs_(ss, BUL_ASRT_TAB, BUL_ASRT_HEADER, keep(BUL_ASRT_TAB, BUL_ASRT_HEADER).concat(snap.asrt));
    info.status = snap.final ? 'final' : 'draft';
    if (!mine.length) info.catatan = 'Daftar toko monitoring belum ada, hanya assortment yang tersimpan.';
    return info;
  } catch (err) {
    info.status = 'error'; info.error = String(err); return info;
  }
}

/** Pure. Rekap per periode x grup untuk halaman: FOP, Banded bulan itu, EVB kuartal berjalan, dan assortment per channel. */
function monRecap_(hist, asrtRows, bandedSku, cfg) {
  const total = { SPM: 0, MINIS: 0 }; bandedSku.forEach(b => { total[b.channel] = (total[b.channel] || 0) + 1; });
  const thr = { SPM: cfg.banded_spm, MINIS: cfg.banded_minis };
  const periodes = {};
  hist.forEach(h => { (periodes[h.periode] = periodes[h.periode] || []).push(h); });
  const out = [];
  Object.keys(periodes).sort().forEach(p => {
    const q = monQuarter_(p);
    ['SPM', 'MINIS'].forEach(g => {
      const rows = periodes[p].filter(h => h.grup === g);
      if (!rows.length) return;
      const skus = h => String(h.banded_sku || '').split(',').map(x => x.trim()).filter(Boolean);
      const evb = {};
      Object.keys(periodes).filter(x => monQuarter_(x) === q && x <= p).forEach(x => periodes[x].filter(h => h.grup === g).forEach(h => {
        const k = h.dist_kode + '|' + h.outlet_kode; evb[k] = evb[k] || {}; skus(h).forEach(c => { evb[k][c] = true; });
      }));
      const hit = n => total[g] > 0 && Math.round(n / total[g] * 1000) / 1000 >= thr[g];
      out.push({ periode: p, grup: g, toko: rows.length,
        weekly: rows.filter(h => h.status_fop === 'WEEKLY').length,
        bandedBulan: rows.filter(h => hit(skus(h).length)).length,
        evbQ: rows.filter(h => hit(Object.keys(evb[h.dist_kode + '|' + h.outlet_kode] || {}).length)).length,
        sampai: rows.reduce((a, h) => String(h.data_sampai) > a ? String(h.data_sampai) : a, ''),
        final: rows.every(h => String(h.final) === '1') ? 1 : 0, disimpan: rows[0].disimpan });
    });
  });
  const asrt = asrtRows.map(a => ({ periode: a.periode, dist_kode: a.dist_kode, dist_nama: a.dist_nama, channel: a.channel, outlet_aktif: a.outlet_aktif, lines: a.lines, terdaftar: a.terdaftar, sampai: a.data_sampai, final: a.final }));
  return { fop: out, asrt: asrt };
}

const STOK_TAB = 'STOK_GUDANG';
const STOK_HEADER = ['dt_kode', 'tanggal', 'sku', 'karton', 'lusin', 'pcs', 'isi', 'rpp'];
const STOK_MAX_ROWS = 8000;
const STOK_MIN_INTERVAL_SEC = 20;  // jarak minimum dua penyimpanan untuk DT yang sama
const STOK_WC_WARN = 100;          // peringatan bila week cover satu parent SKU >= 100 minggu
const STOK_WC_MAX_WARN = 20;       // maksimum jumlah peringatan di balasan
const STOK_BACKUP_TAB = '(Backup) STOK_GUDANG';

/** Terima stock gudang satu DT dari SBA Logbook App. Mengganti baris DT itu saja di STOK_GUDANG. */
function simpanStok_(body) {
  const dt = String(body.dt || '').trim();
  const reg = readRegistry_().find(r => r.peran === 'dt' && r.dt_kode === dt && r.sheet_id);
  if (!reg) return { ok: true, skipped: true, reason: 'DT ' + dt + ' tidak terdaftar di Monitoring Daily, data tidak dikirim.' };
  const tanggal = String(body.tanggal || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { error: 'bad_request', message: 'tanggal harus format YYYY-MM-DD.' };
  const batas = Utilities.formatDate(new Date(Date.now() + 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (tanggal > batas) return { ok: true, skipped: true, reason: 'Tanggal laporan ' + tanggal + ' ada di masa depan, data tidak dikirim.' };
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length) return { error: 'bad_request', message: 'rows kosong.' };
  if (rows.length > STOK_MAX_ROWS) return { error: 'bad_request', message: 'rows terlalu banyak (maks ' + STOK_MAX_ROWS + ').' };
  const clean = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], sku = String(r[0] || '').trim();
    if (!/^\d+$/.test(sku)) continue;
    clean.push([dt, tanggal, sku, +r[1] || 0, +r[2] || 0, +r[3] || 0, +r[4] || 1, Math.max(0, +r[5] || 0)]);
  }
  if (!clean.length) return { error: 'bad_request', message: 'Tidak ada baris SKU yang valid.' };
  const cache = CacheService.getScriptCache(), rk = 'stok_rl_' + dt;
  if (cache.get(rk)) return { ok: true, skipped: true, reason: 'Terlalu sering mengirim stok untuk DT ' + dt + ', coba lagi sebentar lagi.' };
  cache.put(rk, '1', STOK_MIN_INTERVAL_SEC);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = ss.getSpreadsheetTimeZone();
    const all = readObjs_(ss, STOK_TAB).map(o => STOK_HEADER.map(k => o[k] instanceof Date ? Utilities.formatDate(o[k], tz, 'yyyy-MM-dd') : o[k]));
    const keep = all.filter(r => String(r[0]) !== dt), prev = all.filter(r => String(r[0]) === dt);
    if (prev.length) {
      const prevTgl = String(prev[0][1]);
      if (tanggal < prevTgl) return { ok: true, skipped: true, reason: 'Laporan tanggal ' + tanggal + ' lebih lama dari yang tersimpan (' + prevTgl + '), data tidak dikirim.' };
      if (prev.length >= 100 && clean.length < prev.length * 0.5) {
        return { ok: true, skipped: true, reason: 'Jumlah SKU (' + clean.length + ') kurang dari separuh data tersimpan (' + prev.length + '), data tidak dikirim. Upload manual di tool Monitoring jika memang benar.' };
      }
    }
    const bak = ss.getSheetByName(STOK_BACKUP_TAB) || ss.insertSheet(STOK_BACKUP_TAB);
    if (all.length) { writeObjs_(ss, STOK_BACKUP_TAB, STOK_HEADER, all); bak.hideSheet(); }
    writeObjs_(ss, STOK_TAB, STOK_HEADER, keep.concat(clean));
  } finally { lock.releaseLock(); }
  const out = { ok: true, dt: dt, dtNama: reg.nama_dt, rows: clean.length, tanggal: tanggal, wcWarn: STOK_WC_WARN, warnings: [] };
  try { out.warnings = stokWcWarningsForDt_(reg, tanggal, clean); } catch (err) { out.warningsError = String(err); }
  return out;
}

/**
 * Pure. Week cover per parent SKU (LEVEL-9). Stok dijumlah dalam pcs per parent dulu, baru dibagi rata-rata penjualan per minggu.
 * Aturan penjualan meniru assets/stok.js (monthly/metrics): qty karton = GSV ribuan x 1000 / (harga / 1.11), rata-rata 13 minggu
 * = jumlah 3 bulan terakhir (sampai bulan terakhir data jual DT) / (hari / 7), semua bucket dijumlah.
 * in_ = { stok:[{sku,karton,lusin,pcs,isi}], harga:[{sku,isi,mulai,h_new,h_old}], jual:[{sku,bkt,mulai,v}], parentOf:{sku:level9}, today:'YYYY-MM-DD' }
 * return [{ parent, skus, stokPcs, ratePcsMgg, wc }] untuk parent dengan rate > 0, urut wc menurun.
 */
function computeStokWc_(in_) {
  const parentOf = in_.parentOf || {}, today = String(in_.today || '');
  const par = sku => parentOf[sku] || sku;
  const hargaBy = {};
  (in_.harga || []).forEach(h => { const k = String(h.sku); if (!hargaBy[k]) hargaBy[k] = h; });
  const isiOf = {};
  (in_.stok || []).forEach(s => { isiOf[String(s.sku)] = +s.isi || 1; });
  // Bulan terakhir data jual DT (JL) dan deret bulanan per SKU (semua bucket dijumlah)
  let JL = -1;
  const rec = [];
  (in_.jual || []).forEach(r => {
    const p = String(r.mulai).split('-'), i0 = +p[0] * 12 + (+p[1]) - 1, v = String(r.v).split(',').map(Number);
    rec.push({ sku: String(r.sku), i0: i0, v: v });
    JL = Math.max(JL, i0 + v.length - 1);
  });
  if (JL < 0) return [];
  const monthDays = idx => new Date(Date.UTC(Math.floor(idx / 12), idx % 12 + 1, 0)).getUTCDate();
  let hari = 0;
  for (let i = JL - 2; i <= JL; i++) hari += monthDays(i);
  const minggu = hari / 7;
  const rateOf = {};   // sku -> pcs per minggu
  rec.forEach(r => {
    const h = hargaBy[r.sku];
    if (!h) return;
    const hNew = +h.h_new || 0, hOld = +h.h_old || 0;
    const hp = (h.mulai && String(h.mulai) > today) ? (hOld || hNew) : (hNew || hOld);
    if (!hp) return;
    const price = hp / 1.11, isi = +h.isi || isiOf[r.sku] || 1;
    let kartonTot = 0;
    r.v.forEach((g, k) => { const idx = r.i0 + k; if (idx >= JL - 2 && idx <= JL) kartonTot += (+g || 0) * 1000 / price; });
    rateOf[r.sku] = (rateOf[r.sku] || 0) + kartonTot / minggu * (isiOf[r.sku] || isi);
  });
  const by = {};
  const slot = sku => { const p = par(sku); return by[p] || (by[p] = { parent: p, skus: [], stokPcs: 0, ratePcsMgg: 0, wc: null }); };
  (in_.stok || []).forEach(s => {
    const sku = String(s.sku), g = slot(sku);
    g.skus.push(sku);
    g.stokPcs += (+s.karton || 0) * (+s.isi || 1) + (+s.lusin || 0) * 12 + (+s.pcs || 0);
  });
  Object.keys(rateOf).forEach(sku => { slot(sku).ratePcsMgg += rateOf[sku]; });
  return Object.keys(by).map(k => by[k]).filter(g => g.ratePcsMgg > 0)
    .map(g => { g.wc = g.stokPcs / g.ratePcsMgg; return g; })
    .sort((a, b) => b.wc - a.wc);
}

/** Bentuk HARGA_PL (baris readObjs_) untuk computeStokWc_. */
function stokWcHarga_(rows, iso) {
  return rows.map(r => ({ sku: String(r.sku), isi: +r.isi || 1, mulai: iso(r.mulai), h_new: r.h_new === '' ? null : +r.h_new, h_old: r.h_old === '' ? null : +r.h_old }));
}

/** Inti peringatan WC: baca MASTER_PRODUK Sheet DT (LEVEL-9), hitung lewat computeStokWc_, saring >= STOK_WC_WARN. stok = [{sku,karton,lusin,pcs,isi}]. */
function stokWcWarnCore_(reg, stok, harga, jual) {
  const parentOf = {};
  const sh = SpreadsheetApp.openById(reg.sheet_id).getSheetByName('MASTER_PRODUK');
  const produk = sh ? sh.getDataRange().getValues() : [];
  if (produk.length) {
    const h = produk[0].map(x => String(x).replace(/\s+/g, ' ').trim().toLowerCase());
    const cS = h.indexOf('skucode'), cB = h.indexOf('level-9');
    if (cS >= 0 && cB >= 0) produk.slice(1).forEach(r => { const a = String(r[cS]).trim(), b = String(r[cB]).trim(); if (a && b) parentOf[a] = b; });
  }
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return computeStokWc_({ stok: stok, harga: harga, jual: jual, parentOf: parentOf, today: today })
    .filter(g => g.wc >= STOK_WC_WARN).slice(0, STOK_WC_MAX_WARN)
    .map(g => ({ parent: g.parent, skus: g.skus, stokPcs: g.stokPcs, ratePcsMgg: Math.round(g.ratePcsMgg * 10) / 10, wc: Math.round(g.wc * 10) / 10 }));
}

/** Peringatan WC besar untuk laporan stok yang baru disimpan. Hanya parent dengan WC >= STOK_WC_WARN, maks STOK_WC_MAX_WARN. */
function stokWcWarningsForDt_(reg, tanggal, clean) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone();
  const iso = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '');
  const harga = stokWcHarga_(readObjs_(ss, 'HARGA_PL'), iso);
  const jual = readObjs_(ss, 'JUAL_SKU').filter(r => String(r.dt_kode) === reg.dt_kode).map(r => ({ sku: String(r.sku), bkt: String(r.bkt), mulai: String(r.mulai), v: String(r.v) }));
  const stok = clean.map(r => ({ sku: String(r[2]), karton: r[3], lusin: r[4], pcs: r[5], isi: r[6] }));
  return stokWcWarnCore_(reg, stok, harga, jual);
}

/**
 * Peringatan WC untuk stok TERSIMPAN tiap DT di Cek Stok. perDt[dt] = daftar peringatan, atau { error } bila DT itu gagal.
 * Cache 5 menit per DT (kunci memuat dt_kode, tanggal stok, tanggal daftar harga).
 */
function stokWcPerDt_(dts, stokObjs, hargaObjs, jualObjs, tanggal, iso) {
  const harga = stokWcHarga_(hargaObjs, iso), hTgl = hargaObjs.length ? String(hargaObjs[0].tanggal_pl || '') : '';
  const perDt = {};
  dts.forEach(reg => {
    const dt = String(reg.dt_kode);
    if (!tanggal[dt]) return;
    try {
      const key = 'stokwc_v1_' + dt + '_' + tanggal[dt] + '_' + hTgl;
      const hit = cacheGet_(key);
      if (hit) { perDt[dt] = hit.list; return; }
      const stok = stokObjs.filter(r => String(r.dt_kode) === dt).map(r => ({ sku: String(r.sku), karton: +r.karton || 0, lusin: +r.lusin || 0, pcs: +r.pcs || 0, isi: +r.isi || 1 }));
      const jual = jualObjs.filter(r => String(r.dt_kode) === dt).map(r => ({ sku: String(r.sku), bkt: String(r.bkt), mulai: String(r.mulai), v: String(r.v) }));
      const list = stokWcWarnCore_(reg, stok, harga, jual);
      cachePut_(key, { list: list });
      perDt[dt] = list;
    } catch (err) { perDt[dt] = { error: String(err) }; }
  });
  return perDt;
}


// ---- Status aplikasi (spanduk maintenance) ----
// Dibaca publik lewat ?view=status oleh Monitoring Daily, Cek Stok, dan SBA Logbook. Diubah lewat admin-status.html
// dengan kode admin. Kode TIDAK disimpan di repo: hanya hash-nya di Script property ADMIN_HASH.
const STATUS_PROP = 'STATUS_JSON';
const ADMIN_PROP = 'ADMIN_HASH';
const ADMIN_SALT = 'mh-admin-v1:';

function adminHash_(kode) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, ADMIN_SALT + String(kode)));
}

function readStatus_() {
  let s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty(STATUS_PROP) || '{}'); } catch (err) { s = {}; }
  return { mode: 'status', aktif: !!s.aktif, blokir: !!s.blokir, judul: String(s.judul || ''), pesan: String(s.pesan || ''), ts: s.ts || '' };
}

/** null kalau kode benar; kalau salah, objek error. Salah >= 5: tebakan diperlambat; >= 25 dalam 15 menit: semua ditolak. Kode benar tetap diterima di bawah batas keras. */
const ADM_SOFT_LOCK = 5, ADM_HARD_LOCK = 25;   // tebakan salah per 15 menit
function adminAuth_(kode) {
  const cache = CacheService.getScriptCache(), props = PropertiesService.getScriptProperties();
  const fails = +(cache.get('adm_fail') || 0);
  if (fails >= ADM_HARD_LOCK) return { error: 'terkunci', message: 'Terlalu banyak kode salah. Coba lagi 15 menit lagi.' };
  const h = props.getProperty(ADMIN_PROP);
  if (!h) return { error: 'belum_diatur', message: 'Kode admin belum diatur.' };
  if (adminHash_(kode) !== h) {
    cache.put('adm_fail', String(fails + 1), 900);
    if (fails + 1 >= ADM_SOFT_LOCK) Utilities.sleep(2000);   // perlambat tebakan, tanpa menolak kode benar
    return { error: 'invalid_code', message: 'Kode admin salah.' };
  }
  cache.remove('adm_fail');
  return null;
}

function setStatus_(body) {
  const bad = adminAuth_(String(body.kode || ''));
  if (bad) return bad;
  const mode = String(body.mode || '');
  if (['mati', 'banner', 'blokir'].indexOf(mode) < 0) return { error: 'bad_request', message: 'mode harus mati, banner, atau blokir.' };
  const st = { aktif: mode !== 'mati', blokir: mode === 'blokir', judul: String(body.judul || '').slice(0, 60), pesan: String(body.pesan || '').slice(0, 300), ts: new Date().toISOString() };
  if (st.aktif && !st.pesan.trim()) return { error: 'bad_request', message: 'Pesan wajib diisi.' };
  PropertiesService.getScriptProperties().setProperty(STATUS_PROP, JSON.stringify(st));
  return readStatus_();
}

function gantiKodeAdmin_(body) {
  const bad = adminAuth_(String(body.kode || ''));
  if (bad) return bad;
  const baru = String(body.kodeBaru || '');
  if (baru.length < 8) return { error: 'bad_request', message: 'Kode baru minimal 8 karakter.' };
  PropertiesService.getScriptProperties().setProperty(ADMIN_PROP, adminHash_(baru));
  return { ok: true };
}

/** Pengaturan kode admin pertama kali. Hanya jalan selama ADMIN_HASH belum ada; sesudahnya ditolak (pakai gantiKodeAdmin). */
function klaimKodeAdmin_(body) {
  const props = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (props.getProperty(ADMIN_PROP)) return { error: 'sudah_diatur', message: 'Kode admin sudah diatur. Pakai Ganti kode.' };
    const baru = String(body.kodeBaru || '');
    if (baru.length < 8) return { error: 'bad_request', message: 'Kode minimal 8 karakter.' };
    props.setProperty(ADMIN_PROP, adminHash_(baru));
    return { ok: true };
  } finally { lock.releaseLock(); }
}
