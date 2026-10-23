/* Dipakai bersama oleh Monitoring Harian dan KPI Great Sales. Kalau kode akses tersimpan, layar login
   tidak pernah ditampilkan: halaman menampilkan "Memuat" sampai data siap. Login hanya muncul kalau
   kode salah atau pengguna memilih kode lain. */
(function () {
  const KEY = 'mh_code';
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch (e) { /* mode privat */ }
  if (saved) document.documentElement.classList.add('has-code');
  const $ = id => document.getElementById(id);
  window.MHBoot = {
    saved: saved,
    /** Data sudah tampil: sembunyikan kotak "Memuat". */
    done() { document.documentElement.classList.remove('has-code'); },
    /** Kode tersimpan salah: hapus, tampilkan login. */
    invalid(msg) {
      try { localStorage.removeItem(KEY); } catch (e) { /* mode privat */ }
      document.documentElement.classList.remove('has-code');
      if ($('loginErr')) $('loginErr').textContent = msg || '';
    },
    /** Gagal terhubung (bukan salah kode): kode tetap tersimpan, tawarkan coba lagi. */
    fail(msg) {
      if (!$('bootMsg')) return;
      $('bootMsg').textContent = msg;
      $('bootSpin').hidden = true;
      $('bootActions').hidden = false;
    },
  };
  document.addEventListener('DOMContentLoaded', () => {
    if ($('bootRetry')) $('bootRetry').addEventListener('click', () => location.reload());
    if ($('bootOther')) $('bootOther').addEventListener('click', () => document.documentElement.classList.remove('has-code'));
  });
})();
