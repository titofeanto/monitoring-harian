/* Helper bersama semua halaman. Dimuat sebelum skrip halaman lain. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Ikon status (komponen .st): satu kosakata di semua halaman. Hanya menampilkan klasifikasi yang sudah ada
     (kelas okc/amb/neg atau level hijau/kuning/merah dari data), tanpa ambang baru. Tidak bergantung pada warna:
     bentuk (centang, jam, silang) dan aria-label teks ikut. */
  const ST = {
    bad: ['Belum capai', '<path d="M8 8l8 8M16 8l-8 8"/>'],
    mid: ['Hampir', '<circle cx="12" cy="12" r="6.5"/><path d="M12 8.5V12l2.4 1.4"/>'],
    ok: ['Tercapai', '<path d="M6 12.5l4 4 8-9"/>'],
  };
  const stIcon = (k, deco) => ST[k] ? `<span class="st ${k}"${deco ? ' aria-hidden="true"' : ` role="img" aria-label="${ST[k][0]}"`}><svg viewBox="0 0 24 24" aria-hidden="true">${ST[k][1]}</svg></span>` : '';
  const stOf = cls => ({ okc: 'ok', amb: 'mid', neg: 'bad', green: 'ok', amber: 'mid', red: 'bad' }[cls] || '');
  const stLegend = () => '<div class="st-legend" role="note"><span class="lg-t">Arti ikon:</span>' +
    ['bad', 'mid', 'ok'].map(k => `<span class="lg-i">${stIcon(k, true)}${ST[k][0]}</span>`).join('') + '</div>';

  /* Tabel urut di browser: judul kolom jadi tombol, klik = naik, lagi = turun, lagi = urutan awal.
     Hanya mengurutkan baris yang sudah dimuat; nilai tidak dihitung ulang. Baris total (tr.tot) tetap di bawah.
     Pakai class "nosort" pada <table> untuk menolak. */
  const NUM = /^[-+]?\s*(?:Rp\.?\s*)?\d[\d.,]*/;
  const numOf = t => {
    const m = NUM.exec(String(t).trim()); if (!m) return null;
    const s = m[0].replace(/Rp\.?/, '').replace(/\s/g, '');
    const n = parseFloat(s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s));
    return isNaN(n) ? null : n;
  };
  const cellOf = (tr, i) => { const c = tr.children[i]; if (!c) return ''; return c.dataset && c.dataset.v != null ? c.dataset.v : c.textContent; };
  function sortTable(table, col, dir) {
    const tb = table.tBodies[0]; if (!tb) return;
    const rows = [...tb.rows], fixed = rows.filter(r => r.classList.contains('tot')), body = rows.filter(r => !r.classList.contains('tot'));
    if (!body.some(r => r.dataset.o != null)) body.forEach((r, i) => { r.dataset.o = i; });
    if (!dir) body.sort((a, b) => a.dataset.o - b.dataset.o);
    else {
      const vals = body.map(r => cellOf(r, col)), nums = vals.map(numOf);
      const numeric = vals.some(v => String(v).trim() !== '') && vals.every((v, i) => String(v).trim() === '' || nums[i] != null);
      const key = new Map(body.map((r, i) => [r, numeric ? nums[i] : String(vals[i]).trim().toLowerCase()]));
      body.sort((a, b) => {
        const x = key.get(a), y = key.get(b);
        const c = numeric ? ((x == null) - (y == null) || x - y) : String(x).localeCompare(String(y), 'id');
        return (dir === 'desc' ? -c : c) || a.dataset.o - b.dataset.o;
      });
    }
    body.concat(fixed).forEach(r => tb.appendChild(r));
  }
  function enhance(table) {
    if (table.classList.contains('nosort') || !table.tHead || !table.tBodies[0] || table.tBodies[0].rows.length < 2 || table.tHead.querySelector('button[data-srt]')) return;
    const hr = table.tHead.rows[table.tHead.rows.length - 1]; if (!hr) return;
    table.classList.add('srt');
    [...hr.cells].forEach((th, i) => {
      const t = th.textContent.trim(); if (!t) return;
      th.setAttribute('aria-sort', 'none'); th.dataset.col = i;
      th.innerHTML = `<button type="button" class="th-b" data-srt="${i}">${th.innerHTML}<span class="th-a" aria-hidden="true"></span></button>`;
    });
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[data-srt]'); if (!b) return;
    const th = b.parentNode, table = th.closest('table'), col = +b.dataset.srt;
    const cur = th.getAttribute('aria-sort'), next = cur === 'none' ? 'ascending' : cur === 'ascending' ? 'descending' : 'none';
    [...th.parentNode.cells].forEach(x => { if (x.hasAttribute('aria-sort')) x.setAttribute('aria-sort', 'none'); });
    th.setAttribute('aria-sort', next);
    sortTable(table, col, next === 'ascending' ? 'asc' : next === 'descending' ? 'desc' : '');
  });
  const scan = root => (root.querySelectorAll ? root.querySelectorAll('.scroll table') : []).forEach(enhance);
  function watch() {
    scan(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { const t = n.closest && n.closest('.scroll table'); if (t) enhance(t); scan(n); } }))).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof document !== 'undefined') { if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch); }

  window.MHUtil = { esc, stIcon, stOf, stLegend, numOf, sortTable };
})();
