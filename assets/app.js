"use strict";

/* ═══════════════════════════════════════════════════════════════
   BAGIAN 1: FUNGSI MURNI (tidak menyentuh DOM, bisa diuji lepas)
   Sheet hanya mengirim data mentah. Semua pencapaian dan insentif
   dihitung di sini, dengan aturan yang sama seperti Monitoring v13.
   Diekspor lewat window.MonitoringHarian untuk pengujian otomatis.
   ═══════════════════════════════════════════════════════════════ */

const idn = new Intl.NumberFormat('id-ID');
const idn1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rp = v => { if (v == null || isNaN(v)) return '–'; const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e9 ? s + 'Rp ' + idn.format(+(a / 1e9).toFixed(2)) + ' M' : a >= 1e6 ? s + 'Rp ' + idn1.format(a / 1e6) + ' Jt' : s + 'Rp ' + idn.format(Math.round(a)); };
const rpFull = v => (v == null || isNaN(v)) ? '–' : (v < 0 ? '-' : '') + 'Rp ' + idn.format(Math.abs(Math.round(v)));
const pct = v => isFinite(v) ? idn1.format(v * 100) + ' %' : '–';
const num = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v ?? '').replace(/,/g, '').trim()); return isFinite(n) ? n : 0; };
const str = v => String(v ?? '').trim();
const kodeOf = v => { const n = parseInt(str(v), 10); return isFinite(n) ? String(n) : ''; };
const normName = s => str(s).toUpperCase().replace(/\s+/g, ' ');
const hdrKey = s => str(s).replace(/\s+/g, ' ').toLowerCase();
const perKey = v => str(v).slice(0, 7); // '2026-09' atau '2026-09-01' (tanggal dari Sheet) -> '2026-09'

const BU = ['bw', 'pc', 'hc', 'fo'];
const BU_LONG = { bw: 'Beauty & Wellbeing', pc: 'Personal Care', hc: 'Home Care', fo: 'Foods' };
const BU_MAP = { 'BEAUTY & WELLBE': 'bw', 'BEAUTY & WELLBEING': 'bw', 'PERSONAL CARE': 'pc', 'HOME CARE': 'hc', 'FOODS': 'fo', BW: 'bw', PC: 'pc', HC: 'hc', FO: 'fo' };
const toBu = s => BU_MAP[str(s).toUpperCase()] || null;
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const bulanOf = p => { const m = /^(\d{4})-(\d{2})$/.exec(p); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : ''; };
const DAY_ID = { Monday: 'Senin', Tuesday: 'Selasa', Wednesday: 'Rabu', Thursday: 'Kamis', Friday: 'Jumat', Saturday: 'Sabtu', Sunday: 'Minggu' };

const TL = { juara: 'JUARA', achieve: 'ACHIEVE', bawah: 'BATAS BAWAH', none: 'BELUM' };
const TIER_FACTOR = { juara: 1, achieve: .85, bawah: .5, none: 0 };
const PT_LBL = { Everbilled: 'Everbilled', Redlines: 'Redlines', Width: 'Width (Pasti Untung)', NPD: 'NPD Regular', 'Big Bets': 'NPD Thematic' };
const CAT_TO_CODE = { 'SKU Fokus': 'F', 'NPD Regular': 'N', 'NPD Thematic': 'B' };
const CODE_TO_CAT = { F: 'SKU Fokus', N: 'NPD Regular', B: 'NPD Thematic' };
// Tuas simulator untuk tiap tipe komponen KPI. bp ikut tuas eco: toko baru transaksi menambah keduanya.
const LEVER = { ss_total: 'ss', asrt: 'asrt', eco: 'eco', bp: 'eco' };

/** Tabel 2D (baris 1 = header) -> { rows, col(...nama) }. Kolom dicari lewat nama header. */
function table(aoa) {
  const hdr = ((aoa || [])[0] || []).map(str);
  return {
    hdr,
    rows: (aoa || []).slice(1),
    col: (...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; },
  };
}
const at = (r, i) => i < 0 ? '' : r[i];

/** Hari dari tanggal invoice: '16/09/2026', '2026-09-16', atau Date. */
function dayOf(v) {
  const s = str(v); if (!s) return null;
  if (s.includes('/')) { const d = parseInt(s.split('/')[0], 10); return isNaN(d) ? null : d; }
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(s); if (m) return +m[1];
  const dt = new Date(s); return isNaN(dt) ? null : dt.getDate();
}

function tierOf(ach, tiers) {
  if (!isFinite(ach)) return 'none';
  if (ach >= tiers.juara) return 'juara';
  if (ach >= tiers.achieve) return 'achieve';
  if (ach >= tiers.bawah) return 'bawah';
  return 'none';
}

/** Report NGDMS ditempel apa adanya: cari baris header di 20 baris pertama. */
function parseNgdms(aoa) {
  const need = ['salesman', 'e2e target', 'e2s target', 'e2e achieved', 'e2s achieved'];
  let hi = -1, ix = {};
  for (let i = 0; i < Math.min((aoa || []).length, 20); i++) {
    const m = {}; (aoa[i] || []).forEach((c, j) => { const k = hdrKey(c); if (k && !(k in m)) m[k] = j; });
    if (need.every(k => k in m)) { hi = i; ix = m; break; }
  }
  if (hi < 0) return null;
  const get = (r, k) => ix[k] == null ? '' : r[ix[k]];
  let dist = '', distName = ''; const byCode = {};
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const d = str(get(r, 'distributor')); if (d) dist = d;
    const dn = str(get(r, 'distributor name')); if (dn) distName = dn;
    const kode = kodeOf(get(r, 'salesman')); if (!kode) continue;
    const o = byCode[kode] = byCode[kode] || { kode, nama: '', outlets: 0, e2eT: 0, e2sT: 0, e2eA: 0, e2sA: 0 };
    if (!o.nama) o.nama = str(get(r, 'salesman name'));
    o.outlets += num(get(r, 'no of active outlets')); o.e2eT += num(get(r, 'e2e target')); o.e2sT += num(get(r, 'e2s target'));
    o.e2eA += num(get(r, 'e2e achieved')); o.e2sA += num(get(r, 'e2s achieved'));
  }
  let year = '', month = '';
  for (let i = 0; i < hi; i++) (aoa[i] || []).forEach(c => { const t = str(c); if (!year && /^\d{4}$/.test(t)) year = t; else if (year && !month && /^\d{1,2}$/.test(t)) month = t.padStart(2, '0'); });
  return { dist, distName, period: year && month ? year + '-' + month : '', rows: Object.values(byCode) };
}

/**
 * payload = respons Apps Script: { config, tabs: { TARGET, DMS_EXTRACT, NORMS_SKU, SKU_FOKUS,
 * NGDMS_ASRT, DSR, OUTLET_MASTER, KPI, MASTER_PRODUK } }, tiap tab array 2D.
 */
