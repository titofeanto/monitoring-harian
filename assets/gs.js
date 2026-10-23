/* KPI Great Sales: scorecard AAM + daftar toko yang perlu dikejar. Data dari Apps Script ?view=gs. */
(function () {
  const LS_CODE = 'mh_code'; // sama dengan Monitoring Harian, jadi tidak perlu login ulang
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const FOP_NEED = 3; // order minimal 3x sebulan (keterangan Summary ScoreCard)
  let DATA = null, CODE = '', VIEW = '';

  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const pct = v => v == null ? '-' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + BULAN[+m[2]] + ' ' + m[1] : String(iso || ''); };

  async function fetchGs(code, dt) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'view=gs&code=' + encodeURIComponent(code) + (dt ? '&dt=' + encodeURIComponent(dt) : '');
    let last;
    for (let i = 0; i < 4; i++) { // Apps Script kadang membalas 404 sesaat
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
        last = new Error('http_' + res.status);
      } catch (err) { last = err; }
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    throw last;
  }

  function loginErr(msg) { $('loginErr').textContent = msg; $('loginBtn').disabled = false; $('loginBtn').textContent = 'Masuk'; }

  async function login(code, silent) {
    if (!silent) { $('loginBtn').disabled = true; $('loginBtn').textContent = 'Menghubungkan…'; }
    try {
      const d = await fetchGs(code, VIEW);
      if (d.error === 'invalid_code') { loginErr('Kode akses salah.'); return; }
      if (d.error === 'no_data') { loginErr('Data Great Sales belum diupload lewat tool upload.'); return; }
      if (d.error) { loginErr('Server Apps Script bermasalah: ' + (d.message || d.error)); return; }
      if (d.mode !== 'gs') { loginErr('API belum mendukung Great Sales. Deploy ulang Apps Script (lihat README).'); return; }
      DATA = d; CODE = code;
      try { localStorage.setItem(LS_CODE, code); } catch (e) { /* mode privat */ }
      $('loginScreen').hidden = true; $('appScreen').hidden = false;
      render();
    } catch (err) {
      if (!silent) loginErr('Tidak bisa terhubung ke Apps Script (' + err.message + ').');
    }
  }

  /** Snapshot per tanggal dari GS_SCORECARD: {tanggal: {kpi: row}}. */
  function snapshots() {
    const by = {};
    DATA.scorecard.forEach(r => { const t = String(r.tanggal); (by[t] = by[t] || {})[r.kpi] = r; });
    return Object.keys(by).sort().map(t => ({ tanggal: t, rows: by[t] }));
  }

  function level(k) {
    const a = num(k.aktual), t = num(k.target);
    if (a == null || !t) return 'amber';
    if (a >= t) return 'green';
    return a >= t * 0.8 ? 'amber' : 'red';
  }

  function kpiList(snap) {
    return Object.values(snap.rows).filter(r => !['SCORE', 'RANK', 'FOP_WEEK'].includes(r.kpi)).map(r => {
      const bobot = num(r.bobot) || 0, poin = num(r.poin);
      return { kpi: r.kpi, label: r.label, target: num(r.target), aktual: num(r.aktual), bobot, poin, hilang: poin == null ? 0 : bobot - poin, catatan: r.catatan };
    }).sort((a, b) => b.hilang - a.hilang);
  }

  const outlets = jenis => DATA.outlets.filter(o => o.jenis === jenis);

  const PS_PARTS = [['cotc', 'COTC'], ['npd', 'NPD'], ['sos', 'SOS'], ['sstd', 'SSTD'], ['banded', 'Banded']];
  const psStores = () => (DATA.ps && DATA.ps.stores) || [];
  const psMissing = o => PS_PARTS.filter(p => String(o[p[0]]) === '0').map(p => p[1]);
  const isPerfect = o => o.status === 'PS FULL' || o.status === 'PS LITE';

  /** Ringkasan PS dari upload mingguan: target = jumlah target Full + Lite semua DT dalam cakupan. */
  function psSummary() {
    const st = psStores();
    if (!st.length) return null;
    const tg = (DATA.ps.targets || []).reduce((a, t) => ({ full: a.full + (num(t.target_full) || 0), lite: a.lite + (num(t.target_lite) || 0) }), { full: 0, lite: 0 });
    const full = st.filter(o => o.status === 'PS FULL').length, lite = st.filter(o => o.status === 'PS LITE').length;
    const target = tg.full + tg.lite;
    return { stores: st.length, full, lite, perfect: full + lite, target, tFull: tg.full, tLite: tg.lite, tanggal: String(st[0].tanggal) };
  }

  /** PS dihitung dari upload Perfect Stores (perfect / target), bukan angka HO; skor total dihitung ulang dari poin. */
  function applyPs(kp) {
    const sm = psSummary();
    if (!sm || !sm.target) return { kp, sm, score: null };
    const k = kp.find(x => x.kpi === 'PS');
    if (k) {
      k.aktual = sm.perfect / sm.target;
      k.poin = k.target ? k.bobot * Math.min(k.aktual / k.target, 1) : null;
      k.hilang = k.poin == null ? 0 : k.bobot - k.poin;
      k.catatan = 'Dihitung dari upload Perfect Stores ' + tgl(sm.tanggal) + ': ' + sm.perfect + ' dari target ' + sm.target + ' toko perfect';
      kp.sort((a, b) => b.hilang - a.hilang);
    }
    return { kp, sm, score: kp.reduce((a, x) => a + (x.poin || 0), 0) };
  }

  function render() {
    const snaps = snapshots(), cur = snaps[snaps.length - 1], prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
    const rank = num(cur.rows.RANK && cur.rows.RANK.aktual), score = num(cur.rows.SCORE && cur.rows.SCORE.aktual);
    const prevRank = prev ? num(prev.rows.RANK && prev.rows.RANK.aktual) : null;
    const fw = cur.rows.FOP_WEEK;
    $('gsSub').textContent = 'Data ' + tgl(cur.tanggal) + (fw && fw.aktual !== '' ? ' · FOP s.d. minggu ' + fw.aktual + ' (' + fw.catatan + ')' : '') +
      (DATA.scope ? ' · Toko ' + DATA.scope.nama : '');

    if (DATA.dts && DATA.dts.length) {
      $('dtSec').hidden = false;
      $('dtChips').innerHTML = [{ kode: '', nama: 'Semua DT' }].concat(DATA.dts).map(d =>
        `<button type="button" class="chip" data-dt="${esc(d.kode)}" aria-pressed="${d.kode === VIEW}">${esc(d.nama)}</button>`).join('');
    }

    const ap = applyPs(kpiList(cur)), kp = ap.kp;
    const scoreShown = ap.score != null && DATA.ps && !DATA.scope ? ap.score : score;
    const delta = prevRank == null || rank == null ? '' : rank < prevRank ? `<span class="delta-up">▲ naik ${prevRank - rank} dari ${prevRank}</span>` : rank > prevRank ? `<span class="delta-down">▼ turun ${rank - prevRank} dari ${prevRank}</span>` : 'tetap';
    const gain = kp.reduce((s, k) => s + k.hilang, 0);
    $('topKpis').innerHTML =
      `<div class="kpi hot"><div class="l">Rank nasional</div><div class="v">${rank == null ? '-' : rank}</div><div class="s">${delta || 'belum ada pembanding'}</div></div>` +
      `<div class="kpi"><div class="l">Score</div><div class="v">${scoreShown == null ? '-' : scoreShown.toFixed(2).replace('.', ',')}</div><div class="s">${ap.sm && !DATA.scope ? 'PS hasil upload mingguan' : 'dari 100'}</div></div>` +
      `<div class="kpi warn"><div class="l">Poin yang masih bisa dikejar</div><div class="v">${gain.toFixed(1).replace('.', ',')}</div><div class="s">terbesar: ${esc(kp[0] ? kp[0].label : '-')}</div></div>`;

    $('tKpi').innerHTML = '<tr><th>KPI</th><th style="text-align:right">Poin hilang</th></tr>' + kp.map(k =>
      `<tr><td><span class="lv ${level(k)}">${esc(k.label)}</span>` +
      `<div style="margin-top:4px"><b>${pct(k.aktual)}</b> dari target ${pct(k.target)} · poin ${k.poin == null ? '-' : k.poin.toFixed(1)}/${k.bobot}</div>` +
      `<div class="muted" style="font-size:11px;margin-top:2px">${esc(k.catatan)}</div></td>` +
      `<td class="n ${k.hilang > 0.05 ? 'no' : 'ok'}">${k.hilang > 0.05 ? '-' + k.hilang.toFixed(1) : '✓'}</td></tr>`).join('');

    renderFop('secFopMinis', 'LOCAL MINIS', 'Weekly FOP Local Minis', kp.find(k => k.kpi === 'FOP_MINIS'));
    renderFop('secFopSpm', 'LOCAL SUPERMARKET', 'Weekly FOP Supermarket (SPM)', kp.find(k => k.kpi === 'FOP_SPM'));
    renderPs(kp.find(k => k.kpi === 'PS'));
    renderBanded(kp.find(k => k.kpi === 'BANDED_MINIS'), kp.find(k => k.kpi === 'BANDED_SPM'));
    renderHist(snaps);
  }

  function fopRows(channel) {
    return outlets('FOP').filter(o => o.channel === channel).map(o => ({ ...o, orders: num(o.v1) || 0, weekNow: String(o.v2) === '1', lastWeek: o.v3 }));
  }

  function renderFop(id, channel, title, k) {
    const rows = fopRows(channel);
    if (!rows.length) { $(id).innerHTML = ''; return; }
    const done = rows.filter(o => o.status === 'WEEKLY');
    const todo = rows.filter(o => o.status !== 'WEEKLY').sort((a, b) => b.orders - a.orders || String(a.dist_nama).localeCompare(b.dist_nama));
    $(id).innerHTML = `<h2>${esc(title)} ${k ? `<span class="lv ${level(k)}">${pct(k.aktual)}</span>` : ''}</h2>` +
      `<p class="gs-note">${done.length} dari ${rows.length} toko aktif sudah WEEKLY di file. ${todo.length} toko belum: kejar sampai order ${FOP_NEED}x bulan ini, mulai dari yang paling dekat.</p>` +
      (todo.length ? `<div class="scroll"><table class="gs"><tr><th>Toko</th><th>Order bln</th><th>Mg ini</th><th>Terakhir</th></tr>` +
        todo.map(o => `<tr><td>${esc(o.outlet_nama)}<div class="muted" style="font-size:11px">${esc(o.dist_nama)} · ${esc(o.remark)} · ${esc(o.status || '-')}</div></td>` +
          `<td class="n">${o.orders} / ${FOP_NEED}</td><td class="n ${o.weekNow ? 'ok' : 'no'}">${o.weekNow ? '✓' : '✗'}</td><td class="n">${o.lastWeek === '' ? '-' : 'mg ' + esc(o.lastWeek)}</td></tr>`).join('') +
        '</table></div>' : '');
  }

  function renderPs(k) {
    const sm = psSummary(), st = psStores();
    if (!sm) { $('secPs').innerHTML = ''; return; }
    const not = st.filter(o => !isPerfect(o)).sort((a, b) => psMissing(a).length - psMissing(b).length || String(a.dist_nama).localeCompare(b.dist_nama));
    const miss = {};
    not.forEach(o => psMissing(o).forEach(m => { miss[m] = (miss[m] || 0) + 1; }));
    const missTxt = Object.keys(miss).sort((a, b) => miss[b] - miss[a]).map(m => `${m} (${miss[m]} toko)`).join(', ');
    const need = Math.max(sm.target - sm.perfect, 0);
    const dtRows = (DATA.ps.targets || []).map(t => {
      const mine = st.filter(o => String(o.dist_kode) === String(t.dist_kode));
      const per = mine.filter(isPerfect).length, tg = (num(t.target_full) || 0) + (num(t.target_lite) || 0);
      return `<tr><td>${esc(t.dist_nama)}</td><td class="n">${mine.filter(o => o.status === 'PS FULL').length}/${num(t.target_full) || 0}</td>` +
        `<td class="n">${mine.filter(o => o.status === 'PS LITE').length}/${num(t.target_lite) || 0}</td><td class="n ${tg && per >= tg ? 'ok' : ''}">${tg ? pct(per / tg) : '-'}</td></tr>`;
    }).join('');
    $('secPs').innerHTML = `<h2>Perfect Stores ${k ? `<span class="lv ${level(k)}">${pct(k.aktual)}</span>` : ''}</h2>` +
      `<p class="gs-note">Data ${esc(tgl(sm.tanggal))}, update mingguan. ${sm.perfect} toko perfect (Full ${sm.full}, Lite ${sm.lite}) dari target ${sm.target}` +
      (need ? `: kurang ${need} toko lagi.` : ': target tercapai.') +
      ` Toko yang belum perfect paling sering kurang: ${esc(missTxt || '-')}.</p>` +
      (dtRows ? `<div class="scroll"><table class="gs"><tr><th>DT</th><th class="n">Full</th><th class="n">Lite</th><th class="n">Capai</th></tr>${dtRows}</table></div>` : '') +
      `<p class="gs-note" style="margin-top:10px">Status Full atau Lite mengikuti hasil HO di file. Toko di bawah ini diurutkan dari yang paling dekat perfect.</p>` +
      (not.length ? `<div class="scroll"><table class="gs"><tr><th>Toko</th><th>KPI</th><th>Kurang</th></tr>` +
        not.map(o => `<tr><td>${esc(o.outlet_nama)}<div class="muted" style="font-size:11px">${esc(o.dist_nama)} · ${esc(o.channel)}</div></td>` +
          `<td class="n">${esc(o.total_kpi)}</td><td class="no">${esc(psMissing(o).join(', ') || '-')}</td></tr>`).join('') + '</table></div>' : '');
  }

  function renderBanded(kMinis, kSpm) {
    const sku = ch => outlets('BANDED_SKU').filter(o => o.channel === ch);
    const outs = outlets('BANDED_OUTLET');
    const list = (title, k, items) => `<details class="box" style="margin-top:8px"><summary>${esc(title)} ${k ? `<span class="lv ${level(k)}">${pct(k.aktual)} / target ${pct(k.target)}</span>` : ''} · ${items.length} SKU</summary>` +
      `<ul class="sku-list">${items.map(o => `<li>${esc(o.outlet_kode)} ${esc(o.outlet_nama)}</li>`).join('')}</ul></details>`;
    $('secBanded').innerHTML = '<h2>Banded</h2><p class="gs-note">SKU banded yang harus ada di toko monitoring. Pastikan tiap toko di daftar bawah sudah order semua SKU channel-nya.</p>' +
      list('Local Minis', kMinis, sku('LOCAL MINIS')) + list('Supermarket (SPM)', kSpm, sku('SPM')) +
      (outs.length ? `<details class="box" style="margin-top:8px"><summary>Toko monitoring banded · ${outs.length} toko</summary><div class="scroll" style="margin-top:8px"><table class="gs"><tr><th>Toko</th><th>Channel</th></tr>` +
        outs.map(o => `<tr><td>${esc(o.outlet_nama)}<div class="muted" style="font-size:11px">${esc(o.dist_nama)}</div></td><td>${esc(o.remark)}</td></tr>`).join('') + '</table></div></details>' : '');
  }

  function renderHist(snaps) {
    if (snaps.length < 2) { $('secHist').innerHTML = '<h2>Riwayat</h2><p class="gs-note">Riwayat rank muncul setelah upload kedua (1 baris per hari upload).</p>'; return; }
    $('secHist').innerHTML = '<h2>Riwayat rank</h2><div class="scroll"><table class="gs"><tr><th>Tanggal</th><th>Rank</th><th>Score</th></tr>' +
      snaps.slice(-14).reverse().map(s => `<tr><td>${tgl(s.tanggal)}</td><td class="n">${esc(s.rows.RANK ? s.rows.RANK.aktual : '-')}</td><td class="n">${s.rows.SCORE ? (num(s.rows.SCORE.aktual) || 0).toFixed(2) : '-'}</td></tr>`).join('') + '</table></div>';
  }

  /** Teks pengingat untuk grup WhatsApp: rank, 3 KPI dengan poin hilang terbesar, toko FOP yang belum order minggu ini, toko PS yang kurang. */
  function reminderText() {
    const snaps = snapshots(), cur = snaps[snaps.length - 1];
    const kp = kpiList(cur).filter(k => k.hilang > 0.05).slice(0, 3);
    const L = [];
    L.push('*KPI GREAT SALES* (' + tgl(cur.tanggal) + ')' + (DATA.scope ? ' - ' + DATA.scope.nama : ''));
    L.push('Rank nasional: *' + (cur.rows.RANK ? cur.rows.RANK.aktual : '-') + '* · Score ' + (cur.rows.SCORE ? (num(cur.rows.SCORE.aktual) || 0).toFixed(2) : '-'));
    if (kp.length) {
      L.push('', 'Fokus poin:');
      kp.forEach((k, i) => L.push((i + 1) + '. ' + k.label + ': ' + pct(k.aktual) + ' (target ' + pct(k.target) + '), poin hilang ' + k.hilang.toFixed(1)));
    }
    [['LOCAL MINIS', 'Local Minis'], ['LOCAL SUPERMARKET', 'SPM']].forEach(c => {
      const todo = fopRows(c[0]).filter(o => o.status !== 'WEEKLY' && !o.weekNow).sort((a, b) => b.orders - a.orders).slice(0, 15);
      if (!todo.length) return;
      L.push('', 'Toko ' + c[1] + ' belum order minggu ini (target ' + FOP_NEED + 'x sebulan):');
      todo.forEach(o => L.push('- ' + o.outlet_nama + ' (' + o.orders + '/' + FOP_NEED + ')'));
    });
    const ps = psStores().filter(o => !isPerfect(o) && psMissing(o).length).sort((a, b) => psMissing(a).length - psMissing(b).length).slice(0, 10);
    if (ps.length) {
      L.push('', 'Perfect Store, lengkapi:');
      ps.forEach(o => L.push('- ' + o.outlet_nama + ': ' + psMissing(o).join(', ')));
    }
    L.push('', 'Detail: ' + location.href.split('?')[0]);
    return L.join('\n');
  }

  $('loginForm').addEventListener('submit', e => { e.preventDefault(); $('loginErr').textContent = ''; login($('codeInput').value.trim()); });
  $('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(LS_CODE); } catch (e) { /* mode privat */ } location.reload(); });
  $('dtChips').addEventListener('click', async e => {
    const b = e.target.closest('.chip'); if (!b) return;
    VIEW = b.getAttribute('data-dt');
    b.textContent = 'Memuat…';
    try { const d = await fetchGs(CODE, VIEW); if (!d.error) { DATA = d; render(); } } catch (err) { render(); }
  });
  $('waBtn').addEventListener('click', () => { window.open('https://wa.me/?text=' + encodeURIComponent(reminderText()), '_blank'); });
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(reminderText()); $('copyMsg').textContent = 'Teks pengingat disalin. Tempel di grup WhatsApp.'; }
    catch (e) { $('copyMsg').textContent = 'Browser tidak mengizinkan salin otomatis. Pakai tombol WhatsApp.'; }
  });

  let saved = null; try { saved = localStorage.getItem(LS_CODE); } catch (e) { /* mode privat */ }
  if (saved) { $('codeInput').value = saved; login(saved, true); }
})();
