/* Ranking sales bersama: gabungan semua DT atau per DT, terbuka untuk akun mana pun. Data dari Apps Script ?view=rank.
   Angka dan urutan dari server; di sini hanya ditampilkan. Server hanya mengirim bidang aman (rankPublicRow_), tanpa toko/SKU/omzet. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const CACHE_KEY = 'mh_rank_cache';
  const $ = id => document.getElementById(id);
  const esc = window.MHUtil.esc;
  const BLS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + BLS[+m[2]] + ' ' + m[1] : String(iso || ''); };
  const nf = v => Math.round(v).toLocaleString('id-ID');
  const nf1 = v => (Math.round(v * 10) / 10).toLocaleString('id-ID');
  const pct = v => v == null ? '-' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const KPI = [['fop', 'FOP'], ['banded', 'Banded'], ['asrt', 'Assortment']];
  let DATA = null, CODE = '';
  const S = { scope: '', bu: '', kpi: 'fop', q: '', limit: 60 };   // scope '' = Semua DT

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

  /* ---- tampil ---- */
  function render() {
    const rk = DATA, el = $('rkCard');
    const dtName = k => { const d = rk.dts.find(x => x.kode === k); return d ? d.nama : k; };
    $('csUpdated').textContent = rk.tanggalData ? 'Data s.d. ' + tgl(rk.tanggalData) : '';
    $('csSub').textContent = S.scope ? dtName(S.scope) : 'Semua DT';
    window.MHFresh.set({ info: rk.tanggalData ? window.MHFresh.status(rk.tanggalData, { label: 'Ranking', stale: 2 }) : null });
    $('dtChips').innerHTML = [['', 'Semua DT']].concat(rk.dts.map(d => [d.kode, d.nama || d.kode])).map(c => '<button type="button" data-dt="' + esc(c[0]) + '" aria-pressed="' + (c[0] === S.scope) + '">' + esc(c[1]) + '</button>').join('');
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
      '<div class="chips" id="rkBu" role="group" aria-label="Pilih BU">' + buChips + '</div><div class="chips" id="rkKpi" role="group" aria-label="Pilih KPI">' + kpiChips + '</div>' +
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
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Menghubungkan…'; }
    const c = silent && !noCache ? readCache(code) : null;
    if (c && c.data && c.data.mode === 'rank') { enter(c.data, code); note('wait'); }
    try {
      const d = await fetchRank(code);
      if (d.error === 'invalid_code') { problem('Kode akses salah.', silent, true); return false; }
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
    const dt = e.target.closest('[data-dt]'); if (dt) { S.scope = dt.dataset.dt; S.limit = 60; render(); return; }
    const bu = e.target.closest('[data-bu]'); if (bu) { S.bu = bu.dataset.bu; S.limit = 60; render(); return; }
    const kp = e.target.closest('[data-kpi]'); if (kp) { S.kpi = kp.dataset.kpi; S.limit = 60; render(); return; }
    if (e.target.closest('#rkMore')) { S.limit += 60; render(); return; }
    if (e.target.closest('#rkClr') || e.target.closest('#rkReset')) { S.q = ''; S.limit = 60; render(); return; }
    if (e.target.closest('#rkWa')) { window.open('https://wa.me/?text=' + encodeURIComponent(text()), '_blank'); return; }
    if (e.target.closest('#rkCopy')) { navigator.clipboard.writeText(text()).then(() => toast('Teks ranking disalin. Tempel di grup WhatsApp.'), () => toast('Browser tidak mengizinkan salin otomatis. Pakai tombol WhatsApp.')); return; }
    $('syncPop').hidden = true;
  });
  document.addEventListener('input', e => { if (e.target.id === 'rkQ') { S.q = e.target.value; S.limit = 60; renderKeepQ(); } });
  $('loginForm').addEventListener('submit', e => { e.preventDefault(); $('loginErr').textContent = ''; login($('codeInput').value.trim()); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } location.reload(); });
  $('refreshBtn').addEventListener('click', () => {
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    banner(''); note('wait'); login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); });
  });

  window.MHFresh.bind();
  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
