/* Cek Stok & Harga Naik: stok gudang DT + daftar harga lama/baru. Data dari Apps Script ?view=stok. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const CACHE_KEY = 'mh_stok_cache';
  const CFG = { batasMenipisKarton: 2, page: 40 };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + BULAN[+m[2]] + ' ' + m[1] : String(iso || ''); };
  const rp = n => n == null ? '-' : 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const pct = v => (Math.abs(v) * 100).toFixed(1).replace('.', ',') + '%';
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const bcKey = s => String(s).replace(/\D/g, '').replace(/^0+/, '');
  const jam = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); };

  let DATA = null, CODE = '', DT = '', ITEMS = [];
  const S = { f: 'naik', q: '', brand: '', only: true, shown: CFG.page };

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
      const it = Object.assign({}, h, { isi, k, l, p, tot: k * isi + l * 12 + p, ada: !!st, status, pct: h.hNew != null && h.hOld ? (h.hNew - h.hOld) / h.hOld : 0 });
      it._bc = bcKey(h.bc);
      it._txt = (h.nama + ' ' + h.brand + ' ' + h.sku + ' ' + h.bc).toLowerCase();
      return it;
    });
    const brands = Array.from(new Set(ITEMS.map(i => i.brand))).sort();
    $('csBrand').innerHTML = '<option value="">Semua brand</option>' + brands.map(b => '<option>' + esc(b) + '</option>').join('');
    if (S.brand && brands.includes(S.brand)) $('csBrand').value = S.brand; else S.brand = '';
    const d = DATA.dts.find(x => x.kode === DT);
    $('csSub').textContent = d ? d.nama : '';
    $('csUpdated').textContent = d ? 'Stok per ' + tgl(d.tanggal) : '';
  }

  const stokText = i => [i.k && i.k + ' karton', i.l && i.l + ' lusin', i.p && i.p + ' pcs'].filter(Boolean).join(' ') || '0';
  function stokTag(i) {
    if (i.tot <= 0) return '<span class="tag r">Habis</span>';
    if (i.tot <= i.isi * CFG.batasMenipisKarton) return '<span class="tag a">Menipis</span>';
    return '<span class="tag g">Tersedia</span>';
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    const qb = /^\d{6,}$/.test(q) ? bcKey(q) : null;
    let out = ITEMS.filter(i => {
      if (S.brand && i.brand !== S.brand) return false;
      if (q) return qb ? (i._bc === qb || i.sku === q) : q.split(/\s+/).every(w => i._txt.includes(w));
      return S.f === 'semua' || i.status === S.f;
    });
    // Saat mencari, produk stok 0 tetap tampil supaya jelas bahwa produknya habis.
    if (!q && S.only) out = out.filter(i => i.tot > 0);
    return out.sort((a, b) => (b.tot > 0) - (a.tot > 0) || b.pct - a.pct || a.nama.localeCompare(b.nama));
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
    const r = filtered();
    $('csCount').textContent = r.length + ' produk' + (S.q ? ' untuk "' + S.q + '"' : '');
    $('csList').innerHTML = r.length ? r.slice(0, S.shown).map(card).join('') : '<div class="card empty">Produk tidak ditemukan.</div>';
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
    if (c) { enter(c.data, code); banner('Memperbarui data… (tampilan sementara dari pukul ' + jam(c.at) + ')'); }
    try {
      const d = await fetchStok(code);
      if (d.error === 'invalid_code') { problem('Kode akses salah.', silent, true); return false; }
      if (d.error === 'no_data') { if (c) banner(d.message); else problem(d.message + ' Upload lewat tool upload.', silent, false); return false; }
      if (d.error) { if (c) banner('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.'); else problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return false; }
      if (d.mode !== 'stok') { problem('API belum mendukung Cek Stok. Deploy ulang Apps Script (lihat README).', silent, false); return false; }
      writeCache(code, d); enter(d, code); banner('');
      return true;
    } catch (err) {
      if (c || DATA) { banner('Gagal memperbarui, ini data tersimpan. Ketuk muat ulang untuk coba lagi.'); return false; }
      problem('Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
      return false;
    }
  }

  let t;
  $('csQ').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; S.shown = CFG.page; render(); }, 150); });
  $('csQ').addEventListener('keydown', e => { if (e.key === 'Enter') { S.q = e.target.value; S.shown = CFG.page; render(); e.target.select(); } }); // scanner USB/Bluetooth
  $('csBrand').addEventListener('change', e => { S.brand = e.target.value; S.shown = CFG.page; render(); });
  $('csOnly').addEventListener('change', e => { S.only = e.target.checked; S.shown = CFG.page; render(); });
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
    banner('Memperbarui data…');
    login(CODE, true, true).then(ok => { if (ok) toast('Data diperbarui'); });
  });

  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
