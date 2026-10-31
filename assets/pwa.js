/* Pasang aplikasi (PWA): daftarkan service worker dan tampilkan tombol "Pasang aplikasi" di elemen [data-install]. */
(function () {
  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* tanpa SW: tetap bisa dipakai di browser */ });
  }
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var ev = null, slots = function () { return document.querySelectorAll('[data-install]'); };
  function paint() {
    slots().forEach(function (s) {
      if (standalone) { s.hidden = true; return; }
      s.hidden = false;
      if (ev) s.innerHTML = '<button type="button" class="btn plain" data-do-install style="width:100%">Pasang aplikasi di perangkat ini</button>';
      else if (ios) s.innerHTML = '<p class="hint" style="margin:0">Pasang di iPhone atau iPad: ketuk tombol Bagikan, lalu <b>Tambahkan ke Layar Utama</b>.</p>';
      else s.innerHTML = '<p class="hint" style="margin:0">Pasang sebagai aplikasi: buka menu browser (tiga titik), lalu <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</p>';
    });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ev = e; paint(); });
  window.addEventListener('appinstalled', function () { ev = null; standalone = true; paint(); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-do-install]') || !ev) return;
    ev.prompt(); ev.userChoice.finally(function () { ev = null; paint(); });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
})();
