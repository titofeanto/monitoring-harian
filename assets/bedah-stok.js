/* Bedah stok: tampilan dashboard untuk stok DT (filter, KPI, grafik, rincian brand ke SKU). Data dari window.MHStok (stok.js). */
(function () {
  const $ = id => document.getElementById(id);
  const root = $('bedah');
  const M = () => window.MHStok;
  const st = { on: false, chan: 'all', win: '13', brand: '', q: '', only: true, g: 'brand', drill: null, sort: 'butuh', dir: -1 };
  const COL = { habis: '#C0392B', kritis: '#E4684F', menipis: '#F2B705', aman: '#14804F', slow: '#9AAAC6' };
  const NAMA = { habis: 'Habis', kritis: 'Kritis', menipis: 'Menipis', aman: 'Aman', slow: 'Tanpa penjualan' };
  const f1 = n => (Math.round(n * 10) / 10).toLocaleString('id-ID');
  const f0 = n => Math.round(n).toLocaleString('id-ID');
  const pc = v => v == null ? '–' : (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%';
  let rows = [], view = [];

  function compute() {
    const m = M();
    rows = m.rows(st.chan, st.win);
    view = rows.filter(i => (!st.brand || i.brand === st.brand) && (!st.only || i.tot > 0 || i.ana === 'habis') && (!st.q || i._txt.includes(st.q.toLowerCase()) || i._bc.includes(st.q)));
  }

  function agg(list, keyFn) {
    const G = new Map();
    list.forEach(i => {
      const k = keyFn(i); let x = G.get(k);
      if (!x) { x = { k, n: 0, ke: 0, rpp: 0, rd: 0, men: 0, aman: 0, slow: 0, butuh: 0 }; G.set(k, x); }
      x.n++; x.ke += i.ke; x.rpp += i.rpp || 0; x.butuh += i.butuh || 0;
      if (i.ana === 'habis' || i.ana === 'kritis') x.rd++; else if (i.ana === 'menipis') x.men++; else if (i.ana === 'aman') x.aman++; else x.slow++;
    });
    G.forEach(x => { x.cover = x.rpp > 0 ? x.ke / x.rpp : null; });
    return [...G.values()];
  }

  function shell() {
    const m = M(), brands = [...new Set(rows.map(i => i.brand))].sort();
    root.innerHTML =
      '<div class="panel"><div class="f-row">' +
      '<div class="f"><label>Channel</label><div class="chips" id="bdChan">' + [['all', 'Semua'], ['SAT', 'SAT'], ['IDM', 'IDM']].map(c => '<button type="button" data-c="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>' +
      '<div class="f"><label>Rata-rata jual</label><div class="chips" id="bdWin"><button type="button" data-w="13">13 minggu</button><button type="button" data-w="5">1 bulan</button></div></div>' +
      '<div class="f"><label>Brand</label><select id="bdBrand"><option value="">Semua brand</option>' + brands.map(b => '<option>' + m.esc(b) + '</option>').join('') + '</select></div>' +
      '<div class="f"><label>Cari SKU / barcode</label><input type="search" id="bdQ" placeholder="mis. rinso, 8999999…"></div>' +
      '<div class="f"><label>&nbsp;</label><label class="chk"><input type="checkbox" id="bdOnly"> Hanya yang ada stok</label></div>' +
      '</div></div>' +
      '<div id="bdBody"></div>';
    $('bdBrand').value = st.brand; $('bdQ').value = st.q; $('bdOnly').checked = st.only;
  }

  function body() {
    const m = M(), meta = m.meta();
    const cnt = { habis: 0, kritis: 0, menipis: 0, aman: 0, slow: 0 };
    let ke = 0, butuh = 0;
    view.forEach(i => { if (cnt[i.ana] != null) cnt[i.ana]++; ke += i.ke; butuh += i.butuh || 0; });
    const kpi = (cls, b, t) => '<div class="k ' + cls + '"><b>' + b + '</b><span>' + t + '</span></div>';
    let h = '<div class="kpis">' +
      kpi('w', f0(view.length), 'SKU di laporan') + kpi('', f0(ke), 'Stok (karton)') +
      kpi('r', f0(cnt.habis + cnt.kritis), 'Habis + kritis (&lt;1 mgg)') + kpi('y', f0(cnt.menipis), 'Menipis (&lt;2 mgg)') +
      kpi('g', f0(cnt.aman), 'Aman') + kpi('w', f0(butuh), 'Kurang untuk 2 minggu (karton)') + '</div>';
    if (!meta.hasJual) h += '<div class="panel note">Trend penjualan DT ini belum diupload, jadi status hanya dari jumlah stok dan cover tidak bisa dihitung.</div>';

    h += '<div class="grid2"><div class="panel"><h2>Status per brand <small>jumlah SKU, 12 brand teratas</small></h2><div class="lg">' +
      Object.keys(NAMA).map(k => '<span><i style="background:' + COL[k] + '"></i>' + NAMA[k] + '</span>').join('') + '</div>' + stack() + '</div>' +
      '<div class="panel"><h2>Sebaran cover <small>stok ÷ jual per minggu</small></h2>' + dist() + '</div></div>';

    h += '<div class="panel"><h2>Rincian <span class="chips" id="bdTabs" style="margin-left:4px">' +
      [['brand', 'Brand'], ['sku', 'SKU'], ['status', 'Status']].map(t => '<button type="button" data-g="' + t[0] + '" aria-pressed="' + (st.g === t[0]) + '">' + t[1] + '</button>').join('') +
      '</span><span class="crumb" id="bdCrumb"></span><span style="margin-left:auto"><button class="btn plain" id="bdCsv" type="button">Unduh CSV</button></span></h2>' +
      '<div class="tw"><table id="bdTbl"></table></div>' +
      '<p class="note">Klik baris brand atau status untuk turun ke daftar SKU. Klik judul kolom untuk mengurutkan. Cover = stok (karton) ÷ rata-rata jual per minggu. ' +
      (meta.hasJual ? 'Trend sampai ' + meta.trendTo + '. ' : '') + 'Stok per ' + m.esc(meta.tanggal) + ' · ' + m.esc(meta.dtNama) + '.</p></div>';
    $('bdBody').innerHTML = h;
    table();
  }

  /* ---- grafik ---- */
  function stack() {
    const by = agg(view, i => i.brand).sort((a, b) => b.n - a.n).slice(0, 12);
    if (!by.length) return '<p class="note">Tidak ada data.</p>';
    const per = {}; view.forEach(i => { const o = per[i.brand] = per[i.brand] || {}; o[i.ana] = (o[i.ana] || 0) + 1; });
    const mx = Math.max(...by.map(x => x.n)), W = 440, L = 96, rh = 22, H = by.length * rh + 6;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Status stok per brand">';
    by.forEach((x, r) => {
      let cx = L; const y = r * rh + 3;
      s += '<text x="' + (L - 6) + '" y="' + (y + 12) + '" text-anchor="end" font-size="11">' + M().esc(x.k.length > 14 ? x.k.slice(0, 13) + '…' : x.k) + '</text>';
      ['habis', 'kritis', 'menipis', 'aman', 'slow'].forEach(k => {
        const n = (per[x.k] || {})[k] || 0; if (!n) return;
        const w = n / mx * (W - L - 28);
        s += '<rect x="' + cx + '" y="' + y + '" width="' + w + '" height="16" rx="3" fill="' + COL[k] + '"><title>' + M().esc(x.k) + ' · ' + NAMA[k] + ': ' + n + '</title></rect>'; cx += w;
      });
      s += '<text x="' + (cx + 5) + '" y="' + (y + 12) + '" font-size="11">' + x.n + '</text>';
    });
    return s + '</svg>';
  }
  function dist() {
    const B = [['< 1', 0, 1], ['1–2', 1, 2], ['2–4', 2, 4], ['4–8', 4, 8], ['> 8', 8, 1e9]], n = B.map(() => 0);
    let tanpa = 0, habis = 0;
    view.forEach(i => { if (i.ana === 'habis') habis++; else if (i.cover == null) tanpa++; else B.forEach((b, k) => { if (i.cover >= b[1] && i.cover < b[2]) n[k]++; }); });
    const items = [['Habis', habis, COL.habis]].concat(B.map((b, k) => [b[0] + ' mgg', n[k], k === 0 ? COL.kritis : k === 1 ? COL.menipis : COL.aman])).concat([['Tanpa jual', tanpa, COL.slow]]);
    const mx = Math.max(1, ...items.map(x => x[1])), W = 440, H = 190, bw = 44, gap = (W - items.length * bw) / (items.length + 1), base = H - 34;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Sebaran cover stok">';
    items.forEach((x, k) => {
      const h = x[1] / mx * (base - 18), px = gap + k * (bw + gap);
      s += '<rect x="' + px + '" y="' + (base - h) + '" width="' + bw + '" height="' + h + '" rx="5" fill="' + x[2] + '"><title>' + x[0] + ': ' + x[1] + ' SKU</title></rect>' +
        '<text x="' + (px + bw / 2) + '" y="' + (base - h - 5) + '" text-anchor="middle" font-size="12" font-weight="700">' + x[1] + '</text>' +
        '<text x="' + (px + bw / 2) + '" y="' + (base + 15) + '" text-anchor="middle" font-size="10.5">' + x[0] + '</text>';
    });
    return s + '</svg>';
  }

  /* ---- tabel ---- */
  const covTxt = c => c == null ? '–' : f1(c);
  const covCls = c => c == null ? '' : c < 1 ? 'neg' : c < 2 ? '' : 'pos';
  function table() {
    const t = $('bdTbl'), e = M().esc;
    let head, data;
    if (st.drill || st.g === 'sku') {
      let list = view;
      if (st.drill) list = view.filter(i => st.drill.k === 'brand' ? i.brand === st.drill.v : i.ana === st.drill.v);
      $('bdCrumb').innerHTML = st.drill ? '<a id="bdBack">Semua</a> › ' + e(st.drill.k === 'brand' ? st.drill.v : NAMA[st.drill.v] || 'Habis') : '';
      head = [['nama', 'SKU'], ['ke', 'Stok (krt)'], ['rpp', 'Jual / mgg'], ['cover', 'Cover (mgg)'], ['ana', 'Status'], ['yoy', 'vs thn lalu'], ['butuh', 'Kurang 2 mgg']];
      const key = st.sort, d = st.dir;
      data = list.slice().sort((a, b) => {
        const va = key === 'ana' ? M().ANA[a.ana][2] : key === 'nama' ? a.nama : a[key], vb = key === 'ana' ? M().ANA[b.ana][2] : key === 'nama' ? b.nama : b[key];
        if (key === 'nama') return d * String(va).localeCompare(String(vb));
        return d * ((va == null ? -1e9 : va) - (vb == null ? -1e9 : vb));
      }).slice(0, 300).map(i => '<tr><td>' + e(i.nama) + '<span class="sub">' + e(i.brand) + ' · ' + e(i.bc) + '</span></td><td>' + f1(i.ke) + '</td><td>' + (i.rpp > 0 ? f1(i.rpp) : '–') +
        '</td><td class="' + covCls(i.cover) + '">' + covTxt(i.cover) + '</td><td><span class="tag ' + (M().ANA[i.ana][1]) + '">' + M().ANA[i.ana][0] + '</span></td><td class="' + (i.yoy < 0 ? 'neg' : i.yoy > 0 ? 'pos' : '') + '">' + pc(i.yoy) + '</td><td>' + (i.butuh > 0 ? '<b>' + f0(i.butuh) + '</b>' : '–') + '</td></tr>');
    } else {
      $('bdCrumb').innerHTML = '';
      const byStatus = st.g === 'status';
      const G = agg(view, i => byStatus ? i.ana : i.brand);
      head = [['k', byStatus ? 'Status' : 'Brand'], ['n', 'SKU'], ['ke', 'Stok (krt)'], ['rpp', 'Jual / mgg'], ['cover', 'Cover (mgg)'], ['rd', 'Habis+kritis'], ['men', 'Menipis'], ['butuh', 'Kurang 2 mgg']];
      const key = head.some(h => h[0] === st.sort) ? st.sort : 'butuh', d = st.dir;
      data = G.sort((a, b) => key === 'k' ? d * String(a.k).localeCompare(String(b.k)) : d * ((a[key] == null ? -1e9 : a[key]) - (b[key] == null ? -1e9 : b[key])))
        .map(x => '<tr class="click" data-k="' + e(x.k) + '"><td>' + e(byStatus ? (NAMA[x.k] || 'Habis') : x.k) + '</td><td>' + x.n + '</td><td>' + f0(x.ke) + '</td><td>' + f1(x.rpp) + '</td><td class="' + covCls(x.cover) + '">' + covTxt(x.cover) +
          '</td><td>' + (x.rd || '–') + '</td><td>' + (x.men || '–') + '</td><td>' + (x.butuh > 0 ? '<b>' + f0(x.butuh) + '</b>' : '–') + '</td></tr>');
    }
    t.innerHTML = '<thead><tr>' + head.map(h => '<th data-s="' + h[0] + '">' + h[1] + (st.sort === h[0] ? (st.dir < 0 ? ' ▼' : ' ▲') : '') + '</th>').join('') + '</tr></thead><tbody>' +
      (data.length ? data.join('') : '<tr><td colspan="' + head.length + '">Tidak ada data.</td></tr>') + '</tbody>';
  }

  function csv() {
    const e = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const out = [['Brand', 'SKU', 'Barcode', 'Stok karton', 'Jual per minggu (karton)', 'Cover minggu', 'Status', 'Kurang untuk 2 minggu (karton)'].map(e).join(',')];
    view.forEach(i => out.push([i.brand, i.nama, i.bc, f1(i.ke), i.rpp > 0 ? f1(i.rpp) : '', i.cover == null ? '' : f1(i.cover), M().ANA[i.ana][0], i.butuh || 0].map(e).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'bedah-stok.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  function sync() {
    document.querySelectorAll('#bdChan [data-c]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === st.chan)));
    document.querySelectorAll('#bdWin [data-w]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === st.win)));
  }
  function refresh() {
    if (!st.on || !M().meta().ok) return;
    compute();
    if (!$('bdBody')) shell();
    sync(); body();
  }

  root.addEventListener('click', ev => {
    const c = ev.target.closest('[data-c]'); if (c) { st.chan = c.dataset.c; st.drill = null; shellKeep(); return; }
    const w = ev.target.closest('[data-w]'); if (w) { st.win = w.dataset.w; shellKeep(); return; }
    const g = ev.target.closest('[data-g]'); if (g) { st.g = g.dataset.g; st.drill = null; st.sort = 'butuh'; st.dir = -1; refresh(); return; }
    if (ev.target.closest('#bdBack')) { st.drill = null; refresh(); return; }
    if (ev.target.closest('#bdCsv')) { csv(); return; }
    const th = ev.target.closest('th[data-s]'); if (th) { const k = th.dataset.s; st.dir = st.sort === k ? -st.dir : (k === 'k' || k === 'nama' ? 1 : -1); st.sort = k; table(); return; }
    const tr = ev.target.closest('tr.click'); if (tr) { st.drill = { k: st.g === 'status' ? 'ana' : 'brand', v: tr.dataset.k }; st.sort = 'butuh'; st.dir = -1; refresh(); }
  });
  function shellKeep() { compute(); shell(); sync(); body(); }
  root.addEventListener('change', ev => {
    if (ev.target.id === 'bdBrand') { st.brand = ev.target.value; st.drill = null; refresh(); }
    if (ev.target.id === 'bdOnly') { st.only = ev.target.checked; refresh(); }
  });
  let tm;
  root.addEventListener('input', ev => { if (ev.target.id === 'bdQ') { clearTimeout(tm); tm = setTimeout(() => { st.q = ev.target.value.trim(); refresh(); }, 200); } });

  $('csView').addEventListener('click', ev => {
    const b = ev.target.closest('[data-v]'); if (!b) return;
    st.on = b.dataset.v === 'bedah';
    document.querySelectorAll('#csView [data-v]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    root.hidden = !st.on;
    $('csCard').hidden = st.on; $('csList').hidden = st.on;
    if (st.on) { $('csMore').hidden = true; shellKeep(); } else M().render();
  });
  window.MHBedah = { refresh: () => { if (st.on && $('bdBody')) { const b = st.brand; compute(); if (!rows.some(i => i.brand === b)) st.brand = ''; shellKeep(); } else refresh(); } };
})();
