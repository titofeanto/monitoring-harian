/* Cek Stok & Harga Naik: stok gudang DT + daftar harga lama/baru. Data dari Apps Script ?view=stok. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const CACHE_KEY = 'mh_stok_cache';
  const CFG = { batasMenipisKarton: 2, page: 40, kritisMgg: 1, menipisMgg: 2, targetMgg: 2 };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + BULAN[+m[2]] + ' ' + m[1] : String(iso || ''); };
  const rp = n => n == null ? '-' : 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const pct = v => (Math.abs(v) * 100).toFixed(1).replace('.', ',') + '%';
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const bcKey = s => String(s).replace(/\D/g, '').replace(/^0+/, '');
  const jam = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); };

  let DATA = null, CODE = '', DT = '', ITEMS = [], HASRPP = false, CNT = {};
  const S = { mode: 'harga', f: 'naik', ana: 'semua', q: '', brand: '', only: true, shown: CFG.page };
  const fmt1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  /* urutan = prioritas order: habis dan kritis dulu */
  const ANA = { habis: ['Habis', 'r', 0], kritis: ['Kritis', 'r', 1], menipis: ['Menipis', 'a', 2], tidakada: ['Tidak ada di laporan', '', 3], slow: ['Tanpa penjualan', 'b', 4], aman: ['Aman', 'g', 5] };

  async function fetchStok(code) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'view=stok&code=' + encodeURIComponent(code);
    let last;
    for (let i = 0; i < 4; i++) { // Apps Script kadang membalas 404 sesaat
      try { const res = await fetch(url); if (res.ok) return await res.json(); last = new Error('http_' + res.status); } catch (err) { last = err; }
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    throw last;
  }

  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2400); }
  function banner(txt) { const b = $('csBanner'); b.hidden = !txt; b.textContent = txt || ''; }
  /* Bubble header: Memperbarui saat mengambil data; selain itu kesegaran stok (sama dengan tool upload, telat kalau lebih dari 2 hari). */
  function note(kind) {
    const F = window.MHFresh;
    if (kind === 'wait') F.set({ fetch: 'wait', text: 'Memperbarui…' });
    else if (kind === 'off') F.set({ fetch: 'off' });
    else F.set({ fetch: 'ok', at: kind === 'done' ? Date.now() : 0 });
  }
  function loginErr(msg) { $('loginErr').textContent = msg; $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk'; }
  function problem(msg, silent, badCode) {
    if (!silent) { loginErr(msg); return; }
    if (badCode) { $('appScreen').hidden = true; $('loginScreen').hidden = false; window.MHBoot.invalid(msg); } else window.MHBoot.fail(msg);
  }

  function readCache(code) {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.code === code) return c; } catch (e) { /* salinan rusak */ }
    return null;
  }
  function writeCache(code, data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ code, data, at: Date.now() })); } catch (e) { /* penuh / mode privat */ }
  }

  /* Gabung stok DT terpilih dengan daftar harga. Status harga dihitung dari selisih harga baru vs lama per karton. */
  function build() {
    const stokBy = {};
    DATA.stok.forEach(r => { if (r[0] === DT) stokBy[r[1]] = r; });
    ITEMS = DATA.harga.map(h => {
      const st = stokBy[h.sku];
      const isi = st ? st[5] : h.isi;
      const k = st ? st[2] : 0, l = st ? st[3] : 0, p = st ? st[4] : 0;
      let status = 'tetap';
      if (h.hNew != null && h.hOld == null) status = 'baru';
      else if (h.hNew != null && h.hOld != null) status = h.hNew - h.hOld > 0.5 ? 'naik' : h.hOld - h.hNew > 0.5 ? 'turun' : 'tetap';
      const it = Object.assign({}, h, { isi, k, l, p, rpp: st ? (st[6] || 0) : 0, tot: k * isi + l * 12 + p, ada: !!st, status, pct: h.hNew != null && h.hOld ? (h.hNew - h.hOld) / h.hOld : 0 });
      it._bc = bcKey(h.bc);
      it.ke = it.tot / (it.isi || 1);
      it._txt = (h.nama + ' ' + h.brand + ' ' + h.sku + ' ' + h.bc).toLowerCase();
      return it;
    });
    /* Flag channel (SAT/IDM) dicocokkan lewat barcode. Status stok dihitung dari cover = stok (karton) / rata-rata jual per minggu. */
    const fl = {};
    (DATA.flags || []).forEach(f => { const k = bcKey(f[0]); (fl[k] = fl[k] || {})[f[1]] = f[3] || true; });
    HASRPP = DATA.stok.some(r => r[0] === DT && r[6] > 0);
    ITEMS.forEach(it => { it.fl = fl[it._bc] || {}; classify(it); });
    const brands = Array.from(new Set(ITEMS.map(i => i.brand))).sort();
    $('csBrand').innerHTML = '<option value="">Semua brand</option>' + brands.map(b => '<option>' + esc(b) + '</option>').join('');
    if (S.brand && brands.includes(S.brand)) $('csBrand').value = S.brand; else S.brand = '';
    const d = DATA.dts.find(x => x.kode === DT);
    $('csSub').textContent = d ? d.nama : '';
    $('csUpdated').textContent = d ? 'Stok per ' + tgl(d.tanggal) : '';
    window.MHFresh.set({ info: d ? window.MHFresh.status(d.tanggal, { label: 'Stok gudang', stale: 2 }) : null });
  }

  function classify(it) {
    it.cover = null;
    if (!it.ada) it.ana = 'tidakada';
    else if (it.tot <= 0) it.ana = 'habis';
    else if (!HASRPP) it.ana = it.tot <= it.isi * CFG.batasMenipisKarton ? 'menipis' : 'aman';
    else if (it.rpp <= 0) it.ana = 'slow';
    else { it.cover = it.ke / it.rpp; it.ana = it.cover < CFG.kritisMgg ? 'kritis' : it.cover < CFG.menipisMgg ? 'menipis' : 'aman'; }
    it.butuh = it.rpp > 0 ? Math.max(0, Math.ceil(CFG.targetMgg * it.rpp - it.ke)) : 0;
  }
  const stokText = i => [i.k && i.k + ' karton', i.l && i.l + ' lusin', i.p && i.p + ' pcs'].filter(Boolean).join(' ') || '0';
  function stokTag(i) {
    if (i.tot <= 0) return '<span class="tag r">Habis</span>';
    if (i.tot <= i.isi * CFG.batasMenipisKarton) return '<span class="tag a">Menipis</span>';
    return '<span class="tag g">Tersedia</span>';
  }

  /* Satu barcode bisa dipakai beberapa SKU di daftar harga (varian kemasan). Per barcode, ambil SKU yang ada di laporan stok DT ini;
     kalau tidak ada satu pun, cukup satu baris supaya tampil sebagai "Tidak ada di laporan". */
  const pool = () => {
    const by = {};
    ITEMS.forEach(i => { if (i.fl[S.mode]) (by[i._bc] = by[i._bc] || []).push(i); });
    const out = [];
    Object.keys(by).forEach(k => {
      const ada = by[k].filter(i => i.ada);
      if (!ada.length) { out.push(by[k][0]); return; }
      if (ada.length === 1) { out.push(ada[0]); return; }
      /* Barcode sama di dua SKU (mis. kemasan ML ke G): stok dan jual digabung jadi satu baris. */
      const m = Object.assign({}, ada.slice().sort((a, b) => b.rpp - a.rpp || b.tot - a.tot)[0]);
      m.tot = ada.reduce((t, i) => t + i.tot, 0);
      const wk = ada.reduce((t, i) => t + i.rpp * i.isi, 0);
      m.ke = m.tot / m.isi; m.rpp = wk / m.isi;
      m.k = Math.floor(m.tot / m.isi); const rem = m.tot - m.k * m.isi; m.l = Math.floor(rem / 12); m.p = rem - m.l * 12;
      m.gab = ada.map(i => i.sku).join(' + ');
      classify(m); out.push(m);
    });
    return out.filter(i => !S.brand || i.brand === S.brand);
  };
  function filtered() {
    const q = S.q.trim().toLowerCase();
    const qb = /^\d{6,}$/.test(q) ? bcKey(q) : null;
    const hit = i => !q || (qb ? (i._bc === qb || i.sku === q) : q.split(/\s+/).every(w => i._txt.includes(w)));
    if (S.mode !== 'harga') {
      const base = pool().filter(hit);
      CNT = { semua: base.length }; base.forEach(i => { CNT[i.ana] = (CNT[i.ana] || 0) + 1; });
      return base.filter(i => S.ana === 'semua' || i.ana === S.ana)
        .sort((a, b) => ANA[a.ana][2] - ANA[b.ana][2] || (a.cover == null ? 99 : a.cover) - (b.cover == null ? 99 : b.cover) || a.nama.localeCompare(b.nama));
    }
    let out = ITEMS.filter(i => {
      if (S.brand && i.brand !== S.brand) return false;
      if (q) return hit(i);
      return S.f === 'semua' || i.status === S.f;
    });
    // Saat mencari, produk stok 0 tetap tampil supaya jelas bahwa produknya habis.
    if (!q && S.only) out = out.filter(i => i.tot > 0);
    return out.sort((a, b) => (b.tot > 0) - (a.tot > 0) || b.pct - a.pct || a.nama.localeCompare(b.nama));
  }

  function cardAna(i) {
    const a = ANA[i.ana];
    const badge = (i.status === 'naik' ? '<span class="tag r">HARGA NAIK ' + pct(i.pct) + '</span> ' : '') + (i.fl.IDM === 'Pareto' && S.mode === 'IDM' ? '<span class="tag b">Pareto</span> ' : '');
    let cov = '';
    if (HASRPP && i.ada) {
      cov = '<div class="cs-cov">Jual <b>' + (i.rpp > 0 ? fmt1(i.rpp) + ' karton</b>/minggu' : '0</b> (13 minggu)') + (i.cover != null ? ' · cover <b>' + fmt1(i.cover) + ' minggu</b>' : '') + '</div>' +
        (i.butuh > 0 ? '<div class="cs-need">Untuk ' + CFG.targetMgg + ' minggu kurang sekitar <b>' + i.butuh + ' karton</b></div>' : '');
    }
    return '<article class="cs-item"><h3>' + badge + esc(i.nama) + '</h3><div class="meta">' + esc(i.brand) + ' · Barcode ' + esc(i.bc) + ' · SKU ' + esc(i.gab || i.sku) + '</div>' +
      '<div class="cs-stok"><b>' + (i.tot > 0 ? esc(stokText(i)) : 'Stok 0') + '</b><span class="tag ' + a[1] + '">' + a[0] + '</span>' + (i.tot > 0 ? '<small>= ' + i.tot.toLocaleString('id-ID') + ' pcs</small>' : '') + '</div>' + cov + '</article>';
  }

  function card(i) {
    const badge = i.status === 'naik' ? '<span class="tag r">NAIK ' + pct(i.pct) + '</span> ' : i.status === 'turun' ? '<span class="tag g">TURUN ' + pct(i.pct) + '</span> ' : i.status === 'baru' ? '<span class="tag b">BARU</span> ' : '';
    let harga = '';
    if (i.hNew != null) {
      if (i.status === 'naik' || i.status === 'turun') {
        const c = i.status === 'naik' ? 'cs-up' : 'cs-dn';
        harga = '<div class="cs-pr"><div class="l">Harga toko per karton (isi ' + i.isi + ')</div><div><s>' + rp(i.hOld) + '</s></div><div class="' + c + '">' + rp(i.hNew) + '</div>' +
          '<div class="l">Per pcs</div><div><s>' + rp(i.sOld) + '</s></div><div class="' + c + '">' + rp(i.sNew) + '</div></div>';
      } else harga = '<div class="cs-pr"><div class="l">Harga toko</div><div>Karton: ' + rp(i.hNew) + '</div><div>Pcs: ' + rp(i.sNew) + '</div></div>';
    }
    let note = '';
    if (i.status === 'naik' && i.mulai) note = '<div class="cs-note">' + (i.mulai > todayIso() ? 'Harga baru berlaku ' + tgl(i.mulai) + '. Pesan sebelum tanggal itu masih harga lama, selama stok ada.' : 'Harga baru berlaku sejak ' + tgl(i.mulai) + '.') + '</div>';
    return '<article class="cs-item"><h3>' + badge + esc(i.nama) + '</h3><div class="meta">' + esc(i.brand) + ' · Barcode ' + esc(i.bc) + ' · SKU ' + esc(i.sku) + '</div>' +
      '<div class="cs-stok"><b>' + (i.tot > 0 ? esc(stokText(i)) : 'Stok 0') + '</b>' + stokTag(i) + (i.tot > 0 ? '<small>= ' + i.tot.toLocaleString('id-ID') + ' pcs</small>' : '') + '</div>' + harga + note + '</article>';
  }

  function render() {
    const ana = S.mode !== 'harga';
    $('csHargaF').hidden = ana; $('csAnaF').hidden = !ana; $('csOnlyW').hidden = ana;
    document.querySelectorAll('#csMode [data-m]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === S.mode)));
    const r = filtered();
    if (ana) {
      const chips = [['semua', 'Semua']].concat(Object.keys(ANA).map(k => [k, ANA[k][0]])).filter(c => c[0] === 'semua' || CNT[c[0]]);
      $('csAna').innerHTML = chips.map(c => '<button type="button" data-a="' + c[0] + '" aria-pressed="' + (S.ana === c[0]) + '">' + c[1] + '<span class="n">' + (CNT[c[0]] || 0) + '</span></button>').join('');
      $('csAnaNote').textContent = !pool().length && !S.q ? 'Daftar SKU ' + S.mode + ' belum diupload. Upload di tool upload (kotak Daftar SKU SAT & IDM).'
        : !HASRPP ? 'Data rata-rata jual belum ada di stok ini. Upload ulang laporan stok supaya cover per minggu terhitung. Sementara status hanya dari jumlah stok.'
        : 'Cover = stok dibagi rata-rata jual DT per minggu (13 minggu). Kritis kurang dari ' + CFG.kritisMgg + ' minggu, menipis kurang dari ' + CFG.menipisMgg + ' minggu. Dihitung dari penjualan seluruh DT, bukan khusus order ' + S.mode + '.';
    }
    $('csCount').textContent = r.length + ' produk' + (S.q ? ' untuk "' + S.q + '"' : '');
    $('csList').innerHTML = r.length ? r.slice(0, S.shown).map(ana ? cardAna : card).join('') : '<div class="card empty">' + (ana && !S.q && !pool().length ? 'Belum ada daftar SKU ' + S.mode + '.' : 'Produk tidak ditemukan.') + '</div>';
    $('csMore').hidden = r.length <= S.shown;
    $('csExport').disabled = !r.length;
    $('csExport').textContent = 'Export Excel (' + r.length + ')';
  }

  /* ---- Export Excel: daftar yang sedang tampil, untuk dikirim ke toko ---- */
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = ok; s.onerror = () => no(new Error('Pustaka Excel gagal dimuat. Cek koneksi internet.'));
      document.head.appendChild(s);
    });
  }
  async function exportExcel() {
    const r = filtered();
    if (!r.length) return;
    $('csExport').disabled = true;
    try {
      await loadXlsx();
      const d = DATA.dts.find(x => x.kode === DT) || { nama: '', tanggal: '' };
      if (S.mode !== 'harga') { exportAna(r, d); return; }
      const head = ['No', 'Brand', 'Nama Produk', 'Kemasan', 'Barcode', 'Stok', 'Total Pcs', 'Status Stok', 'Harga Lama / Karton', 'Harga Baru / Karton', 'Kenaikan %', 'Harga Baru / Pcs', 'Berlaku Mulai'];
      const rows = r.map((i, n) => [n + 1, i.brand, i.nama, i.kemasan, i.bc, i.tot > 0 ? stokText(i) : '0', i.tot,
        i.tot <= 0 ? 'Habis' : i.tot <= i.isi * CFG.batasMenipisKarton ? 'Menipis' : 'Tersedia',
        i.hOld == null ? '' : Math.round(i.hOld), i.hNew == null ? '' : Math.round(i.hNew), i.status === 'naik' || i.status === 'turun' ? Math.round(i.pct * 1000) / 1000 : '',
        i.sNew == null ? '' : Math.round(i.sNew), i.mulai ? tgl(i.mulai) : '']);
      const title = S.q ? 'Hasil cari "' + S.q + '"' : S.f === 'naik' ? 'Harga naik' : S.f === 'turun' ? 'Harga turun' : 'Semua produk';
      const aoa = [['Stok & Harga - ' + d.nama], [title + ' · stok per ' + tgl(d.tanggal) + ' · harga toko per karton, termasuk PPN'], [], head].concat(rows);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [5, 14, 44, 14, 16, 22, 10, 12, 18, 18, 11, 16, 14].map(w => ({ wch: w }));
      const hdrRow = 3;
      for (let k = 0; k < rows.length; k++) {
        const rowNo = hdrRow + 1 + k;
        ['I', 'J', 'L'].forEach(c => { const cell = ws[c + (rowNo + 1)]; if (cell && cell.t === 'n') cell.z = '#,##0'; });
        const pc = ws['K' + (rowNo + 1)]; if (pc && pc.t === 'n') pc.z = '0.0%';
        const bc = ws['E' + (rowNo + 1)]; if (bc) { bc.t = 's'; }
      }
      ws['!autofilter'] = { ref: 'A4:M' + (rows.length + 4) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stok');
      const name = 'Stok-' + (S.f === 'naik' ? 'Harga-Naik' : S.f === 'turun' ? 'Harga-Turun' : 'Semua') + '_' + String(d.nama).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + d.tanggal + '.xlsx';
      XLSX.writeFile(wb, name);
      toast('Excel diunduh: ' + r.length + ' produk');
    } catch (e) { toast(e.message || 'Export gagal'); }
    $('csExport').disabled = false;
  }
  /* Export analisa SAT / IDM: daftar yang sedang tampil, urut prioritas order. */
  function exportAna(r, d) {
    const head = ['No', 'Brand', 'Nama Produk', 'Barcode', 'SKU', 'Stok', 'Total Pcs', 'Status', 'Jual / Minggu (karton)', 'Cover (minggu)', 'Kurang utk ' + CFG.targetMgg + ' Minggu (karton)', 'Harga Naik %'].concat(S.mode === 'IDM' ? ['Pareto'] : []);
    const rows = r.map((i, n) => [n + 1, i.brand, i.nama, i.bc, i.gab || i.sku, i.tot > 0 ? stokText(i) : '0', i.tot, ANA[i.ana][0],
      HASRPP && i.ada ? Math.round(i.rpp * 10) / 10 : '', i.cover != null ? Math.round(i.cover * 10) / 10 : '', i.butuh || '',
      i.status === 'naik' ? Math.round(i.pct * 1000) / 1000 : ''].concat(S.mode === 'IDM' ? [i.fl.IDM === 'Pareto' ? 'Y' : ''] : []));
    const aoa = [['Analisa stok ' + S.mode + ' - ' + d.nama], ['Stok per ' + tgl(d.tanggal) + ' · cover = stok / rata-rata jual DT per minggu (13 minggu)'], [], head].concat(rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [5, 14, 44, 16, 11, 22, 10, 18, 12, 10, 14, 10, 8].map(w => ({ wch: w }));
    for (let k = 0; k < rows.length; k++) {
      const bc = ws['D' + (k + 5)]; if (bc) bc.t = 's';
      const pc = ws['L' + (k + 5)]; if (pc && pc.t === 'n') pc.z = '0.0%';
    }
    ws['!autofilter'] = { ref: 'A4:' + String.fromCharCode(64 + head.length) + (rows.length + 4) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analisa ' + S.mode);
    XLSX.writeFile(wb, 'Analisa-Stok-' + S.mode + '_' + String(d.nama).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + d.tanggal + '.xlsx');
    toast('Excel diunduh: ' + r.length + ' produk');
    $('csExport').disabled = false;
  }

  /* ---- Scan kamera ---- */
  let scanner = null;
  function stopScan() {
    $('csReader').hidden = true;
    if (scanner) { const s = scanner; scanner = null; s.stop().then(() => s.clear()).catch(() => {}); }
  }
  $('csScan').addEventListener('click', () => {
    if (!window.Html5Qrcode) { toast('Pemindai belum termuat. Cek internet, atau ketik barcode.'); return; }
    $('csReader').hidden = false;
    scanner = new Html5Qrcode('csReaderView');
    const F = Html5QrcodeSupportedFormats;
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 120 }, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.CODE_128, F.ITF] },
      text => { $('csQ').value = text; S.q = text; stopScan(); S.shown = CFG.page; render(); }, () => {})
      .catch(() => { stopScan(); toast('Kamera tidak bisa dibuka. Izinkan akses kamera atau ketik barcode.'); });
  });
  $('csScanStop').addEventListener('click', stopScan);

  /* ---- tampilan ---- */
  function enter(d, code) {
    DATA = d; CODE = code;
    try { localStorage.setItem(LS_CODE, code); } catch (e) { /* mode privat */ }
    if (!d.dts.some(x => x.kode === DT)) DT = d.dts[0].kode;
    $('dtSec').hidden = d.dts.length < 2;
    $('dtChips').innerHTML = d.dts.map(x => '<button type="button" data-dt="' + esc(x.kode) + '" aria-pressed="' + (x.kode === DT) + '">' + esc(x.nama || x.kode) + '</button>').join('');
    window.MHBoot.done();
    $('loginScreen').hidden = true; $('appScreen').hidden = false;
    build(); render();
  }

  async function login(code, silent, noCache) {
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Menghubungkan…'; }
    const c = silent && !noCache ? readCache(code) : null;
    if (c) { enter(c.data, code); note('wait'); }
    try {
      const d = await fetchStok(code);
      if (d.error === 'invalid_code') { problem('Kode akses salah.', silent, true); return false; }
      if (d.error === 'no_data') { if (c) { note('off'); banner(d.message); } else problem(d.message + ' Upload lewat tool upload.', silent, false); return false; }
      if (d.error) { if (c) { note('off'); banner('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.'); } else problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return false; }
      if (d.mode !== 'stok') { problem('API belum mendukung Cek Stok. Deploy ulang Apps Script (lihat README).', silent, false); return false; }
      writeCache(code, d); enter(d, code); banner(''); note('done');
      return true;
    } catch (err) {
      if (c || DATA) { note('off'); banner('Gagal memperbarui, ini data tersimpan. Ketuk muat ulang untuk coba lagi.'); return false; }
      problem('Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
      return false;
    }
  }

  let t;
  $('csQ').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; S.shown = CFG.page; render(); }, 150); });
  $('csQ').addEventListener('keydown', e => { if (e.key === 'Enter') { S.q = e.target.value; S.shown = CFG.page; render(); e.target.select(); } }); // scanner USB/Bluetooth
  $('csBrand').addEventListener('change', e => { S.brand = e.target.value; S.shown = CFG.page; render(); });
  $('csOnly').addEventListener('change', e => { S.only = e.target.checked; S.shown = CFG.page; render(); });
  $('csMode').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    S.mode = b.dataset.m; S.ana = 'semua'; S.shown = CFG.page; render();
  });
  $('csAna').addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    S.ana = b.dataset.a; S.shown = CFG.page; render();
  });
  $('csMore').addEventListener('click', () => { S.shown += CFG.page; render(); });
  $('csExport').addEventListener('click', exportExcel);
  $('csChips').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    S.f = b.dataset.f; S.shown = CFG.page;
    document.querySelectorAll('#csChips [data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  $('dtChips').addEventListener('click', e => {
    const b = e.target.closest('[data-dt]'); if (!b) return;
    DT = b.dataset.dt;
    document.querySelectorAll('#dtChips [data-dt]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    S.shown = CFG.page; build(); render();
  });
  $('loginForm').addEventListener('submit', e => { e.preventDefault(); $('loginErr').textContent = ''; login($('codeInput').value.trim()); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } location.reload(); });
  $('refreshBtn').addEventListener('click', () => {
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    banner(''); note('wait');
    login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); });
  });

  window.MHFresh.bind();
  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
