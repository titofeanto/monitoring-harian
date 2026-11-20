/* Menu Kategori: analisa toko per Category Key, tampilan dan rumus mengikuti By Category v3 di Power BI.
   Data dari Apps Script ?view=kategori (pra-agregat per toko x category x brand); hitungan di assets/kat-calc.js.
   Semua teks dari Sheet lewat esc(); tidak ada innerHTML mentah dari data. Peta berkunci teks memakai Object.create(null). */
(function () {
  const LS_CODE = 'mh_code';   // sama dengan halaman lain, tanpa login ulang
  const CACHE_KEY = 'mh_kat_cache';
  const $ = id => document.getElementById(id);
  const esc = window.MHUtil.esc, K = window.MHKat;
  const TABS = ['bycat', 'byout', 'insight', 'logika'];
  const S = { basis: 'weekly', dt: '', sm: '', ch: '', div: '', cat: '', br: '', tab: 'bycat', open: new Set(), closed: new Set(), icat: '', store: '' };
  let DATA = null, ROWS = [], BYTOKO = [], CODE = '', KK = null;

  async function fetchKat(code) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'view=kategori&code=' + encodeURIComponent(code);
    let last;
    for (let i = 0; i < 4; i++) {   // Apps Script kadang membalas 404 sesaat
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

  /* ---------- filter ---------- */
  const tokoOk = tk => (!S.dt || tk.dt === S.dt) && (!S.sm || String(tk.sm) === S.sm) && (!S.ch || tk.ch === S.ch);
  const brOk = br => (!S.div || br.division === S.div) && (!S.cat || br.category === S.cat) && (!S.br || br.brand === S.br);
  const items = () => ROWS.filter(p => tokoOk(p.tk) && brOk(p.br));
  const storesOn = () => { const o = []; DATA.tokos.forEach((tk, i) => { if (tokoOk(tk)) o.push(i); }); return o; };
  const itemsOf = ti => BYTOKO[ti].filter(p => brOk(p.br));
  const uniq = a => [...new Set(a)];
  const mkOpts = (list, all, cur) => '<option value="">' + esc(all) + '</option>' + list.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  const sel = (id, label, html) => '<label class="kt-f" for="' + id + '"><span>' + label + '</span><select id="' + id + '">' + html + '</select></label>';

  function filtersHtml() {
    const d = DATA, multiDt = d.dts.length > 1;
    const sms = d.salesmen.map((s, i) => [String(i), s.nama + (multiDt ? ' (' + s.dt + ')' : '')]).filter(([i]) => !S.dt || d.salesmen[+i].dt === S.dt);
    if (d.salesmen.length && d.tokos.some(t => t.sm < 0)) sms.push(['-1', K.NO_SM]);
    const chs = uniq(d.tokos.map(t => t.ch).filter(Boolean)).sort();
    const divs = uniq(d.brands.map(b => b.division)).sort();
    const cats = uniq(d.brands.filter(b => !S.div || b.division === S.div).map(b => b.category)).sort();
    const brs = uniq(d.brands.filter(b => (!S.div || b.division === S.div) && (!S.cat || b.category === S.cat)).map(b => b.brand)).sort();
    return (multiDt ? sel('ktDt', 'Distributor', mkOpts(d.dts.map(x => [x.kode, x.nama]), 'Semua distributor', S.dt)) : '') +
      (sms.length ? sel('ktSm', 'Salesman', mkOpts(sms, 'Semua salesman', S.sm)) : '') +
      sel('ktCh', 'Channel', mkOpts(chs.map(c => [c, c]), 'Semua channel', S.ch)) +
      sel('ktDiv', 'Division', mkOpts(divs.map(c => [c, c]), 'Semua division', S.div)) +
      sel('ktCat', 'Category', mkOpts(cats.map(c => [c, c]), 'Semua category', S.cat)) +
      sel('ktBr', 'Brand', mkOpts(brs.map(c => [c, c]), 'Semua brand', S.br));
  }
  const onFilter = {
    ktDt: v => { S.dt = v; S.sm = ''; }, ktSm: v => { S.sm = v; }, ktCh: v => { S.ch = v; },
    ktDiv: v => { S.div = v; S.cat = ''; S.br = ''; }, ktCat: v => { S.cat = v; S.br = ''; }, ktBr: v => { S.br = v; },
  };

  /* ---------- tabel pivot ---------- */
  function pivot(title, rowHead, rows, tot, noteTxt) {
    const C = K.cols(S.basis);
    const th = C.map(c => c.sp ? '<th class="kt-sp" aria-hidden="true"></th>' : '<th scope="col">' + c.h + '</th>').join('');
    const cell = (c, m) => c.sp ? '<td class="kt-sp"></td>' : c.bar
      ? '<td class="kt-c kt-db"><i style="width:' + Math.max(0, Math.min(100, c.bar(m, tot) * 220)).toFixed(0) + '%"></i><span>' + c.v(m, tot) + '</span></td>'
      : '<td' + (c.c ? ' class="kt-c"' : '') + '>' + c.v(m, tot) + '</td>';
    const tr = r => '<tr class="kt-l' + r.lv + '"><th scope="row" class="kt-rh" style="padding-left:' + (8 + (r.lv - 1) * 16) + 'px">' +
      (r.kids ? '<button type="button" class="kt-ex" data-k="' + esc(r.key) + '" aria-expanded="' + r.open + '"><span class="kt-ar" aria-hidden="true">' + (r.open ? '▾' : '▸') + '</span><span class="kt-lbl">' + esc(r.label) + '</span></button>'
        : '<span class="kt-lbl kt-leaf">' + esc(r.label) + '</span>') + '</th>' + C.map(c => cell(c, r.m)).join('') + '</tr>';
    const total = '<tr class="kt-tot"><th scope="row" class="kt-rh"><span class="kt-lbl kt-leaf">Total</span></th>' +
      C.map(c => c.sp ? '<td class="kt-sp"></td>' : '<td' + (c.c ? ' class="kt-c"' : '') + '>' + (c.bar ? c.tot : c.v(tot, tot)) + '</td>').join('') + '</tr>';
    return '<section class="card kt-card"><h2>' + esc(title) + '</h2>' + (noteTxt ? '<p class="hint">' + esc(noteTxt) + '</p>' : '') +
      '<div class="kt-pv" tabindex="0" role="region" aria-label="' + esc(title) + ', tabel dapat digeser"><table class="kt-pivot"><thead><tr><th class="kt-rh" scope="col">' + esc(rowHead) + '</th>' + th + '</tr></thead><tbody>' +
      rows.map(tr).join('') + total + '</tbody></table></div></section>';
  }
  const unit = () => S.basis === 'weekly' ? 'minggu' : 'bulan';
  const note1 = () => 'GSV rupiah. AVG dan RR dalam rata-rata per ' + unit() + '. ' + (S.basis === 'weekly' ? 'L3W, L2W, LW' : 'L3M, L2M, LM') + ' dalam jutaan. Ketuk nama baris untuk membuka atau menutup.';

  /* ---------- grafik area GSV per bulan (TY vs LY) ---------- */
  function areaChart(m) {
    const el = $('ktPanel'), W = Math.max(280, Math.round((el.clientWidth || 340) - 34)), H = 230, L = 50, Bt = 26, T = 10, R = 10;
    const cm = +DATA.cutoff.slice(5, 7) - 1, yr = DATA.cutoff.slice(0, 4);
    const mx = Math.max(...m.mty.slice(0, cm + 1), ...m.mly, 1) * 1.1;
    const x = i => L + i * (W - L - R) / 11, y = v => T + (H - T - Bt) * (1 - v / mx);
    const pts = (a, upto) => a.slice(0, upto + 1).map((v, i) => x(i).toFixed(1) + ' ' + Math.max(T, y(v)).toFixed(1));
    const line = (a, upto) => 'M' + pts(a, upto).join('L'), area = (a, upto) => line(a, upto) + 'L' + x(upto).toFixed(1) + ' ' + y(0).toFixed(1) + 'L' + x(0).toFixed(1) + ' ' + y(0).toFixed(1) + 'Z';
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = mx * k / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="kt-gl"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="kt-ax">' + K.fM(v) + '</text>'; }
    const step = (W - L - R) / 11 < 30 ? 2 : 1;
    const labels = K.BULAN.map((b, i) => i % step ? '' : '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" class="kt-ax">' + b + '</text>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Tren GSV per bulan, ' + yr + ' dibanding ' + (yr - 1) + '">' + g + labels +
      '<path d="' + area(m.mly, 11) + '" class="kt-ar-ly"/><path d="' + line(m.mly, 11) + '" class="kt-ln-ly"/>' +
      '<path d="' + area(m.mty, cm) + '" class="kt-ar-ty"/><path d="' + line(m.mty, cm) + '" class="kt-ln-ty"/><circle cx="' + x(cm).toFixed(1) + '" cy="' + Math.max(T, y(m.mty[cm])).toFixed(1) + '" r="4" class="kt-dot"/></svg>' +
      '<div class="kt-legend"><span><i class="kt-sw-ty"></i>' + yr + '</span><span><i class="kt-sw-ly"></i>' + (yr - 1) + '</span><span>' + esc(K.BULAN[cm]) + ' ' + yr + ' baru sampai ' + (+DATA.cutoff.slice(8, 10)) + '</span></div>';
  }

  /* ---------- stok SOH per kategori (fase 1) ---------- */
  function stokCard() {
    const st = DATA.stok; if (!st || !st.rows.length) return '';
    const divOf = Object.create(null); DATA.brands.forEach(b => { divOf[b.category] = b.division; });
    const rows = st.rows.filter(r => (!S.dt || r[0] === S.dt) && (!S.cat || r[1] === S.cat) && (!S.div || divOf[r[1]] === S.div));
    if (!rows.length) return '';
    const nama = Object.create(null); DATA.dts.forEach(d => { nama[d.kode] = d.nama; });
    const tgl = DATA.dts.filter(d => st.tanggal[d.kode] && (!S.dt || d.kode === S.dt)).map(d => esc(d.nama) + ' ' + K.dateLabel(st.tanggal[d.kode])).join(', ');
    return '<section class="card kt-card"><h2>Stok gudang per kategori</h2><p class="hint">SOH dalam karton (ekuivalen), stok terbaru: ' + tgl + '. RR in CS, W.C, dan In transit belum tersedia, butuh qty penjualan karton per kategori yang belum ada di data.</p>' +
      '<div class="kt-pv" tabindex="0" role="region" aria-label="Stok gudang per kategori, tabel dapat digeser"><table class="kt-pivot kt-small"><thead><tr><th class="kt-rh" scope="col">Distributor / Category</th><th scope="col">SOH (CS)</th><th scope="col">RR in CS</th><th scope="col">W.C</th><th scope="col">In transit</th></tr></thead><tbody>' +
      rows.map(r => '<tr><th scope="row" class="kt-rh"><span class="kt-lbl kt-leaf">' + esc(nama[r[0]] || r[0]) + ' / ' + esc(r[1]) + '</span></th><td>' + K.fN(r[2]) + '</td><td class="kt-na">belum tersedia</td><td class="kt-na">belum tersedia</td><td class="kt-na">belum tersedia</td></tr>').join('') +
      '</tbody></table></div></section>';
  }

  /* ---------- panel ---------- */
  function noToko() { return '<section class="card kt-card"><p class="kt-empty">Tidak ada toko pada filter ini. Ubah distributor, salesman, atau channel.</p></section>'; }
  function pBycat() {
    const its = items(), tot = K.M(its, S.basis, KK);
    return pivot('SS Performance', 'Division / Category / Brand', K.rowsCategory(its, S.basis, KK, S.open), tot, note1()) +
      '<section class="card kt-card"><h2>Tren GSV</h2><p class="hint">Area per bulan, tahun ini lawan tahun lalu, sesuai filter di atas.</p>' + areaChart(tot) + '</section>' + stokCard();
  }
  function pByout() {
    const its = items(), tot = K.M(its, S.basis, KK);
    return pivot('By Outlet', 'Salesman / Outlet', K.rowsOutlet(its, DATA.salesmen, S.basis, KK, S.closed), tot, 'Pilih Division, Category, atau Brand di atas untuk melihat toko pada kategori itu. ' + note1());
  }
  const smName = tk => tk.sm >= 0 ? DATA.salesmen[tk.sm].nama : K.NO_SM;
  function pInsight() {
    const st = storesOn(); if (!st.length) return noToko();
    const cats = uniq(DATA.brands.filter(b => (!S.div || b.division === S.div) && (!S.cat || b.category === S.cat)).map(b => b.category)).sort();
    if (!cats.length) return noToko();
    if (cats.indexOf(S.icat) < 0) S.icat = cats[0];
    const r = K.insight(st, itemsOf, S.icat, S.basis, KK, DATA.tokos);
    const li = (x, right) => '<li><div class="kt-l"><b>' + esc(x.tk.nama) + '</b><span class="kt-sm">' + esc(x.tk.dt) + ' · ' + esc(smName(x.tk)) + ' · ' + esc(x.tk.ch) + '</span></div><div class="kt-r">' + right + '</div></li>';
    const list = (arr, fn, kosong) => '<ul class="kt-ul">' + (arr.length ? arr.map(fn).join('') : '<li class="kt-sm">' + kosong + '</li>') + '</ul>';
    return '<section class="card kt-card"><h2>Insight toko</h2><p class="hint">Pilih kategori. Daftar mengikuti filter di atas.</p>' +
      '<div class="kt-pills" role="group" aria-label="Kategori">' + cats.map(c => '<button type="button" data-pc="' + esc(c) + '" aria-pressed="' + (c === S.icat) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<p class="hint kt-sum">' + r.buyers + ' dari ' + r.aktif + ' toko aktif membeli ' + esc(S.icat) + ' dalam 3 bulan terakhir (penetrasi ' + Math.round(r.penetrasi * 100) + '%). Growth A2A ' + K.fG(r.tot.a2a) + '.</p></section>' +
      '<div class="kt-row2"><section class="card kt-card"><h2>Perlu dikejar</h2><p class="hint">Berhenti beli 3 bulan terakhir, atau Growth SP turun lebih dari 20%.</p>' +
        list(r.turun, x => li(x, x.m.l3 === 0 ? '<span class="kt-tag kt-tdown">Berhenti beli</span>' : K.fG(x.m.sp)), 'Tidak ada.') + '</section>' +
      '<section class="card kt-card"><h2>Peluang tambah toko</h2><p class="hint">Toko aktif yang belum pernah beli ' + esc(S.icat) + '. Angka kanan: perkiraan RR 13 dari median toko sejenis yang sudah beli.</p>' +
        list(r.pel, x => li(x, '<b>' + K.fN(x.pot) + '</b>'), 'Semua toko aktif sudah pernah beli.') + '</section></div>' +
      '<section class="card kt-card"><h2>Toko yang naik</h2><p class="hint">Growth SP lebih dari +20%.</p>' + list(r.naik, x => li(x, K.fG(x.m.sp)), 'Belum ada.') + '</section>' + pToko(st, cats);
  }
  function pToko(st, cats) {
    if (st.indexOf(+S.store) < 0 || S.store === '') S.store = String(st[0]);
    const ti = +S.store, tk = DATA.tokos[ti], c = K.composition(st, itemsOf, ti, cats, S.basis, KK, DATA.tokos);
    const tag = { aktif: ['kt-tup', 'Aktif'], bawah: ['kt-twarn', 'Di bawah rata-rata'], berhenti: ['kt-tdown', 'Berhenti'], belum: ['', 'Belum pernah'] };
    return '<section class="card kt-card"><h2>Komposisi kategori per toko</h2><label class="kt-f kt-wide" for="ktStore"><span>Pilih toko</span><select id="ktStore">' +
      st.map(i => '<option value="' + i + '"' + (i === ti ? ' selected' : '') + '>' + esc(DATA.tokos[i].id) + ' - ' + esc(DATA.tokos[i].nama) + ' · ' + esc(DATA.tokos[i].dt) + '</option>').join('') + '</select></label>' +
      '<p class="hint">' + esc(tk.nama) + ' · ' + esc(smName(tk)) + ' · ' + esc(tk.ch) + '. Dibanding rata-rata ' + c.peers + ' toko ' + esc(tk.ch) + ' lain pada filter.</p>' +
      '<div class="kt-pv" tabindex="0" role="region" aria-label="Komposisi kategori toko, tabel dapat digeser"><table class="kt-pivot kt-small"><thead><tr><th class="kt-rh" scope="col">Category</th><th scope="col">ABS YTD TY</th><th scope="col">Porsi toko</th><th scope="col">Porsi rata-rata</th><th scope="col">Growth A2A</th><th scope="col">Status</th></tr></thead><tbody>' +
      c.rows.map(r => '<tr><th scope="row" class="kt-rh"><span class="kt-lbl kt-leaf">' + esc(r.cat) + '</span></th><td>' + K.fN(r.m.ty) + '</td><td>' + K.fP(r.mix) + '</td><td>' + K.fP(r.pm) + '</td><td class="kt-c">' + K.fG(r.m.a2a) + '</td><td class="kt-c"><span class="kt-tag ' + tag[r.status][0] + '">' + tag[r.status][1] + '</span></td></tr>').join('') +
      '</tbody></table></div></section>';
  }
  function pLogika() {
    const dl = [
      ['ABS YTD TY', 'GSV 1 Jan sampai cutoff. Cutoff = hari Minggu terakhir pada atau sebelum tanggal data terakhir.'],
      ['ABS YTD LY, ABS FY LY', 'GSV tahun lalu pada rentang hari yang sama (cutoff dikurangi 364 hari), dan GSV satu tahun penuh tahun lalu.'],
      ['Contr TY, Contr LY', 'Nilai baris dibagi total semua baris, jadi porsi terhadap total filter.'],
      ['AVG YTD TY, AVG SP LY, AVG FY LY', 'GSV dibagi jumlah hari, dikali hari basis: 7 untuk Weekly, 365/12 untuk Monthly.'],
      ['Growth SP, Growth A2A', 'AVG YTD TY dibagi AVG SP LY, dan dibagi AVG FY LY, masing-masing dikurangi 1. Kosong bila pembanding 0.'],
      ['RR 13, RR 5', 'GSV 91 hari (35 hari untuk RR 5) terakhir dibagi 13 (5), dibagi 7, dikali hari basis.'],
      ['L3W, L2W, LW / L3M, L2M, LM', 'GSV per minggu penuh terakhir, atau per bulan penuh terakhir, dalam jutaan.'],
      ['Toko aktif, penetrasi', 'Toko dengan GSV lebih dari 0 sejak awal bulan ke-3 terakhir (Active Outlet L3M). Penetrasi kategori = toko aktif yang beli kategori itu dibagi toko aktif.'],
      ['Perlu dikejar, Peluang', 'Aturan tambahan, belum ada di Power BI. Berhenti beli: pernah beli, GSV 3 bulan terakhir 0. Peluang: toko aktif yang belum pernah beli kategori itu; perkiraan = median RR 13 toko sejenis yang sudah beli.'],
    ];
    const c = DATA.catatan || {}, cat = [];
    if (c.tanggalRusak) cat.push(c.tanggalRusak + ' baris dengan tanggal atau periode rusak dibuang');
    if (c.gsvRusak) cat.push(c.gsvRusak + ' baris dengan GSV bukan angka dibuang');
    if (c.tokoTakDikenal) cat.push(c.tokoTakDikenal + ' baris dengan toko yang tidak ada di GS_TOKO dibuang');
    if (c.mingguLintasBulan) cat.push(c.mingguLintasBulan + ' baris minggu melintasi bulan atau cutoff dibuang');
    if (c.lewatCutoff) cat.push(c.lewatCutoff + ' baris minggu setelah cutoff diabaikan');
    if (c.skuTanpaKategori) cat.push(c.skuTanpaKategori + ' SKU stok belum dipetakan ke kategori (dijumlah ke Tanpa kategori)');
    if (c.salesmanTidakTersedia && c.salesmanTidakTersedia.length) cat.push('Salesman tidak tersedia untuk DT ' + c.salesmanTidakTersedia.map(esc).join(', '));
    return '<section class="card kt-card kt-logic"><h2>Rumus, sama dengan Power BI</h2><p class="hint">Nama kolom mengikuti tabel Formula di Dashboard Banupa 2026.</p><dl>' +
      dl.map(x => '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>').join('') + '</dl></section>' +
      '<section class="card kt-card kt-logic"><h2>Data yang dibutuhkan</h2><p class="hint">Tiga tab di Sheet pusat, diisi tiap minggu dari ekspor Power BI: GS_KAT_BULAN, GS_KAT_MINGGU, GS_KAT_PRODUK. Format lengkap ada di berkas docs/format-data-kategori.md di repositori.</p>' +
      '<p class="hint">Data sampai ' + esc(K.dateLabel(DATA.dataUntil)) + ', cutoff ' + esc(K.dateLabel(DATA.cutoff)) + ', pembanding tahun lalu sampai ' + esc(K.dateLabel(DATA.lyEnd)) + '.</p>' +
      (cat.length ? '<h3>Catatan data</h3><ul class="kt-notes">' + cat.map(t => '<li>' + t + '</li>').join('') + '</ul>' : '<p class="hint">Tidak ada catatan data.</p>') + '</section>';
  }

  /* ---------- kepala dan render ---------- */
  function headHtml() {
    const w = S.basis === 'weekly', n = storesOn().length;
    return '<div class="kt-hd-t"><div><h2 class="kt-ttl">Radar ' + (w ? 'Weekly' : 'Monthly') + ' Report</h2><p class="kt-per">' + esc(K.periodLabel(DATA.cutoff)) + '</p>' +
      '<p class="hint">Periode hitung s/d ' + esc(K.dateLabel(DATA.cutoff)) + ' · ' + n + ' toko</p></div>' +
      '<div class="kt-seg" role="group" aria-label="Basis perhitungan"><button type="button" data-basis="weekly" aria-pressed="' + w + '">Weekly</button><button type="button" data-basis="monthly" aria-pressed="' + !w + '">Monthly</button></div></div>';
  }
  function setTabs() { TABS.forEach(t => { const b = $('kt-t-' + t); b.setAttribute('aria-selected', String(t === S.tab)); b.tabIndex = t === S.tab ? 0 : -1; }); $('ktPanel').setAttribute('aria-labelledby', 'kt-t-' + S.tab); }
  function render() {
    if (!DATA) return;
    const p = $('ktPanel'), sc = p.querySelector('.kt-pv'), keep = sc ? [sc.scrollLeft, sc.scrollTop] : null;
    $('ktHead').innerHTML = headHtml();
    const f = document.activeElement && document.activeElement.id;
    $('ktFilters').innerHTML = filtersHtml();
    if (f && $(f) && /^kt(Dt|Sm|Ch|Div|Cat|Br)$/.test(f)) $(f).focus();
    setTabs();
    if (!storesOn().length && S.tab !== 'logika') p.innerHTML = noToko();
    else p.innerHTML = S.tab === 'bycat' ? pBycat() : S.tab === 'byout' ? pByout() : S.tab === 'insight' ? pInsight() : pLogika();
    const nsc = p.querySelector('.kt-pv'); if (keep && nsc) { nsc.scrollLeft = keep[0]; nsc.scrollTop = keep[1]; }
  }
  function go(t, focus) {
    S.tab = TABS.includes(t) ? t : 'bycat';
    try { history.replaceState(null, '', '#' + S.tab); } catch (e) { /* tanpa riwayat */ }
    render(); if (focus) $('kt-t-' + S.tab).focus();
  }
  function empty(d) {
    DATA = null;
    $('ktHead').innerHTML = '<div class="kt-hd-t"><div><h2 class="kt-ttl">Radar Kategori</h2><p class="hint">Belum ada data kategori.</p></div></div>';
    $('ktFilters').innerHTML = ''; $('ktTabs').hidden = true;
    $('ktPanel').innerHTML = '<section class="card kt-card"><h2>Data Kategori belum diisi</h2><p class="hint">' + esc(d.message || 'Isi tab GS_KAT_BULAN, GS_KAT_MINGGU, dan GS_KAT_PRODUK di Sheet pusat.') + '</p>' +
      '<p class="hint">Tab yang harus diisi: ' + esc((d.tab || ['GS_KAT_BULAN', 'GS_KAT_MINGGU']).join(', ')) + '. Format kolom ada di berkas docs/format-data-kategori.md di repositori. Isi lewat ekspor Power BI tiap minggu.</p></section>';
    $('ktFilters').hidden = true;
    window.MHFresh.set({ info: null });
  }

  function enter(d, code) {
    DATA = d; CODE = code;
    try { localStorage.setItem(LS_CODE, code); } catch (e) { /* mode privat */ }
    KK = { hkTy: d.hkTy, hkLy: d.hkLy };
    ROWS = K.expand(d); BYTOKO = d.tokos.map(() => []); ROWS.forEach(p => { BYTOKO[p.t].push(p); });
    if (!d.dts.some(x => x.kode === S.dt)) S.dt = '';
    S.open = new Set(uniq(d.brands.map(b => 'd:' + b.division)));
    $('ktTabs').hidden = false; $('ktFilters').hidden = false;
    window.MHFresh.set({ info: window.MHFresh.status(d.dataUntil, { label: 'Data Kategori', stale: 8 }) });
    $('csSub').textContent = d.dts.length === 1 ? d.dts[0].nama : '';
    window.MHBoot.done();
    $('loginScreen').hidden = true; $('appScreen').hidden = false;
    const h = (location.hash || '').slice(1); S.tab = TABS.includes(h) ? h : S.tab;
    render();
  }
  async function login(code, silent, noCache) {
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Memeriksa kode…'; }
    let c = silent && !noCache ? readCache(code) : null;
    const dropBad = () => { c = null; DATA = null; try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } $('appScreen').hidden = true; $('loginScreen').hidden = false; };
    if (c && c.data && c.data.mode === 'kategori') { try { enter(c.data, code); note('wait'); } catch (e) { dropBad(); } }
    try {
      const d = window.MHUtil.needObj(await fetchKat(code));
      if (d.error === 'invalid_code') { problem('Kode tidak cocok. Periksa huruf besar/kecil atau minta kode baru.', silent, true); return false; }
      if (d.error === 'no_data') {
        try { localStorage.setItem(LS_CODE, code); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ }
        CODE = code; empty(d); window.MHBoot.done(); $('loginScreen').hidden = true; $('appScreen').hidden = false; banner(''); note('done'); return true;
      }
      if (d.error) { if (c) { note('off'); banner('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.'); } else problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return false; }
      if (d.mode !== 'kategori') { problem('API belum diperbarui. Deploy ulang Apps Script.', silent, false); return false; }
      writeCache(code, d); enter(d, code); banner(''); note('done');
      return true;
    } catch (err) {
      if (c || DATA) { note('off'); banner('Gagal memperbarui, ini data tersimpan. Ketuk muat ulang untuk coba lagi.'); return false; }
      problem(err.bad ? err.message : 'Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
      return false;
    }
  }

  /* ---------- peristiwa ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const tab = t.closest('[data-tab]'); if (tab && tab.closest('#ktTabs')) { go(tab.dataset.tab); return; }
    const bs = t.closest('[data-basis]'); if (bs) { S.basis = bs.dataset.basis; render(); return; }
    const ex = t.closest('.kt-ex');
    if (ex) { const k = ex.dataset.k, set = S.tab === 'bycat' ? S.open : S.closed; set.has(k) ? set.delete(k) : set.add(k); render(); const n = [...document.querySelectorAll('.kt-ex')].find(x => x.dataset.k === k); if (n) n.focus(); return; }
    const pc = t.closest('[data-pc]'); if (pc) { S.icat = pc.dataset.pc; render(); const n = [...document.querySelectorAll('[data-pc]')].find(x => x.dataset.pc === S.icat); if (n) n.focus(); return; }
    $('syncPop').hidden = true;
  });
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (onFilter[id]) { onFilter[id](e.target.value); render(); return; }
    if (id === 'ktStore') { S.store = e.target.value; render(); const n = $('ktStore'); if (n) n.focus(); }
  });
  $('ktTabs').addEventListener('keydown', e => {   // panah kiri/kanan antar tab (pola tablist)
    const i = TABS.indexOf(S.tab); let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
    if (n >= 0) { e.preventDefault(); go(TABS[n], true); }
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (DATA && TABS.includes(h) && h !== S.tab) go(h); });
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (DATA && S.tab === 'bycat') render(); }, 200); });

  $('loginForm').addEventListener('submit', e => { e.preventDefault(); const code = $('codeInput').value.trim(); if (!code) { $('loginErr').textContent = 'Isi kode akses dulu.'; return; } $('loginErr').textContent = ''; login(code); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } location.reload(); });
  let refreshing = false;   // satu permintaan segarkan sekaligus
  $('refreshBtn').addEventListener('click', () => {
    if (refreshing) return; refreshing = true;
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    banner(''); note('wait'); login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); }).finally(() => { refreshing = false; });
  });

  window.MHFresh.bind();
  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