function buildModel(payload) {
  const cfg = payload.config || {}, T = payload.tabs || {}, warn = [], note = [];
  const dtKode = str(cfg.dt_kode);

  /* DSR */
  const tD = table(T.DSR), dK = tD.col('kode_dsr'), dN = tD.col('nama_dsr'), dC = tD.col('channel');
  const dsrAll = tD.rows.map(r => ({ kode: kodeOf(at(r, dK)), nama: str(at(r, dN)), ch: str(at(r, dC)) || 'GT' })).filter(d => d.kode);
  const active = dsrAll.filter(d => d.ch !== '-').sort((a, b) => +a.kode - +b.kode);
  const dsrByKode = k => active.find(d => d.kode === String(k));
  const byName = n => active.find(d => normName(d.nama) === normName(n));
  if (!active.length) warn.push('Tab DSR kosong atau semua nonaktif.');

  /* TARGET: baris dengan periode sama dengan CONFIG.periode (kosong = periode terbaru di tab) */
  const tT = table(T.TARGET), tp = tT.col('periode');
  let periode = perKey(cfg.periode);
  if (!periode) periode = tT.rows.map(r => perKey(at(r, tp))).sort().pop() || '';
  const tgt = {};
  tT.rows.filter(r => perKey(at(r, tp)) === periode).forEach(r => {
    const k = kodeOf(at(r, tT.col('kode_dsr'))); if (!k) return;
    tgt[k] = { bw: num(at(r, tT.col('target_ss_bw'))), pc: num(at(r, tT.col('target_ss_pc'))), hc: num(at(r, tT.col('target_ss_hc'))), fo: num(at(r, tT.col('target_ss_fo'))), asrt: num(at(r, tT.col('target_assortment'))), bp: num(at(r, tT.col('target_bp'))) };
  });
  if (!Object.keys(tgt).length) warn.push(`Tab TARGET tidak punya baris untuk periode ${periode || '(kosong)'}.`);
  const tgtSs = k => tgt[k] || { bw: 0, pc: 0, hc: 0, fo: 0, asrt: 0, bp: 0 };
  const buCoverage = k => BU.filter(b => tgtSs(k)[b] > 0);

  /* MASTER_PRODUK */
  const tP = table(T.MASTER_PRODUK), pS = tP.col('SKUCode'), pB = tP.col('LEVEL-9'), pU = tP.col('BU'), pN = tP.col('nama_basepack');
  const sku2base = {}, base2bu = {}, base2name = {};
  tP.rows.forEach(r => {
    const sku = str(at(r, pS)), bp = str(at(r, pB)); if (!bp) return;
    if (sku) sku2base[sku] = bp;
    const bu = toBu(at(r, pU)); if (bu) base2bu[bp] = bu;
    const nm = str(at(r, pN)); if (nm) base2name[bp] = nm;
  });
  if (!tP.rows.length) warn.push('Tab MASTER_PRODUK kosong: norms SKU dan SKU Fokus tidak bisa dihitung.');

  /* OUTLET_MASTER -> pjp[kodeToko] = daftar pemilik (bisa >1 salesman, dual coverage per BU) */
  const tO = table(T.OUTLET_MASTER), oC = tO.col('Outlet Code'), oN = tO.col('Outlet Name'), oS = tO.col('Salesman'), oP = tO.col('PJP Day'), oT = tO.col('Outlet Type Desc'), oU = tO.col('Outlet sub-Type Description', 'Outlet Sub-Type Description', 'Outlet Sub Type Desc');
  const pjp = {};
  tO.rows.forEach(r => {
    const full = str(at(r, oC)); if (!full) return;
    const suffix = dtKode && full.startsWith(dtKode) && full.length > dtKode.length ? full.slice(dtKode.length) : full;
    const rec = { kode: suffix, nama: str(at(r, oN)), sm: str(at(r, oS)), pjp: DAY_ID[str(at(r, oP))] || str(at(r, oP)) || 'Uncovered', ch: str(at(r, oT)), sub: str(at(r, oU)) };
    pjp[suffix] = pjp[suffix] || [];
    if (!pjp[suffix].some(x => x.sm === rec.sm)) pjp[suffix].push(rec);
  });

  /* DMS_EXTRACT */
  const tE = table(T.DMS_EXTRACT);
  const cK = tE.col('Salesman', 'DSR Code (Hygiene)'), cBu = tE.col('Sub_division', 'Category'), cG = tE.col('GSV'), cO = tE.col('Outlet', 'Kode Outlet Bersih'), cON = tE.col('Outlet Name', 'OutletName'), cCh = tE.col('SubChannel', 'Sub Channel'), cSku = tE.col('SKUCode', 'SKU Code'), cQty = tE.col('TotalQuantity(PCS)', 'TotalQuantity (PCS)'), cDate = tE.col('INVDate', 'InvDate', 'Tanggal');
  if (tE.rows.length && (cK < 0 || cG < 0)) warn.push('Tab DMS_EXTRACT: kolom Salesman/GSV tidak ditemukan. Header: ' + tE.hdr.slice(0, 12).join(', '));
  const ssAct = {}, ssMid = {}, outlets = {}, ownerByBu = {}, qtyBy = {}, weekMap = {}, unknown = new Set();
  let numericOutlet = 0;
  const zero = () => ({ bw: 0, pc: 0, hc: 0, fo: 0 });
  if (cK >= 0 && cG >= 0) tE.rows.forEach(r => {
    const kode = kodeOf(r[cK]); if (!kode) return;
    const d = dsrByKode(kode); if (!d) { unknown.add(kode); return; }
    const b = toBu(at(r, cBu)), g = typeof r[cG] === 'number' ? r[cG] : parseFloat(str(r[cG]).replace(/,/g, '.')) || 0;
    const rawO = at(r, cO); if (typeof rawO === 'number' && rawO > 1e14) numericOutlet++;
    const ok = str(rawO);
    ssAct[kode] = ssAct[kode] || zero(); if (b) ssAct[kode][b] += g;
    const day = cDate >= 0 ? dayOf(r[cDate]) : null;
    if (day !== null && day <= 15) { ssMid[kode] = ssMid[kode] || zero(); if (b) ssMid[kode][b] += g; }
    if (ok) {
      const key = ok + '||' + kode;
      const o = outlets[key] = outlets[key] || { kode: ok, nama: str(at(r, cON)), sm: d.nama, dk: kode, omset: 0, bu: {}, ch: str(at(r, cCh)) };
      o.omset += g;
      if (b) { o.bu[b] = (o.bu[b] || 0) + g; (ownerByBu[ok] = ownerByBu[ok] || {})[b] = kode; }
      if (day !== null) (weekMap[ok] = weekMap[ok] || new Set()).add(Math.min(5, Math.ceil(day / 7)));
    }
    if (cSku >= 0 && cQty >= 0 && ok) {
      const bp = sku2base[str(r[cSku])];
      if (bp) { const q = num(r[cQty]); qtyBy[ok] = qtyBy[ok] || {}; qtyBy[ok][bp] = (qtyBy[ok][bp] || 0) + q; }
    }
  });
  if (!tE.rows.length) warn.push('Tab DMS_EXTRACT kosong: pencapaian SS, ECO, dan SKU belum bisa dihitung.');
  if (unknown.size) note.push('Kode salesman di DMS_EXTRACT yang tidak ada di tab DSR (dilewati): ' + [...unknown].join(', ') + '.');
  if (numericOutlet) warn.push(`${idn.format(numericOutlet)} kode outlet di DMS_EXTRACT tersimpan sebagai angka, digit belakangnya bisa hilang. Import ulang dengan "Convert text to numbers" tidak dicentang.`);

  /* Toko dari extract yang belum ada di Outlet Master ikut dihitung sebagai toko DSR itu. */
  Object.values(outlets).forEach(o => {
    pjp[o.kode] = pjp[o.kode] || [];
    if (!pjp[o.kode].some(x => x.sm === o.sm)) pjp[o.kode].push({ kode: o.kode, nama: o.nama, sm: o.sm, ch: o.ch, sub: '', pjp: 'Uncovered' });
  });

  /* Frekuensi belanja: weekly (>=3 minggu berbeda), biweekly (2), monthly (1) */
  const freqOf = ok => { const n = weekMap[ok] ? weekMap[ok].size : 0; return n >= 3 ? 'weekly' : n === 2 ? 'biweekly' : n === 1 ? 'monthly' : 'none'; };
  const eco = {};
  Object.entries(pjp).forEach(([suffix, owners]) => owners.forEach(p => {
    const d = byName(p.sm);
    eco[suffix + '||' + (d ? d.kode : p.sm)] = { kode: suffix, nama: p.nama, sm: p.sm, pjp: p.pjp, ch: p.ch, omset: 0, gapBu: '', freq: freqOf(suffix) };
  }));
  Object.values(outlets).forEach(o => {
    const e = eco[o.kode + '||' + o.dk]; if (!e) return;
    e.omset += o.omset; if (!e.nama) e.nama = o.nama;
    const miss = BU.filter(b => !(o.bu[b] > 0)), have = BU.filter(b => o.bu[b] > 0);
    e.gapBu = miss.length && have.length ? miss.map(b => b.toUpperCase()).join('·') : '';
  });
  const ecoList = Object.values(eco);

  /* Pemilik toko per BU: (1) bukti transaksi di extract, (2) cakupan BU target DSR, (3) satu-satunya pemilik */
  function ownerFor(suffix, bu) {
    if (bu && ownerByBu[suffix] && ownerByBu[suffix][bu]) return ownerByBu[suffix][bu];
    const owners = (pjp[suffix] || []).map(o => byName(o.sm)).filter(Boolean);
    if (bu) { const m = owners.find(d => buCoverage(d.kode).includes(bu)); if (m) return m.kode; }
    return owners.length === 1 ? owners[0].kode : null;
  }

  /* NGDMS_ASRT: cocokkan ke DSR lewat nama dulu, kode salesman sebagai cadangan */
  const ng = parseNgdms(T.NGDMS_ASRT), asrt = {};
  if (!ng) warn.push('Tab NGDMS_ASRT kosong atau header E2E/E2S tidak ditemukan.');
  else {
    if (ng.dist && dtKode && ng.dist !== dtKode) warn.push(`Report NGDMS milik distributor ${ng.dist}, bukan ${dtKode}.`);
    if (ng.period && periode && ng.period !== periode) warn.push(`Periode report NGDMS ${ng.period} berbeda dari periode aktif ${periode}.`);
    const miss = [];
    ng.rows.forEach(r => {
      const d = byName(r.nama) || dsrByKode(r.kode); if (!d) { miss.push(`${r.nama} (${r.kode})`); return; }
      const o = asrt[d.kode] = asrt[d.kode] || { e2eT: 0, e2sT: 0, e2eA: 0, e2sA: 0 };
      o.e2eT += r.e2eT; o.e2sT += r.e2sT; o.e2eA += r.e2eA; o.e2sA += r.e2sA;
    });
    if (miss.length) note.push('Salesman di report NGDMS yang tidak cocok dengan DSR aktif: ' + miss.join(', ') + '.');
  }

  /* NORMS_SKU + SKU_FOKUS: achievement selalu dari qty extract DMS */
  const bucket = () => ({ pastiLaku: { tot: 0, ach: 0 }, pastiUntung: { tot: 0, ach: 0 }, npdReg: { tot: 0, ach: 0 }, bigBets: { tot: 0, ach: 0 }, fokus: { tot: 0, ach: 0 } });
  const iq = {}; active.forEach(d => { iq[d.kode] = bucket(); });
  const detail = [];
  const pushDetail = (suffix, kode, sku, cat, soq, qty, ach) => {
    const owners = pjp[suffix] || [], d = dsrByKode(kode), rec = owners.find(x => x.sm === d.nama) || owners[0];
    detail.push({ outlet: suffix, toko: rec ? rec.nama : suffix, pjp: rec ? rec.pjp : '', dk: kode, sku, skuName: base2name[sku] || sku, cat, soq, qty, ach });
  };
  const tN = table(T.NORMS_SKU), nPt = tN.col('PACKTYPE'), nOut = tN.col('OutletCode'), nSku = tN.col('LEVEL-9'), nSub = tN.col('SUB DIVISION2'), nSoq = tN.col('Target SOQ (in pcs)', 'Target SOQ', 'SOQ');
  let normsUnmapped = 0;
  if (tN.rows.length && (nPt < 0 || nOut < 0 || nSoq < 0)) warn.push('Tab NORMS_SKU: kolom PACKTYPE/OutletCode/Target SOQ tidak ditemukan.');
  else tN.rows.forEach(r => {
    const suffix = str(r[nOut]).replace(/^B/i, ''); if (!suffix) return;
    const pt = str(r[nPt]), sku = str(at(r, nSku)), soq = num(r[nSoq]);
    const kode = ownerFor(suffix, toBu(at(r, nSub)) || base2bu[sku]);
    if (!kode || !iq[kode]) { normsUnmapped++; return; }
    const qty = (qtyBy[suffix] && qtyBy[suffix][sku]) || 0, ach = soq > 0 && qty >= soq, b = iq[kode];
    if (pt === 'Everbilled' || pt === 'Redlines') { b.pastiLaku.tot++; if (ach) b.pastiLaku.ach++; }
    else if (pt === 'Width') { b.pastiUntung.tot++; if (ach) b.pastiUntung.ach++; }
    else if (pt === 'NPD') { b.pastiUntung.tot++; b.npdReg.tot++; if (ach) { b.pastiUntung.ach++; b.npdReg.ach++; } }
    else if (pt === 'Big Bets') { b.bigBets.tot++; if (ach) b.bigBets.ach++; }
    pushDetail(suffix, kode, sku, PT_LBL[pt] || pt, soq, qty, ach);
  });
  if (normsUnmapped) warn.push(`${idn.format(normsUnmapped)} baris NORMS_SKU tidak ketemu salesman-nya (toko tidak ada di OUTLET_MASTER atau extract), dilewati.`);

  const tF = table(T.SKU_FOKUS), fC = tF.col('channel'), fB = tF.col('LEVEL-9'), fokusBy = {};
  tF.rows.forEach(r => { const ch = str(at(r, fC)), bp = str(at(r, fB)); if (ch && bp) (fokusBy[ch] = fokusBy[ch] || []).push(bp); });
  Object.entries(pjp).forEach(([suffix, owners]) => {
    const lists = new Set(); owners.forEach(p => { if (fokusBy[p.ch]) lists.add(p.ch); if (fokusBy[p.sub]) lists.add(p.sub); });
    lists.forEach(ch => fokusBy[ch].forEach(bp => {
      // Sama dengan v13: hanya basepack yang pernah terbeli di toko itu yang dihitung.
      const qty = qtyBy[suffix] && qtyBy[suffix][bp]; if (qty === undefined) return;
      const kode = ownerFor(suffix, base2bu[bp]); if (!kode || !iq[kode]) return;
      iq[kode].fokus.tot++; if (qty > 0) iq[kode].fokus.ach++;
      pushDetail(suffix, kode, bp, 'SKU Fokus', 1, qty, qty > 0);
    }));
  });

  /* KPI */
  const tK = table(T.KPI), kc = n => tK.col(n);
  const comps = tK.rows.filter(r => str(at(r, kc('id')))).map(r => ({
    id: str(at(r, kc('id'))), nama: str(at(r, kc('nama'))) || str(at(r, kc('id'))), tipe: str(at(r, kc('tipe'))), bu: toBu(at(r, kc('bu'))) || str(at(r, kc('bu'))).toLowerCase() || 'bw',
    bobot: num(at(r, kc('bobot'))),
    tiers: { juara: num(at(r, kc('tier_juara'))), achieve: num(at(r, kc('tier_achieve'))), bawah: num(at(r, kc('tier_bawah'))) },
    jasper: { juara: num(at(r, kc('jasper_juara'))), achieve: num(at(r, kc('jasper_achieve'))), bawah: num(at(r, kc('jasper_bawah'))) },
    dsr: str(at(r, kc('khusus_dsr'))).split(/[,;\s]+/).map(kodeOf).filter(Boolean),
  }));
  if (!comps.length) warn.push('Tab KPI kosong: skor dan jasper tidak bisa dihitung.');
  const rules = {
    comps,
    addInc: { midPct: num(cfg.add_mid_pct), reward: num(cfg.add_reward) },
    sku: { fokusRate: num(cfg.rate_sku_fokus), npdRate: num(cfg.rate_npd_regular), bbRate: num(cfg.rate_npd_thematic), bbEcoMin: num(cfg.npd_thematic_eco_min) },
    band: { green: num(cfg.band_green) || 90, amber: num(cfg.band_amber) || 70 },
  };
  const hkTotal = num(cfg.hk_total) || 25, hkRun = num(cfg.hk_run) || 0;

  /* Model per DSR */
  const dsrList = active.map(d => {
    const k = d.kode, t = tgtSs(k), a = ssAct[k] || zero(), m = ssMid[k] || zero(), q = iq[k], as = asrt[k];
    const sum = o => BU.reduce((s, b) => s + (+o[b] || 0), 0);
    const pjpCnt = Object.values(pjp).flat().filter(p => p.sm === d.nama).length;
    const mine = ecoList.filter(o => o.sm === d.nama);
    const bpAkt = Object.values(outlets).filter(o => o.dk === k && o.omset > 0).length;
    const lines = detail.filter(x => x.dk === k && !x.ach && CAT_TO_CODE[x.cat]).map(x => ({
      c: CAT_TO_CODE[x.cat], toko: x.toko, pjp: x.pjp, sku: x.skuName, soq: x.soq, qty: x.qty, need: Math.max(1, Math.ceil(x.soq - x.qty)),
    })).sort((x, y) => x.need - y.need);
    return {
      kode: k, nama: d.nama, ch: d.ch,
      ss: { target: sum(t), aktual: sum(a), mid: sum(m), bu: Object.fromEntries(BU.map(b => [b, { t: t[b] || 0, a: a[b] || 0 }])) },
      asrt: as ? { target: as.e2eT + as.e2sT, aktual: as.e2eA + as.e2sA, e2eT: as.e2eT, e2sT: as.e2sT, e2eA: as.e2eA, e2sA: as.e2sA, ref: t.asrt, ada: true }
        : { target: 0, aktual: 0, e2eT: 0, e2sT: 0, e2eA: 0, e2sA: 0, ref: t.asrt, ada: false },
      bp: { target: t.bp || pjpCnt, aktual: bpAkt },
      eco: { pjp: pjpCnt, tx: mine.filter(o => o.omset > 0).length },
      sku: { fokus: q.fokus.ach, npd: q.npdReg.ach, bb: q.bigBets.ach, iq: q },
      bbEco: q.pastiLaku.tot ? q.pastiLaku.ach / q.pastiLaku.tot : 0,
      lines,
      belum: mine.filter(o => o.omset <= 0).map(o => ({ toko_nama: o.nama, pjp_hari: o.pjp, ch: o.ch })),
      toko: mine,
    };
  });

  return {
    rules, hkTotal, hkRun, hkLeft: Math.max(0, hkTotal - hkRun),
    dt: { nama: str(cfg.dt_nama), kode: dtKode, ket: str(cfg.dt_ket) },
    periode, bulan: bulanOf(periode), tanggalData: str(cfg.tanggal_data), ngdmsTanggal: str(cfg.ngdms_tanggal_data),
    builtAt: payload.builtAt || '',
    counts: { extract: tE.rows.length, norms: tN.rows.length, fokus: tF.rows.length, outlet: tO.rows.length, produk: tP.rows.length },
    warn, note, dsrList,
  };
}

