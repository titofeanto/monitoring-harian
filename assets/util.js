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

  /** Medali hanya untuk rank server 1-3 dan paling banyak 5 baris pertama (ord = urutan baris dari 0); rank kembar sama-sama bermedali. */
  const isMedal = (rank, ord) => rank >= 1 && rank <= 3 && ord < 5;

  /* ---- Baris KPI sederhana (cincin persen + angka besar + rincian buka-tutup). Hanya presentasi: persen berasal dari
     server atau aktual/target yang sudah ada; cincin dibatasi 0-100 untuk gambar, label teks memakai angka asli dibulatkan.
     Warna: kelas okc/amb/neg atau level server bila ada; bila tidak ada, hijau bila >= 100% selain itu merah (aturan tampilan saja). ---- */
  const RING_R = 42, RING_C = 2 * Math.PI * RING_R;
  const toneOf = (p, cls) => { if (!isFinite(p)) return ''; return stOf(cls) || (p >= 1 ? 'ok' : 'bad'); };
  const pctInt = p => Math.round(p * 100);
  const ring = (p, tone, name) => {
    if (typeof p !== 'number' || !isFinite(p)) return '';
    const n = pctInt(p), dash = Math.max(0, Math.min(1, p)) * RING_C;
    return `<svg class="ring" data-tone="${tone || ''}" viewBox="0 0 100 100" role="img" aria-label="${esc(name)}: ${n}%"><circle class="rg-t" cx="50" cy="50" r="${RING_R}"/>` +
      `<circle class="rg-f" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${dash.toFixed(1)} ${RING_C.toFixed(1)}" transform="rotate(-90 50 50)"/><text class="rg-x" x="50" y="50" dy=".35em" text-anchor="middle">${n}%</text></svg>`;
  };
  const barThin = (p, tone) => `<div class="bar-thin" data-tone="${tone || ''}" aria-hidden="true"><i style="width:${(isFinite(p) ? Math.max(0, Math.min(1, p)) * 100 : 0).toFixed(0)}%"></i></div>`;
  /** Item rincian: nama + (persen) | Sisa Target; bar tipis; angka capaian | angka target. */
  const barItem = o => `<div class="bar-item"><div class="bi-h"><b>${esc(o.name)}${isFinite(o.p) ? ` <span class="bi-p">(${pctInt(o.p)}%)</span>` : ''}</b>${o.sisa ? `<span class="bi-s">Sisa Target: ${esc(o.sisa)}</span>` : ''}</div>` +
    (isFinite(o.p) ? barThin(o.p, o.tone) : '') + `<div class="bi-f"><span>${esc(o.left)}</span><span>${esc(o.right)}</span></div></div>`;
  const OPEN = {};
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  /** o: {id, name, icon (html ikon status), p (pecahan, NaN = tanpa target: tanpa cincin dan panah), tone, big, target, sisa, detail (html)} */
  const kpiRow = o => {
    const has = typeof o.p === 'number' && isFinite(o.p), exp = !!(o.detail && has && OPEN[o.id]), det = o.detail && has;
    return `<div class="kpi-row${has ? '' : ' no-ring'}" data-tone="${has ? o.tone || '' : ''}"><div class="kr-main">${ring(o.p, o.tone, o.name)}` +
      `<div class="kr-body"><div class="kpi-name">${o.icon || ''}<span>${o.name}</span></div><div class="kpi-big">${o.big}</div>` +
      `<div class="kpi-meta">${o.target ? `<span>Target ${o.target}</span>` : ''}${o.sisa ? `<span>Sisa Target ${o.sisa}</span>` : ''}</div></div>` +
      (det ? `<button type="button" class="kpi-toggle" data-kt="${esc(o.id)}" aria-expanded="${exp}" aria-controls="kd-${esc(o.id)}" aria-label="Rincian ${esc(String(o.name).replace(/<[^>]*>/g, ''))}">${CHEV}</button>` : '') + '</div>' +
      (det ? `<div class="kpi-detail" id="kd-${esc(o.id)}"${exp ? '' : ' hidden'}>${o.detail}</div>` : '') + '</div>';
  };
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button.kpi-toggle'); if (!b) return;
    e.stopPropagation();
    const d = document.getElementById(b.getAttribute('aria-controls')); if (!d) return;
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open)); d.hidden = !open; OPEN[b.dataset.kt] = open;
  }, true);

  window.MHUtil = { esc, isMedal, stIcon, stOf, stLegend, numOf, sortTable, toneOf, ring, barThin, barItem, kpiRow };
})();
