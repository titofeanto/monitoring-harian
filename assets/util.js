/* Helper bersama semua halaman. Dimuat sebelum skrip halaman lain. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.MHUtil = { esc };
})();
