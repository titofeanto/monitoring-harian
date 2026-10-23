/* Dipakai bersama oleh Monitoring Harian dan KPI Great Sales. Kalau kode akses tersimpan, layar login
   tidak pernah ditampilkan: halaman menampilkan "Memuat" sampai data siap. Login hanya muncul kalau
   kode salah atau pengguna memilih kode lain. */
(function () {
  const KEY = 'mh_code';
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch (e) { /* mode privat */ }
  if (saved) document.documentElement.classList.add('has-code');
  const $ = id => document.getElementById(id);
  const LKEY = 'mh_load_ms:' + location.pathname.split('/').pop();
  const DEFAULT_MS = 6000;
  let t0 = Date.now(), timer = null, est = DEFAULT_MS;
  try { est = Math.min(Math.max(+localStorage.getItem(LKEY) || DEFAULT_MS, 2000), 60000); } catch (e) { /* mode privat */ }

  /* Bar mendekati 95% menurut perkiraan waktu (rata-rata muat sebelumnya di perangkat ini), lalu menunggu data. */
  function tick() {
    const el = Date.now() - t0, bar = $('bootBar'), eta = $('bootEta');
    if (!bar || !eta) return;
    bar.style.width = Math.min(95, 95 * (1 - Math.exp(-1.6 * el / est))) + '%';
    const left = Math.ceil((est - el) / 1000);
    eta.textContent = left > 0
      ? 'Perkiraan sekitar ' + left + ' detik lagi'
      : 'Lebih lama dari biasanya (' + Math.round(el / 1000) + ' detik), mohon tunggu';
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  window.MHBoot = {
    /** Teks tahap, mis. "Memuat 2 DT…". */
    stage(msg) { if ($('bootMsg')) $('bootMsg').textContent = msg; },
    saved: saved,
    /** Data sudah tampil: sembunyikan kotak "Memuat". */
    done() {
      if (timer) { // simpan rata-rata waktu muat (EMA) untuk perkiraan berikutnya
        try { localStorage.setItem(LKEY, String(Math.round(0.5 * est + 0.5 * (Date.now() - t0)))); } catch (e) { /* mode privat */ }
      }
      stop();
      document.documentElement.classList.remove('has-code');
    },
    /** Kode tersimpan salah: hapus, tampilkan login. */
    invalid(msg) {
      try { localStorage.removeItem(KEY); } catch (e) { /* mode privat */ }
      stop();
      document.documentElement.classList.remove('has-code');
      if ($('loginErr')) $('loginErr').textContent = msg || '';
    },
    /** Gagal terhubung (bukan salah kode): kode tetap tersimpan, tawarkan coba lagi. */
    fail(msg) {
      if (!$('bootMsg')) return;
      $('bootMsg').textContent = msg;
      stop();
      $('bootProg').hidden = true;
      $('bootActions').hidden = false;
    },
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (saved) { t0 = Date.now(); tick(); timer = setInterval(tick, 250); }
    if ($('bootRetry')) $('bootRetry').addEventListener('click', () => location.reload());
    if ($('bootOther')) $('bootOther').addEventListener('click', () => document.documentElement.classList.remove('has-code'));
  });
})();