/** sim = {ss,asrt,eco,picks:Set<lineIndex>}, tambahan hipotetis di atas aktual sekarang. */
function zeroSim() { return { ss: 0, asrt: 0, eco: 0, picks: new Set() }; }

const applies = (c, d) => !c.dsr.length || c.dsr.includes(d.kode);

function achOf(c, d, sim) {
  switch (c.tipe) {
    case 'ss_total': return d.ss.target ? (d.ss.aktual + sim.ss) / d.ss.target : NaN;
    case 'ss_bu': { const b = d.ss.bu[c.bu] || { t: 0, a: 0 }; return b.t ? b.a / b.t : NaN; }
    case 'asrt': return d.asrt.target ? (d.asrt.aktual + sim.asrt) / d.asrt.target : NaN;
    case 'bp': return d.bp.target ? (d.bp.aktual + sim.eco) / d.bp.target : NaN;
    case 'eco': return d.eco.pjp ? Math.min(d.eco.pjp, d.eco.tx + sim.eco) / d.eco.pjp : NaN;
    default: return NaN;
  }
}

function calc(d, rules, sim) {
  const parts = []; let jasper = 0, scoreSum = 0, weightSum = 0;
  rules.comps.filter(c => applies(c, d)).forEach(c => {
    const ach = achOf(c, d, sim), tier = tierOf(ach, c.tiers), pay = tier === 'none' ? 0 : (c.jasper[tier] || 0);
    parts.push({ id: c.id, nama: c.nama, tipe: c.tipe, ach, tier, pay });
    jasper += pay;
    if (c.bobot > 0) { scoreSum += TIER_FACTOR[tier] * c.bobot; weightSum += c.bobot; }
  });
  const T = d.ss.target, A = d.ss.aktual + sim.ss;
  const addInc = (rules.addInc.reward && T > 0 && d.ss.mid >= rules.addInc.midPct * T && A >= T) ? rules.addInc.reward : 0;
  let fokus = d.sku.fokus, npd = d.sku.npd, bb = d.sku.bb;
  sim.picks.forEach(i => { const l = d.lines[i]; if (!l) return; if (l.c === 'F') fokus++; else if (l.c === 'N') npd++; else if (l.c === 'B') bb++; });
  const bbOk = d.bbEco >= rules.sku.bbEcoMin;
  const sku = fokus * rules.sku.fokusRate + npd * rules.sku.npdRate + (bbOk ? bb * rules.sku.bbRate : 0);
  const score = weightSum ? scoreSum * 100 / weightSum : 0;
  const band = score >= rules.band.green ? 'GREEN' : score >= rules.band.amber ? 'AMBER' : 'RED';
  const ach = {
    ss: T ? A / T : NaN,
    asrt: d.asrt.target ? (d.asrt.aktual + sim.asrt) / d.asrt.target : NaN,
    eco: d.eco.pjp ? Math.min(d.eco.pjp, d.eco.tx + sim.eco) / d.eco.pjp : NaN,
  };
  return { parts, ach, jasper, addInc, sku, total: jasper + addInc + sku, score, band };
}

