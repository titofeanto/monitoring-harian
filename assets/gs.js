/* KPI Great Sales: scorecard AAM + daftar toko yang perlu dikejar. Data dari Apps Script ?view=gs. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const bulanLbl = p => BULAN[+String(p).slice(5, 7)] + ' ' + String(p).slice(0, 4);
  let DATA = null, CODE = '', VIEW = '';

  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const pct = v => v == null ? '-' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + BULAN[+m[2]] + ' ' + m[1] : String(iso || ''); };

  async function fetchGs(code, dt) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'view=gs&code=' + encodeURIComponent(code) + (dt ? '&dt=' + encodeURIComponent(dt) : '');
    let last;
    for (let i = 0; i < 4; i++) { // Apps Script kadang membalas 404 sesaat
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
        last = new Error('http_' + res.status);
      } catch (err) { last = err; }
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    throw last;
  }

  function loginErr(msg) { $('loginErr').textContent = msg; $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk'; }

  /* Login otomatis (silent) yang gagal tidak boleh melempar ke layar login kecuali kodenya memang salah. */
  function problem(msg, silent, badCode) {
    if (!silent) { loginErr(msg); return; }
    if (badCode) { $('appScreen').hidden = true; $('loginScreen').hidden = false; refreshNote(''); window.MHBoot.invalid(msg); } else window.MHBoot.fail(msg);
  }

  const CACHE_KEY = 'mh_gs_cache';
  let cacheAt = 0;
  const jam = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); };
  /* Status data di header (titik hijau/kuning/merah); banner hanya untuk gagal memperbarui. */
  function setSync(state, text) { const el = $('sync'); el.className = 'sync ' + state; el.innerHTML = '<i></i><span>' + esc(text) + '</span>'; }
  function refreshNote(txt) {
    const b = $('gsBanner'); b.hidden = true;
    if (!txt) { setSync('ok', 'Terbaru'); return; }
    if (/^Memperbarui/.test(txt)) { setSync('wait', 'Memperbarui…'); return; }
    if (/^Data diperbarui/.test(txt)) { setSync('ok', txt.replace('Data diperbarui pukul ', 'Terbaru ')); return; }
    setSync('off', 'Gagal memperbarui'); b.hidden = false; b.textContent = txt;
  }
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }
  /* Salinan respons terakhir: halaman langsung tampil saat dibuka/refresh, data baru menyusul di belakang. */
  function readCache(code) {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.code === code && c.view === VIEW) { cacheAt = c.at || 0; return c.data; } } catch (e) { /* salinan rusak */ }
    return null;
  }
  function writeCache(code, data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ code, view: VIEW, data, at: Date.now() })); } catch (e) { /* penuh / mode privat */ }
  }

  function enter(d, code) {
    DATA = d; CODE = code;
    try { localStorage.setItem(LS_CODE, code); } catch (e) { /* mode privat */ }
    window.MHBoot.done();
    $('loginScreen').hidden = true; $('appScreen').hidden = false;
    render();
  }

  async function login(code, silent, noCache) {
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Menghubungkan…'; }
    const cached = silent && !noCache ? readCache(code) : null;
    const shown = !!(cached && cached.mode === 'gs' && cached.scorecard && cached.scorecard.length);
    if (shown) { enter(cached, code); refreshNote('Memperbarui data… (tampilan sementara dari ' + (cacheAt ? 'pukul ' + jam(cacheAt) : 'data tersimpan') + ')'); }
    try {
      const d = await fetchGs(code, VIEW);
      if (shown && d.error) refreshNote('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.', true);
      if (d.error === 'invalid_code') { problem('Kode akses salah.', silent, true); return; }
      if (d.error === 'no_data') { problem('Data Great Sales belum diupload lewat tool upload.', silent, false); return; }
      if (d.error) { problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return; }
      if (d.mode !== 'gs') { problem('API belum mendukung Great Sales. Deploy ulang Apps Script (lihat README).', silent, false); return; }
      writeCache(code, d);
      enter(d, code);
      refreshNote('Data diperbarui pukul ' + jam(Date.now()), true);
      return true;
    } catch (err) {
      if (shown || DATA) { refreshNote('Gagal memperbarui, ini data tersimpan' + (cacheAt ? ' pukul ' + jam(cacheAt) : '') + '. Ketuk muat ulang untuk coba lagi.', true); return false; }
      problem('Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
    }
  }

  /** Snapshot per tanggal dari GS_SCORECARD: {tanggal: {kpi: row}}. */
  function snapshots() {
    const by = {};
    DATA.scorecard.forEach(r => { const t = String(r.tanggal); (by[t] = by[t] || {})[r.kpi] = r; });
    return Object.keys(by).sort().map(t => ({ tanggal: t, rows: by[t] }));
  }

  function level(k) {
    const a = num(k.aktual), t = num(k.target);
    if (a == null || !t) return 'amber';
    if (a >= t) return 'green';
    return a >= t * 0.8 ? 'amber' : 'red';
  }

  function kpiList(snap) {
    return Object.values(snap.rows).filter(r => !['SCORE', 'RANK', 'FOP_WEEK'].includes(r.kpi)).map(r => {
      const bobot = num(r.bobot) || 0, poin = num(r.poin);
      return { kpi: r.kpi, label: r.label, target: num(r.target), aktual: num(r.aktual), bobot, poin, hilang: poin == null ? 0 : bobot - poin, catatan: r.catatan };
    }).sort((a, b) => b.hilang - a.hilang);
  }

  const outlets = jenis => DATA.outlets.filter(o => o.jenis === jenis);

  /* ---- Weekly FOP & Banded dihitung API dari Extract DMS (DATA.mon); tanpa daftar toko, jatuh ke data file lama ---- */
  const FOP_NEED_DEFAULT = 3;
  const fopNeed = () => (DATA && DATA.mon && DATA.mon.cfg && num(DATA.mon.cfg.fop_weekly)) || FOP_NEED_DEFAULT;
  const MON_G = { 'LOCAL MINIS': 'MINIS', 'LOCAL SUPERMARKET': 'SPM' };
  const monDts = () => ((DATA.mon && DATA.mon.perDt) || []).filter(d => !d.error && !d.noData && d.groups);
  const monLive = () => !!(DATA.mon && DATA.mon.hasList && monDts().length);
  function monStores(g) {
    const out = [];
    monDts().forEach(d => (d.groups[g] || []).forEach(o => out.push(Object.assign({ dist_nama: d.dist_nama }, o))));
    return out;
  }
  function monSummary() {
    if (!monLive()) return null;
    const r = { bulan: '', tanggal: '', week: null, qLabel: '', qMonths: [], fop: {}, banded: {} };
    monDts().forEach(d => { if (d.tanggalData > r.tanggal) { r.tanggal = d.tanggalData; r.bulan = d.bulan; r.week = d.week; r.qLabel = d.qLabel; r.qMonths = d.qMonths || []; } });
    ['SPM', 'MINIS'].forEach(g => {
      const st = monStores(g), w = st.filter(o => o.status === 'WEEKLY').length, h = st.filter(o => o.bHit).length;
      r.fop[g] = { n: st.length, weekly: w, pct: st.length ? w / st.length : null };
      r.banded[g] = { n: st.length, hit: h, pct: st.length ? h / st.length : null };
    });
    return r;
  }
  /** Catatan kalau ada DT di daftar toko yang DMS-nya belum ada: tokonya tidak ikut hitungan. */
  function monNote() {
    const m = DATA.mon; if (!m || !m.hasList) return '';
    const miss = (m.perDt || []).filter(d => d.noData || d.error).map(d => d.dist_nama).concat((m.noDt || []).map(d => d.dist_nama));
    return miss.length ? `<div class="notice" style="margin-bottom:10px">Extract DMS belum ada untuk <b>${esc(miss.join(', '))}</b>, jadi tokonya belum ikut hitungan.</div>` : '';
  }
  /** Rank & %DR isian manual mingguan: entri terbaru dan sebelumnya. */
  function manual() {
    const m = ((DATA.mon && DATA.mon.manual) || []).filter(x => num(x.rank) != null).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    return { cur: m[m.length - 1] || null, prev: m.length > 1 ? m[m.length - 2] : null };
  }
  const wkTag = '<span class="tag b">Update mingguan</span>';

  const PS_PARTS = [['cotc', 'COTC'], ['npd', 'NPD'], ['sos', 'SOS'], ['sstd', 'SSTD'], ['banded', 'Banded']];
  const psStores = () => (DATA.ps && DATA.ps.stores) || [];
  const psMissing = o => PS_PARTS.filter(p => String(o[p[0]]) === '0').map(p => p[1]);
  const isPerfect = o => o.status === 'PS FULL' || o.status === 'PS LITE';


  const ASRT_CH = [['SPM', 'LOCAL SUPERMARKET', 'Supermarket (SPM)', 'ASRT_SPM'], ['MINIS', 'LOCAL MINIS', 'Local Minis', 'ASRT_MINIS']];
  const asrtDts = () => ((DATA.asrt && DATA.asrt.perDt) || []).filter(d => !d.error);

  /** Assortment per channel dari DMS Extract: lines = jumlah (toko x base pack) tercapai, target dari GS_ASRT_TARGET. */
  function asrtSummary() {
    const dts = asrtDts();
    if (!dts.length) return null;
    const out = {};
    ASRT_CH.forEach(c => {
      let lines = 0, outlets = 0, target = 0;
      dts.forEach(d => { const x = d.channels && d.channels[c[0]]; if (x) { lines += x.lines; outlets += x.outlets; } });
      ((DATA.asrt.targets) || []).forEach(t => { if (t.channel === c[1]) target += num(t.target_lines) || 0; });
      out[c[0]] = { lines, outlets, target, pct: target > 0 ? lines / target : null, perOutlet: outlets ? lines / outlets : 0 };
    });
    return out;
  }

  /** Ringkasan PS dari upload mingguan: target = jumlah target Full + Lite semua DT dalam cakupan. */
  function psSummary() {
    const st = psStores();
    if (!st.length) return null;
    const tg = (DATA.ps.targets || []).reduce((a, t) => ({ full: a.full + (num(t.target_full) || 0), lite: a.lite + (num(t.target_lite) || 0) }), { full: 0, lite: 0 });
    const full = st.filter(o => o.status === 'PS FULL').length, lite = st.filter(o => o.status === 'PS LITE').length;
    const target = tg.full + tg.lite;
    return { stores: st.length, full, lite, perfect: full + lite, target, tFull: tg.full, tLite: tg.lite, tanggal: String(st[0].tanggal) };
  }

  function setKpi(k, aktual, catatan) {
    k.aktual = aktual;
    k.poin = k.target ? k.bobot * Math.min(aktual / k.target, 1) : null;
    k.hilang = k.poin == null ? 0 : k.bobot - k.poin;
    k.catatan = catatan;
  }

  /** PS (upload mingguan) dan Assortment (DMS Extract) dihitung dari data kita, bukan angka HO; skor total dihitung ulang dari poin. */
  function applyLive(kp) {
    let changed = false;
    const sm = psSummary();
    if (sm && sm.target) {
      const k = kp.find(x => x.kpi === 'PS');
      if (k) { setKpi(k, sm.perfect / sm.target, 'Dihitung dari upload Perfect Stores ' + tgl(sm.tanggal) + ': ' + sm.perfect + ' dari target ' + sm.target + ' toko perfect'); changed = true; }
    }
    const as = asrtSummary();
    if (as) ASRT_CH.forEach(c => {
      const a = as[c[0]], k = kp.find(x => x.kpi === c[3]);
      if (k && a.pct != null) { setKpi(k, a.pct, 'Dihitung dari Extract DMS: ' + a.lines + ' lines dari target ' + a.target); changed = true; }
    });
    const ms = monSummary();
    if (ms) [['FOP_SPM', 'fop', 'SPM'], ['FOP_MINIS', 'fop', 'MINIS'], ['BANDED_SPM', 'banded', 'SPM'], ['BANDED_MINIS', 'banded', 'MINIS']].forEach(c => {
      const k = kp.find(x => x.kpi === c[0]), a = ms[c[1]][c[2]];
      if (!k || a.pct == null) return;
      setKpi(k, a.pct, c[1] === 'fop' ? 'Dihitung dari Extract DMS ' + tgl(ms.tanggal) + ': ' + a.weekly + ' dari ' + a.n + ' toko monitoring WEEKLY'
        : 'EVB ' + ms.qLabel + ' dari Extract DMS ' + tgl(ms.tanggal) + ': ' + a.hit + ' dari ' + a.n + ' toko tercapai');
      changed = true;
    });
    const mm = manual(), dr = kp.find(x => x.kpi === 'DR');
    if (dr) {
      dr.weekly = true;
      if (mm.cur && num(mm.cur.dr) != null) { setKpi(dr, num(mm.cur.dr), 'Isian manual ' + tgl(mm.cur.tanggal)); changed = true; }
      else dr.catatan = (dr.catatan ? dr.catatan + ' · ' : '') + 'belum diisi di tool upload, memakai angka file';
    }
    if (changed) kp.sort((a, b) => b.hilang - a.hilang);
    return { kp, sm, as, ms, score: changed ? kp.reduce((a, x) => a + (x.poin || 0), 0) : null };
  }

  const idr = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');
  const nf = v => Math.round(v).toLocaleString('id-ID');
  const nf1 = v => (Math.round(v * 10) / 10).toLocaleString('id-ID');

  /* ---- komponen tampilan (pola: DESIGN.md) ---- */
  const ICON = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', warn: '<path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4M12 17h.01"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>', box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const ciTitle = (icon, title, extra) => `<h2><span class="ci">${svg(icon)}</span>${title}${extra || ''}</h2>`;
  const lvIcon = l => l === 'green' ? ['ok', 'check'] : l === 'amber' ? ['warn', 'warn'] : ['neg', 'down'];

  /* ---- daftar dengan cari, filter, jumlah: satu pola untuk FOP dan Perfect Store ---- */
  const LISTS = {};
  const LST = {};   // id -> {q, f}
  function mountList(id, cfg) {
    LISTS[id] = cfg;
    const st = LST[id] = LST[id] || { q: '', f: cfg.defaultF };
    if (!cfg.chips.some(c => c[0] === st.f)) st.f = cfg.defaultF;
    return `<div class="tb" id="tb-${id}"><label class="sbox">${svg('search')}<input type="search" data-q="${id}" placeholder="Cari nama toko atau distributor" autocomplete="off" value="${esc(st.q)}"><button type="button" class="clr" data-clr="${id}" aria-label="Hapus pencarian" ${st.q ? '' : 'hidden'}>${svg('x')}</button></label>` +
      `<div class="chips" id="ch-${id}" role="group" aria-label="Filter"></div><div class="tb-meta"><span id="mt-${id}"></span></div></div><div id="ls-${id}"></div>`;
  }
  function fillList(id) {
    const cfg = LISTS[id], st = LST[id]; if (!cfg || !$('ls-' + id)) return;
    const q = st.q.trim().toLowerCase();
    const base = cfg.rows.filter(r => !q || cfg.hay(r).includes(q));
    const cnt = {}; cfg.chips.forEach(c => { cnt[c[0]] = base.filter(r => cfg.test(c[0], r)).length; });
    if (q && !cnt[st.f] && st.f !== cfg.defaultF) st.f = cfg.defaultF;
    $('ch-' + id).innerHTML = cfg.chips.map(c => `<button type="button" data-ch="${id}" data-f="${c[0]}" aria-pressed="${st.f === c[0]}"${cnt[c[0]] ? '' : ' class="z"'}>${esc(c[1])} <b>${nf(cnt[c[0]])}</b></button>`).join('');
    const list = base.filter(r => cfg.test(st.f, r)).sort(cfg.sort);
    $('mt-' + id).textContent = list.length === cfg.rows.length ? nf(cfg.rows.length) + ' toko' : nf(list.length) + ' dari ' + nf(cfg.rows.length) + ' toko';
    const shown = list.slice(0, st.limit || 60);
    $('ls-' + id).innerHTML = !cfg.rows.length ? `<div class="empty">${cfg.empty}</div>` : !list.length ? `<div class="empty">Tidak ada toko yang cocok. <button type="button" class="lnk" data-reset="${id}">Hapus pencarian dan filter</button></div>`
      : `<div class="rk-list">${shown.map(cfg.row).join('')}</div>` + (list.length > shown.length ? `<button type="button" class="btn plain more" data-more="${id}">Tampilkan lebih banyak (${nf(list.length - shown.length)} lagi)</button>` : '');
  }

  function render() {
    const snaps = snapshots(), cur = snaps[snaps.length - 1], prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
    const mm = manual();
    const rank = mm.cur ? num(mm.cur.rank) : num(cur.rows.RANK && cur.rows.RANK.aktual), score = num(cur.rows.SCORE && cur.rows.SCORE.aktual);
    const prevRank = mm.cur ? (mm.prev ? num(mm.prev.rank) : null) : (prev ? num(prev.rows.RANK && prev.rows.RANK.aktual) : null);
    const fw = cur.rows.FOP_WEEK;
    $('gsSub').textContent = 'AAM' + (DATA.scope ? ' · ' + DATA.scope.nama : ' · semua DT') + (monLive() ? ' · FOP s.d. mg ' + monSummary().week : fw && fw.aktual !== '' ? ' · FOP s.d. mg ' + fw.aktual : '');
    $('gsUpdated').textContent = 'Data ' + tgl(cur.tanggal);
    const big = $('greetBig'); big.textContent = rank == null ? 'Rank –' : 'Rank ' + rank; big.dataset.len = '';

    if (DATA.dts && DATA.dts.length) {
      $('dtSec').hidden = false;
      $('dtChips').innerHTML = [{ kode: '', nama: 'Semua DT' }].concat(DATA.dts).map(d =>
        `<button type="button" class="chip" data-dt="${esc(d.kode)}" aria-pressed="${d.kode === VIEW}">${esc(d.nama)}</button>`).join('');
    }

    const ap = applyLive(kpiList(cur)), kp = ap.kp;
    const scoreShown = ap.score != null && !DATA.scope ? ap.score : score;
    const gain = kp.reduce((s, k) => s + k.hilang, 0);
    const delta = prevRank == null || rank == null ? 'belum ada pembanding' : rank < prevRank ? `<span class="delta-up">▲ naik ${prevRank - rank} dari ${prevRank}</span>` : rank > prevRank ? `<span class="delta-down">▼ turun ${rank - prevRank} dari ${prevRank}</span>` : 'tetap';
    const pctScore = scoreShown == null ? 0 : Math.max(0, Math.min(100, scoreShown));
    $('heroCard').innerHTML = `<div class="hero-h"><span class="hero-ico">${svg('trophy')}</span><span class="hero-k">Skor Great Sales</span><span class="hero-s">${tgl(cur.tanggal)}</span></div>` +
      `<div class="hero-units"><div><b>${rank == null ? '-' : rank}</b><span>Rank nasional</span>${wkTag}</div><div><b>${scoreShown == null ? '-' : scoreShown.toFixed(2).replace('.', ',')}</b><span>Score</span></div><div><b>${gain.toFixed(1).replace('.', ',')}</b><span>Poin dikejar</span></div></div>` +
      `<div class="bar"><i style="width:${pctScore}%"></i></div><div class="bar-meta"><span>${delta}</span><span>${ap.score != null && !DATA.scope ? (ap.ms ? 'PS, Assortment, FOP, Banded, %DR dihitung ulang' : 'PS dan Assortment dihitung ulang') : 'dari 100'}</span></div>`;

    $('tKpi').innerHTML = kp.map(k => {
      const l = level(k), ic = lvIcon(l), v = k.target && k.aktual != null ? Math.max(0, Math.min(1, k.aktual / k.target)) : 0;
      const lost = k.hilang > 0.05;
      return `<div class="rk"><div class="rk-h"><span class="si ${ic[0]}">${svg(ic[1])}</span><div class="it-i"><div class="nm">${esc(k.label)}${k.weekly ? ' ' + wkTag : ''}</div><div class="sk">${esc(k.catatan)}</div></div><span class="tag ${l === 'green' ? 'g' : l === 'amber' ? 'a' : 'r'}">${lost ? '-' + k.hilang.toFixed(1) : '✓'}</span></div>` +
        `<div class="bar" style="margin-top:10px;height:6px"><i style="width:${(v * 100).toFixed(0)}%"></i></div>` +
        `<div class="rk-s"><div class="${l === 'green' ? 'okc' : l === 'amber' ? 'amb' : 'neg'}"><small>Aktual</small><b>${pct(k.aktual)}</b></div><div><small>Target</small><b>${pct(k.target)}</b></div><div><small>Poin</small><b>${k.poin == null ? '-' : k.poin.toFixed(1)}<span class="muted" style="font-weight:600;font-size:11px"> / ${k.bobot}</span></b></div></div></div>`;
    }).join('');

    renderFop('secFopMinis', 'fopMinis', 'LOCAL MINIS', 'Weekly FOP Local Minis', kp.find(k => k.kpi === 'FOP_MINIS'));
    renderFop('secFopSpm', 'fopSpm', 'LOCAL SUPERMARKET', 'Weekly FOP Supermarket (SPM)', kp.find(k => k.kpi === 'FOP_SPM'));
    renderUnmapped();
    renderAsrt(kp);
    renderPs(kp.find(k => k.kpi === 'PS'));
    renderBanded(kp.find(k => k.kpi === 'BANDED_MINIS'), kp.find(k => k.kpi === 'BANDED_SPM'));
    renderHist(snaps);
    renderRecap();
    Object.keys(LISTS).forEach(fillList);
  }

  /** Toko yang bertransaksi di Extract DMS tapi belum ada di Outlet Master: channel tidak diketahui, tidak ikut hitungan. */
  function renderUnmapped() {
    const all = (DATA.asrt && DATA.asrt.perDt) || [];
    const empty = all.filter(d => !d.error && d.masterRows === 0);
    const errs = all.filter(d => d.error);
    const rows = [];
    all.filter(d => !d.error && d.masterRows > 0).forEach(d => (d.unmapped || []).forEach(u => rows.push(Object.assign({ dt: d.dist_nama }, u))));
    if (!rows.length && !errs.length && !empty.length) { $('secUnmapped').innerHTML = ''; return; }
    rows.sort((a, b) => b.gsv - a.gsv);
    const gsv = rows.reduce((s, r) => s + r.gsv, 0);
    $('secUnmapped').innerHTML = '<div class="notice">' +
      (empty.length ? `<div><b>Outlet Master belum diisi:</b> ${empty.map(d => esc(d.dist_nama)).join(', ')}. Channel toko belum bisa dibaca, jadi assortment SPM dan Minis untuk DT ini belum terhitung. Otomatis terhitung setelah Outlet Master diisi.</div>` : '') +
      (rows.length ? `<div${empty.length ? ' style="margin-top:8px"' : ''}><b>${rows.length} toko belum terbaca di Outlet Master.</b> Toko ini transaksi di Extract DMS bulan ini (omset ${idr(gsv)}) tapi channelnya tidak diketahui, jadi assortmentnya belum masuk hitungan SPM maupun Minis. Minta tim DT menambahkannya ke Outlet Master lalu upload ulang.</div>` : '') +
      (errs.length ? `<div style="margin-top:8px">Assortment gagal dihitung untuk: ${errs.map(e => esc(e.dist_nama)).join(', ')}.</div>` : '') +
      (rows.length ? `<details class="box" style="margin-top:10px"><summary>Lihat daftar toko</summary><div class="rk-list" style="margin-top:10px">` +
        rows.slice(0, 40).map(r => `<div class="rk"><div class="rk-h"><span class="si warn">${svg('warn')}</span><div class="it-i"><div class="nm">${esc(r.nama || r.outlet)}</div><div class="sk">${esc(r.dt)} · terakhir ${esc(tgl(r.terakhir))}</div></div></div>` +
          `<div class="rk-s two"><div><small>Omset</small><b>${idr(r.gsv)}</b></div><div><small>Lines</small><b>${r.lines}</b></div></div></div>`).join('') +
        '</div>' + (rows.length > 40 ? `<p class="hint" style="margin-top:8px">Menampilkan 40 dengan omset terbesar dari ${rows.length}.</p>` : '') + '</details>' : '') + '</div>';
  }

  function renderAsrt(kp) {
    const as = asrtSummary(), dts = asrtDts();
    if (!as) { $('secAsrt').innerHTML = ''; return; }
    const first = dts.find(d => d.tanggalData) || {};
    const noTarget = ASRT_CH.some(c => as[c[0]].pct == null);
    const tgtOf = (d, c) => ((DATA.asrt.targets) || []).filter(z => String(z.dist_kode) === String(d.dist_kode) && z.channel === c[1]).reduce((a, z) => a + (num(z.target_lines) || 0), 0);
    const head = ASRT_CH.map(c => {
      const a = as[c[0]], k = kp.find(x => x.kpi === c[3]);
      const reg = dts.reduce((s, d) => s + ((d.channels && d.channels[c[0]] && d.channels[c[0]].registered) || 0), 0);
      const ref = a.target > 0 && reg > 0 ? a.target / reg : null;
      return `<div class="kpi"><div class="l">${esc(c[2])}</div><div class="v">${a.pct == null ? '-' : pct(a.pct)}</div>` +
        `<div class="s">${nf(a.lines)} lines${a.target ? ' dari ' + nf(a.target) : ', target belum diisi'}${k ? ' · poin ' + (k.poin == null ? '-' : k.poin.toFixed(1)) + '/' + k.bobot : ''}</div>` +
        `<div class="s"><b>${nf1(a.perOutlet)}</b> base pack per toko aktif${ref ? ` · acuan <b>${nf1(ref)}</b> per toko` : ''}</div></div>`;
    }).join('');
    const cards = dts.map(d => ASRT_CH.map(c => {
      const x = d.channels && d.channels[c[0]];
      if (!x) return '';
      const t = tgtOf(d, c), ref = t > 0 && x.registered > 0 ? t / x.registered : null, v = t ? x.lines / t : NaN;
      const tone = !isFinite(v) ? '' : v >= 1 ? 'okc' : v >= 0.8 ? 'amb' : 'neg';
      const ic = !isFinite(v) ? ['plus', 'box'] : v >= 1 ? ['ok', 'check'] : v >= 0.8 ? ['warn', 'warn'] : ['neg', 'down'];
      const tagTxt = !t ? '<span class="tag a">target belum diisi</span>' : `<span class="tag ${v >= 1 ? 'g' : v >= 0.8 ? 'a' : 'r'}">${pct(v)}</span>`;
      return `<div class="rk"><div class="rk-h"><span class="si ${ic[0]}">${svg(ic[1])}</span><div class="it-i"><div class="nm">${esc(d.dist_nama)}</div><div class="sk">${esc(c[2])} · ${nf(x.registered)} toko terdaftar</div></div>${tagTxt}</div>` +
        `<div class="rk-s four"><div class="${tone}"><small>Lines</small><b>${nf(x.lines)}</b><em>${t ? 'dari ' + nf(t) : 'tanpa target'}</em></div><div><small>Toko aktif</small><b>${nf(x.outlets)}</b><em>transaksi</em></div>` +
        `<div><small>Per toko</small><b>${nf1(x.perOutlet)}</b><em>rata-rata kini</em></div><div class="${ref ? tone : ''}"><small>Acuan</small><b>${ref ? nf1(ref) : '-'}</b><em>per toko</em></div></div></div>`;
    }).join('')).join('');
    const refAll = {};
    ASRT_CH.forEach(c => { const reg = dts.reduce((s, d) => s + ((d.channels && d.channels[c[0]] && d.channels[c[0]].registered) || 0), 0); refAll[c[0]] = as[c[0]].target > 0 && reg > 0 ? as[c[0]].target / reg : null; });
    const low = ASRT_CH.map(c => {
      const items = [];
      dts.forEach(d => { const x = d.channels && d.channels[c[0]]; if (x) x.low.forEach(o => items.push(Object.assign({ dt: d.dist_nama }, o))); });
      items.sort((a, b) => a.lines - b.lines);
      const ref = refAll[c[0]];
      return items.length ? `<details class="box"><summary>Toko ${esc(c[2])} dengan base pack paling sedikit</summary><div class="rk-list" style="margin-top:10px">` +
        items.slice(0, 10).map(o => `<div class="rk"><div class="rk-h"><span class="si ${ref && o.lines >= ref ? 'ok' : 'neg'}">${svg(ref && o.lines >= ref ? 'check' : 'down')}</span><div class="it-i"><div class="nm">${esc(o.nama)}</div><div class="sk">${esc(o.dt)}</div></div><b class="num">${o.lines}${ref ? ` <span class="muted" style="font-weight:600;font-size:11px">/ ${nf1(ref)}</span>` : ''}</b></div></div>`).join('') + '</div></details>' : '';
    }).join('');
    $('secAsrt').innerHTML = `<div class="card">${ciTitle('box', 'Assortment per channel')}` +
      `<p class="hint">Dari Extract DMS${first.tanggalData ? ' s.d. ' + esc(tgl(first.tanggalData)) : ''}. Satu line = satu base pack di satu toko, dihitung kalau qty bersih bulan ini minimal ${DATA.asrt.moq} pcs. Base pack yang sama di toko yang sama hanya dihitung sekali, jadi tambah assortment dengan menjual base pack baru. Acuan per toko = target dibagi toko terdaftar di Outlet Master.${noTarget ? ' Target belum diisi untuk sebagian channel, jadi persennya belum muncul.' : ''}</p>` +
      `<div class="kpis">${head}</div></div>` +
      (cards ? `<div class="card">${ciTitle('store', 'Per DT dan channel')}<div class="rk-list">${cards}</div></div>` : '') + low;
  }

  function fopRows(channel) {
    const g = MON_G[channel];
    if (g && monLive()) return monStores(g).map(o => ({ outlet_kode: o.outlet_kode, outlet_nama: o.outlet_nama, dist_nama: o.dist_nama, remark: o.remark, status: o.status, orders: o.weeks, weekNow: o.weekNow === 1, lastWeek: o.lastWeek }));
    return outlets('FOP').filter(o => o.channel === channel).map(o => ({ ...o, orders: num(o.v1) || 0, weekNow: String(o.v2) === '1', lastWeek: o.v3 }));
  }

  function renderFop(id, key, channel, title, k) {
    const rows = fopRows(channel);
    const el = $(id);
    if (!rows.length) { el.innerHTML = ciTitle('cal', esc(title)) + monNote() + '<div class="empty">Belum ada data toko. Upload daftar toko monitoring di tool upload.</div>'; return; }
    const done = rows.filter(o => o.status === 'WEEKLY').length, live = MON_G[channel] && monLive(), ms = live ? monSummary() : null;
    el.innerHTML = ciTitle('cal', esc(title), k ? ` <span class="lv ${level(k)}">${pct(k.aktual)}</span>` : '') +
      (live ? monNote() + `<p class="hint">${done} dari ${rows.length} toko monitoring sudah WEEKLY (order di ${fopNeed()} minggu atau lebih bulan ini). Dihitung dari Extract DMS sampai ${tgl(ms.tanggal)}, minggu ke-${ms.week}. Aturan: ${fopNeed()} minggu = WEEKLY, ${num(DATA.mon.cfg.fop_biweekly) || 2} = BIWEEKLY, 1 = MONTHLY.</p>`
        : `<p class="hint">${done} dari ${rows.length} toko aktif sudah WEEKLY di file. Sisanya perlu order ${fopNeed()}x bulan ini, mulai dari yang paling dekat.</p>`) +
      mountList(key, {
        rows, defaultF: 'belum', empty: 'Belum ada toko.',
        chips: [['belum', 'Belum WEEKLY'], ['minggu', 'Belum order mg ini'], ['weekly', 'WEEKLY'], ['semua', 'Semua']],
        test: (f, o) => f === 'semua' || (f === 'belum' && o.status !== 'WEEKLY') || (f === 'minggu' && o.status !== 'WEEKLY' && !o.weekNow) || (f === 'weekly' && o.status === 'WEEKLY'),
        hay: o => (o.outlet_nama + ' ' + o.dist_nama + ' ' + o.remark).toLowerCase(),
        sort: (a, b) => (a.status === 'WEEKLY') - (b.status === 'WEEKLY') || b.orders - a.orders || String(a.outlet_nama).localeCompare(b.outlet_nama),
        row: o => { const ok = o.status === 'WEEKLY'; return `<div class="rk"><div class="rk-h"><span class="si ${ok ? 'ok' : o.orders >= fopNeed() - 1 ? 'warn' : 'neg'}">${svg(ok ? 'check' : o.orders >= fopNeed() - 1 ? 'warn' : 'down')}</span>` +
          `<div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)} · ${esc(o.remark)} · ${esc(o.status || '-')}</div></div><span class="tag ${o.weekNow ? 'g' : 'r'}">${o.weekNow ? 'order mg ini' : 'belum mg ini'}</span></div>` +
          `<div class="rk-s two"><div class="${o.orders >= fopNeed() ? 'okc' : o.orders >= fopNeed() - 1 ? 'amb' : 'neg'}"><small>Minggu order bulan ini</small><b>${o.orders} / ${fopNeed()}</b></div><div><small>Order terakhir</small><b>${o.lastWeek === '' ? '-' : 'mg ' + esc(o.lastWeek)}</b></div></div></div>`; },
      });
  }

  function renderPs(k) {
    const sm = psSummary(), st = psStores();
    if (!sm) { $('secPs').innerHTML = `<div class="card">${ciTitle('store', 'Perfect Stores')}<div class="empty">Belum ada data. Upload sheet Perfect Stores di tool upload (seminggu sekali).</div></div>`; return; }
    const need = Math.max(sm.target - sm.perfect, 0);
    const v = sm.target ? sm.perfect / sm.target : 0;
    const dtRows = (DATA.ps.targets || []).map(t => {
      const mine = st.filter(o => String(o.dist_kode) === String(t.dist_kode));
      const per = mine.filter(isPerfect).length, tg = (num(t.target_full) || 0) + (num(t.target_lite) || 0), vv = tg ? per / tg : NaN;
      const tone = !isFinite(vv) ? '' : vv >= 1 ? 'okc' : vv >= 0.8 ? 'amb' : 'neg';
      return `<div class="rk"><div class="rk-h"><span class="si ${tone === 'okc' ? 'ok' : tone === 'amb' ? 'warn' : tone === 'neg' ? 'neg' : 'plus'}">${svg(tone === 'okc' ? 'check' : tone === 'amb' ? 'warn' : 'down')}</span><div class="it-i"><div class="nm">${esc(t.dist_nama)}</div><div class="sk">${mine.length} toko di-audit</div></div><span class="tag ${tone === 'okc' ? 'g' : tone === 'amb' ? 'a' : 'r'}">${tg ? pct(vv) : '-'}</span></div>` +
        `<div class="rk-s"><div><small>Full</small><b>${mine.filter(o => o.status === 'PS FULL').length}/${num(t.target_full) || 0}</b></div><div><small>Lite</small><b>${mine.filter(o => o.status === 'PS LITE').length}/${num(t.target_lite) || 0}</b></div><div class="${tone}"><small>Perfect</small><b>${per}/${tg}</b></div></div></div>`;
    }).join('');
    const miss = {};
    st.filter(o => !isPerfect(o)).forEach(o => psMissing(o).forEach(m => { miss[m] = (miss[m] || 0) + 1; }));
    const missTxt = Object.keys(miss).sort((a, b) => miss[b] - miss[a]).map(m => `${m} (${miss[m]} toko)`).join(', ');
    const rows = st.map(o => Object.assign({}, o, { miss: psMissing(o) }));
    const comp = (o, p) => { const f = String(o[p[0]]); const sc = o['s_' + p[0]]; return `<div class="${f === '1' ? 'okc' : f === '0' ? 'neg' : ''}"><small>${p[1]}</small><b>${f === '1' ? '✓' : f === '0' ? '✗' : '–'}</b><em>${sc === '' || sc == null ? ' ' : Math.round(num(sc) * 100) + '%'}</em></div>`; };
    $('secPs').innerHTML = `<div class="card">${ciTitle('store', 'Perfect Stores', k ? ` <span class="lv ${level(k)}">${pct(k.aktual)}</span>` : '')}` +
      `<p class="hint">Data ${esc(tgl(sm.tanggal))}, update mingguan. Status Full atau Lite mengikuti hasil HO di file.</p>` +
      `<div class="hero-units" style="margin-top:0;border-top:0;padding-top:0"><div><b>${sm.perfect}</b><span>Perfect</span></div><div><b>${sm.full} · ${sm.lite}</b><span>Full · Lite</span></div><div><b>${sm.target}</b><span>Target</span></div></div>` +
      `<div class="bar"><i style="width:${Math.min(100, v * 100).toFixed(0)}%"></i></div><div class="bar-meta"><span>${need ? `Kurang <b>${need}</b> toko lagi` : 'Target tercapai'}</span><b>${pct(v)}</b></div>` +
      `<p class="hint" style="margin-top:10px">Belum perfect paling sering kurang: ${esc(missTxt || '-')}.</p></div>` +
      (dtRows ? `<div class="card">${ciTitle('store', 'Per DT')}<div class="rk-list">${dtRows}</div></div>` : '') +
      `<div class="card">${ciTitle('store', 'Daftar toko')}` + mountList('ps', {
        rows, defaultF: 'belum', empty: 'Belum ada toko.',
        chips: [['belum', 'Belum perfect'], ['perfect', 'Perfect'], ...PS_PARTS.map(p => ['k' + p[0], 'Kurang ' + p[1]]), ['semua', 'Semua']],
        test: (f, o) => f === 'semua' || (f === 'belum' && !isPerfect(o)) || (f === 'perfect' && isPerfect(o)) || (f.startsWith('k') && f !== 'k' && !isPerfect(o) && String(o[f.slice(1)]) === '0'),
        hay: o => (o.outlet_nama + ' ' + o.dist_nama + ' ' + o.channel).toLowerCase(),
        sort: (a, b) => isPerfect(a) - isPerfect(b) || a.miss.length - b.miss.length || String(a.outlet_nama).localeCompare(b.outlet_nama),
        row: o => { const ok = isPerfect(o); return `<div class="rk"><div class="rk-h"><span class="si ${ok ? 'ok' : o.miss.length <= 1 ? 'warn' : 'neg'}">${svg(ok ? 'check' : o.miss.length <= 1 ? 'warn' : 'down')}</span><div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)} · ${esc(o.channel)}</div></div><span class="tag ${ok ? 'g' : 'a'}">${esc(o.status === 'NOT PERFECT' ? o.total_kpi : o.status)}</span></div><div class="rk-s five">${PS_PARTS.map(p => comp(o, p)).join('')}</div></div>`; },
      }) + '</div>';
  }

  function renderBanded(kMinis, kSpm) {
    const sku = ch => outlets('BANDED_SKU').filter(o => o.channel === ch);
    const outs = outlets('BANDED_OUTLET');
    if (monLive()) { renderBandedLive(kMinis, kSpm); return; }
    const list = (title, k, items) => `<details class="box" style="margin-top:8px"><summary><span>${esc(title)} ${k ? `<span class="lv ${level(k)}">${pct(k.aktual)} / target ${pct(k.target)}</span>` : ''} · ${items.length} SKU</span></summary>` +
      `<ul class="sku-list">${items.map(o => `<li>${esc(o.outlet_kode)} ${esc(o.outlet_nama)}</li>`).join('')}</ul></details>`;
    $('secBanded').innerHTML = ciTitle('box', 'Banded') + '<p class="hint">SKU banded yang harus ada di toko monitoring. Pastikan tiap toko di daftar sudah order semua SKU channel-nya.</p>' +
      list('Local Minis', kMinis, sku('LOCAL MINIS')) + list('Supermarket (SPM)', kSpm, sku('SPM')) +
      (outs.length ? `<details class="box" style="margin-top:8px"><summary><span>Toko monitoring banded · ${outs.length} toko</span></summary><div class="rk-list" style="margin-top:10px">` +
        outs.map(o => `<div class="rk"><div class="rk-h"><span class="si plus">${svg('store')}</span><div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)}</div></div><span class="tag a">${esc(o.remark)}</span></div></div>`).join('') + '</div></details>' : '');
  }

  /** Banded dari Extract DMS: toko tercapai kalau bagian SKU banded channel-nya yang sudah dibeli >= ambang (config). */
  function renderBandedLive(kMinis, kSpm) {
    const cfg = DATA.mon.cfg, ms = monSummary();
    const names = {}; (DATA.mon.bandedSku || []).forEach(b => { names[b.sku_kode] = b.sku_nama; });
    const groups = [['MINIS', 'Local Minis', kMinis, num(cfg.banded_minis) || 0.7], ['SPM', 'Supermarket (SPM)', kSpm, num(cfg.banded_spm) || 0.8]];
    $('secBanded').innerHTML = ciTitle('box', 'Banded') + monNote() +
      `<p class="hint">EVB ${esc(ms.qLabel)}: toko tercapai kalau SKU banded channel-nya yang pernah dibeli sepanjang kuartal ini minimal ${Math.round((num(cfg.banded_spm) || 0.8) * 100)}% (Supermarket) atau ${Math.round((num(cfg.banded_minis) || 0.7) * 100)}% (Local Minis). Bulan yang terhitung: ${esc(ms.qMonths.map(bulanLbl).join(', '))}; bulan lalu diambil dari rekap yang tersimpan, bulan berjalan dari Extract DMS sampai ${tgl(ms.tanggal)}. Hanya toko ber-REMARK monitoring. Ini hitungan sendiri, bukan angka HO.</p>` +
      groups.map(g => `<div class="card" style="margin-top:10px"><h3 style="margin:0 0 6px">${esc(g[1])} ${g[2] ? `<span class="lv ${level(g[2])}">${pct(g[2].aktual)} / target ${pct(g[2].target)}</span>` : ''}</h3><div id="bd-${g[0]}"></div></div>`).join('');
    groups.forEach(g => {
      const rows = monStores(g[0]), tot = rows.length ? rows[0].bTotal : 0, thr = g[3];
      const need = o => Math.max(Math.ceil(thr * o.bTotal - 1e-9) - o.bBought, 0);
      const hit = rows.filter(o => o.bHit).length;
      const box = $('bd-' + g[0]);
      if (!rows.length) { box.innerHTML = '<div class="empty">Belum ada toko monitoring di channel ini.</div>'; return; }
      if (!tot) { box.innerHTML = '<div class="empty">Daftar SKU banded channel ini belum diupload di tool upload.</div>'; return; }
      box.innerHTML = `<p class="hint">${hit} dari ${rows.length} toko tercapai · ${tot} SKU banded, ambang ${Math.ceil(thr * tot - 1e-9)} SKU per toko.</p>` + mountList('bnd' + g[0], {
        rows, defaultF: 'belum', empty: 'Belum ada toko.',
        chips: [['belum', 'Belum tercapai'], ['hit', 'Tercapai'], ['semua', 'Semua']],
        test: (f, o) => f === 'semua' || (f === 'belum' && !o.bHit) || (f === 'hit' && !!o.bHit),
        hay: o => (o.outlet_nama + ' ' + o.dist_nama + ' ' + o.remark).toLowerCase(),
        sort: (a, b) => (!!a.bHit) - (!!b.bHit) || need(a) - need(b) || String(a.outlet_nama).localeCompare(b.outlet_nama),
        row: o => {
          const ok = !!o.bHit, near = need(o) <= 2;
          return `<div class="rk"><div class="rk-h"><span class="si ${ok ? 'ok' : near ? 'warn' : 'neg'}">${svg(ok ? 'check' : near ? 'warn' : 'down')}</span>` +
            `<div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)} · ${esc(o.remark)}</div></div><span class="tag ${ok ? 'g' : near ? 'a' : 'r'}">${ok ? 'Tercapai' : 'Kurang ' + need(o) + ' SKU'}</span></div>` +
            `<div class="rk-s two"><div class="${ok ? 'okc' : near ? 'amb' : 'neg'}"><small>SKU banded dibeli (${esc(ms.qLabel.split(' ')[0])})</small><b>${o.bBought} / ${o.bTotal}</b></div><div><small>Bulan ini · persen</small><b>${o.bMonth} · ${o.bShare == null ? '-' : Math.round(o.bShare * 100) + '%'}</b></div></div>` +
            (o.bMiss && o.bMiss.length ? `<details class="box" style="margin-top:8px"><summary><span>Belum dibeli (${o.bMiss.length} SKU)</span></summary><ul class="sku-list">${o.bMiss.map(k => `<li>${esc(k)} ${esc(names[k] || '')}</li>`).join('')}</ul></details>` : '') + '</div>';
        },
      });
    });
  }

  /** Rekap bulanan tersimpan (GS_BULANAN): FOP, EVB kuartal, dan assortment per bulan. */
  function renderRecap() {
    const el = $('secRecap'); if (!el) return;
    const rc = DATA.mon && DATA.mon.recap, title = ciTitle('cal', 'Rekap bulanan');
    if (!rc || (!rc.fop.length && !rc.asrt.length)) { el.innerHTML = title + '<div class="empty">Belum ada rekap. Tersimpan otomatis tiap upload DMS; jadi FINAL kalau data sudah sampai hari kerja terakhir bulan itu.</div>'; return; }
    const by = {};
    rc.fop.forEach(r => { const o = by[r.periode] = by[r.periode] || { asrt: {} }; o[r.grup] = r; if (!r.final) o.draft = true; o.sampai = r.sampai > (o.sampai || '') ? r.sampai : o.sampai; });
    rc.asrt.forEach(a => { const o = by[a.periode] = by[a.periode] || { asrt: {} }; const x = o.asrt[a.channel] = o.asrt[a.channel] || { lines: 0, outlets: 0 }; x.lines += num(a.lines) || 0; x.outlets += num(a.outlet_aktif) || 0; if (String(a.final) !== '1') o.draft = true; if (a.sampai > (o.sampai || '')) o.sampai = a.sampai; });
    const p = (n, d) => d ? Math.round(n / d * 100) + '%' : '-';
    const cell = (r, k) => r ? p(r[k], r.toko) + `<small class="muted"> ${r[k]}/${r.toko}</small>` : '-';
    const rows = Object.keys(by).sort().reverse().map(k => { const o = by[k];
      return `<tr><td>${esc(bulanLbl(k))}<div><span class="tag ${o.draft ? 'a' : 'g'}">${o.draft ? 'Draft' : 'Final'}</span></div><small class="muted">s.d. ${esc(tgl(o.sampai))}</small></td><td class="n">${cell(o.SPM, 'weekly')}</td><td class="n">${cell(o.MINIS, 'weekly')}</td><td class="n">${cell(o.SPM, 'evbQ')}</td><td class="n">${cell(o.MINIS, 'evbQ')}</td>` +
        `<td class="n">${o.asrt.SPM ? nf(o.asrt.SPM.lines) : '-'}</td><td class="n">${o.asrt.MINIS ? nf(o.asrt.MINIS.lines) : '-'}</td></tr>`; }).join('');
    el.innerHTML = title + '<p class="hint">Hasil tiap bulan disimpan otomatis dari Extract DMS. FINAL = data sudah sampai hari kerja terakhir bulan itu. EVB = SKU banded yang pernah dibeli sejak awal kuartal.</p>' +
      '<div class="scroll"><table><thead><tr><th>Bulan</th><th class="n">FOP SPM</th><th class="n">FOP Minis</th><th class="n">EVB SPM</th><th class="n">EVB Minis</th><th class="n">Lines SPM</th><th class="n">Lines Minis</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderHist(snaps) {
    if (snaps.length < 2) { $('secHist').innerHTML = ciTitle('clock', 'Riwayat rank') + '<div class="empty">Riwayat rank muncul setelah upload kedua (1 baris per hari upload).</div>'; return; }
    $('secHist').innerHTML = ciTitle('clock', 'Riwayat rank') + '<div class="scroll"><table><thead><tr><th>Tanggal</th><th class="n">Rank</th><th class="n">Score</th></tr></thead><tbody>' +
      snaps.slice(-14).reverse().map(s => `<tr><td>${tgl(s.tanggal)}</td><td class="n">${esc(s.rows.RANK ? s.rows.RANK.aktual : '-')}</td><td class="n">${s.rows.SCORE ? (num(s.rows.SCORE.aktual) || 0).toFixed(2) : '-'}</td></tr>`).join('') + '</tbody></table></div>';
  }

  /** Teks pengingat untuk grup WhatsApp: rank, 3 KPI dengan poin hilang terbesar, toko FOP yang belum order minggu ini, toko PS yang kurang. */
  function reminderText() {
    const snaps = snapshots(), cur = snaps[snaps.length - 1];
    const kp = kpiList(cur).filter(k => k.hilang > 0.05).slice(0, 3);
    const L = [];
    L.push('*KPI GREAT SALES* (' + tgl(cur.tanggal) + ')' + (DATA.scope ? ' - ' + DATA.scope.nama : ''));
    L.push('Rank nasional: *' + (cur.rows.RANK ? cur.rows.RANK.aktual : '-') + '* · Score ' + (cur.rows.SCORE ? (num(cur.rows.SCORE.aktual) || 0).toFixed(2) : '-'));
    if (kp.length) {
      L.push('', 'Fokus poin:');
      kp.forEach((k, i) => L.push((i + 1) + '. ' + k.label + ': ' + pct(k.aktual) + ' (target ' + pct(k.target) + '), poin hilang ' + k.hilang.toFixed(1)));
    }
    [['LOCAL MINIS', 'Local Minis'], ['LOCAL SUPERMARKET', 'SPM']].forEach(c => {
      const todo = fopRows(c[0]).filter(o => o.status !== 'WEEKLY' && !o.weekNow).sort((a, b) => b.orders - a.orders).slice(0, 15);
      if (!todo.length) return;
      L.push('', 'Toko ' + c[1] + ' belum order minggu ini (target ' + fopNeed() + 'x sebulan):');
      todo.forEach(o => L.push('- ' + o.outlet_nama + ' (' + o.orders + '/' + fopNeed() + ')'));
    });
    const ps = psStores().filter(o => !isPerfect(o) && psMissing(o).length).sort((a, b) => psMissing(a).length - psMissing(b).length).slice(0, 10);
    if (ps.length) {
      L.push('', 'Perfect Store, lengkapi:');
      ps.forEach(o => L.push('- ' + o.outlet_nama + ': ' + psMissing(o).join(', ')));
    }
    L.push('', 'Detail: ' + location.href.split('?')[0]);
    return L.join('\n');
  }

  $('loginForm').addEventListener('submit', e => { e.preventDefault(); $('loginErr').textContent = ''; login($('codeInput').value.trim()); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } location.reload(); });
  $('dtChips').addEventListener('click', async e => {
    const b = e.target.closest('.chip'); if (!b) return;
    VIEW = b.getAttribute('data-dt');
    b.textContent = 'Memuat…';
    try { const d = await fetchGs(CODE, VIEW); if (!d.error) { DATA = d; writeCache(CODE, d); render(); } } catch (err) { render(); }
  });
  $('waBtn').addEventListener('click', () => { window.open('https://wa.me/?text=' + encodeURIComponent(reminderText()), '_blank'); });
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(reminderText()); toast('Teks pengingat disalin. Tempel di grup WhatsApp.'); }
    catch (e) { toast('Browser tidak mengizinkan salin otomatis. Pakai tombol WhatsApp.'); }
  });

  /* tab, daftar (cari/filter/lagi), muat ulang, popover status */
  const TABS = ['skor', 'fop', 'asrt', 'ps'];
  function setTab(t) {
    if (!TABS.includes(t)) t = 'skor';
    TABS.forEach(k => { $('tab-' + k).hidden = k !== t; });
    document.querySelectorAll('#tabsNav [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    try { localStorage.setItem('mh_gs_tab', t); } catch (e) { /* mode privat */ }
    window.scrollTo({ top: 0 });
  }
  $('tabsNav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  document.addEventListener('input', e => { const id = e.target.getAttribute && e.target.getAttribute('data-q'); if (!id) return; LST[id].q = e.target.value; LST[id].limit = 60; $('tb-' + id).querySelector('.clr').hidden = !e.target.value; fillList(id); });
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-ch]'); if (c) { LST[c.dataset.ch].f = c.dataset.f; LST[c.dataset.ch].limit = 60; fillList(c.dataset.ch); return; }
    const x = e.target.closest('[data-clr]'); if (x) { const id = x.dataset.clr; LST[id].q = ''; $('tb-' + id).querySelector('input').value = ''; x.hidden = true; fillList(id); return; }
    const m = e.target.closest('[data-more]'); if (m) { const id = m.dataset.more; LST[id].limit = (LST[id].limit || 60) + 60; fillList(id); return; }
    const r = e.target.closest('[data-reset]'); if (r) { const id = r.dataset.reset; LST[id].q = ''; LST[id].f = LISTS[id].defaultF; $('tb-' + id).querySelector('input').value = ''; fillList(id); return; }
    $('syncPop').hidden = true;
  });
  $('syncInfo').addEventListener('click', e => { e.stopPropagation(); const p = $('syncPop'); p.hidden = !p.hidden; });
  $('refreshBtn').addEventListener('click', () => {
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    refreshNote('Memperbarui data…');
    login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); });
  });
  try { setTab(localStorage.getItem('mh_gs_tab') || 'skor'); } catch (e) { setTab('skor'); }

  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
