/* Hitungan menu Kategori (plan 034). Murni, tanpa DOM: dipakai assets/kategori.js di browser dan tests/kat-calc.test.mjs di Node.
   Rumus sama dengan halaman By Category v3 di Power BI (tabel Formula). Server (view=kategori) sudah menggabungkan bulan + minggu per
   toko x category x brand; di sini hanya menjumlahkan baris sesuai filter lalu menghitung ukuran turunan.
   Baris hasil expand(): { t, b, tk, br, fy, ly, ty, r13, r5, wk:[LW,L2W,L3W], m:[LM,L2M,L3M], l3, mty[12], mly[12] }. */
(function () {
  const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BULANP = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const z = v => (isFinite(v) ? v : 0) + 0;          // buang NaN dan -0

  /** Ubah respons server menjadi daftar baris objek dengan referensi toko dan brand. */
  function expand(d) {
    return (d.r || []).map(a => ({
      t: a[0], b: a[1], tk: d.tokos[a[0]], br: d.brands[a[1]],
      fy: a[2], ly: a[3], ty: a[4], r13: a[5], r5: a[6], wk: [a[7], a[8], a[9]], m: [a[10], a[11], a[12]], l3: a[13],
      mty: a.slice(14, 26), mly: a.slice(26, 38),
    }));
  }

  /** Ukuran satu kumpulan baris. basis 'weekly' (B = 7) atau 'monthly' (B = 365/12). K = { hkTy, hkLy }. */
  function M(items, basis, K) {
    const o = { fy: 0, ly: 0, ty: 0, r13: 0, r5: 0, wk: [0, 0, 0], m: [0, 0, 0], mty: new Array(12).fill(0), mly: new Array(12).fill(0), l3: 0, n: items.length };
    items.forEach(p => {
      o.fy += p.fy; o.ly += p.ly; o.ty += p.ty; o.r13 += p.r13; o.r5 += p.r5; o.l3 += p.l3;
      for (let i = 0; i < 3; i++) { o.wk[i] += p.wk[i]; o.m[i] += p.m[i]; }
      for (let i = 0; i < 12; i++) { o.mty[i] += p.mty[i]; o.mly[i] += p.mly[i]; }
    });
    const b = basis === 'monthly' ? 365 / 12 : 7;
    o.avgFY = o.fy / 365 * b; o.avgSP = o.ly / K.hkLy * b; o.avgTY = o.ty / K.hkTy * b;
    // Mode bulanan (tanpa data minggu): RR 13 dan RR 5 tidak ada; rr3m = rata-rata 3 bulan penuh terakhir per basis.
    o.rr13 = K.bulanan ? null : o.r13 / 13 / 7 * b; o.rr5 = K.bulanan ? null : o.r5 / 5 / 7 * b;
    o.rr3m = K.d3 ? o.l3 / K.d3 * b : 0;
    o.a2a = o.avgFY !== 0 ? o.avgTY / o.avgFY - 1 : null;      // kosong bila pembanding 0 (DIVIDE di PBI)
    o.sp = o.avgSP !== 0 ? o.avgTY / o.avgSP - 1 : null;
    return o;
  }

  /* ---- format (sama dengan PBI: #,0 / #,0,,M / ▲ 0,0% / ▼ 0,0%) ---- */
  const fN = v => nf0.format(z(Math.round(v)));
  const fM = v => nf0.format(z(Math.round(v / 1e6))) + 'M';
  const fP = v => nf1.format(z(v * 100)) + '%';
  /** Growth: HTML kecil. Hijau naik, merah turun, nol hitam, kosong "–". Kelas .kt-up / .kt-down / .kt-na dari style.css. */
  function fG(v) {
    if (v == null || !isFinite(v)) return '<span class="kt-na">–</span>';
    const t = nf1.format(Math.abs(v) * 100) + '%';
    return v > 0.00049 ? '<span class="kt-up">▲ ' + t + '</span>' : v < -0.00049 ? '<span class="kt-down">▼ ' + t + '</span>' : t;
  }
  /** Rupiah ringkas untuk teks bantu (jt, M, rb). */
  function rp(v) { const a = Math.abs(v); return a >= 1e9 ? nf1.format(v / 1e9) + ' M' : a >= 1e6 ? nf1.format(v / 1e6) + ' jt' : a >= 1e3 ? nf0.format(v / 1e3) + ' rb' : nf0.format(v); }

  /** Kolom tabel pivot, urutan persis PBI. Satu kolom: { h, v:(m,total)=>teks/HTML, c:rata tengah, bar:(m,total)=>pecahan } atau { sp:1 } (spasi). */
  function cols(basis, bulanan) {
    const w = basis !== 'monthly', na = '<span class="kt-na">–</span>', wk = i => m => bulanan ? na : fM(m.wk[i]), rr = k => m => m[k] == null ? na : fN(m[k]);
    return [
      { h: 'ABS FY LY', v: m => fN(m.fy) }, { h: 'ABS YTD LY', v: m => fN(m.ly) }, { h: 'ABS YTD TY', v: m => fN(m.ty) },
      { h: 'Contr LY', v: (m, t) => t.ly ? fP(m.ly / t.ly) : '–', c: 1, bar: (m, t) => t.ly ? m.ly / t.ly : 0, tot: '100,0%' },
      { h: 'Contr TY', v: (m, t) => t.ty ? fP(m.ty / t.ty) : '–', c: 1, bar: (m, t) => t.ty ? m.ty / t.ty : 0, tot: '100,0%' }, { sp: 1 },
      { h: 'Growth SP', v: m => fG(m.sp), c: 1 }, { h: 'Growth A2A', v: m => fG(m.a2a), c: 1 }, { sp: 1 },
      { h: 'AVG FY LY', v: m => fN(m.avgFY) }, { h: 'AVG SP LY', v: m => fN(m.avgSP) }, { h: 'AVG YTD TY', v: m => fN(m.avgTY) }, { sp: 1 },
      { h: 'RR 13', v: rr('rr13') }, { h: 'RR 5', v: rr('rr5') }, { sp: 1 },
      { h: w ? 'L3W' : 'L3M', v: w ? wk(2) : m => fM(m.m[2]) }, { h: w ? 'L2W' : 'L2M', v: w ? wk(1) : m => fM(m.m[1]) }, { h: w ? 'LW' : 'LM', v: w ? wk(0) : m => fM(m.m[0]) },
    ];
  }

  const byTy = (a, b) => b.m.ty - a.m.ty;
  /** Baris pivot Division > Category > Brand. open = Set kunci yang terbuka ('d:DIV', 'c:DIV|CAT'). -> [{ lv, key, label, kids, open, m }] */
  function rowsCategory(items, basis, K, open) {
    const out = [], tree = new Map();
    items.forEach(p => {
      const d = p.br.division, c = p.br.category, bn = p.br.brand;
      if (!tree.has(d)) tree.set(d, new Map());
      const cm = tree.get(d); if (!cm.has(c)) cm.set(c, new Map());
      const bm = cm.get(c); if (!bm.has(bn)) bm.set(bn, []); bm.get(bn).push(p);
    });
    const flat = x => x instanceof Map ? [...x.values()].reduce((a, y) => a.concat(flat(y)), []) : x;
    const rank = mp => [...mp.entries()].map(([k, v]) => ({ k, v, m: M(flat(v), basis, K) })).sort(byTy);
    rank(tree).forEach(D => {
      const dk = 'd:' + D.k, dop = open.has(dk);
      out.push({ lv: 1, key: dk, label: D.k, kids: 1, open: dop, m: D.m });
      if (!dop) return;
      rank(D.v).forEach(C => {
        const ck = 'c:' + D.k + '|' + C.k, cop = open.has(ck);
        out.push({ lv: 2, key: ck, label: C.k, kids: 1, open: cop, m: C.m });
        if (!cop) return;
        rank(C.v).forEach(Bn => out.push({ lv: 3, key: 'b:' + D.k + '|' + C.k + '|' + Bn.k, label: Bn.k, kids: 0, open: false, m: Bn.m }));
      });
    });
    return out;
  }

  const NO_SM = 'Tanpa salesman';
  /** Baris pivot Salesman > Outlet. closed = Set kunci salesman yang ditutup (bawaan terbuka). */
  function rowsOutlet(items, salesmen, basis, K, closed) {
    const out = [], bySm = new Map();
    items.forEach(p => { const s = p.tk.sm; if (!bySm.has(s)) bySm.set(s, new Map()); const om = bySm.get(s); if (!om.has(p.t)) om.set(p.t, []); om.get(p.t).push(p); });
    const smLabel = s => s < 0 ? NO_SM : salesmen[s].nama + ' (' + salesmen[s].dt + ')';
    [...bySm.entries()].map(([s, om]) => ({ s, om, m: M([...om.values()].reduce((a, x) => a.concat(x), []), basis, K) })).sort(byTy).forEach(S => {
      const k = 's:' + S.s, op = !closed.has(k);
      out.push({ lv: 1, key: k, label: smLabel(S.s), kids: 1, open: op, m: S.m });
      if (!op) return;
      [...S.om.entries()].map(([t, its]) => ({ t, its, m: M(its, basis, K) })).sort(byTy).forEach(O =>
        out.push({ lv: 2, key: 'o:' + O.t, label: O.its[0].tk.id + ' - ' + O.its[0].tk.nama, kids: 0, open: false, m: O.m }));
    });
    return out;
  }

  /** Nomor minggu ISO dari tanggal YYYY-MM-DD (label "WEEK n"). */
  function isoWeek(iso) {
    const p = iso.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
    const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
  }
  /** "NOV 2026 - WEEK 46" */
  const periodLabel = (iso, bulanan) => BULANP[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4) + (bulanan ? '' : ' - WEEK ' + isoWeek(iso));
  /** Jumlah hari 3 bulan kalender terakhir sampai cutoff (awal bulan ke-2 sebelum bulan cutoff s/d cutoff). */
  const days3 = iso => { const p = iso.split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(+p[0], +p[1] - 3, 1)) / 864e5) + 1; };
  const dateLabel = iso => (+iso.slice(8, 10)) + ' ' + BULAN[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);

  /** Insight satu kategori. stores = indeks toko pada filter; itemsOf(ti) = baris toko itu yang lolos filter. */
  function insight(stores, itemsOf, catName, basis, K, tokos) {
    const stat = ti => {
      const its = itemsOf(ti).filter(p => p.br.category === catName), m = M(its, basis, K);
      return { t: ti, tk: tokos[ti], m, ever: its.some(p => p.ty + p.fy > 0) };
    };
    const all = stores.map(stat), buyers = all.filter(x => x.m.l3 > 0);
    const aktif = stores.filter(ti => itemsOf(ti).some(p => p.l3 > 0));
    const aktifSet = new Set(aktif);
    const tot = M(stores.reduce((a, ti) => a.concat(itemsOf(ti).filter(p => p.br.category === catName)), []), basis, K);
    const turun = all.filter(x => (x.ever && x.m.l3 === 0) || (x.m.sp != null && x.m.sp < -0.2))
      .sort((p, q) => (p.m.sp == null ? -1 : p.m.sp) - (q.m.sp == null ? -1 : q.m.sp)).slice(0, 6);
    const naik = all.filter(x => x.m.sp != null && x.m.sp > 0.2 && x.m.l3 > 0).sort((p, q) => q.m.sp - p.m.sp).slice(0, 5);
    const med = Object.create(null);
    buyers.forEach(x => { (med[x.tk.ch] = med[x.tk.ch] || []).push(x.m.rr13 == null ? x.m.rr3m : x.m.rr13); });
    Object.keys(med).forEach(c => { const v = med[c].sort((a, b) => a - b); med[c] = v[Math.floor(v.length / 2)]; });
    const pel = all.filter(x => aktifSet.has(x.t) && !x.ever).map(x => ({ t: x.t, tk: x.tk, pot: med[x.tk.ch] || 0 })).sort((a, b) => b.pot - a.pot).slice(0, 6);
    return { tot, buyers: buyers.length, aktif: aktif.length, turun, naik, pel, penetrasi: aktif.length ? buyers.length / aktif.length : 0 };
  }

  /** Komposisi kategori satu toko dibanding rata-rata toko sejenis (channel sama) pada filter. */
  function composition(stores, itemsOf, ti, cats, basis, K, tokos) {
    const mineIts = itemsOf(ti), ch = tokos[ti].ch, peers = stores.filter(p => p !== ti && tokos[p].ch === ch);
    const mine = cats.map(c => { const its = mineIts.filter(p => p.br.category === c); return { cat: c, m: M(its, basis, K), ever: its.some(p => p.ty + p.fy > 0) }; });
    const tot = mine.reduce((n, r) => n + r.m.ty, 0) || 1;
    const pt = cats.map(c => peers.reduce((n, p) => n + M(itemsOf(p).filter(q => q.br.category === c), basis, K).ty, 0)), ptt = pt.reduce((a, b) => a + b, 0) || 1;
    return { peers: peers.length, rows: mine.map((r, i) => {
      const mix = r.m.ty / tot, pm = pt[i] / ptt;
      return Object.assign({ mix, pm }, r, { status: r.m.l3 > 0 ? (mix < pm - 0.05 && pm > 0.1 ? 'bawah' : 'aktif') : (r.ever ? 'berhenti' : 'belum') });
    }) };
  }

  window.MHKat = { expand, M, fN, fM, fP, fG, rp, cols, rowsCategory, rowsOutlet, insight, composition, isoWeek, periodLabel, days3, dateLabel, BULAN, NO_SM };
})();
