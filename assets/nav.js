/* Navigasi samping bersama semua halaman. Satu daftar item di bawah; tambah KPI baru di sini.
   Di halaman Great Sales dan Monitoring Harian item bagiannya berupa tombol tab sungguhan (dibaca gs.js / app.js);
   di halaman lain item yang sama berupa tautan. Layar >= 900 px: sidebar tetap. Di bawah itu: laci geser dari tombol menu.
   Dimuat sebelum gs.js / app.js (skrip halaman). Tidak mengubah logika KPI. */
(function () {
  const nav = document.getElementById('tabsNav'); if (!nav) return;
  const page = document.body.dataset.page || '';
  const I = {
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>',
    store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    sim: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
    user: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0M12 18l4-6"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    out: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  };
  /* [kunci, label, ikon, halaman (untuk tombol tab) atau berkas tujuan] */
  const GROUPS = [
    { t: 'Umum', items: [['rank', 'Ranking', 'trophy', 'ranking.html'], ['kategori', 'Kategori', 'grid', 'kategori.html']] },   // terlihat di semua halaman, terbuka untuk akun mana pun
    { t: 'Great Sales', p: 'gs', file: 'great-sales.html', items: [['skor', 'Skor', 'gauge'], ['fop', 'Weekly FOP', 'cal'], ['banded', 'Banded', 'box'], ['asrt', 'Assortment', 'layers'], ['ps', 'Perfect Store', 'store'], ['toko', 'Toko', 'pin']] },
    { t: 'Monitoring Harian', p: 'mon', file: 'index.html', items: [['ring', 'Ringkasan', 'chart'], ['sim', 'Simulator', 'sim'], ['fruit', 'Low Hanging Fruit', 'target']] },
    { t: 'Alat', items: [['stok', 'Cek Stok', 'box', 'cek-stok.html'], ['hadir', 'Kehadiran', 'user', 'kehadiran.html']] },
  ];
  const ico = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
  const item = (g, it) => {
    const inner = `${ico(it[2])}<span class="side-l">${it[1]}</span>`;
    if (g.p && g.p === page) {   // halaman ini: tombol tab sungguhan
      return g.p === 'gs'
        ? `<button type="button" class="side-i" data-tab="${it[0]}">${inner}</button>`
        : `<button type="button" class="side-i" id="tab-${it[0]}" aria-controls="p-${it[0]}"${it[0] === 'ring' ? ' aria-current="page"' : ''}>${inner}</button>`;
    }
    const href = it[3] || (g.file + (g.p === 'mon' && it[0] === 'ring' ? '' : '#' + it[0]));
    return `<a class="side-i" href="${href}"${it[3] && it[0] === page ? ' aria-current="page"' : ''}>${inner}</a>`;
  };
  const APP = window.MH_APP_NAME || 'Jendela Jasper', TAG = window.MH_APP_TAGLINE || 'Monitoring Pencapaian Sales Harian';
  const LOGO = '<img class="side-logo" src="assets/brand/ikon-monogram-56.png?v=33" srcset="assets/brand/ikon-monogram-56.png?v=33 1x, assets/brand/ikon-monogram-112.png?v=33 2x" width="28" height="28" alt="" aria-hidden="true">';
  nav.className = 'side';
  nav.setAttribute('aria-label', 'Navigasi utama');
  nav.innerHTML = `<div class="side-brand">${LOGO}<div class="side-bt"><b>${APP}</b><small>${TAG}</small></div>` +
    `<button type="button" class="side-x" id="navClose" aria-label="Tutup menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` +
    GROUPS.map((g, gi) => `<div class="side-g" role="group" aria-labelledby="sg${gi}"><div class="side-gt" id="sg${gi}">${g.t}</div>${g.items.map(it => item(g, it)).join('')}</div>`).join('') +
    `<div class="side-foot"><div class="side-acc">${ico('me')}<span>Akun</span></div>` +
    `<button type="button" class="side-out" id="sideLogout">${ico('out')}<span>Ganti akun / Keluar</span></button></div>`;

  /* Dialog konfirmasi keluar. Tombol "Keluar" memakai id logoutBtn supaya handler logout tiap halaman (gs.js, app.js, stok.js, hadir.js)
     tetap satu-satunya tempat yang menghapus kode dan salinan data; di sini dialog hanya ditutup lebih dulu. */
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg-confirm'; dlg.id = 'logoutDlg';
  dlg.setAttribute('aria-labelledby', 'logoutTtl');
  dlg.innerHTML = '<h2 id="logoutTtl">Keluar dari akun ini?</h2>' +
    '<p>Kode akses dan salinan data di HP ini akan dihapus. Anda perlu memasukkan kode lagi untuk masuk.</p>' +
    '<div class="dlg-act"><button type="button" class="btn plain" id="logoutCancel">Batal</button><button type="button" class="btn danger" id="logoutBtn">Keluar</button></div>';
  document.body.appendChild(dlg);
  const outBtn = document.getElementById('sideLogout');
  const closeDlg = () => { if (dlg.open) dlg.close(); outBtn.focus(); };
  outBtn.addEventListener('click', () => {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.getElementById('logoutCancel').focus();
  });
  document.getElementById('logoutCancel').addEventListener('click', closeDlg);
  document.getElementById('logoutBtn').addEventListener('click', () => { if (dlg.open) dlg.close(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); });
  dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDlg(); } });
  dlg.addEventListener('cancel', e => { e.preventDefault(); closeDlg(); });

  const menuBtn = document.getElementById('menuBtn');
  const scrim = document.createElement('div');
  scrim.className = 'nav-scrim'; scrim.id = 'navScrim'; scrim.hidden = true;
  nav.parentNode.insertBefore(scrim, nav.nextSibling);
  const mq = window.matchMedia('(min-width:900px)');
  let open = false;

  function sync() {
    nav.classList.toggle('open', open);
    scrim.hidden = !open;
    document.documentElement.classList.toggle('nav-lock', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    nav.inert = !mq.matches && !open;   // laci tertutup: tab-key tidak masuk
  }
  function setOpen(o, focus) {
    if (o === open) return;
    open = o; sync();
    if (!focus) return;
    if (o) { const f = nav.querySelector('.side-i:not([hidden])'); if (f) f.focus(); }
    else if (menuBtn && !mq.matches) menuBtn.focus();
  }
  if (menuBtn) menuBtn.addEventListener('click', () => setOpen(!open, true));
  scrim.addEventListener('click', () => setOpen(false, true));
  document.getElementById('navClose').addEventListener('click', () => setOpen(false, true));
  nav.addEventListener('click', e => { if (e.target.closest('.side-i')) setOpen(false, true); });
  document.addEventListener('keydown', e => {
    if (!open || dlg.open) return;
    if (e.key === 'Escape') { setOpen(false, true); return; }
    if (e.key === 'Tab') {   // fokus tetap di dalam laci
      const f = [...nav.querySelectorAll('button, a')].filter(x => !x.hidden && x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  const onMq = () => { if (mq.matches && open) open = false; sync(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
  sync();
})();
