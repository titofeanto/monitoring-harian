/* Kehadiran salesman: kunjungan pertama per hari. Hijau = kunjungan geo code 1 pertama jam 09.00 atau lebih awal. Data dari Apps Script ?view=hadir. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const CACHE_KEY = 'mh_hadir_cache';
  const BATAS = '09:00'; // kunjungan geo 1 pertama harus jam ini atau lebih awal (09:00 masih hijau, sama dengan laporan nasional)
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BLN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let DATA = null, CODE = '', DT = '', MONTH = '', VIEW = null;
  const S = { f: 'semua' };

  async function fetchHadir(code) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'view=hadir&code=' + encodeURIComponent(code);
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
  function loginErr(msg) { $('loginErr').textContent = msg; $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk'; }
  function problem(msg, silent, badCode) {
    if (!silent) { loginErr(msg); return; }
    if (badCode) { $('appScreen').hidden = true; $('loginScreen').hidden = false; window.MHBoot.invalid(msg); } else window.MHBoot.fail(msg);
  }
  function readCache(code) { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.code === code) return c; } catch (e) { /* salinan rusak */ } return null; }
  function writeCache(code, data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ code, data, at: Date.now() })); } catch (e) { /* penuh / mode privat */ } }

  /* ---- hitung ---- */
  const pad = n => String(n).padStart(2, '0');
  const dow = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getDay();
  const dtName = k => { const d = DATA.dts.find(x => x.kode === k); return d ? d.nama : k; };

  function months() {
    const m = new Set(); DATA.rows.forEach(r => { if (r[0] === DT) m.add(r[2].slice(0, 7)); });
    return [...m].sort().reverse();
  }
  function build() {
    const rows = DATA.rows.filter(r => r[0] === DT && r[2].slice(0, 7) === MONTH);
    const lastAll = DATA.rows.filter(r => r[0] === DT).reduce((a, r) => r[2] > a ? r[2] : a, '');
    const y = +MONTH.slice(0, 4), mo = +MONTH.slice(5, 7), dim = new Date(y, mo, 0).getDate();
    const endDay = lastAll.slice(0, 7) === MONTH ? +lastAll.slice(8, 10) : dim; // bulan terbaru: sampai tanggal data terakhir
    const cell = {}, withData = new Set();
    rows.forEach(r => { cell[r[1] + '|' + r[2]] = r; withData.add(r[2]); });
    const days = [];
    for (let d = 1; d <= endDay; d++) {
      const iso = MONTH + '-' + pad(d);
      if (dow(iso) === 0) continue; // Minggu libur
      days.push({ iso, d, libur: !withData.has(iso) }); // tidak ada satu pun kunjungan di DT itu: dianggap libur
    }
    const names = {}; DATA.sales.forEach(s => { if (s[0] === DT) names[s[1]] = s[2]; });
    const ids = new Set(Object.keys(names)); rows.forEach(r => ids.add(r[1]));
    const sales = [...ids].sort().map(id => {
      let ok = 0, bad = 0, abs = 0;
      const cs = days.map(dy => {
        if (dy.libur) return { st: 'lib' };
        const r = cell[id + '|' + dy.iso];
        if (!r) { abs++; return { st: 'abs' }; }
        const late = r[3] > BATAS, geo0 = !r[4];
        if (!late && !geo0) { ok++; return { st: 'ok', jam: r[3], n: r[5] }; }
        bad++; return { st: 'bad', jam: r[3], n: r[5], late, geo0 };
      });
      const tot = ok + bad + abs;
      return { id, nama: names[id] || '', cs, ok, bad, abs, tot, pct: tot ? ok / tot : null };
    });
    VIEW = { days, sales, cell };
  }

  /* ---- tampil ---- */
  function render() {
    const d = DATA.dts.find(x => x.kode === DT);
    $('csSub').textContent = d ? d.nama : '';
    const upd = DATA.rows.filter(r => r[0] === DT).reduce((a, r) => r[2] > a ? r[2] : a, '');
    $('csUpdated').textContent = upd ? 'Data s.d. ' + (+upd.slice(8, 10)) + ' ' + BLS[+upd.slice(5, 7)] + ' ' + upd.slice(0, 4) : '';
    window.MHFresh.set({ info: upd ? window.MHFresh.status(upd, { label: 'Kehadiran', stale: 2 }) : null });
    build();
    const V = VIEW, work = V.days.filter(x => !x.libur);
    let ok = 0, bad = 0, abs = 0; V.sales.forEach(s => { ok += s.ok; bad += s.bad; abs += s.abs; });
    const tot = ok + bad + abs;
    $('hdKpis').innerHTML =
      '<div class="k"><b>' + V.sales.length + '</b><span>Salesman</span></div>' +
      '<div class="k"><b>' + work.length + '</b><span>Hari kerja berjalan</span></div>' +
      '<div class="k g"><b>' + (tot ? Math.round(ok / tot * 100) : 0) + '%</b><span>Hijau (' + ok + ' dari ' + tot + ')</span></div>' +
      '<div class="k r"><b>' + (bad + abs) + '</b><span>Merah (' + bad + ' terlambat atau geo 0, ' + abs + ' tidak hadir)</span></div>';
    let list = V.sales.slice();
    if (S.f === 'merah') list = list.filter(s => s.bad + s.abs > 0);
    list.sort((a, b) => (a.pct == null ? 2 : a.pct) - (b.pct == null ? 2 : b.pct) || a.id.localeCompare(b.id));
    let h = '<table class="hd"><thead><tr><th class="nm">Salesman</th><th class="pc">% hijau</th>' + V.days.map(dy => '<th class="' + (dy.libur ? 'lib' : '') + '"><span>' + dy.d + '</span><small>' + HARI[dow(dy.iso)] + '</small></th>').join('') + '</tr></thead><tbody>';
    list.forEach(s => {
      h += '<tr><th class="nm"><b>' + esc(s.id) + '</b>' + (s.nama ? '<span>' + esc(s.nama) + '</span>' : '') + '</th><td class="pc ' + (s.pct == null ? '' : s.pct >= 0.9 ? 'g' : s.pct >= 0.7 ? 'a' : 'r') + '">' + (s.pct == null ? '–' : Math.round(s.pct * 100) + '%') + '</td>';
      s.cs.forEach((c, i) => {
        const dy = V.days[i];
        if (c.st === 'lib') h += '<td class="lib">·</td>';
        else if (c.st === 'abs') h += '<td class="abs" title="' + esc(dy.iso) + ': tidak ada kunjungan"></td>';
        else h += '<td class="' + c.st + '" title="' + esc(dy.iso + ' · ' + c.n + ' kunjungan' + (c.geo0 ? ' · geo code 0' : '') + (c.late ? ' · lewat 09.00' : '')) + '">' + c.jam + (c.geo0 ? '<sup>geo</sup>' : '') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    $('hdWrap').innerHTML = list.length ? h : '<div class="empty">Tidak ada salesman yang cocok.</div>';
    const lib = V.days.filter(x => x.libur).map(x => x.d);
    $('hdNote').textContent = 'Jam = kunjungan pertama yang geo code 1 hari itu (aturan sama dengan laporan nasional). "geo" = hari itu tidak ada kunjungan geo code 1, jam yang tampil kunjungan paling awal (merah). Kotak kosong merah = tidak ada kunjungan di hari kerja. Minggu tidak dihitung' +
      (lib.length ? '; tanggal ' + lib.join(', ') + ' dianggap libur karena tidak ada kunjungan sama sekali di DT ini' : '') + '. Salesman tanpa nama: isi nama di tool upload (kartu Kehadiran).';
  }
  function renderMonths() {
    const ms = months();
    if (!ms.length) { return; }
    if (!ms.includes(MONTH)) MONTH = ms[0];
    $('hdMonth').innerHTML = ms.map(m => '<option value="' + m + '">' + BLN[+m.slice(5, 7)] + ' ' + m.slice(0, 4) + '</option>').join('');
    $('hdMonth').value = MONTH;
  }
  function csv() {
    const V = VIEW, q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const out = [['Salesman', 'Nama', '% hijau'].concat(V.days.map(d => d.iso)).map(q).join(',')];
    V.sales.forEach(s => out.push([s.id, s.nama, s.pct == null ? '' : Math.round(s.pct * 100) + '%'].concat(s.cs.map(c => c.st === 'lib' ? 'libur' : c.st === 'abs' ? 'tidak ada' : c.jam + (c.st === 'ok' ? '' : c.geo0 ? ' (geo 0)' : ' (terlambat)'))).map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'kehadiran-' + DT + '-' + MONTH + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  function enter(d, code) {
    DATA = d; CODE = code;
    try { localStorage.setItem(LS_CODE, code); } catch (e) { /* mode privat */ }
    const withData = d.dts.filter(x => d.rows.some(r => r[0] === x.kode));
    if (!withData.some(x => x.kode === DT)) DT = (withData[0] || d.dts[0]).kode;
    $('dtSec').hidden = withData.length < 2;
    $('dtChips').innerHTML = withData.map(x => '<button type="button" data-dt="' + esc(x.kode) + '" aria-pressed="' + (x.kode === DT) + '">' + esc(x.nama || x.kode) + '</button>').join('');
    window.MHBoot.done();
    $('loginScreen').hidden = true; $('appScreen').hidden = false;
    renderMonths(); render();
  }
  async function login(code, silent, noCache) {
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Menghubungkan…'; }
    const c = silent && !noCache ? readCache(code) : null;
    if (c && c.data && c.data.mode === 'hadir') { enter(c.data, code); note('wait'); }
    try {
      const d = await fetchHadir(code);
      if (d.error === 'invalid_code') { problem('Kode akses salah.', silent, true); return false; }
      if (d.error === 'no_data') { if (c) { note('off'); banner(d.message); } else problem(d.message + ' Upload lewat tool upload (kartu Kehadiran).', silent, false); return false; }
      if (d.error) { if (c) { note('off'); banner('Gagal memperbarui (' + (d.message || d.error) + '), ini data tersimpan.'); } else problem('Server Apps Script bermasalah: ' + (d.message || d.error), silent, false); return false; }
      if (d.mode !== 'hadir') { problem('API belum mendukung Kehadiran. Deploy ulang Apps Script (lihat README).', silent, false); return false; }
      writeCache(code, d); enter(d, code); banner(''); note('done');
      return true;
    } catch (err) {
      if (c || DATA) { note('off'); banner('Gagal memperbarui, ini data tersimpan. Ketuk muat ulang untuk coba lagi.'); return false; }
      problem('Tidak bisa terhubung ke Apps Script (' + err.message + ').', silent, false);
      return false;
    }
  }

  $('hdMonth').addEventListener('change', e => { MONTH = e.target.value; render(); });
  $('hdFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    S.f = b.dataset.f; document.querySelectorAll('#hdFilter [data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  $('dtChips').addEventListener('click', e => {
    const b = e.target.closest('[data-dt]'); if (!b) return;
    DT = b.dataset.dt; document.querySelectorAll('#dtChips [data-dt]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderMonths(); render();
  });
  $('hdCsv').addEventListener('click', csv);
  $('loginForm').addEventListener('submit', e => { e.preventDefault(); $('loginErr').textContent = ''; login($('codeInput').value.trim()); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(CACHE_KEY); } catch (e) { /* mode privat */ } location.reload(); });
  $('refreshBtn').addEventListener('click', () => {
    const b = $('refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    banner(''); note('wait'); login(CODE, true, true);
  });

  window.MHFresh.bind();
  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
