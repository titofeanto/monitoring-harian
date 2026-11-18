/* KPI Great Sales: scorecard AAM + daftar toko yang perlu dikejar. Data dari Apps Script ?view=gs. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const $ = id => document.getElementById(id);
  const esc = window.MHUtil.esc;
  const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const bulanLbl = p => BULAN[+String(p).slice(5, 7)] + ' ' + String(p).slice(0, 4);
  let DATA = null, CODE = '', VIEW = '';

  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const pct = v => v == null ? '-' : (v * 100).toFixed(1).replace('.', ',') + '%';
  /* Teks tanggal dari sel Sheet ikut ke innerHTML: bulan di luar 1-12 atau teks bukan tanggal dikembalikan ter-escape, bukan mentah. */
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m && BULAN[+m[2]] ? (+m[3]) + ' ' + BULAN[+m[2]] + ' ' + m[1] : esc(String(iso || '')); };

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
  function refreshNote(txt) {
    const b = $('gsBanner'); b.hidden = true;
    if (!txt) { window.MHFresh.set({ fetch: 'ok' }); return; }
    if (/^Memperbarui/.test(txt)) { window.MHFresh.set({ fetch: 'wait', text: 'Memperbarui…' }); return; }
    if (/^Data diperbarui/.test(txt)) { window.MHFresh.set({ fetch: 'ok', at: Date.now() }); return; }
    window.MHFresh.set({ fetch: 'off' }); b.hidden = false; b.textContent = txt;
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
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Memeriksa kode…'; }
    const cached = silent && !noCache ? readCache(code) : null;
    let shown = !!(cached && cached.mode === 'gs' && cached.live && cached.scorecard && cached.scorecard.length);   // salinan lama tanpa `live` tidak ditampilkan
    if (shown) {
      try { enter(cached, code); refreshNote('Memperbarui data… (tampilan sementara dari ' + (cacheAt ? 'pukul ' + jam(cacheAt) : 'data tersimpan') + ')'); }
      catch (e) {   // salinan dari versi lama / bentuk lain: jangan macet di "Memuat", buang dan ambil dari jaringan
        shown = false; DATA = null; try { localStorage.removeItem(CACHE_KEY); } catch (e2) { /* mode privat */ }
        $('appScreen').hidden = true; $('loginScreen').hidden = false;
      }
    }
    try {
      const d = await fetchGs(code, VIEW);
      if (shown && d.error) refreshNote('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.', true);
      if (d.error === 'invalid_code') { problem('Kode tidak cocok. Periksa huruf besar/kecil atau minta kode baru.', silent, true); return; }
      if (d.error === 'no_data') { problem('Data Great Sales belum diupload lewat tool upload.', silent, false); return; }
      if (d.error) { problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return; }
      if (d.mode !== 'gs') { problem('API belum mendukung Great Sales. Deploy ulang Apps Script (lihat README).', silent, false); return; }
      if (!d.live) { problem('API belum diperbarui. Deploy ulang Apps Script (lihat README).', silent, false); return; }
      writeCache(code, d);
      enter(d, code);
      refreshNote('Data diperbarui pukul ' + jam(Date.now()), true);
      return true;
    } catch (err) {
      if (shown || DATA) { refreshNote('Gagal memperbarui, ini data tersimpan' + (cacheAt ? ' pukul ' + jam(cacheAt) : '') + '. Ketuk muat ulang untuk coba lagi.', true); return false; }
      problem('Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
    }
  }

  const outlets = jenis => DATA.outlets.filter(o => o.jenis === jenis);

  /* ---- Weekly FOP & Banded dihitung API dari Extract DMS (DATA.mon); tanpa daftar toko, jatuh ke data file lama ---- */
  const fopNeed = () => DATA.mon.cfg.fop_weekly;
  const MON_G = { 'LOCAL MINIS': 'MINIS', 'LOCAL SUPERMARKET': 'SPM' };
  const monDts = () => ((DATA.mon && DATA.mon.perDt) || []).filter(d => !d.error && !d.noData && d.groups);
  const monLive = () => DATA.live.monLive;
  function monStores(g) {
    const out = [];
    monDts().forEach(d => (d.groups[g] || []).forEach(o => out.push(Object.assign({ dist_nama: d.dist_nama, monthWeeks: d.monthWeeks, curWeek: d.week, qLabel: d.qLabel }, o))));
    return out;
  }
  /** Catatan kalau ada DT di daftar toko yang DMS-nya belum ada: tokonya tidak ikut hitungan. */
  function monNote() {
    const m = DATA.mon; if (!m || !m.hasList) return '';
    const miss = (m.perDt || []).filter(d => d.noData || d.error).map(d => d.dist_nama).concat((m.noDt || []).map(d => d.dist_nama));
    return miss.length ? `<div class="notice" style="margin-bottom:10px">Extract DMS belum ada untuk <b>${esc(miss.join(', '))}</b>, jadi tokonya belum ikut hitungan.</div>` : '';
  }
  const wkTag = '<span class="tag b">Update mingguan</span>';
  /** Minggu data terbaru dan sisa minggu kerja bulan ini (termasuk minggu ini). null kalau server belum mengirim monthWeeks (server lama). */
  function monRemain() {
    const ms = DATA.live.summary.mon; if (!ms) return null;
    const d = monDts().find(x => x.monthWeeks && x.week === ms.week) || monDts().find(x => x.monthWeeks);
    if (!d) return null;
    const i = d.monthWeeks.findIndex(m => m.w === d.week); if (i < 0) return null;
    return { week: d.week, sisa: d.monthWeeks.slice(i).filter(m => m.workdays >= 1).length };
  }

  const PS_PARTS = [['cotc', 'COTC'], ['npd', 'NPD'], ['sos', 'SOS'], ['sstd', 'SSTD'], ['banded', 'Banded']];
  const psStores = () => (DATA.ps && DATA.ps.stores) || [];
  const psMissing = o => PS_PARTS.filter(p => String(o[p[0]]) === '0').map(p => p[1]);
  const isPerfect = o => o.status === 'PS FULL' || o.status === 'PS LITE';

  /* store:start */
  /** Satu toko monitoring + Perfect Store-nya, hanya disusun ulang (tanpa aturan baru, tanpa DOM).
   *  o = baris monStores(g); psList = DATA.ps.stores; skuList = DATA.mon.bandedSku. ps = null kalau kode outlet tidak ada di data PS. */
  function storeCard(o, g, psList, skuList) {
    const skus = (skuList || []).filter(b => !b.channel || b.channel === g), names = {};
    (skuList || []).forEach(b => { names[b.sku_kode] = b.sku_nama; });
    const nm = k => ({ kode: k, nama: names[k] || k });
    const kode = String(o.outlet_kode == null ? '' : o.outlet_kode).trim();
    const miss = (o.bMiss || []).map(nm), missSet = {};
    miss.forEach(m => { missSet[m.kode] = true; });
    const month = {}; (o.bSkus || []).forEach(k => { month[k] = true; });
    // sudah dibeli (kuartal) = SKU banded channel ini yang tidak ada di bMiss; tanpa daftar SKU channel, pakai bSkus saja
    const bought = skus.length ? skus.filter(b => !missSet[b.sku_kode]).map(b => ({ kode: b.sku_kode, nama: b.sku_nama || b.sku_kode, bulanIni: !!month[b.sku_kode] }))
      : (o.bSkus || []).map(k => ({ kode: k, nama: names[k] || k, bulanIni: true }));
    const rec = (psList || []).find(x => String(x.outlet_kode == null ? '' : x.outlet_kode).trim() === kode);
    const PARTS = [['cotc', 'COTC'], ['npd', 'NPD'], ['sos', 'SOS'], ['sstd', 'SSTD'], ['banded', 'Banded']];
    const sc = v => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };
    return {
      kode: kode, nama: o.outlet_nama, dist: o.dist_nama, channel: g, remark: o.remark,
      fop: { weeks: o.weeks, status: o.status, weekNow: o.weekNow, lastWeek: o.lastWeek, wks: o.wks, needMore: o.needMore, open: o.open, risk: o.risk, monthWeeks: o.monthWeeks, curWeek: o.curWeek },
      banded: { qLabel: o.qLabel, bTotal: o.bTotal, bBought: o.bBought, bMonth: o.bMonth, bShare: o.bShare, bHit: o.bHit, bMiss: miss, bSkus: (o.bSkus || []).map(nm), bought: bought },
      ps: rec ? { status: rec.status, total_kpi: rec.total_kpi, parts: PARTS.map(p => ({ k: p[0], label: p[1], ok: String(rec[p[0]]) === '1' ? true : String(rec[p[0]]) === '0' ? false : null, skor: sc(rec['s_' + p[0]]) })) } : null,
    };
  }
  /* store:end */


  const ASRT_CH = [['SPM', 'LOCAL SUPERMARKET', 'Supermarket (SPM)', 'ASRT_SPM'], ['MINIS', 'LOCAL MINIS', 'Local Minis', 'ASRT_MINIS']];
  const asrtDts = () => ((DATA.asrt && DATA.asrt.perDt) || []).filter(d => !d.error);


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
  /* Header kartu biru (.card-head): ikon bulat, judul, subjudul kecil (hanya fakta yang sudah tampil), pil status di kanan. */
  const ciTitle = (icon, title, extra, sub) => `<div class="card-head"><span class="ci">${svg(icon)}</span><div class="ch-t"><h2>${title}</h2>${sub ? `<p class="ch-s">${sub}</p>` : ''}</div>${extra || ''}</div>`;
  const U = window.MHUtil;
  /* Ikon status .st pada sel yang SUDAH punya klasifikasi okc/amb/neg dari data; sel tanpa kelas tidak diberi ikon. */
  function decorate(el) {
    if (!el) return;
    el.querySelectorAll('.rk-s>div').forEach(d => {
      if (d.querySelector('.st')) return;
      const k = U.stOf(['okc', 'amb', 'neg'].find(c => d.classList.contains(c)) || '');
      if (k) d.insertAdjacentHTML('beforeend', U.stIcon(k));
    });
  }
  const lvIcon = l => l === 'green' ? ['ok', 'check'] : l === 'amber' ? ['warn', 'warn'] : ['neg', 'down'];

  /* ---- daftar dengan cari, filter, jumlah: satu pola untuk FOP dan Perfect Store ---- */
  const LISTS = {};
  const LST = {};   // id -> {q, f}
  const nameOfRow = r => r.outlet_nama || r.nama || r.sku_nama || '';
  function mountList(id, cfg) {
    LISTS[id] = cfg;
    /* Urut: urutan awal (cfg.sort) + nama + pilihan khusus daftar; hanya mengurutkan baris yang sudah dimuat. */
    cfg.sorts = [['', 'Prioritas (bawaan)', cfg.sort], ['nama', 'Nama A-Z', (a, b) => String(nameOfRow(a)).localeCompare(String(nameOfRow(b)), 'id')]].concat(cfg.more || []);
    const st = LST[id] = LST[id] || { q: '', f: cfg.defaultF, s: '' };
    if (!cfg.sorts.some(x => x[0] === st.s)) st.s = '';
    if (!cfg.chips.some(c => c[0] === st.f)) st.f = cfg.defaultF;
    return `<div class="tb" id="tb-${id}"><label class="sbox">${svg('search')}<input type="search" data-q="${id}" placeholder="${esc(cfg.ph || 'Cari nama toko atau distributor')}" autocomplete="off" value="${esc(st.q)}"><button type="button" class="clr" data-clr="${id}" aria-label="Hapus pencarian" ${st.q ? '' : 'hidden'}>${svg('x')}</button></label>` +
      (cfg.st ? U.stLegend() : '') +
      `<div class="chips" id="ch-${id}" role="group" aria-label="Filter"></div><div class="tb-meta"><span id="mt-${id}"></span><label class="sortsel">Urut: <select data-sort="${id}" aria-label="Urutkan daftar">${cfg.sorts.map(x => `<option value="${esc(x[0])}"${x[0] === st.s ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select></label></div></div><div id="ls-${id}"></div>`;
  }
  function fillList(id) {
    const cfg = LISTS[id], st = LST[id]; if (!cfg || !$('ls-' + id)) return;
    const q = st.q.trim().toLowerCase();
    const base = cfg.rows.filter(r => !q || cfg.hay(r).includes(q));
    const cnt = {}; cfg.chips.forEach(c => { cnt[c[0]] = base.filter(r => cfg.test(c[0], r)).length; });
    if (q && !cnt[st.f] && st.f !== cfg.defaultF) st.f = cfg.defaultF;
    $('ch-' + id).innerHTML = cfg.chips.map(c => `<button type="button" data-ch="${id}" data-f="${c[0]}" aria-pressed="${st.f === c[0]}"${cnt[c[0]] ? '' : ' class="z"'}>${esc(c[1])} <b>${nf(cnt[c[0]])}</b></button>`).join('');
    const list = base.filter(r => cfg.test(st.f, r)).sort((cfg.sorts.find(x => x[0] === st.s) || cfg.sorts[0])[2]);
    $('mt-' + id).textContent = list.length === cfg.rows.length ? nf(cfg.rows.length) + ' ' + (cfg.unit || 'toko') : nf(list.length) + ' dari ' + nf(cfg.rows.length) + ' ' + (cfg.unit || 'toko');
    const shown = list.slice(0, st.limit || 60);
    $('ls-' + id).innerHTML = !cfg.rows.length ? `<div class="empty">${cfg.empty}</div>` : !list.length ? `<div class="empty">Tidak ada ${cfg.unit || 'toko'} yang cocok. <button type="button" class="lnk" data-reset="${id}">Hapus pencarian dan filter</button></div>`
      : `<div class="rk-list${cfg.listCls ? ' ' + cfg.listCls : ''}">${shown.map(cfg.row).join('')}</div>` + (list.length > shown.length ? `<button type="button" class="btn plain more" data-more="${id}">Tampilkan lebih banyak (${nf(list.length - shown.length)} lagi)</button>` : '');
    if (cfg.st) decorate($('ls-' + id));
  }

  /* Baris KPI Skor: persen cincin = aktual/target (hanya gambar); warna dari level server. Rincian = poin dan catatan yang sudah ada. */
  const LV_TONE = { green: 'ok', amber: 'mid', red: 'bad' };
  function kpiRowOf(k) {
    const has = k.target > 0 && k.aktual != null, p = has ? k.aktual / k.target : NaN, tone = LV_TONE[k.level] || U.toneOf(p, '');
    const lost = k.hilang > 0.05;
    const det = barItemPoin(k) + (k.catatan ? `<p class="hint">${esc(k.catatan)}</p>` : '');
    return U.kpiRow({ id: 'sk-' + k.kpi, name: esc(k.label) + (k.weekly ? ' ' + wkTag : ''), icon: U.stIcon(tone, false), p, tone, big: pct(k.aktual),
      target: has ? pct(k.target) : '', sisa: has ? pct(Math.max(0, k.target - k.aktual)) : '', detail: det });
  }
  /** Satu baris cincin ringkasan di atas tab (persen = aktual/target server, hanya gambar). */
  function topRing(k, id, name, detail) {
    if (!k) return '';
    const has = k.target > 0 && k.aktual != null, p = has ? k.aktual / k.target : NaN, tone = LV_TONE[k.level] || U.toneOf(p, '');
    return `<div class="kpi-list" style="margin:4px 0 18px">` + U.kpiRow({ id, name: esc(name), icon: U.stIcon(tone, false), p, tone, big: pct(k.aktual), target: has ? pct(k.target) : '', sisa: has ? pct(Math.max(0, k.target - k.aktual)) : '', detail: detail || '' }) + '</div>';
  }
  function barItemPoin(k) {
    const pp = k.bobot > 0 && k.poin != null ? k.poin / k.bobot : NaN;
    return U.barItem({ name: 'Poin', p: pp, tone: LV_TONE[k.level] || U.toneOf(pp, ''), sisa: k.hilang > 0.05 ? k.hilang.toFixed(1).replace('.', ',') : '', left: k.poin == null ? '-' : k.poin.toFixed(1).replace('.', ','), right: String(k.bobot) });
  }

  function render() {
    const live = DATA.live, rank = live.rank, prevRank = live.prevRank, scoreShown = live.scoreShown;
    (live.kpis || []).forEach(k => { if (!Object.prototype.hasOwnProperty.call(LV_TONE, k.level)) k.level = ''; });   // level masuk ke atribut class: hanya green/amber/red
    $('gsSub').textContent = 'AAM' + (DATA.scope ? ' · ' + DATA.scope.nama : ' · semua DT') + (live.monLive ? ' · FOP s.d. mg ' + live.summary.mon.week : live.fopWeek !== '' ? ' · FOP s.d. mg ' + live.fopWeek : '');
    $('gsUpdated').textContent = 'Data ' + tgl(live.tanggal);
    window.MHFresh.set({ info: window.MHFresh.status(live.tanggal, { label: 'Scorecard' }) });

    if (DATA.dts && DATA.dts.length) {
      $('dtSec').hidden = false;
      $('dtChips').innerHTML = [{ kode: '', nama: 'Semua DT' }].concat(DATA.dts).map(d =>
        `<button type="button" class="chip" data-dt="${esc(d.kode)}" aria-pressed="${d.kode === VIEW}">${esc(d.nama)}</button>`).join('');
    }

    const kp = live.kpis;
    const gain = kp.reduce((s, k) => s + k.hilang, 0);
    const delta = prevRank == null || rank == null ? 'belum ada pembanding' : rank < prevRank ? `<span class="delta-up">▲ naik ${prevRank - rank} dari ${prevRank}</span>` : rank > prevRank ? `<span class="delta-down">▼ turun ${rank - prevRank} dari ${prevRank}</span>` : 'tetap';
    const pctScore = scoreShown == null ? 0 : Math.max(0, Math.min(100, scoreShown));
    const hc = $('heroCard'); hc.className = 'soft-card';
    hc.innerHTML = `<div><div class="nm" style="font-size:15px;font-weight:700">Skor Great Sales</div><div class="muted" style="font-size:13px">Data ${tgl(live.tanggal)}</div></div>` +
      `<div class="sc-score"><b>${scoreShown == null ? '-' : scoreShown.toFixed(2).replace('.', ',')}</b><span>dari 100 ${wkTag}</span></div>` +
      `<div class="sc-units"><div><b>${rank == null ? '-' : rank}</b>Rank nasional</div><div><b>${gain.toFixed(1).replace('.', ',')}</b>Poin dikejar</div></div>` +
      `<div>${U.barThin(pctScore / 100, '')}<div class="bar-meta" style="margin-top:0"><span>${delta}</span><span>${live.recalculated ? (live.summary.mon ? 'PS, Assortment, FOP, Banded, %DR dihitung ulang' : 'PS dan Assortment dihitung ulang') : 'dari 100'}</span></div></div>`;

    if ($('tLegend')) $('tLegend').innerHTML = U.stLegend();
    $('tKpi').className = 'kpi-list';
    $('tKpi').innerHTML = kp.map(kpiRowOf).join('');

    renderFop('secFopSpm', 'fopSpm', 'LOCAL SUPERMARKET', 'Weekly FOP Supermarket (SPM)', kp.find(k => k.kpi === 'FOP_SPM'));
    renderFop('secFopMinis', 'fopMinis', 'LOCAL MINIS', 'Weekly FOP Local Minis', kp.find(k => k.kpi === 'FOP_MINIS'));
    renderWajibBanner();
    renderUnmapped();
    renderAsrt(kp);
    renderPs(kp.find(k => k.kpi === 'PS'));
    renderBanded(kp.find(k => k.kpi === 'BANDED_MINIS'), kp.find(k => k.kpi === 'BANDED_SPM'));
    renderToko();
    renderHist(live.history);
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
    const as = DATA.live.summary.asrt, dts = asrtDts();
    if (!as) { $('secAsrt').innerHTML = ''; return; }
    const first = dts.find(d => d.tanggalData) || {};
    const noTarget = ASRT_CH.some(c => as[c[0]].pct == null);
    const tgtOf = (d, c) => ((DATA.asrt.targets) || []).filter(z => String(z.dist_kode) === String(d.dist_kode) && z.channel === c[1]).reduce((a, z) => a + (num(z.target_lines) || 0), 0);
    const head = ASRT_CH.map(c => {
      const a = as[c[0]], k = kp.find(x => x.kpi === c[3]);
      const reg = dts.reduce((s, d) => s + ((d.channels && d.channels[c[0]] && d.channels[c[0]].registered) || 0), 0);
      const ref = a.target > 0 && reg > 0 ? a.target / reg : null;
      const p = a.pct == null || !(a.target > 0) ? NaN : a.pct, tone = (k && LV_TONE[k.level]) || U.toneOf(p, '');
      const det = dts.map(d => { const x = d.channels && d.channels[c[0]]; if (!x) return ''; const t = tgtOf(d, c), v = t ? x.lines / t : NaN;
        return U.barItem({ name: d.dist_nama, p: v, tone: U.toneOf(v, ''), sisa: t ? nf(Math.max(0, t - x.lines)) : '', left: nf(x.lines) + ' lines', right: t ? 'Target ' + nf(t) : 'tanpa target' }); }).join('') +
        `<p class="hint"><b>${nf1(a.perOutlet)}</b> base pack per toko aktif${ref ? ` · acuan <b>${nf1(ref)}</b> per toko` : ''}${k ? ' · poin ' + (k.poin == null ? '-' : k.poin.toFixed(1)) + '/' + k.bobot : ''}</p>`;
      return U.kpiRow({ id: 'as-' + c[0], name: esc(c[2]), icon: U.stIcon(tone, false), p, tone, big: nf(a.lines) + ' lines', target: a.target ? nf(a.target) + ' lines' : '', sisa: a.target ? nf(Math.max(0, a.target - a.lines)) + ' lines' : '', detail: det });
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
    $('secAsrt').innerHTML = `<div class="card">${ciTitle('box', 'Assortment per channel', '', first.tanggalData ? 's.d. ' + esc(tgl(first.tanggalData)) : '')}` +
      `<details class="how"><summary>Cara baca</summary><p class="hint">Dari Extract DMS${first.tanggalData ? ' s.d. ' + esc(tgl(first.tanggalData)) : ''}. Satu line = satu base pack di satu toko, dihitung kalau qty bersih bulan ini minimal ${DATA.asrt.moq} pcs. Base pack yang sama di toko yang sama hanya dihitung sekali, jadi tambah assortment dengan menjual base pack baru. Acuan per toko = target dibagi toko terdaftar di Outlet Master.${noTarget ? ' Target belum diisi untuk sebagian channel, jadi persennya belum muncul.' : ''}</p></details>` +
      `<div class="kpi-list">${head}</div></div>` +
      (cards ? `<div class="card">${ciTitle('store', 'Per DT dan channel')}<div class="rk-list">${cards}</div></div>` : '') + low;
  }

  function fopRows(channel) {
    const g = MON_G[channel];
    if (g && monLive()) return monStores(g).map(o => ({ outlet_kode: o.outlet_kode, outlet_nama: o.outlet_nama, dist_nama: o.dist_nama, remark: o.remark, status: o.status, orders: o.weeks, weekNow: o.weekNow === 1, lastWeek: o.lastWeek,
      risk: o.risk, wks: o.wks, needMore: o.needMore, open: o.open, monthWeeks: o.monthWeeks, curWeek: o.curWeek, g: g }));   // risk dkk dari server (kosong di server lama)
    return outlets('FOP').filter(o => o.channel === channel).map(o => ({ ...o, orders: num(o.v1) || 0, weekNow: String(o.v2) === '1', lastWeek: o.v3 }));
  }

  /** Sel kalender minggu satu toko (tanpa DOM). kind: ok = sudah order, now = minggu ini belum order, miss = terlewat, next = belum berjalan, off = tanpa hari kerja. */
  function weekCells(o) {
    const wks = o.wks || [], mw = o.monthWeeks || [], ci = mw.findIndex(m => m.w === o.curWeek);
    return mw.map((m, i) => ({ w: m.w, from: m.from, to: m.to, kind: wks.indexOf(m.w) >= 0 ? 'ok' : m.workdays < 1 ? 'off' : i === ci ? 'now' : ci >= 0 && i < ci ? 'miss' : 'next' }));
  }
  const WK_TXT = { ok: 'sudah order', now: 'minggu ini, belum order', miss: 'terlewat, tidak ada order', next: 'belum berjalan', off: 'tidak ada hari kerja' };
  function weekStrip(o) {
    const cells = weekCells(o); if (!cells.length) return '';
    return '<div class="wks" role="group" aria-label="Minggu order bulan ini">' + cells.map(c => {
      const d1 = +c.from.slice(8), d2 = +c.to.slice(8), rng = d1 === d2 ? String(d1) : d1 + '-' + d2;
      const aria = `Minggu ${c.w}, ${d1 === d2 ? d1 : d1 + ' sampai ' + d2} ${BULAN[+c.from.slice(5, 7)]}: ${WK_TXT[c.kind]}`;
      const inner = c.kind === 'ok' ? `${svg('check')}<b>Mg ${c.w}</b><small>${rng}</small>`
        : c.kind === 'now' ? `<b>Mg ${c.w}</b><small>minggu ini</small>`
        : c.kind === 'miss' ? `${svg('x')}<b>Mg ${c.w}</b>`
        : c.kind === 'next' ? `<b>Mg ${c.w}</b>` : '<b>-</b>';
      return `<span class="wk ${c.kind}" role="img" aria-label="${aria}">${inner}</span>`;
    }).join('') + '</div>';
  }
  /** Kalimat status dari angka server (risk, needMore, open); tidak dihitung ulang di sini. */
  function weekNote(o) {
    if (o.risk === 'AMAN') return `<p class="wk-note a">Sudah ${o.orders}x. Aman bulan ini.</p>`;
    if (o.risk === 'KRITIS') return `<p class="wk-note k">Perlu ${o.needMore}x lagi, tersisa ${o.open} minggu: <b>wajib order setiap minggu</b>.</p>`;
    if (o.risk === 'GAGAL') return `<p class="wk-note k">Tidak bisa WEEKLY bulan ini (sisa ${o.open} minggu, perlu ${o.needMore}x).</p>`;
    return `<p class="wk-note">Perlu ${o.needMore}x lagi, tersisa ${o.open} minggu.</p>`;
  }
  const RISK_ORD = { KRITIS: 0, BIASA: 1, GAGAL: 2, AMAN: 3 };
  /** Tombol "Detail" di baris toko tab FOP dan Banded: membuka lembar detail toko (target sentuh 44 px). */
  const detailBtn = (kode, g) => g && kode ? `<div class="rk-act"><button type="button" class="lnk" data-store="${esc(kode)}" data-g="${esc(g)}" aria-label="Detail toko">Detail toko</button></div>` : '';

  function rowLegacy(o) {
    const ok = o.status === 'WEEKLY'; return `<div class="rk"><div class="rk-h"><span class="si ${ok ? 'ok' : o.orders >= fopNeed() - 1 ? 'warn' : 'neg'}">${svg(ok ? 'check' : o.orders >= fopNeed() - 1 ? 'warn' : 'down')}</span>` +
      `<div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)} · ${esc(o.remark)} · ${esc(o.status || '-')}</div></div><span class="tag ${o.weekNow ? 'g' : 'r'}">${o.weekNow ? 'order mg ini' : 'belum mg ini'}</span></div>` +
      `<div class="rk-s two"><div class="${o.orders >= fopNeed() ? 'okc' : o.orders >= fopNeed() - 1 ? 'amb' : 'neg'}"><small>Minggu order bulan ini</small><b>${o.orders} / ${fopNeed()}</b></div><div><small>Order terakhir</small><b>${o.lastWeek === '' ? '-' : 'mg ' + esc(o.lastWeek)}</b></div></div>${detailBtn(o.outlet_kode, o.g)}</div>`;
  }
  function rowRisk(o) {
    const ic = o.risk === 'AMAN' ? ['ok', 'check'] : o.risk === 'BIASA' ? ['warn', 'warn'] : o.risk === 'KRITIS' ? ['neg', 'warn'] : ['neg', 'down'];
    return `<div class="rk"><div class="rk-h"><span class="si ${ic[0]}">${svg(ic[1])}</span>` +
      `<div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)} · ${esc(o.remark)} · ${esc(o.status || '-')}</div></div><span class="tag ${o.weekNow ? 'g' : 'r'}">${o.weekNow ? 'order mg ini' : 'belum mg ini'}</span></div>` +
      `<div class="rk-s two"><div class="${riskTone(o.risk)}"><small>Order bulan ini</small><b>${o.orders}/${fopNeed()}</b><em>${esc(o.status || '-')}</em></div><div class="${o.weekNow ? 'okc' : 'neg'}"><small>Minggu ini</small><b>${o.weekNow ? 'Sudah' : 'Belum'}</b><em>order</em></div></div>` +
      weekStrip(o) + weekNote(o) + detailBtn(o.outlet_kode, o.g) + '</div>';
  }
  /** Ringkasan wajib di atas daftar: jumlah toko per risiko dan target sebulan. */
  function wajibBox(rows, isSpm) {
    const n = f => rows.filter(f).length, need = fopNeed(), r = monRemain();
    const cell = (cls, v, lbl) => `<div class="${cls}"><b>${nf(v)}</b><span>${lbl}</span></div>`;
    return `<div class="wajib"><div class="hero-units">${cell('k-ok', n(o => o.risk === 'AMAN'), 'Aman')}${cell('k-neg', n(o => o.risk === 'KRITIS'), 'Kritis')}${cell('k-neg', n(o => o.risk === 'GAGAL'), 'Tidak bisa')}${cell('k-amb', n(o => o.risk !== 'AMAN' && !o.weekNow), 'Belum order mg ini')}</div>` +
      `<p class="wajib-t">${isSpm ? `SPM <b>wajib ${need}x sebulan</b>.` + (r ? ` Minggu ke-${r.week}, tersisa ${r.sisa} minggu kerja.` : '') : `Target ${need}x sebulan.`}</p></div>`;
  }
  /** Peringatan di halaman Skor: ada toko SPM kritis yang belum order minggu ini. Server lama (tanpa risk): disembunyikan. */
  function renderWajibBanner() {
    const el = $('wajibBanner'); if (!el) return;
    const rows = monLive() ? fopRows('LOCAL SUPERMARKET') : [];
    const kritis = rows.filter(o => o.risk === 'KRITIS');
    if (!kritis.some(o => !o.weekNow)) { el.hidden = true; el.innerHTML = ''; return; }
    const belum = rows.filter(o => o.risk !== 'AMAN' && !o.weekNow).length;
    el.innerHTML = `SPM <b>wajib ${fopNeed()}x sebulan</b>: <b>${kritis.length} toko kritis</b>, ${belum} belum order minggu ini. <button type="button" class="linkbtn" data-go="fop">Lihat toko</button>`;
    el.hidden = false;
  }

  function renderFop(id, key, channel, title, k) {
    const rows = fopRows(channel);
    const el = $(id);
    if (!rows.length) { el.innerHTML = ciTitle('cal', esc(title)) + monNote() + '<div class="empty">Belum ada data toko. Upload daftar toko monitoring di tool upload.</div>'; return; }
    const done = rows.filter(o => o.status === 'WEEKLY').length, live = MON_G[channel] && monLive(), ms = live ? DATA.live.summary.mon : null;
    const hasRisk = rows.some(o => o.risk !== undefined), isSpm = channel === 'LOCAL SUPERMARKET';   // server lama: tampilan dan filter lama
    el.innerHTML = ciTitle('cal', esc(title), (k ? ` <span class="lv ${k.level}">${pct(k.aktual)}</span>` : '') + (isSpm && live ? ` <span class="tag r">WAJIB ${fopNeed()}x</span>` : ''), done + ' dari ' + rows.length + ' toko sudah WEEKLY') +
      (live ? monNote() + `<details class="how"><summary>Cara baca</summary><p class="hint">${done} dari ${rows.length} toko monitoring sudah WEEKLY (order di ${fopNeed()} minggu atau lebih bulan ini). Dihitung dari Extract DMS sampai ${tgl(ms.tanggal)}, minggu ke-${ms.week}. Aturan: ${fopNeed()} minggu = WEEKLY, ${num(DATA.mon.cfg.fop_biweekly) || 2} = BIWEEKLY, 1 = MONTHLY.</p></details>`
        : `<p class="hint">${done} dari ${rows.length} toko aktif sudah WEEKLY di file. Sisanya perlu order ${fopNeed()}x bulan ini, mulai dari yang paling dekat.</p>`) +
      topRing(k, 'top-' + key, title, '') +
      (hasRisk ? wajibBox(rows, isSpm) : '') +
      mountList(key, {
        listCls: 'lega', st: true, rows, empty: 'Belum ada toko.',
        more: [['order', 'Order terbanyak', (a, b) => b.orders - a.orders || String(a.outlet_nama).localeCompare(b.outlet_nama)], ['orderlo', 'Order tersedikit', (a, b) => a.orders - b.orders || String(a.outlet_nama).localeCompare(b.outlet_nama)]],
        defaultF: hasRisk ? (rows.some(o => o.risk === 'KRITIS') ? 'kritis' : 'minggu') : 'belum',
        chips: hasRisk ? [['kritis', 'Kritis'], ['minggu', 'Belum order mg ini'], ['gagal', 'Tidak bisa WEEKLY'], ['weekly', 'WEEKLY'], ['semua', 'Semua']]
          : [['belum', 'Belum WEEKLY'], ['minggu', 'Belum order mg ini'], ['weekly', 'WEEKLY'], ['semua', 'Semua']],
        test: hasRisk ? (f, o) => f === 'semua' || (f === 'kritis' && o.risk === 'KRITIS') || (f === 'minggu' && o.risk !== 'AMAN' && !o.weekNow) || (f === 'gagal' && o.risk === 'GAGAL') || (f === 'weekly' && o.risk === 'AMAN')
          : (f, o) => f === 'semua' || (f === 'belum' && o.status !== 'WEEKLY') || (f === 'minggu' && o.status !== 'WEEKLY' && !o.weekNow) || (f === 'weekly' && o.status === 'WEEKLY'),
        hay: o => (o.outlet_nama + ' ' + o.dist_nama + ' ' + o.remark).toLowerCase(),
        sort: hasRisk ? (a, b) => (RISK_ORD[a.risk] - RISK_ORD[b.risk]) || (a.weekNow - b.weekNow) || String(a.outlet_nama).localeCompare(b.outlet_nama)
          : (a, b) => (a.status === 'WEEKLY') - (b.status === 'WEEKLY') || b.orders - a.orders || String(a.outlet_nama).localeCompare(b.outlet_nama),
        row: o => o.risk === undefined ? rowLegacy(o) : rowRisk(o),
      });
  }

  function renderPs(k) {
    const sm = DATA.live.summary.ps, st = psStores();
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
    $('secPs').innerHTML = `<div class="card">${ciTitle('store', 'Perfect Stores', k ? ` <span class="lv ${k.level}">${pct(k.aktual)}</span>` : '', 'Data ' + esc(tgl(sm.tanggal)))}` +
      `<details class="how"><summary>Cara baca</summary><p class="hint">Data ${esc(tgl(sm.tanggal))}, update mingguan. Status Full atau Lite mengikuti hasil HO di file.</p></details>` +
      topRing(k, 'top-ps', 'Perfect Stores', '') +
      `<div class="soft-card"><div class="bar-item"><div class="bi-h"><b>Perfect Store <span class="bi-p">(${sm.perfect}/${sm.target})</span></b><span class="bi-s">${need ? 'Sisa ' + need + ' Toko' : 'Target tercapai'}</span></div>` +
      `<div class="bar-thin" data-tone="${v >= 1 ? 'ok' : 'bad'}" aria-hidden="true"><i style="width:${Math.min(100, (sm.target ? sm.full / sm.target : 0) * 100).toFixed(0)}%"></i><i class="alt" style="width:${Math.max(0, Math.min(100 - Math.min(100, (sm.target ? sm.full / sm.target : 0) * 100), (sm.target ? sm.lite / sm.target : 0) * 100)).toFixed(0)}%"></i></div>` +
      `<div class="bi-lg"><span>Full ${sm.full}</span><span class="alt">Lite ${sm.lite}</span></div></div></div>` +
      `<p class="hint" style="margin-top:10px">Belum perfect paling sering kurang: ${esc(missTxt || '-')}.</p></div>` +
      (dtRows ? `<div class="card">${ciTitle('store', 'Per DT')}<div class="rk-list">${dtRows}</div></div>` : '') +
      `<div class="card">${ciTitle('store', 'Daftar toko')}` + mountList('ps', {
        more: [['miss', 'Paling banyak kurang', (a, b) => b.miss.length - a.miss.length || String(a.outlet_nama).localeCompare(b.outlet_nama)]],
        rows, defaultF: 'belum', empty: 'Belum ada toko.', listCls: 'lega',
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
    const list = (title, k, items) => `<details class="box" style="margin-top:8px"><summary><span>${esc(title)} ${k ? `<span class="lv ${k.level}">${pct(k.aktual)} / target ${pct(k.target)}</span>` : ''} · ${items.length} SKU</span></summary>` +
      `<ul class="sku-list">${items.map(o => `<li>${esc(o.outlet_kode)} ${esc(o.outlet_nama)}</li>`).join('')}</ul></details>`;
    $('secBanded').innerHTML = ciTitle('box', 'Banded') + '<details class="how"><summary>Cara baca</summary><p class="hint">SKU banded yang harus ada di toko monitoring. Pastikan tiap toko di daftar sudah order semua SKU channel-nya.</p></details>' +
      list('Local Minis', kMinis, sku('LOCAL MINIS')) + list('Supermarket (SPM)', kSpm, sku('SPM')) +
      (outs.length ? `<details class="box" style="margin-top:8px"><summary><span>Toko monitoring banded · ${outs.length} toko</span></summary><div class="rk-list" style="margin-top:10px">` +
        outs.map(o => `<div class="rk"><div class="rk-h"><span class="si plus">${svg('store')}</span><div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)}</div></div><span class="tag a">${esc(o.remark)}</span></div></div>`).join('') + '</div></details>' : '');
  }

  /* bysku:start */
  /** Gabung ringkasan per SKU antar-DT: jumlah bought/total/month per sku_kode (penjumlahan tampilan, bukan aturan Banded). Urut bought menaik. */
  function mergeBySku(lists) {
    const m = {};
    (lists || []).forEach(arr => (arr || []).forEach(b => {
      const o = m[b.sku_kode] = m[b.sku_kode] || { sku_kode: b.sku_kode, sku_nama: b.sku_nama, bought: 0, total: 0, month: 0 };
      o.bought += +b.bought || 0; o.total += +b.total || 0; o.month += +b.month || 0;
    }));
    return Object.keys(m).map(k => m[k]).sort((a, b) => a.bought - b.bought || (a.sku_kode < b.sku_kode ? -1 : a.sku_kode > b.sku_kode ? 1 : 0));
  }
  /* bysku:end */
  let BND = {};
  const BV = {};
  /** Banded dari Extract DMS: toko tercapai kalau bagian SKU banded channel-nya yang sudah dibeli >= ambang (config). */
  function renderBandedLive(kMinis, kSpm) {
    const cfg = DATA.mon.cfg, ms = DATA.live.summary.mon;
    const names = {}; (DATA.mon.bandedSku || []).forEach(b => { names[b.sku_kode] = b.sku_nama; });
    const groups = [['SPM', 'Supermarket (SPM)', kSpm, num(cfg.banded_spm) || 0.8], ['MINIS', 'Local Minis', kMinis, num(cfg.banded_minis) || 0.7]];   // SPM dulu: channel wajib
    $('secBanded').innerHTML = ciTitle('box', 'Banded', '', 'EVB ' + esc(ms.qLabel)) + monNote() +
      `<details class="how"><summary>Cara baca</summary><p class="hint">EVB ${esc(ms.qLabel)}: toko tercapai kalau SKU banded channel-nya yang pernah dibeli sepanjang kuartal ini minimal ${Math.round((num(cfg.banded_spm) || 0.8) * 100)}% (Supermarket) atau ${Math.round((num(cfg.banded_minis) || 0.7) * 100)}% (Local Minis). Bulan yang terhitung: ${esc(ms.qMonths.map(bulanLbl).join(', '))}; bulan lalu diambil dari rekap yang tersimpan, bulan berjalan dari Extract DMS sampai ${tgl(ms.tanggal)}. Hanya toko ber-REMARK monitoring. Ini hitungan sendiri, bukan angka HO.</p></details>` +
      '<div class="kpi-list" style="margin:4px 0 18px">' + groups.map(g => {
        const rows = monStores(g[0]), hit = rows.filter(o => o.bHit).length, k = g[2];
        const det = rows.length ? U.barItem({ name: 'Toko tercapai', p: hit / rows.length, tone: U.toneOf(hit / rows.length, ''), sisa: nf(rows.length - hit) + ' toko', left: nf(hit) + ' toko', right: nf(rows.length) + ' toko' }) : '';
        if (!k) return '';
        const has = k.target > 0 && k.aktual != null, p = has ? k.aktual / k.target : NaN, tone = LV_TONE[k.level] || U.toneOf(p, '');
        return U.kpiRow({ id: 'bd-top-' + g[0], name: esc(g[1]) + (g[0] === 'SPM' ? ' wajib' : ''), icon: U.stIcon(tone, false), p, tone, big: pct(k.aktual), target: has ? pct(k.target) : '', sisa: has ? pct(Math.max(0, k.target - k.aktual)) : '', detail: det });
      }).join('') + '</div>' +
      groups.map(g => `<div class="card" style="margin-top:10px"><h3 style="margin:0 0 6px">${esc(g[1])} ${g[2] ? `<span class="lv ${g[2].level}">${pct(g[2].aktual)} / target ${pct(g[2].target)}</span>` : ''}</h3><div id="bd-${g[0]}"></div></div>`).join('');
    BND = {};
    groups.forEach(g => {
      const ch = g[0], thr = g[3], rows = monStores(ch), tot = rows.length ? rows[0].bTotal : 0;
      const minSku = Math.ceil(thr * tot - 1e-9);
      const need = o => Math.max(Math.ceil(thr * o.bTotal - 1e-9) - o.bBought, 0);
      const hit = rows.filter(o => o.bHit).length;
      const box = $('bd-' + ch);
      if (!rows.length) { box.innerHTML = '<div class="empty">Belum ada toko monitoring di channel ini.</div>'; return; }
      if (!tot) { box.innerHTML = '<div class="empty">Daftar SKU banded channel ini belum diupload di tool upload.</div>'; return; }
      const skus = mergeBySku(monDts().map(d => d.bySku && d.bySku[ch]));
      const hasSku = skus.length > 0;
      // toko yang belum membeli tiap SKU (penyaringan tampilan dari bMiss)
      const missBy = {};
      rows.forEach(o => (o.bMiss || []).forEach(k => { (missBy[k] = missBy[k] || []).push(o); }));
      const pctHit = rows.length ? Math.round(hit / rows.length * 100) : 0;
      const summary = `<div class="hero-units"><div><b>${hit}/${rows.length}</b><span>Tercapai</span></div><div><b>${minSku}<small class="muted" style="font-weight:600;font-size:12px"> dari ${tot}</small></b><span>Ambang SKU</span></div><div><b>${rows.length - hit}</b><span>Kurang toko</span></div></div>` +
        `<div class="bar"><i style="width:${pctHit}%"></i></div><div class="bar-meta"><span>EVB ${esc(ms.qLabel)}</span><span>${pctHit}% toko tercapai</span></div>`;
      const skuList = () => mountList('bsku' + ch, {
        listCls: 'lega', st: true, more: [['sudah', 'Paling banyak sudah', (a, b) => b.bought - a.bought || (a.sku_kode < b.sku_kode ? -1 : 1)]], rows: skus, defaultF: 'kurang', empty: 'Belum ada SKU banded.', unit: 'SKU', ph: 'Cari nama atau kode SKU',
        chips: [['kurang', 'Paling banyak belum'], ['semua', 'Semua SKU']],
        test: (f, b) => f === 'semua' || b.bought < b.total,
        hay: b => (b.sku_nama + ' ' + b.sku_kode).toLowerCase(),
        sort: (a, b) => a.bought - b.bought || (a.sku_kode < b.sku_kode ? -1 : a.sku_kode > b.sku_kode ? 1 : 0),
        row: b => {
          const r = b.total ? b.bought / b.total : 0, ic = r >= thr ? 'ok' : r >= 0.5 ? 'warn' : 'neg', belum = b.total - b.bought, miss = missBy[b.sku_kode] || [];
          const cls = ic === 'ok' ? 'okc' : ic === 'warn' ? 'amb' : 'neg';
          return `<div class="rk"><div class="rk-h"><span class="si ${ic}">${svg(ic === 'ok' ? 'check' : ic === 'warn' ? 'warn' : 'down')}</span>` +
            `<div class="it-i"><div class="nm">${esc(b.sku_nama || b.sku_kode)}</div><div class="sk">${esc(b.sku_kode)}</div></div><span class="tag ${ic === 'ok' ? 'g' : ic === 'warn' ? 'a' : 'r'}">${belum > 0 ? nf(belum) + ' toko belum' : 'Semua sudah'}</span></div>` +
            `<div class="bar" style="margin-top:10px;height:6px"><i style="width:${(r * 100).toFixed(0)}%"></i></div>` +
            `<div class="rk-s two"><div class="${cls}"><small>Sudah dibeli (kuartal)</small><b>${nf(b.bought)} / ${nf(b.total)}</b><em>${Math.round(r * 100)}%</em></div><div><small>Bulan ini</small><b>${nf(b.month)}</b></div></div>` +
            (miss.length ? `<details class="box" style="margin-top:8px"><summary><span>Toko yang belum membeli (${nf(miss.length)})</span></summary><ul class="sku-list">${miss.slice(0, 30).map(o => `<li>${esc(o.outlet_nama)} · ${esc(o.dist_nama)}</li>`).join('')}${miss.length > 30 ? `<li>dan ${nf(miss.length - 30)} lagi</li>` : ''}</ul></details>` : '') + '</div>';
        },
      });
      const tokoList = () => mountList('bnd' + ch, {
        listCls: 'lega', st: true, more: [['sku', 'SKU terbanyak sudah', (a, b) => b.bBought - a.bBought || String(a.outlet_nama).localeCompare(b.outlet_nama)], ['kurang', 'Kurang SKU terbanyak', (a, b) => need(b) - need(a) || String(a.outlet_nama).localeCompare(b.outlet_nama)]],
        rows, defaultF: 'belum', empty: 'Belum ada toko.',
        chips: [['belum', 'Belum tercapai'], ['dekat', 'Tinggal 1-2 SKU'], ['hit', 'Tercapai'], ['semua', 'Semua']],
        test: (f, o) => f === 'semua' || (f === 'belum' && !o.bHit) || (f === 'hit' && !!o.bHit) || (f === 'dekat' && !o.bHit && need(o) <= 2),
        hay: o => (o.outlet_nama + ' ' + o.dist_nama + ' ' + o.remark).toLowerCase(),
        sort: (a, b) => (!!a.bHit) - (!!b.bHit) || need(a) - need(b) || String(a.outlet_nama).localeCompare(b.outlet_nama),
        row: o => {
          const ok = !!o.bHit, near = need(o) <= 2, miss = ok ? [] : (o.bMiss || []);
          const v = minSku ? Math.min(1, o.bBought / minSku) : 0;
          return `<div class="rk"><div class="rk-h"><span class="si ${ok ? 'ok' : near ? 'warn' : 'neg'}">${svg(ok ? 'check' : near ? 'warn' : 'down')}</span>` +
            `<div class="it-i"><div class="nm">${esc(o.outlet_nama)}</div><div class="sk">${esc(o.dist_nama)} · ${esc(o.remark)}</div></div><span class="tag ${ok ? 'g' : near ? 'a' : 'r'}">${ok ? 'Tercapai' : 'Kurang ' + need(o) + ' SKU'}</span></div>` +
            `<div class="bar" style="margin-top:10px;height:6px"><i style="width:${(v * 100).toFixed(0)}%"></i></div>` +
            `<div class="rk-s two"><div class="${ok ? 'okc' : near ? 'amb' : 'neg'}"><small>SKU sudah dibeli</small><b>${o.bBought} / ${minSku}</b><em>${ok ? 'tercapai' : 'kurang ' + need(o) + ' SKU'}</em></div><div><small>Bulan ini</small><b>${o.bMonth}</b><em>${o.bShare == null ? '-' : Math.round(o.bShare * 100) + '% dari SKU'}</em></div></div>` + detailBtn(o.outlet_kode, ch) +
            (miss.length ? `<div class="skc">${miss.slice(0, 3).map(k => `<span title="${esc(k)}">${esc(names[k] || k)}</span>`).join('')}${miss.length > 3 ? `<button type="button" data-skmore="1">+${miss.length - 3}</button>` : ''}</div>` +
              `<details class="box skm" style="margin-top:8px"><summary><span>Belum dibeli (${miss.length} SKU)</span></summary><ul class="sku-list">${miss.map(k => `<li>${esc(k)} ${esc(names[k] || '')}</li>`).join('')}</ul></details>` : '') + '</div>';
        },
      });
      BND[ch] = { hasSku, skuList, tokoList };
      const sw = hasSku ? `<div class="chips bv" role="group" aria-label="Pandangan ${esc(g[1])}" id="bvs-${ch}"></div>` : '';
      box.innerHTML = summary + `<details class="how"><summary>Cara baca</summary><p class="hint" style="margin:10px 0 8px">${hasSku ? 'Per SKU: SKU mana yang belum dibeli banyak toko. Per toko: toko mana yang masih kurang SKU. Dihitung sepanjang kuartal.' : `${hit} dari ${rows.length} toko tercapai · ${tot} SKU banded, ambang ${minSku} SKU per toko (sepanjang kuartal).`}</p></details>` + sw + `<div id="bv-${ch}"></div>`;
      paintBanded(ch);
    });
  }

  /* Pandangan Banded per channel: 'sku' atau 'toko'. Bawaan: SPM per SKU (wajib 80%), Minis per toko; pilihan diingat per channel. */
  const bandedView = ch => {
    let sv = {}; try { sv = JSON.parse(localStorage.getItem('mh_gs_bnd_view') || '{}') || {}; } catch (e) { /* mode privat */ }
    const v = BV[ch] || sv[ch] || (ch === 'SPM' ? 'sku' : 'toko');
    return v === 'sku' && BND[ch] && BND[ch].hasSku ? 'sku' : 'toko';
  };
  function paintBanded(ch) {
    const b = BND[ch], el = $('bv-' + ch); if (!b || !el) return;
    const v = bandedView(ch), sw = $('bvs-' + ch);
    if (sw) sw.innerHTML = [['sku', 'Per SKU'], ['toko', 'Per toko']].map(x => `<button type="button" data-bv="${ch}" data-v="${x[0]}" aria-pressed="${v === x[0]}">${x[1]}</button>`).join('');
    el.innerHTML = v === 'sku' ? b.skuList() : b.tokoList();
    fillList(v === 'sku' ? 'bsku' + ch : 'bnd' + ch);
  }
  function setBandedView(ch, v) {
    try { const sv = JSON.parse(localStorage.getItem('mh_gs_bnd_view') || '{}') || {}; sv[ch] = v; localStorage.setItem('mh_gs_bnd_view', JSON.stringify(sv)); } catch (e) { /* mode privat */ }
    BV[ch] = v; paintBanded(ch);
  }

  /* ---- tab Toko: semua toko monitoring dalam satu daftar, ketuk untuk lembar detail ---- */
  const bandedThr = g => (g === 'SPM' ? num(DATA.mon.cfg.banded_spm) || 0.8 : num(DATA.mon.cfg.banded_minis) || 0.7);
  const minSkuOf = (g, tot) => Math.ceil(bandedThr(g) * tot - 1e-9);
  /** Satu definisi "perlu tindakan": SPM kritis, belum order minggu ini (dan belum aman), atau Banded belum tercapai. */
  const fopAman = f => f.risk === 'AMAN' || (f.risk === undefined && f.status === 'WEEKLY');   // server lama tanpa risk: WEEKLY dianggap aman
  const needsAction = c => c.fop.risk === 'KRITIS' || (!c.fop.weekNow && !fopAman(c.fop)) || !c.banded.bHit;
  const riskTone = r => r === 'AMAN' ? 'okc' : r === 'BIASA' ? 'amb' : r === undefined ? '' : 'neg';
  const psShort = c => !c.ps ? '-' : c.ps.status === 'PS FULL' ? 'FULL' : c.ps.status === 'PS LITE' ? 'LITE' : 'belum';
  let STORES = [];
  function tokoCards() {
    if (!monLive()) return [];
    const sk = DATA.mon.bandedSku || [], ps = psStores();
    return ['SPM', 'MINIS'].reduce((a, g) => a.concat(monStores(g).map(o => storeCard(o, g, ps, sk))), []);
  }
  function tokoRow(c) {
    const na = needsAction(c), f = c.fop, b = c.banded, min = minSkuOf(c.channel, b.bTotal);
    const ic = !na ? ['ok', 'check'] : f.risk === 'KRITIS' || !b.bHit && !f.weekNow ? ['neg', 'down'] : ['warn', 'warn'];
    const need = DATA.mon.cfg.fop_weekly;
    return `<div class="rk tap" role="button" tabindex="0" data-store="${esc(c.kode)}" data-g="${esc(c.channel)}" aria-label="Buka detail ${esc(c.nama)}"><div class="rk-h"><span class="si ${ic[0]}">${svg(ic[1])}</span>` +
      `<div class="it-i"><div class="nm">${esc(c.nama)}</div><div class="sk">${esc(c.dist)} · ${esc(c.channel === 'SPM' ? 'Supermarket' : 'Local Minis')}</div></div><span class="tag ${na ? 'r' : 'g'}">${na ? 'Perlu tindakan' : 'Aman'}</span></div>` +
      `<div class="rk-s"><div class="${riskTone(f.risk)}"><small>Order</small><b>${f.weeks}/${need}</b><em>${f.weekNow ? 'mg ini sudah' : 'mg ini belum'}</em></div>` +
      `<div class="${b.bHit ? 'okc' : 'neg'}"><small>Banded</small><b>${b.bBought}/${min}</b><em>${b.bHit ? 'tercapai' : 'belum'}</em></div>` +
      `<div class="${!c.ps ? '' : isPerfect(c.ps) ? 'okc' : 'amb'}"><small>Perfect Store</small><b>${psShort(c)}</b><em>${c.ps ? esc(c.ps.status === 'NOT PERFECT' ? c.ps.total_kpi || '' : '') : 'tanpa data'}</em></div></div></div>`;
  }
  function renderToko() {
    const el = $('secToko'); if (!el) return;
    STORES = tokoCards();
    el.innerHTML = ciTitle('store', 'Toko monitoring', '', nf(STORES.length) + ' toko') + (monLive() ? monNote() : '') +
      '<details class="how"><summary>Cara baca</summary><p class="hint">Semua toko monitoring SPM dan Minis dalam satu daftar: order mingguan, Banded, dan Perfect Store. Ketuk toko untuk melihat detailnya.</p></details>' +
      mountList('toko', {
        st: true, more: [['order', 'Order terbanyak', (a, b) => b.fop.weeks - a.fop.weeks || String(a.nama).localeCompare(b.nama)], ['banded', 'Banded terbanyak', (a, b) => b.banded.bBought - a.banded.bBought || String(a.nama).localeCompare(b.nama)]],
        rows: STORES, empty: 'Belum ada data toko monitoring. Upload daftar toko dan Extract DMS di tool upload.',
        defaultF: 'perlu',
        chips: [['perlu', 'Perlu tindakan'], ['spm', 'SPM'], ['minis', 'Minis'], ['semua', 'Semua']],
        test: (f, c) => f === 'semua' || (f === 'perlu' && needsAction(c)) || (f === 'spm' && c.channel === 'SPM') || (f === 'minis' && c.channel === 'MINIS'),
        hay: c => (c.nama + ' ' + c.kode + ' ' + c.dist).toLowerCase(),
        sort: (a, b) => (a.channel === b.channel ? 0 : a.channel === 'SPM' ? -1 : 1) || ((RISK_ORD[a.fop.risk] == null ? 9 : RISK_ORD[a.fop.risk]) - (RISK_ORD[b.fop.risk] == null ? 9 : RISK_ORD[b.fop.risk])) || String(a.nama).localeCompare(b.nama),
        row: tokoRow,
      });
  }

  /* ---- lembar detail toko (modal) ---- */
  let storeOpener = null;
  const emptyMsg = t => `<div class="empty">${t}</div>`;
  function storeBody(c) {
    const f = c.fop, b = c.banded, fo = Object.assign({}, f, { orders: f.weeks });
    const order = f.monthWeeks && f.monthWeeks.length ? weekStrip(fo) + (f.risk === undefined ? `<p class="wk-note">Sudah order di ${f.weeks} minggu bulan ini.</p>` : weekNote(fo))
      : emptyMsg('Kalender minggu belum ada. Perbarui data dari tombol muat ulang; kalau tetap kosong, Apps Script perlu diperbarui.');
    const min = minSkuOf(c.channel, b.bTotal), v = min ? Math.min(1, b.bBought / min) : 0;
    const li = (arr, mark) => arr.map(s => `<li>${esc(s.nama)} <span class="muted">${esc(s.kode)}</span>${mark && s.bulanIni ? ' <span class="tag b">bulan ini</span>' : ''}</li>`).join('');
    const banded = !b.bTotal ? emptyMsg('Daftar SKU banded channel ini belum diupload di tool upload.')
      : `<div class="bar" style="height:8px"><i style="width:${(v * 100).toFixed(0)}%"></i></div><div class="bar-meta"><span>${b.bBought} dari ${min} SKU (ambang), total ${b.bTotal} SKU</span><b>${b.bHit ? 'Tercapai' : 'Kurang ' + Math.max(min - b.bBought, 0) + ' SKU'}</b></div>` +
        `<details class="box" open style="margin-top:8px"><summary><span>Belum dibeli (${b.bMiss.length} SKU)</span></summary>${b.bMiss.length ? `<ul class="sku-list">${li(b.bMiss)}</ul>` : '<p class="hint" style="margin:6px 0 0">Semua SKU banded sudah dibeli.</p>'}</details>` +
        `<details class="box" style="margin-top:8px"><summary><span>Sudah dibeli (${b.bought.length} SKU)</span></summary>${b.bought.length ? `<ul class="sku-list">${li(b.bought, true)}</ul>` : '<p class="hint" style="margin:6px 0 0">Belum ada SKU banded yang dibeli.</p>'}</details>`;
    let ps;
    if (!c.ps) ps = emptyMsg('Belum ada data Perfect Store untuk toko ini. Upload sheet Perfect Stores di tool upload.');
    else {
      const miss = c.ps.parts.filter(p => p.ok === false).map(p => p.label), ok = isPerfect(c.ps);
      ps = `<div class="ps-st"><span class="tag ${ok ? 'g' : 'a'}">${esc(c.ps.status)}</span>${c.ps.total_kpi ? ` <span class="muted">KPI ${esc(c.ps.total_kpi)}</span>` : ''}</div>` +
        '<div class="rk-s five">' + c.ps.parts.map(p => `<div class="${p.ok === true ? 'okc' : p.ok === false ? 'neg' : ''}"><small>${p.label}</small><b>${p.ok === true ? '✓' : p.ok === false ? '✗' : '–'}</b><em>${p.skor == null ? ' ' : Math.round(p.skor * 100) + '%'}</em></div>`).join('') + '</div>' +
        (miss.length ? `<p class="wk-note k">Kurang: <b>${esc(miss.join(', '))}</b></p>` : ok ? '<p class="wk-note a">Perfect Store lengkap.</p>' : '');
    }
    return `<h4 class="mh">Order mingguan</h4>${order}<h4 class="mh">Banded${b.qLabel ? ' (EVB ' + esc(b.qLabel) + ')' : ''}</h4>${banded}<h4 class="mh">Perfect Store</h4>${ps}`;
  }
  function openStore(kode, g) {
    const c = STORES.find(x => x.kode === String(kode) && x.channel === g) || STORES.find(x => x.kode === String(kode)); if (!c) return;
    storeOpener = document.activeElement;
    $('storeModalTitle').textContent = c.nama;
    $('storeModalSub').textContent = [c.dist, c.remark, c.channel === 'SPM' ? 'Supermarket' : 'Local Minis'].filter(Boolean).join(' · ');
    $('storeModalBody').innerHTML = storeBody(c);
    $('storeModalBody').scrollTop = 0;
    $('storeModal').hidden = false;
    $('storeModalClose').focus();
  }
  function closeStore() {
    if ($('storeModal').hidden) return;
    $('storeModal').hidden = true;
    const o = storeOpener; storeOpener = null;
    if (o && document.body.contains(o)) o.focus();
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
    el.innerHTML = title + '<details class="how"><summary>Cara baca</summary><p class="hint">Hasil tiap bulan disimpan otomatis dari Extract DMS. FINAL = data sudah sampai hari kerja terakhir bulan itu. EVB = SKU banded yang pernah dibeli sejak awal kuartal.</p></details>' +
      '<div class="scroll"><table><thead><tr><th>Bulan</th><th class="n">FOP SPM</th><th class="n">FOP Minis</th><th class="n">EVB SPM</th><th class="n">EVB Minis</th><th class="n">Lines SPM</th><th class="n">Lines Minis</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderHist(snaps) {
    if (snaps.length < 2) { $('secHist').innerHTML = ciTitle('clock', 'Riwayat rank') + '<div class="empty">Riwayat rank muncul setelah upload kedua (1 baris per hari upload).</div>'; return; }
    $('secHist').innerHTML = ciTitle('clock', 'Riwayat rank') + '<div class="scroll"><table><thead><tr><th>Tanggal</th><th class="n">Rank</th><th class="n">Score</th></tr></thead><tbody>' +
      snaps.slice(-14).reverse().map(s => `<tr><td>${tgl(s.tanggal)}</td><td class="n">${esc(s.rank != null ? s.rank : '-')}</td><td class="n">${s.score != null ? s.score.toFixed(2) : '-'}</td></tr>`).join('') + '</tbody></table></div>';
  }

  /** Teks pengingat untuk grup WhatsApp: rank, 3 KPI dengan poin hilang terbesar, toko FOP yang belum order minggu ini, toko PS yang kurang. */
  function reminderText() {
    const live = DATA.live, cur = live.history[live.history.length - 1];
    const kp = live.kpis.filter(k => k.hilang > 0.05).slice(0, 3);   // sama dengan daftar KPI di dasbor (sudah dihitung ulang)
    const L = [];
    L.push('*KPI GREAT SALES* (' + tgl(live.tanggal) + ')' + (DATA.scope ? ' - ' + DATA.scope.nama : ''));
    L.push('Rank nasional: *' + (cur.rank != null ? cur.rank : '-') + '* · Score ' + (cur.score != null ? cur.score.toFixed(2) : '-'));
    if (kp.length) {
      L.push('', 'Fokus poin:');
      kp.forEach((k, i) => L.push((i + 1) + '. ' + k.label + ': ' + pct(k.aktual) + ' (target ' + pct(k.target) + '), poin hilang ' + k.hilang.toFixed(1)));
    }
    const fopTodo = c => {
      const todo = fopRows(c[0]).filter(o => o.status !== 'WEEKLY' && !o.weekNow).sort((a, b) => b.orders - a.orders).slice(0, 15);
      if (!todo.length) return;
      L.push('', 'Toko ' + c[1] + ' belum order minggu ini (target ' + fopNeed() + 'x sebulan):');
      todo.forEach(o => L.push('- ' + o.outlet_nama + ' (' + o.orders + '/' + fopNeed() + ')'));
    };
    const spm = monLive() ? fopRows('LOCAL SUPERMARKET') : [];
    if (spm.some(o => o.risk !== undefined)) {   // server baru: SPM wajib dulu, lalu Minis
      const r = monRemain(), need = fopNeed();
      L.push('', '*SPM wajib ' + need + 'x sebulan*' + (r ? ' (minggu ' + r.week + ', tersisa ' + r.sisa + ' minggu kerja)' : ''));
      const kritis = spm.filter(o => o.risk === 'KRITIS').sort((a, b) => String(a.outlet_nama).localeCompare(b.outlet_nama)).slice(0, 15);
      if (kritis.length) { L.push('Kritis:'); kritis.forEach(o => L.push('- ' + o.outlet_nama + ' (' + o.orders + '/' + need + ', perlu ' + o.needMore + 'x lagi, wajib setiap minggu)')); }
      const belum = spm.filter(o => o.risk !== 'AMAN' && o.risk !== 'KRITIS' && !o.weekNow).sort((a, b) => b.orders - a.orders).slice(0, 15);
      if (belum.length) { L.push('Belum order minggu ini:'); belum.forEach(o => L.push('- ' + o.outlet_nama + ' (' + o.orders + '/' + need + ')')); }
      fopTodo(['LOCAL MINIS', 'Local Minis']);
    } else [['LOCAL MINIS', 'Local Minis'], ['LOCAL SUPERMARKET', 'SPM']].forEach(fopTodo);
    const ps = psStores().filter(o => !isPerfect(o) && psMissing(o).length).sort((a, b) => psMissing(a).length - psMissing(b).length).slice(0, 10);
    if (ps.length) {
      L.push('', 'Perfect Store, lengkapi:');
      ps.forEach(o => L.push('- ' + o.outlet_nama + ': ' + psMissing(o).join(', ')));
    }
    L.push('', 'Detail: ' + location.href.split('?')[0]);
    return L.join('\n');
  }

  $('loginForm').addEventListener('submit', e => { e.preventDefault(); const code = $('codeInput').value.trim(); if (!code) { $('loginErr').textContent = 'Isi kode akses dulu.'; return; } $('loginErr').textContent = ''; login(code); });
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
  const TABS = ['skor', 'fop', 'banded', 'toko', 'asrt', 'ps'];
  function setTab(t) {
    if (!TABS.includes(t)) t = 'skor';
    TABS.forEach(k => { $('tab-' + k).hidden = k !== t; });
    document.querySelectorAll('#tabsNav [data-tab]').forEach(b => {
      if (b.dataset.tab === t) { b.setAttribute('aria-current', 'page'); $('greetBig').textContent = b.textContent.trim(); } else b.removeAttribute('aria-current');
    });
    try { localStorage.setItem('mh_gs_tab', t); } catch (e) { /* mode privat */ }
    window.scrollTo({ top: 0 });
  }
  $('tabsNav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  document.addEventListener('input', e => { const id = e.target.getAttribute && e.target.getAttribute('data-q'); if (!id) return; LST[id].q = e.target.value; LST[id].limit = 60; $('tb-' + id).querySelector('.clr').hidden = !e.target.value; fillList(id); });
  document.addEventListener('change', e => { const id = e.target.getAttribute && e.target.getAttribute('data-sort'); if (!id) return; LST[id].s = e.target.value; LST[id].limit = 60; fillList(id); });
  document.addEventListener('click', e => {
    const st = e.target.closest('[data-store]'); if (st) { openStore(st.dataset.store, st.dataset.g); return; }
    const c = e.target.closest('[data-ch]'); if (c) { LST[c.dataset.ch].f = c.dataset.f; LST[c.dataset.ch].limit = 60; fillList(c.dataset.ch); return; }
    const x = e.target.closest('[data-clr]'); if (x) { const id = x.dataset.clr; LST[id].q = ''; $('tb-' + id).querySelector('input').value = ''; x.hidden = true; fillList(id); return; }
    const m = e.target.closest('[data-more]'); if (m) { const id = m.dataset.more; LST[id].limit = (LST[id].limit || 60) + 60; fillList(id); return; }
    const bv = e.target.closest('[data-bv]'); if (bv) { setBandedView(bv.dataset.bv, bv.dataset.v); return; }
    const sm = e.target.closest('[data-skmore]'); if (sm) { const d = sm.closest('.rk').querySelector('details.skm'); if (d) d.open = !d.open; return; }
    const go = e.target.closest('[data-go]'); if (go) { setTab(go.dataset.go); return; }
    const r = e.target.closest('[data-reset]'); if (r) { const id = r.dataset.reset; LST[id].q = ''; LST[id].f = LISTS[id].defaultF; $('tb-' + id).querySelector('input').value = ''; fillList(id); return; }
    $('syncPop').hidden = true;
  });
  document.addEventListener('keydown', e => {
    const t = e.target.closest && e.target.closest('.rk.tap');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openStore(t.dataset.store, t.dataset.g); return; }
    if ($('storeModal').hidden) return;
    if (e.key === 'Escape') { closeStore(); return; }
    if (e.key === 'Tab') {   // fokus tetap di dalam lembar
      const f = [...$('storeModal').querySelectorAll('button, summary, [tabindex="0"]')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  $('storeModalClose').addEventListener('click', closeStore);
  $('storeModal').addEventListener('click', e => { if (e.target.id === 'storeModal') closeStore(); });
  window.MHFresh.bind();
  let refreshing = false;   // satu permintaan segarkan sekaligus: klik berulang tidak menumpuk permintaan ke Apps Script
  $('refreshBtn').addEventListener('click', () => {
    if (refreshing) return; refreshing = true;
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    refreshNote('Memperbarui data…');
    login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); }).finally(() => { refreshing = false; });
  });
  /* #fop dst dari halaman Cek Stok membuka tab itu; tanpa hash, tab terakhir dibuka. Ranking pindah ke halaman sendiri. */
  const hashTab = (location.hash || '').replace('#', '');
  if (hashTab === 'ranking') { location.replace('ranking.html'); return; }
  try { setTab(TABS.includes(hashTab) ? hashTab : (localStorage.getItem('mh_gs_tab') || 'skor')); } catch (e) { setTab(TABS.includes(hashTab) ? hashTab : 'skor'); }

  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