/** Langkah menuju tier berikutnya, diurutkan dari tambahan insentif per 1% target (paling murah dulu). */
function stepsOf(d, rules, hkLeft) {
  const base = calc(d, rules, zeroSim());
  const ecoCap = Math.max(0, d.eco.pjp - d.eco.tx);
  const lev = {
    ss_total: { cur: d.ss.aktual, tgt: d.ss.target, cap: Infinity, unit: v => rp(v) },
    asrt: { cur: d.asrt.aktual, tgt: d.asrt.target, cap: Infinity, unit: v => idn.format(v) + ' lines' },
    eco: { cur: d.eco.tx, tgt: d.eco.pjp, cap: ecoCap, unit: v => idn.format(v) + ' toko' },
    bp: { cur: d.bp.aktual, tgt: d.bp.target, cap: ecoCap, unit: v => idn.format(v) + ' toko' },
  };
  const out = [];
  rules.comps.filter(c => applies(c, d) && LEVER[c.tipe]).forEach(c => {
    const L = lev[c.tipe], tiers = c.tiers, curAch = L.tgt ? L.cur / L.tgt : NaN;
    if (!L.tgt) return;
    [...new Set([tiers.bawah, tiers.achieve, tiers.juara])].filter(t => t > 0 && (!isFinite(curAch) || t > curAch)).sort((a, b) => a - b).forEach(thr => {
      const need = Math.ceil(thr * L.tgt - L.cur - 1e-9);
      if (need <= 0 || need > L.cap) return;
      const id = LEVER[c.tipe], sim = zeroSim(); sim[id] = need;
      const gain = calc(d, rules, sim).total - base.total;
      if (gain <= 0) return;
      const name = thr === tiers.juara ? 'JUARA' : thr === tiers.achieve ? 'ACHIEVE' : 'BATAS BAWAH';
      const rel = need / L.tgt;
      out.push({ id, comp: c.nama, thr, name, need, gain, per: rel ? gain / (rel * 100) : gain, perDay: (id === 'ss' && hkLeft) ? need / hkLeft : null, text: L.unit(need) });
    });
  });
  return out.sort((a, b) => b.per - a.per);
}

