/* Ranking sales bersama: gabungan semua DT atau per DT, terbuka untuk akun mana pun. Data dari Apps Script ?view=rank.
   Angka dan urutan dari server; di sini hanya ditampilkan. Server hanya mengirim bidang aman (rankPublicRow_), tanpa toko/SKU/omzet. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const CACHE_KEY = 'mh_rank_cache';
  const $ = id => document.getElementById(id);
  const esc = window.MHUtil.esc;
  const BLS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m && BLS[+m[2]] ? (+m[3]) + ' ' + BLS[+m[2]] + ' ' + m[1] : String(iso || ''); };
  const nf = v => Math.round(v).toLocaleString('id-ID');
  const nf1 = v => (Math.round(v * 10) / 10).toLocaleString('id-ID');
  const pct = v => v == null ? '-' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const KPI = [['fop', 'FOP'], ['banded', 'Banded'], ['asrt', 'Assortment']];
  let DATA = null, CODE = '';
  const S = { scope: '', bu: '', kpi: 'fop', q: '', limit: 60, mode: '', sel: '', open: false };   // scope '' = Semua DT

  async function fetchRank(code) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'view=rank&code=' + encodeURIComponent(code);
    let last;
    for (let i = 0; i < 4; i++) { // Apps Script kadang membalas 404 sesaat
      try { const res = await fetch(url); if (res.ok) return await res.json(); last = new Error('http_' + res.status); } catch (err) { last = err; }
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    throw last;
  }
  function banner(txt) { const b = $('csBanner'); b.hidden = !txt; b.textContent = txt || ''; }
  function note(kind) {
    const F = window.MHFresh;
    if (kind === 'wait') F.set({ fetch: 'wait', text: 'Memperbarui…' });
    else if (kind === 'off') F.set({ fetch: 'off' });
    else F.set({ fetch: 'ok', at: kind === 'done' ? Date.now() : 0 });
  }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200); }
  function loginErr(msg) { $('loginErr').textContent = msg; $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk'; }
  function problem(msg, silent, badCode) {
    if (!silent) { loginErr(msg); return; }
    if (badCode) { $('appScreen').hidden = true; $('loginScreen').hidden = false; window.MHBoot.invalid(msg); } else window.MHBoot.fail(msg);
  }
  function readCache(code) { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.code === code) return c; } catch (e) { /* salinan rusak */ } return null; }
  function writeCache(code, data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ code, data, at: Date.now() })); } catch (e) { /* penuh / mode privat */ } }

  /* ---- papan: baris yang tampil menurut ruang lingkup ---- */
  const bus = () => (DATA && DATA.bu) || {};
  const rankOf = r => S.scope ? r.rankDt : r.rank;   // per DT = peringkat dalam DT; Semua DT = peringkat gabungan
  function board() {
    const b = bus(); if (!S.bu || !b[S.bu]) S.bu = Object.keys(b)[0] || '';
    const bu = b[S.bu]; if (!bu) return { ranked: [], low: [], top: 0 };
    const keep = r => !S.scope || r.dt_kode === S.scope;
    const ranked = bu[S.kpi].filter(keep).map((r, i) => Object.assign({ ord: i }, r)), low = bu.belumCukup[S.kpi].filter(keep);
    return { bu: bu, ranked: ranked, low: low, top: ranked.length ? ranked[0].nilai : 0 };
  }
  const val = r => S.kpi === 'asrt' ? nf1(r.nilai) + '<small>lines/toko</small>' : pct(r.nilai);
  const valTxt = r => S.kpi === 'asrt' ? nf1(r.nilai) + ' lines/toko' : pct(r.nilai);
  const sub = r => S.kpi === 'fop' ? nf(r.weekly) + ' dari ' + nf(r.n) + ' toko WEEKLY' : S.kpi === 'banded' ? nf(r.hit) + ' dari ' + nf(r.n) + ' toko tercapai' : nf(r.toko) + ' dari ' + nf(r.n) + ' toko aktif';
  const stats = r => {
    const cell = (l, v) => '<div><small>' + l + '</small><b>' + v + '</b></div>';
    if (S.kpi === 'fop') return cell('WEEKLY', r.weekly + '/' + r.n) + cell('SPM wajib', r.spm.weekly + '/' + r.spm.n);
    if (S.kpi === 'banded') return cell('Tercapai', r.hit + '/' + r.n) + cell('Toko', nf(r.n));
    return cell('Lines', nf(r.lines)) + cell('Toko aktif', nf(r.toko));
  };
  const medal = n => '<svg class="medal g' + n + '" viewBox="0 0 34 34" role="img" aria-label="Peringkat ' + n + '"><path class="m-rb" d="M9 1h7l2 9h-7zM25 1h-7l-2 9h7z"/><circle class="m-bg" cx="17" cy="21" r="12"/><text x="17" y="25.5">' + n + '</text></svg>';
  const mine = r => !!DATA.me.dt_kode && r.dt_kode === DATA.me.dt_kode;
  function row(r, top) {
    const rk = rankOf(r), w = top > 0 ? Math.max(2, Math.min(100, r.nilai / top * 100)) : 0, pod = window.MHUtil.isMedal(rk, r.ord);
    return '<div class="rk' + (pod ? ' pod' : '') + (mine(r) ? ' mine' : '') + '"><div class="rk-h">' + (pod ? medal(rk) : '<span class="si rkn off" aria-label="Peringkat ' + rk + '">' + rk + '</span>') +
      '<div class="it-i"><div class="nm">' + esc(r.nama) + (mine(r) ? ' <span class="tag b">DT Anda</span>' : '') + '</div><div class="sk">' + esc(r.dt_nama) + ' · ' + sub(r) + '</div></div><span class="rk-val">' + val(r) + '</span></div>' +
      '<div class="bar" style="margin-top:10px;height:6px"><i style="width:' + w.toFixed(0) + '%"></i></div><div class="rk-s two">' + stats(r) + '</div></div>';
  }
  function lowRow(r) {
    return '<div class="rk' + (mine(r) ? ' mine' : '') + '"><div class="rk-h"><span class="si rkn off" aria-hidden="true">–</span><div class="it-i"><div class="nm">' + esc(r.nama) + (mine(r) ? ' <span class="tag b">DT Anda</span>' : '') + '</div><div class="sk">' + esc(r.dt_nama) + ' · ' + nf(r.n) + ' toko</div></div><span class="rk-val">' + val(r) + '</span></div></div>';
  }
  const ICON_TROPHY = '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>';
  const ICON_SEARCH = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>';
  const ICON_X = '<path d="M6 6l12 12M18 6L6 18"/>';
  const svg = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  const head = sub => '<div class="card-head"><span class="ci">' + svg(ICON_TROPHY) + '</span><div class="ch-t"><h2>Ranking sales</h2>' + (sub ? '<p class="ch-s">' + sub + '</p>' : '') + '</div></div>';

  /* ---- papan Total: skor total 5 KPI berbobot per DSR (dari server, `total`), lembar detail per DSR ---- */
  const TK = [['ps', 'Perfect Store', 'PS'], ['fop', 'Weekly FOP', 'FOP'], ['asrt', 'Assortment', 'Asrt'], ['banded', 'Banded', 'Banded'], ['r2g', 'R2G', 'R2G']];
  const U = window.MHUtil;
  const hasTotal = () => !!(DATA && DATA.total && Array.isArray(DATA.total.rows));
  const wide = () => !!(window.matchMedia && window.matchMedia('(min-width:1200px)').matches);
  const p0 = v => Math.round(v * 100) + '%';
  const noData = k => !k || k.tanpaData || typeof k.pct !== 'number' || !isFinite(k.pct);
  const poin = k => k.skor * k.bobot / 100;   // tampilan saja: skor 0-100 x bobot
  const sc1 = v => (Math.round(v * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 1 });
  const keepDt = r => !S.scope || r.dt_kode === S.scope;
  function tboard() {
    const t = DATA.total, q = S.q.trim().toLowerCase();
    const hit = r => !q || (r.nama + ' ' + r.kode + ' ' + r.dt_nama).toLowerCase().includes(q);
    const all = t.rows.filter(keepDt);
    if (S.scope) all.sort((a, b) => a.rankDt - b.rankDt);
    const ranked = all.map((r, i) => Object.assign({ ord: i }, r));
    return { ranked: ranked, list: ranked.filter(hit), low: t.belumCukup.filter(keepDt) };
  }
  const dots = r => '<div class="kdots" role="img" aria-label="' + esc(TK.map(c => { const k = r.kpi[c[0]]; return c[1] + ' ' + (noData(k) ? 'belum ada data' : p0(k.pct)); }).join(', ')) + '">' +
    TK.filter(c => r.kpi[c[0]]).map(c => { const k = r.kpi[c[0]]; return '<span class="kd" data-tone="' + (noData(k) ? '' : U.kpiTone(k.pct)) + '">' + c[2] + '</span>'; }).join('') + '</div>';
  function trow(r, sel) {
    const rk = rankOf(r), pod = r.rank != null && U.isMedal(rk, r.ord), ranked = r.rank != null;
    const lead = ranked ? (pod ? medal(rk) : '<span class="si rkn off" aria-label="Peringkat ' + rk + '">' + rk + '</span>') : '<span class="si rkn off" aria-hidden="true">–</span>';
    return '<div class="rk tap rk-total' + (pod ? ' pod' : '') + (mine(r) ? ' mine' : '') + (sel ? ' sel' : '') + '" role="button" tabindex="0" data-sel="' + esc(r.kode) + '" aria-haspopup="dialog"><div class="rk-h">' + lead +
      '<div class="it-i"><div class="nm">' + esc(r.nama) + (mine(r) ? ' <span class="tag b">DT Anda</span>' : '') + '</div><div class="sk">' + esc(r.dt_nama) + ' · ' + nf(r.n) + ' toko</div></div>' +
      '<span class="rk-val">' + sc1(r.skor) + '<small>dari 100</small></span></div>' +
      '<div class="bar" style="margin-top:10px;height:6px"><i style="width:' + Math.max(2, Math.min(100, r.skor)).toFixed(0) + '%"></i></div>' + dots(r) + '</div>';
  }
  function kpiLine(c, k) {
    const key = c[0], base = { id: 'sh-' + key, name: c[1] };
    if (noData(k)) return U.kpiRow(Object.assign(base, { p: NaN, big: '<span class="nodata">Belum ada data</span>', meta: '<span>Bobot ' + nf(k.bobot) + '</span>' }));
    const tone = U.kpiTone(k.pct), meta = '<span>Bobot ' + nf(k.bobot) + '</span><span>Poin ' + nf1(poin(k)) + ' dari ' + nf(k.bobot) + '</span>';
    const o = Object.assign(base, { p: k.pct, tone: tone, icon: U.stIcon(tone), meta: meta });
    if (key === 'ps') { o.big = nf(k.full) + ' Full · ' + nf(k.lite) + ' Lite'; o.detail = '<p class="hint">Dari ' + nf(k.n) + ' toko: ' + nf(k.full) + ' Full, ' + nf(k.lite) + ' Lite, ' + nf(Math.max(0, k.n - k.full - k.lite)) + ' belum Full atau Lite.</p>'; }
    else if (key === 'fop') { o.big = nf(k.weekly) + ' dari ' + nf(k.n) + ' toko'; o.target = p0(k.target) + ' toko'; o.detail = '<p class="hint">' + nf(k.weekly) + ' dari ' + nf(k.n) + ' toko WEEKLY (order di 3 minggu atau lebih bulan ini). Target ' + p0(k.target) + ' toko.</p>'; }
    else if (key === 'asrt') {
      o.big = nf(k.lines) + ' lines'; o.target = nf1(k.target) + ' lines';
      o.detail = U.barItem({ name: 'Lines aktual vs target', p: k.pct, tone: tone, left: nf(k.lines) + ' lines', right: 'Target ' + nf1(k.target) + ' (+15% vs Q4 2025)' }) +
        '<p class="hint">' + nf(k.tokoNaik) + ' dari ' + nf(k.n) + ' toko naik dari baseline. ' + nf(k.tanpaBaseline || 0) + ' toko tanpa baseline.</p>';
    } else if (key === 'banded') { o.big = nf(k.hit) + ' dari ' + nf(k.n) + ' toko'; o.target = p0(k.target) + ' toko'; o.detail = '<p class="hint">' + nf(k.hit) + ' dari ' + nf(k.n) + ' toko lolos Banded. Target ' + p0(k.target) + ' toko.</p>'; }
    else if (key === 'r2g') {
      o.big = p0(k.pct);
      const km = k.komponen;
      if (km) o.detail = [['ss', 'SS'], ['e2e', 'E2E'], ['e2s', 'E2S'], ['pastiUntung', 'Pasti Untung'], ['pastiLaku', 'Pasti Laku']].filter(x => km[x[0]]).map(x => {
        const c2 = km[x[0]]; return U.barItem({ name: x[1], p: c2.pct, tone: U.kpiTone(c2.pct), left: c2.t != null ? nf(c2.a) + ' dari ' + nf(c2.t) : '', right: '' });
      }).join('');
    }
    return U.kpiRow(o);
  }
  const trophy = svg(ICON_TROPHY);
  function sheet(r, ranked, open) {
    const rk = rankOf(r), N = ranked.length;
    const sub = esc(r.dt_nama) + ' · ' + (r.rank != null ? '#' + rk + ' dari ' + nf(N) : 'belum diperingkat') + ' · ' + nf(r.n) + ' toko';
    const lines = TK.filter(c => r.kpi[c[0]]).map(c => kpiLine(c, r.kpi[c[0]])).join('');
    let gap = '';
    if (r.rank == null) gap = 'Belum diperingkat: kurang dari ' + nf(DATA.minToko) + ' toko.';
    else { const prev = ranked.filter(x => rankOf(x) < rk).pop(); gap = prev ? '+' + nf1(prev.skor - r.skor) + ' poin' : 'Sudah peringkat teratas'; }
    const live = TK.filter(c => !noData(r.kpi[c[0]]) && r.kpi[c[0]]);
    let weak = null; live.forEach(c => { const k = r.kpi[c[0]], lost = k.bobot - poin(k); if (!weak || lost > weak.lost) weak = { name: c[1], lost: lost }; });
    return '<aside class="sheet card' + (open ? ' open' : '') + '" id="rkSheet" role="dialog" aria-labelledby="shT"><div class="card-head"><span class="ci">' + trophy + '</span><div class="ch-t"><h2 id="shT">' + esc(r.nama) + '</h2><p class="ch-s">' + sub + '</p></div>' +
      '<span class="sh-sc"><b>' + sc1(r.skor) + '</b><small>skor total</small></span><button type="button" class="sh-x" id="shX" data-shclose aria-label="Tutup rincian">' + svg(ICON_X) + '</button></div>' +
      '<div class="kpi-list">' + lines + '</div>' +
      '<div class="sh-foot"><div><small>Selisih ke peringkat di atas</small><b>' + gap + '</b></div>' + (weak ? '<div><small>Poin paling menentukan</small><b>' + esc(weak.name) + '</b><em>kurang ' + nf1(weak.lost) + ' poin</em></div>' : '') + '</div></aside>';
  }
  function renderTotal(el, rk) {
    const tb = tboard(), t = rk.total, all = tb.ranked.concat(tb.low);
    let cur = all.find(r => r.kode === S.sel);
    if (!cur) { S.open = false; if (wide() && all.length) cur = tb.ranked.find(mine) || tb.ranked[0] || all[0]; if (cur) S.sel = cur.kode; else S.sel = ''; }
    const open = !!(S.open && cur);
    document.body.classList.toggle('sheet-open', open);
    const failed = rk.dts.filter(d => d.status === 'error').map(d => d.nama);
    const bob = TK.filter(c => t.bobot && t.bobot[c[0]] != null).map(c => c[2] + ' ' + t.bobot[c[0]]).join(', ');
    const dn = tb.list.length, tot = tb.ranked.length;
    const q = '<div class="tb"><label class="sbox">' + svg(ICON_SEARCH) + '<input type="search" id="rkQ" placeholder="Cari nama atau kode salesman" autocomplete="off" value="' + esc(S.q) + '"><button type="button" class="clr" id="rkClr" aria-label="Hapus pencarian"' + (S.q ? '' : ' hidden') + '>' + svg(ICON_X) + '</button></label>' +
      '<div class="tb-meta"><span>' + (dn === tot ? nf(tot) : nf(dn) + ' dari ' + nf(tot)) + ' salesman</span></div></div>';
    const listHtml = !tot ? '<div class="empty">Belum ada data cukup untuk peringkat total. Minimal 3 KPI dan ' + nf(rk.minToko) + ' toko.</div>'
      : !dn ? '<div class="empty">Tidak ada salesman yang cocok. <button type="button" class="lnk" id="rkReset">Hapus pencarian</button></div>'
      : '<div class="rk-list rkn-list" id="rkList">' + tb.list.slice(0, S.limit).map(r => trow(r, cur && r.kode === S.sel && (open || wide()))).join('') + '</div>' + (dn > S.limit ? '<button type="button" class="btn plain more" id="rkMore">Tampilkan lebih banyak (' + nf(dn - S.limit) + ' lagi)</button>' : '');
    el.innerHTML = head('Skor total 5 KPI · data DMS s.d. ' + esc(tgl(rk.tanggalData))) + '<div class="rk-layout tot"><div class="rk-side ctl">' +
      '<details class="how"><summary>Cara baca</summary><p class="hint" style="margin:0">Skor total 0-100 dari lima KPI berbobot (' + esc(bob) + '). Titik di bawah nama: hijau 100% atau lebih, kuning 70-99%, merah di bawah 70%, abu belum ada data. Ketuk baris untuk melihat rincian lima KPI. Minimal ' + nf(rk.minToko) + ' toko untuk dapat peringkat.</p></details>' +
      segHtml() + (failed.length ? '<div class="notice">Ranking belum bisa dihitung untuk ' + esc(failed.join(', ')) + '.</div>' : '') + '</div>' +
      '<div class="rk-panel">' + q + listHtml + '</div>' + (cur ? sheet(cur, tb.ranked, open) + '<div class="sheet-scrim' + (open ? ' open' : '') + '" data-shclose></div>' : '') +
      '<div class="rk-side aft">' + (tb.low.length ? '<details class="box"><summary><span>Belum diperingkat (kurang dari ' + nf(rk.minToko) + ' toko) · ' + nf(tb.low.length) + '</span></summary><div class="rk-list" style="margin-top:10px">' + tb.low.map(r => trow(Object.assign({ ord: 99 }, r), cur && r.kode === S.sel && (open || wide()))).join('') + '</div></details>' : '') +
      '<div class="row"><button type="button" class="btn main ic" id="rkWa">Kirim ke WhatsApp</button><button type="button" class="btn plain ic" id="rkCopy">Salin teks</button></div></div></div>';
  }
  const segHtml = () => hasTotal() ? '<div class="chips" id="rkMode" role="group" aria-label="Pilih papan"><button type="button" data-mode="total" aria-pressed="' + (S.mode === 'total') + '">Total</button><button type="button" data-mode="kpi" aria-pressed="' + (S.mode === 'kpi') + '">Per KPI</button></div>' : '';
  function textTotal() {
    const tb = tboard(), dn = S.scope ? (DATA.dts.find(x => x.kode === S.scope) || {}).nama : 'Semua DT', L = [];
    L.push('*RANKING TOTAL SALES* (' + dn + ')', 'Skor 0-100 dari 5 KPI berbobot · data DMS s.d. ' + tgl(DATA.tanggalData) + ' · minimal ' + DATA.minToko + ' toko', '');
    tb.ranked.slice(0, 10).forEach(r => {
      const low = TK.filter(c => !noData(r.kpi[c[0]])).sort((a, b) => r.kpi[a[0]].pct - r.kpi[b[0]].pct).slice(0, 3).map(c => c[1] + ' ' + p0(r.kpi[c[0]].pct)).join(', ');
      L.push(rankOf(r) + '. ' + r.nama + ' (' + r.dt_nama + ') ' + sc1(r.skor) + (low ? ' · terendah: ' + low : ''));
    });
    if (!tb.ranked.length) L.push('Belum ada salesman yang cukup toko.');
    L.push('', 'Detail: ' + location.href.split('?')[0].split('#')[0]);
    return L.join('\n');
  }
  function closeSheet() { const k = S.sel; S.open = false; render(); const el = k && document.querySelector('[data-sel="' + k.replace(/"/g, '') + '"]'); if (el) el.focus(); }
  function pick(k) { S.sel = k; S.open = true; render(); const x = wide() ? document.querySelector('[data-sel="' + k.replace(/"/g, '') + '"]') : $('shX'); if (x) x.focus(); }

  /* ---- tampil ---- */
  function render() {
    const rk = DATA, el = $('rkCard');
    const dtName = k => { const d = rk.dts.find(x => x.kode === k); return d ? d.nama : k; };
    $('csUpdated').textContent = rk.tanggalData ? 'Data s.d. ' + tgl(rk.tanggalData) : '';
    $('csSub').textContent = S.scope ? dtName(S.scope) : 'Semua DT';
    window.MHFresh.set({ info: rk.tanggalData ? window.MHFresh.status(rk.tanggalData, { label: 'Ranking', stale: 2 }) : null });
    $('dtChips').innerHTML = [['', 'Semua DT']].concat(rk.dts.map(d => [d.kode, d.nama || d.kode])).map(c => '<button type="button" data-dt="' + esc(c[0]) + '" aria-pressed="' + (c[0] === S.scope) + '">' + esc(c[1]) + '</button>').join('');
    if (!hasTotal()) S.mode = 'kpi'; else if (!S.mode) S.mode = 'total';
    document.body.classList.toggle('sheet-open', false);
    if (S.mode === 'total') { renderTotal(el, rk); return; }
    const buKeys = Object.keys(bus());
    if (!buKeys.length) { el.innerHTML = head('') + '<div class="empty">Belum ada data ranking. Upload Extract DMS dan daftar toko monitoring di tool upload, lalu ketuk muat ulang.</div>'; return; }
    const bd = board(), b = bus();
    const buChips = buKeys.map(k => '<button type="button" data-bu="' + esc(k) + '" aria-pressed="' + (k === S.bu) + '">' + esc(b[k].label) + '</button>').join('');
    const cnt = k => b[S.bu][k].filter(r => !S.scope || r.dt_kode === S.scope).length;
    const kpiChips = KPI.map(c => '<button type="button" data-kpi="' + c[0] + '" aria-pressed="' + (c[0] === S.kpi) + '">' + c[1] + ' <b>' + nf(cnt(c[0])) + '</b></button>').join('');
    const notes = [];
    if (bd.bu.belumTransaksi > 0 && !S.scope) notes.push(nf(bd.bu.belumTransaksi) + ' toko monitoring belum bertransaksi di BU ini, jadi belum ikut peringkat.');
    const failed = rk.dts.filter(d => d.status === 'error').map(d => d.nama);
    if (failed.length) notes.push('Ranking belum bisa dihitung untuk ' + failed.join(', ') + '.');
    const what = S.kpi === 'fop' ? 'Persen toko yang WEEKLY (order di 3 minggu atau lebih bulan ini).' : S.kpi === 'banded' ? 'Persen toko yang tercapai Banded kuartal ini, hanya SKU banded BU ini.' : 'Rata-rata lines (base pack) per toko aktif di BU ini.';
    const q = S.q.trim().toLowerCase();
    const list = bd.ranked.filter(r => !q || (r.nama + ' ' + r.kode + ' ' + r.dt_nama).toLowerCase().includes(q));
    const shown = list.slice(0, S.limit);
    el.innerHTML = head('Data DMS s.d. ' + esc(tgl(rk.tanggalData))) + '<div class="rk-layout"><div class="rk-side">' +
      '<details class="how"><summary>Cara baca</summary><p class="hint" style="margin:0">Peringkat salesman per BU, dari toko yang dilayani bulan ini. Dihitung dari Extract DMS sampai ' + esc(tgl(rk.tanggalData)) + '. ' + what +
      ' Minimal ' + nf(rk.minToko) + ' toko untuk dapat peringkat. Pilih Semua DT untuk peringkat gabungan, atau satu DT untuk peringkat di dalam DT itu.</p></details>' +
      segHtml() + '<div class="chips" id="rkBu" role="group" aria-label="Pilih BU">' + buChips + '</div><div class="chips" id="rkKpi" role="group" aria-label="Pilih KPI">' + kpiChips + '</div>' +
      (notes.length ? '<div class="notice">' + notes.map(esc).join('<br>') + '</div>' : '') +
      (bd.low.length ? '<details class="box"><summary><span>Belum cukup toko (kurang dari ' + nf(rk.minToko) + ') · ' + nf(bd.low.length) + '</span></summary><div class="rk-list" style="margin-top:10px">' + bd.low.slice(0, 60).map(lowRow).join('') + '</div></details>' : '') +
      '<div class="row"><button type="button" class="btn main ic" id="rkWa">Kirim ke WhatsApp</button><button type="button" class="btn plain ic" id="rkCopy">Salin teks</button></div></div>' +
      '<div class="rk-panel"><div class="tb"><label class="sbox">' + svg(ICON_SEARCH) + '<input type="search" id="rkQ" placeholder="Cari nama atau kode salesman" autocomplete="off" value="' + esc(S.q) + '"><button type="button" class="clr" id="rkClr" aria-label="Hapus pencarian"' + (S.q ? '' : ' hidden') + '>' + svg(ICON_X) + '</button></label>' +
      '<div class="tb-meta"><span>' + (list.length === bd.ranked.length ? nf(bd.ranked.length) : nf(list.length) + ' dari ' + nf(bd.ranked.length)) + ' salesman</span></div></div>' +
      (!bd.ranked.length ? '<div class="empty">' + (S.scope ? 'Belum ada salesman di DT ini yang cukup toko untuk diberi peringkat. Pilih Semua DT atau BU lain.' : 'Belum ada salesman yang cukup toko untuk diberi peringkat di KPI ini. Coba BU atau KPI lain.') + '</div>'
        : !list.length ? '<div class="empty">Tidak ada salesman yang cocok. <button type="button" class="lnk" id="rkReset">Hapus pencarian</button></div>'
        : '<div class="rk-list rkn-list" id="rkList">' + shown.map(r => row(r, bd.top)).join('') + '</div>' + (list.length > shown.length ? '<button type="button" class="btn plain more" id="rkMore">Tampilkan lebih banyak (' + nf(list.length - shown.length) + ' lagi)</button>' : '')) +
      '</div></div>';
  }
  /* Render ulang tanpa kehilangan fokus kolom cari. */
  function renderKeepQ() {
    const had = document.activeElement && document.activeElement.id === 'rkQ';
    render();
    if (had) { const i = $('rkQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  /** Teks 5 teratas BU, KPI, dan lingkup yang sedang dibuka, untuk grup WhatsApp. */
  function text() {
    if (S.mode === 'total') return textTotal();
    const bd = board(), L = [], kpi = KPI.find(c => c[0] === S.kpi)[1];
    const dn = S.scope ? (DATA.dts.find(x => x.kode === S.scope) || {}).nama : 'Semua DT';
    L.push('*RANKING SALES ' + (bd.bu ? bd.bu.label.toUpperCase() : '') + ' - ' + kpi.toUpperCase() + '* (' + dn + ')');
    L.push('Data DMS s.d. ' + tgl(DATA.tanggalData) + ' · minimal ' + DATA.minToko + ' toko', '');
    bd.ranked.slice(0, 5).forEach(r => L.push(rankOf(r) + '. ' + r.nama + ' (' + r.dt_nama + ') ' + valTxt(r) + ' · ' + r.n + ' toko'));
    if (!bd.ranked.length) L.push('Belum ada salesman yang cukup toko.');
    L.push('', 'Detail: ' + location.href.split('?')[0].split('#')[0]);
    return L.join('\n');
  }

  function enter(d, code) {
    DATA = d; CODE = code;
    try { localStorage.setItem(LS_CODE, code); } catch (e) { /* mode privat */ }
    if (S.scope && !d.dts.some(x => x.kode === S.scope)) S.scope = '';
    window.MHBoot.done();
    $('loginScreen').hidden = true; $('appScreen').hidden = false;
    render();
  }
  async function login(code, silent, noCache) {
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Memeriksa kode…'; }
    let c = silent && !noCache ? readCache(code) : null;
    /* Salinan dari versi lama / bentuk lain bisa membuat enter() melempar. Jangan macet di "Memuat": buang salinan dan ambil dari jaringan. */
    const dropBad = () => { c = null; DATA = null; try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } $('appScreen').hidden = true; $('loginScreen').hidden = false; };
    if (c && c.data && c.data.mode === 'rank') { try { enter(c.data, code); note('wait'); } catch (e) { dropBad(); } }
    try {
      const d = await fetchRank(code);
      if (d.error === 'invalid_code') { problem('Kode tidak cocok. Periksa huruf besar/kecil atau minta kode baru.', silent, true); return false; }
      if (d.error) { if (c) { note('off'); banner('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.'); } else problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return false; }
      if (d.mode !== 'rank') { problem('API belum diperbarui. Deploy ulang Apps Script.', silent, false); return false; }
      writeCache(code, d); enter(d, code); banner(''); note('done');
      return true;
    } catch (err) {
      if (c || DATA) { note('off'); banner('Gagal memperbarui, ini data tersimpan. Ketuk muat ulang untuk coba lagi.'); return false; }
      problem('Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
      return false;
    }
  }

  document.addEventListener('click', e => {
    const md = e.target.closest('[data-mode]'); if (md) { S.mode = md.dataset.mode; S.limit = 60; S.open = false; render(); return; }
    if (e.target.closest('[data-shclose]')) { closeSheet(); return; }
    const sl = e.target.closest('[data-sel]'); if (sl) { pick(sl.dataset.sel); return; }
    const dt = e.target.closest('[data-dt]'); if (dt) { S.scope = dt.dataset.dt; S.limit = 60; render(); return; }
    const bu = e.target.closest('[data-bu]'); if (bu) { S.bu = bu.dataset.bu; S.limit = 60; render(); return; }
    const kp = e.target.closest('[data-kpi]'); if (kp) { S.kpi = kp.dataset.kpi; S.limit = 60; render(); return; }
    if (e.target.closest('#rkMore')) { S.limit += 60; render(); return; }
    if (e.target.closest('#rkClr') || e.target.closest('#rkReset')) { S.q = ''; S.limit = 60; render(); return; }
    if (e.target.closest('#rkWa')) { window.open('https://wa.me/?text=' + encodeURIComponent(text()), '_blank'); return; }
    if (e.target.closest('#rkCopy')) { navigator.clipboard.writeText(text()).then(() => toast('Teks ranking disalin. Tempel di grup WhatsApp.'), () => toast('Browser tidak mengizinkan salin otomatis. Pakai tombol WhatsApp.')); return; }
    $('syncPop').hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.open) { e.preventDefault(); closeSheet(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-sel]')) { e.preventDefault(); pick(e.target.dataset.sel); }
  });
  if (window.matchMedia) window.matchMedia('(min-width:1200px)').addEventListener('change', () => { if (DATA && S.mode === 'total') render(); });
  document.addEventListener('input', e => { if (e.target.id === 'rkQ') { S.q = e.target.value; S.limit = 60; renderKeepQ(); } });
  $('loginForm').addEventListener('submit', e => { e.preventDefault(); const code = $('codeInput').value.trim(); if (!code) { $('loginErr').textContent = 'Isi kode akses dulu.'; return; } $('loginErr').textContent = ''; login(code); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } location.reload(); });
  let refreshing = false;   // satu permintaan segarkan sekaligus: klik berulang tidak menumpuk permintaan ke Apps Script
  $('refreshBtn').addEventListener('click', () => {
    if (refreshing) return; refreshing = true;
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    banner(''); note('wait'); login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); }).finally(() => { refreshing = false; });
  });

  window.MHFresh.bind();
  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
