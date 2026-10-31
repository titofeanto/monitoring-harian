/* Status kesegaran data di bubble header. Aturan sama dengan tool upload: tanggal yang seharusnya sudah ada = hari ini
   kalau hari kerja, kalau Minggu/libur mundur ke hari kerja terakhir. Hijau = sudah update, kuning = telat. */
(function () {
  const pad = n => String(n).padStart(2, '0');
  const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const utc = s => { const p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
  const utcIso = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const tgl = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + BULAN[+m[2]] + ' ' + m[1] : String(iso || ''); };
  const jam = t => { const d = new Date(t); return pad(d.getHours()) + '.' + pad(d.getMinutes()); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function expected(today, libur) {
    const off = libur instanceof Set ? libur : new Set(libur || []);
    let ms = utc(today);
    for (let i = 0; i < 14; i++) {
      const iso = utcIso(ms);
      if (new Date(ms).getUTCDay() !== 0 && !off.has(iso)) return iso;
      ms -= 86400000;
    }
    return today;
  }

  /* opt.stale: toleransi hari (laporan harian seperti stok: telat kalau lebih dari 2 hari). Tanpa stale: harus s.d. tanggal seharusnya. */
  function status(dataIso, opt) {
    opt = opt || {};
    const d = /^\d{4}-\d{2}-\d{2}/.test(String(dataIso || '')) ? String(dataIso).slice(0, 10) : '';
    const today = isoOf(new Date()), exp = expected(today, opt.libur);
    if (!d) return { lvl: 'late', short: 'Tanggal data ?', long: 'Tanggal data tidak terbaca.', exp };
    const lag = Math.round((utc(exp) - utc(d)) / 86400000);
    const late = lag > (opt.stale || 0);
    return {
      lvl: late ? 'late' : 'ok',
      short: late ? 'Telat ' + lag + ' hari' : 'Sudah update',
      long: (opt.label || 'Data') + ' per ' + tgl(d) + '. Seharusnya sudah s.d. ' + tgl(exp) + (late ? ', jadi telat ' + lag + ' hari.' : '. Sudah update.'),
      exp, lag
    };
  }

  const ST = { fetch: 'ok', text: '', info: null, at: 0 };
  function render() {
    const el = document.getElementById('sync'); if (!el) return;
    let cls, txt;
    if (ST.fetch === 'wait') { cls = 'wait'; txt = ST.text || 'Memperbarui…'; }
    else if (ST.fetch === 'off') { cls = 'off'; txt = 'Gagal memperbarui'; }
    else if (ST.info) { cls = ST.info.lvl; txt = ST.info.short; }
    else { cls = 'ok'; txt = 'Terbaru'; }
    el.className = 'sync ' + cls; el.innerHTML = '<i></i><span>' + esc(txt) + '</span>';
    const pop = document.getElementById('syncPop'); if (!pop) return;
    const d = ST.info ? '<div class="' + ST.info.lvl + ' det"><i></i><span><b>' + esc(ST.info.short) + '.</b> ' + esc(ST.info.long) + (ST.at ? ' Diambil pukul ' + jam(ST.at) + '.' : '') + '</span></div>' : '';
    pop.innerHTML = d +
      '<div class="ok"><i></i><span><b>Sudah update.</b> Data sudah sampai tanggal yang seharusnya.</span></div>' +
      '<div class="late"><i></i><span><b>Telat.</b> Data belum sampai tanggal yang seharusnya. Upload data terbaru di tool upload.</span></div>' +
      '<div class="wait"><i></i><span><b>Memperbarui.</b> Layar sementara memakai salinan terakhir, data baru sedang diambil.</span></div>' +
      '<div class="off"><i></i><span><b>Gagal memperbarui.</b> Layar memakai salinan tersimpan. Ketuk muat ulang untuk coba lagi.</span></div>';
  }
  window.MHFresh = {
    status, expected, tgl, jam,
    /* fetch: 'ok' | 'wait' | 'off'; info: hasil status() atau null */
    set(p) { Object.assign(ST, p); render(); },
    bind() {
      const b = document.getElementById('syncInfo'); if (!b) return;
      b.addEventListener('click', e => { e.stopPropagation(); const p = document.getElementById('syncPop'); p.hidden = !p.hidden; });
      document.addEventListener('click', () => { const p = document.getElementById('syncPop'); if (p) p.hidden = true; });
    }
  };
})();
