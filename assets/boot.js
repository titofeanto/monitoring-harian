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

  /* Salinan respons API di IndexedDB (muat jauh lebih besar dari localStorage; respons Monitoring Harian beberapa MB). */
  function idb() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('mh_cache', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  function kv(mode, fn) {
    return idb().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req ? req.result : null);
      tx.onerror = tx.onabort = () => rej(tx.error);
    })).catch(() => null); // IndexedDB tidak tersedia / mode privat: halaman tetap jalan tanpa salinan
  }

  window.MHBoot = {
    cacheGet: key => kv('readonly', st => st.get(key)),
    cacheSet: (key, val) => kv('readwrite', st => st.put(val, key)),
    cacheClear: key => kv('readwrite', st => st.delete(key)),
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
      if ($('bootBox')) $('bootBox').classList.add('is-fail');
    },
  };
  /* Bungkus kotak status dengan kerangka halaman (header + kartu), supaya bentuk aplikasi langsung terlihat. */
  function skeleton() {
    const box = $('bootBox'), inner = box && box.firstElementChild;
    if (!inner || box.querySelector('.boot-top')) return;
    const row = w => '<div class="boot-li"><i class="skel skel-dot"></i><div><i class="skel" style="width:' + w + '%"></i><i class="skel" style="width:' + (w - 25) + '%"></i></div></div>';
    const top = document.createElement('div');
    top.className = 'boot-top'; top.setAttribute('aria-hidden', 'true');
    top.innerHTML = '<div><div class="boot-row"><i class="skel skel-on skel-dot"></i><div style="flex:1;display:grid;gap:7px"><i class="skel skel-on" style="width:46%"></i><i class="skel skel-on" style="width:28%"></i></div></div>' +
      '<i class="skel skel-on skel-lg" style="width:58%;margin-top:8px"></i><i class="skel skel-on" style="width:34%"></i></div>';
    const main = document.createElement('div');
    main.className = 'boot-main';
    inner.className = 'card boot-status';
    main.appendChild(inner);
    const more = document.createElement('div');
    more.setAttribute('aria-hidden', 'true'); more.style.cssText = 'display:grid;gap:12px';
    more.innerHTML = '<div class="boot-kpis"><i class="skel skel-tile"></i><i class="skel skel-tile"></i><i class="skel skel-tile"></i><i class="skel skel-tile"></i></div>' +
      '<div class="card">' + row(70) + row(85) + row(60) + row(78) + '</div>';
    main.appendChild(more);
    box.appendChild(top); box.appendChild(main);
  }
  document.addEventListener('DOMContentLoaded', () => {
    skeleton();
    if (saved) { t0 = Date.now(); tick(); timer = setInterval(tick, 250); }
    if ($('bootRetry')) $('bootRetry').addEventListener('click', () => location.reload());
    if ($('bootOther')) $('bootOther').addEventListener('click', () => document.documentElement.classList.remove('has-code'));
  });
})();