if (typeof window !== 'undefined') {
  window.MonitoringHarian = { tierOf, calc, stepsOf, buildModel, parseNgdms, zeroSim, rp, rpFull, pct, esc, idn, idn1, BU, BU_LONG, CAT_TO_CODE, CODE_TO_CAT, TL };
}
if (typeof module !== 'undefined') {
  module.exports = { tierOf, calc, stepsOf, buildModel, parseNgdms, zeroSim };
}

/* ═══════════════════════════════════════════════════════════════
   BAGIAN 2: DOM, login, render, dan simulator
   Berjalan hanya kalau elemen halamannya ada (aman dipakai di Node
   lewat require untuk mengetes Bagian 1 tanpa memicu ini).
   ═══════════════════════════════════════════════════════════════ */

(function boot() {
  if (typeof document === 'undefined' || !document.getElementById('loginForm')) return;

  const LS_CODE = 'mh_code';
  const $ = id => document.getElementById(id);
  const M = window.MonitoringHarian;
  let MODEL = null, CUR = 0;
  let SIM = []; // satu zeroSim() per DSR, indeks sinkron dengan MODEL.dsrList

  function apiUrl(code) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    return base + (base.includes('?') ? '&' : '?') + 'code=' + encodeURIComponent(code);
  }

  /* Apps Script kadang membalas 404 sesaat walau skripnya jalan normal. Coba ulang sampai 4 kali. */
  async function fetchApi(code) {
    let last;
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetch(apiUrl(code));
        if (res.ok) return await res.json();
        last = new Error('http_' + res.status);
      } catch (err) { last = err; }
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    throw last;
  }

  async function tryLogin(code, silent) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    if (!base || base.includes('PASTE_URL')) {
      showLoginError('APPS_SCRIPT_URL belum diisi di assets/config.js. Lihat README bagian 3.');
      return false;
    }
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Menghubungkan…'; }
    try {
      const data = await fetchApi(code);
      if (data.error === 'invalid_code') { showLoginError('Kode akses salah.'); return false; }
      if (data.error === 'missing_code') { showLoginError('Isi kode akses dulu.'); return false; }
      if (data.error) { showLoginError('Server Apps Script bermasalah: ' + (data.message || data.error)); return false; }
      MODEL = M.buildModel(data);
      SIM = MODEL.dsrList.map(() => M.zeroSim());
      CUR = 0;
      try { localStorage.setItem(LS_CODE, code); } catch {}
      showApp();
      return true;
    } catch (err) {
      showLoginError('Tidak bisa terhubung ke Apps Script. Cek koneksi internet, atau URL di config.js. (' + err.message + ')');
      return false;
    } finally {
      if (!silent) { $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk'; }
    }
  }
  function showLoginError(msg) { $('loginErr').textContent = msg; }

  $('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('codeInput').value.trim();
    if (!code) { showLoginError('Isi kode akses dulu.'); return; }
    showLoginError('');
    tryLogin(code, false);
  });

  function showApp() {
    $('loginScreen').hidden = true;
    $('appScreen').hidden = false;
    renderHeader();
    renderDsrChips();
    renderAll();
  }

  $('logoutBtn').addEventListener('click', () => {
    try { localStorage.removeItem(LS_CODE); } catch {}
    MODEL = null;
    $('appScreen').hidden = true;
    $('loginScreen').hidden = false;
    $('codeInput').value = '';
    $('codeInput').focus();
  });

  function renderHeader() {
    $('dtName').textContent = MODEL.dt.nama || 'Monitoring Harian';
    $('dtIcon').textContent = initialsOf(MODEL.dt.nama);
    $('dtSub').textContent = [MODEL.dt.kode && ('DT ' + MODEL.dt.kode), MODEL.dt.ket, MODEL.bulan].filter(Boolean).join(' · ');
    const upd = MODEL.tanggalData ? ('Data per ' + MODEL.tanggalData) : '';
    $('dtUpdated').textContent = [upd, MODEL.hkRun + '/' + MODEL.hkTotal + ' HK'].filter(Boolean).join(' · ');
    $('dtSepMid').hidden = !$('dtSub').textContent || !$('dtUpdated').textContent;
  }
  function initialsOf(name) {
    const words = String(name || '').replace(/^(PT|CV)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map(w => w[0]).join('') || 'MH').toUpperCase();
  }

  function renderDsrChips() {
    $('dsrChips').innerHTML = MODEL.dsrList.map((d, i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === CUR}">${M.esc(d.nama)}</button>`).join('');
    document.querySelectorAll('#dsrChips .chip').forEach(b => b.onclick = () => { CUR = +b.dataset.i; document.querySelectorAll('#dsrChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderAll(); });
  }

  /* tabs */
  const tabs = () => [...document.querySelectorAll('nav.tabs [role=tab]')];
  function openTab(t) {
    tabs().forEach(b => { const on = b === t; b.setAttribute('aria-selected', on); document.getElementById(b.getAttribute('aria-controls')).hidden = !on; });
  }
  document.addEventListener('click', e => { const t = e.target.closest('nav.tabs [role=tab]'); if (t) openTab(t); });

  function renderAll() { renderRingkasan(); renderSimulator(); renderFruit(); }

  /* RINGKASAN */
  function renderRingkasan() {
    const rows = MODEL.dsrList.map((d, i) => {
      const c = M.calc(d, MODEL.rules, M.zeroSim());
      return `<tr class="${i === CUR ? 'tot' : ''}"><td>${M.esc(d.nama)}</td><td class="n">${pct(c.ach.ss)}</td><td class="n">${pct(c.ach.asrt)}</td><td class="n">${pct(c.ach.eco)}</td><td class="n">${Math.round(c.score)}</td><td><span class="tag ${c.band === 'GREEN' ? 'g' : c.band === 'AMBER' ? 'a' : 'r'}">${c.band}</span></td><td class="n">${rpFullLocal(c.total)}</td></tr>`;
    }).join('');
    $('tOverview').innerHTML = `<thead><tr><th>DSR</th><th class="n">SS</th><th class="n">Assortment</th><th class="n">ECO</th><th class="n">Skor</th><th>Status</th><th class="n">Insentif</th></tr></thead><tbody>${rows}</tbody>`;

    const W = MODEL.warn, N = MODEL.note, li = a => `<ul style="margin:6px 0 0;padding-left:18px">${a.map(w => `<li>${M.esc(w)}</li>`).join('')}</ul>`;
    $('ringBanner').className = 'banner ' + (W.length ? 'bad' : 'info');
    $('ringBanner').innerHTML = (W.length ? 'Cek data di Sheet:' + li(W)
      : `Data terbaca: ${idn.format(MODEL.counts.extract)} baris extract, ${idn.format(MODEL.counts.norms)} baris norms SKU, ${idn.format(MODEL.counts.outlet)} toko di Outlet Master.`)
      + (N.length ? '<div style="margin-top:6px;font-weight:500">Catatan:' + li(N) + '</div>' : '');

    const d = MODEL.dsrList[CUR], base = M.calc(d, MODEL.rules, M.zeroSim());
    $('ringDetail').innerHTML = `<h2 style="margin-top:14px">${M.esc(d.nama)}: insentif</h2>` + breakdownTable(d, base, base) + detailTables(d);
  }

  /* Rincian pencapaian per DSR: SS per BU, assortment, toko, norms SKU */
  function detailTables(d) {
    const tf = MODEL.hkTotal ? MODEL.hkRun / MODEL.hkTotal : 0;
    const ssRows = M.BU.filter(b => d.ss.bu[b].t || d.ss.bu[b].a).map(b => {
      const x = d.ss.bu[b], gap = Math.max(0, x.t - x.a);
      return `<tr><td>${M.BU_LONG[b]}</td><td class="n">${rp(x.t)}</td><td class="n">${rp(x.a)}</td><td class="n">${barCell(x.t ? x.a / x.t : NaN)}</td><td class="n">${rp(gap)}</td><td class="n">${MODEL.hkLeft ? rp(gap / MODEL.hkLeft) : '–'}</td></tr>`;
    }).join('');
    const gapTot = Math.max(0, d.ss.target - d.ss.aktual);
    const ss = `<h2 style="margin-top:14px">Secondary Sales</h2><p class="muted" style="font-size:13px">Timegone ${pct(tf)} · SS tanggal 1-15: ${rp(d.ss.mid)}</p>
      <div class="scroll"><table><thead><tr><th>BU</th><th class="n">Target</th><th class="n">Aktual</th><th class="n">Capaian</th><th class="n">Kurang</th><th class="n">Per hari sisa</th></tr></thead><tbody>${ssRows}
      <tr class="tot"><td>Total</td><td class="n">${rp(d.ss.target)}</td><td class="n">${rp(d.ss.aktual)}</td><td class="n">${barCell(d.ss.target ? d.ss.aktual / d.ss.target : NaN)}</td><td class="n">${rp(gapTot)}</td><td class="n">${MODEL.hkLeft ? rp(gapTot / MODEL.hkLeft) : '–'}</td></tr></tbody></table></div>`;
    const a = d.asrt;
    const asrt = `<h2 style="margin-top:14px">Assortment (NGDMS)</h2>` + (a.ada
      ? `<div class="scroll"><table><thead><tr><th>Bagian</th><th class="n">Target</th><th class="n">Achieved</th><th class="n">Capaian</th></tr></thead><tbody>
        <tr><td>E2E</td><td class="n">${idn1.format(a.e2eT)}</td><td class="n">${idn1.format(a.e2eA)}</td><td class="n">${barCell(a.e2eT ? a.e2eA / a.e2eT : NaN)}</td></tr>
        <tr><td>E2S</td><td class="n">${idn1.format(a.e2sT)}</td><td class="n">${idn1.format(a.e2sA)}</td><td class="n">${barCell(a.e2sT ? a.e2sA / a.e2sT : NaN)}</td></tr>
        <tr class="tot"><td>Total</td><td class="n">${idn1.format(a.target)}</td><td class="n">${idn1.format(a.aktual)}</td><td class="n">${barCell(a.target ? a.aktual / a.target : NaN)}</td></tr></tbody></table></div>
        <p class="muted" style="font-size:12px">Report NGDMS ${M.esc(MODEL.ngdmsTanggal || '')}${a.ref ? ` · Target assortment di tab TARGET: ${idn.format(a.ref)} lines (referensi)` : ''}</p>`
      : `<p class="muted" style="font-size:13px">${M.esc(d.nama)} tidak ada di report NGDMS.</p>`);
    const q = d.sku.iq, r = (x, lbl) => `<tr><td>${lbl}</td><td class="n">${idn.format(x.ach)}</td><td class="n">${idn.format(x.tot)}</td><td class="n">${barCell(x.tot ? x.ach / x.tot : NaN)}</td></tr>`;
    const norms = `<h2 style="margin-top:14px">Norms SKU dan SKU Fokus</h2><div class="scroll"><table><thead><tr><th>Kelompok</th><th class="n">Tercapai</th><th class="n">Target</th><th class="n">Capaian</th></tr></thead><tbody>
      ${r(q.pastiLaku, 'Pasti Laku (Everbilled + Redlines)')}${r(q.pastiUntung, 'Pasti Untung (Width + NPD)')}${r(q.npdReg, 'NPD Regular')}${r(q.bigBets, 'NPD Thematic (Big Bets)')}${r(q.fokus, 'SKU Fokus')}</tbody></table></div>`;
    const tx = d.toko.filter(o => o.omset > 0), fr = k => tx.filter(o => o.freq === k).length;
    const toko = `<h2 style="margin-top:14px">Toko</h2><div class="kpis">
      <div class="kpi"><div class="l">ECO</div><div class="v">${d.eco.tx} / ${d.eco.pjp}</div><div class="s">${pct(d.eco.pjp ? d.eco.tx / d.eco.pjp : NaN)} toko transaksi</div></div>
      <div class="kpi"><div class="l">Billed Productive</div><div class="v">${d.bp.aktual} / ${d.bp.target}</div><div class="s">${pct(d.bp.target ? d.bp.aktual / d.bp.target : NaN)}</div></div>
      <div class="kpi"><div class="l">Frekuensi belanja</div><div class="v">${fr('weekly')} · ${fr('biweekly')} · ${fr('monthly')}</div><div class="s">weekly · biweekly · monthly</div></div></div>`;
    return ss + asrt + toko + norms;
  }

  function barCell(ach) {
    const v = isFinite(ach) ? Math.max(0, Math.min(1, ach)) : 0;
    const color = ach >= 1 ? 'var(--success)' : ach >= .8 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="prow"><span class="pct">${pct(ach)}</span><div class="ptrack"><span class="pfill" style="width:${(v * 100).toFixed(0)}%;background:${color}"></span></div></div>`;
  }
  function breakdownTable(d, base, cur) {
    const rows = cur.parts.map((p, i) => {
      const diff = p.pay - base.parts[i].pay;
      return `<tr><td>${M.esc(p.nama)}</td><td class="n">${barCell(p.ach)}</td><td>${M.TL[p.tier]}</td><td class="n">${rpFullLocal(p.pay)}</td><td class="n">${diff > 0 ? '+' + rpFullLocal(diff) : '–'}</td></tr>`;
    }).join('')
      + `<tr><td>Add Incentive (SSV)</td><td class="n">${pct(cur.ach.ss)}</td><td>${cur.addInc ? 'CAPAI' : 'BELUM'}</td><td class="n">${rpFullLocal(cur.addInc)}</td><td class="n">${cur.addInc > base.addInc ? '+' + rpFullLocal(cur.addInc - base.addInc) : '–'}</td></tr>`
      + `<tr><td>SKU Distribution</td><td class="n">–</td><td>${d.sku.fokus + d.sku.npd + d.sku.bb} SKU</td><td class="n">${rpFullLocal(cur.sku)}</td><td class="n">${cur.sku > base.sku ? '+' + rpFullLocal(cur.sku - base.sku) : '–'}</td></tr>`
      + `<tr class="tot"><td>Total</td><td></td><td></td><td class="n">${rpFullLocal(cur.total)}</td><td class="n">${cur.total > base.total ? '+' + rpFullLocal(cur.total - base.total) : '–'}</td></tr>`;
    return `<div class="scroll"><table><thead><tr><th>Bagian</th><th class="n">Capaian</th><th>Tier</th><th class="n">Insentif</th><th class="n">Tambahan</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function rpFullLocal(v) { return M.rpFull(v); }

  /* SIMULATOR */
  function maxFor(d, id) {
    const steps = M.stepsOf(d, MODEL.rules, MODEL.hkLeft).filter(x => x.id === id).map(x => x.need);
    if (id === 'ss') return Math.max(5000000, Math.ceil((1.15 * d.ss.target - d.ss.aktual) / 1e6) * 1e6, ...steps, 1);
    if (id === 'asrt') return Math.max(10, Math.ceil(0.25 * d.asrt.target), ...steps, 1);
    return Math.max(0, d.eco.pjp - d.eco.tx);
  }
  function renderSimulator() {
    const d = MODEL.dsrList[CUR], s = SIM[CUR];
    const ssMax = maxFor(d, 'ss'), asMax = maxFor(d, 'asrt'), ecMax = maxFor(d, 'eco');
    s.ss = Math.min(s.ss, ssMax); s.asrt = Math.min(s.asrt, asMax); s.eco = Math.min(s.eco, ecMax);
    $('simControls').innerHTML = `
      <div class="ctl"><div class="row"><label for="cSs">Penjualan tambahan sampai akhir bulan</label><output id="oSs">${rp(s.ss)}</output></div>
        <input type="range" id="cSs" min="0" max="${ssMax}" step="500000" value="${s.ss}"><div class="hint" id="hSs"></div></div>
      <div class="ctl"><div class="row"><label for="cAs">Lines assortment tambahan</label><output id="oAs">${idn.format(s.asrt)} lines</output></div>
        <input type="range" id="cAs" min="0" max="${asMax}" step="1" value="${s.asrt}"><div class="hint" id="hAs"></div></div>
      <div class="ctl"><div class="row"><label for="cEc">Toko belum transaksi yang berhasil dibuka</label><output id="oEc">${idn.format(s.eco)} toko</output></div>
        <input type="range" id="cEc" min="0" max="${ecMax}" step="1" value="${s.eco}"><div class="hint" id="hEc"></div></div>`;
    $('cSs').oninput = e => { s.ss = +e.target.value; paintSim(); };
    $('cAs').oninput = e => { s.asrt = +e.target.value; paintSim(); };
    $('cEc').oninput = e => { s.eco = +e.target.value; paintSim(); };
    paintSim();
  }
  function paintSim() {
    const d = MODEL.dsrList[CUR], s = SIM[CUR], base = M.calc(d, MODEL.rules, M.zeroSim()), sim = M.calc(d, MODEL.rules, s), diff = sim.total - base.total;
    $('oSs').textContent = rp(s.ss); $('oAs').textContent = idn.format(s.asrt) + ' lines'; $('oEc').textContent = idn.format(s.eco) + ' toko';
    $('hSs').textContent = `Aktual jadi ${rp(d.ss.aktual + s.ss)} dari ${rp(d.ss.target)} (${pct(sim.ach.ss)})${s.ss ? `, sekitar ${rp(s.ss / (MODEL.hkLeft || 1))} per hari` : ''}`;
    $('hAs').textContent = `Aktual jadi ${idn1.format(d.asrt.aktual + s.asrt)} dari ${idn1.format(d.asrt.target)} lines (${pct(sim.ach.asrt)})`;
    $('hEc').textContent = `Transaksi jadi ${Math.min(d.eco.pjp, d.eco.tx + s.eco)} dari ${d.eco.pjp} toko PJP (${pct(sim.ach.eco)})`;
    $('simKpis').innerHTML = `
      <div class="kpi"><div class="l">Insentif sekarang</div><div class="v">${rpFullLocal(base.total)}</div><div class="s">Skor ${Math.round(base.score)} ${base.band}</div></div>
      <div class="kpi ${diff > 0 ? 'hot' : ''}"><div class="l">Insentif simulasi (perkiraan)</div><div class="v">${rpFullLocal(sim.total)}</div><div class="s">${diff > 0 ? 'Naik ' + rpFullLocal(diff) : diff < 0 ? 'Turun ' + rpFullLocal(-diff) : 'Sama dengan sekarang'}</div></div>
      <div class="kpi"><div class="l">Skor KPI simulasi</div><div class="v">${Math.round(sim.score)}</div><div class="s">${sim.band} · hijau mulai ${MODEL.rules.band.green}</div></div>`;
    $('simBreak').innerHTML = breakdownTable(d, base, sim);
    document.querySelectorAll('#steps .btn').forEach(b => { const on = s[b.dataset.id] >= +b.dataset.need; b.setAttribute('aria-pressed', on); b.textContent = on ? 'Dicoba' : 'Coba'; });
    document.querySelectorAll('#tLines input[type=checkbox]').forEach(c => { c.checked = s.picks.has(+c.dataset.i); });
  }

  /* LOW HANGING FRUIT */
  function renderFruit() {
    const d = MODEL.dsrList[CUR], s = SIM[CUR];
    const steps = M.stepsOf(d, MODEL.rules, MODEL.hkLeft);
    $('steps').innerHTML = steps.length
      ? steps.map((x, i) => `<div class="step"><span class="rank">${i + 1}</span><div><h4>${M.esc(x.comp)}: capai ${x.name}</h4><p>Butuh ${x.text}${x.perDay ? ` (sekitar ${rp(x.perDay)} per hari)` : ''}. Tambahan ${rpFullLocal(x.gain)}, ${rp(x.per)} per 1% target.</p></div><button type="button" class="btn plain" data-id="${x.id}" data-need="${x.need}" aria-pressed="false">Coba</button></div>`).join('')
      : `<div class="empty"><div class="t">Semua tier tercapai</div><p>Tidak ada tier yang bisa menambah insentif untuk ${M.esc(d.nama)} saat ini.</p></div>`;
    document.querySelectorAll('#steps .btn').forEach(b => b.onclick = () => {
      const id = b.dataset.id, need = +b.dataset.need;
      s[id] = s[id] >= need ? 0 : need;
      const inputId = { ss: 'cSs', asrt: 'cAs', eco: 'cEc' }[id];
      const el = $(inputId); if (el) el.value = s[id];
      paintSim();
    });

    if (!d.lines.length) {
      $('tLines').innerHTML = '<tbody><tr><td class="muted">Tidak ada SKU berinsentif yang nyaris capai untuk DSR ini.</td></tr></tbody>';
    } else {
      $('tLines').innerHTML = '<thead><tr><th>Coba</th><th>Toko</th><th>SKU</th><th>Kategori</th><th class="n">Kurang (pcs)</th></tr></thead><tbody>'
        + d.lines.slice(0, 40).map((l, i) => `<tr><td><label class="chk"><input type="checkbox" data-i="${i}" ${s.picks.has(i) ? 'checked' : ''} aria-label="Coba kejar ${M.esc(l.sku)} di ${M.esc(l.toko)}"></label></td><td class="wrap-cell">${M.esc(l.toko)}</td><td class="wrap-cell">${M.esc(l.sku)}</td><td>${M.CODE_TO_CAT[l.c]}</td><td class="n">${idn.format(l.need)}</td></tr>`).join('') + '</tbody>';
      document.querySelectorAll('#tLines input[type=checkbox]').forEach(c => c.onchange = () => { const i = +c.dataset.i; c.checked ? s.picks.add(i) : s.picks.delete(i); paintSim(); });
    }

    $('tBelum').innerHTML = d.belum.length
      ? '<thead><tr><th>Toko</th><th>Hari PJP</th><th>Channel</th></tr></thead><tbody>' + d.belum.slice(0, 60).map(o => `<tr><td class="wrap-cell">${M.esc(o.toko_nama)}</td><td>${M.esc(o.pjp_hari || '–')}</td><td class="wrap-cell">${M.esc(o.ch || '–')}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="muted">Tidak ada toko PJP yang belum transaksi untuk DSR ini.</td></tr></tbody>';
  }

  /* login otomatis kalau kode tersimpan dari sesi sebelumnya */
  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch {}
  if (saved) { $('codeInput').value = saved; tryLogin(saved, true); }
})();
