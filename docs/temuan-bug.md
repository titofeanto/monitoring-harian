# Temuan bug: uji input nakal (plan 025)

Dicari dengan fuzz berbenih di `tests/fuzz/`. Tiap bug yang diperbaiki punya tes yang gagal dulu (merah), akar penyebab, perbaikan sekecil mungkin, dan komit sendiri.

## Cara menjalankan

| Perintah | Isi |
| --- | --- |
| `node --test tests/` | termasuk `tests/fuzz.test.mjs` (60 iterasi, uji skala 5.000 baris), `tests/fuzz-regresi.test.mjs`, `tests/fuzz-browser*.test.mjs` |
| `FUZZ_N=1000 FUZZ_SEED=1 node tests/fuzz/server.fuzz.mjs` | fuzz server penuh; keluar 1 bila ada pelanggaran invarian |
| `FUZZ_PROTO=1 node tests/fuzz/server.fuzz.mjs` | menyalakan teks kunci prototipe (temuan T-01) |
| `node tests/fuzz/browser.fuzz.mjs [--seeds 3] [--stress]` | respons rusak dan dimutasi ke tiap halaman (Chrome headless lewat CDP) |
| `node tests/fuzz/xss.sweep.mjs` | sapuan injeksi HTML: tiap jalur string respons diisi payload, tiap halaman dan tab dibuka |
| `node tests/fuzz/login.fuzz.mjs` | kode akses aneh, klik ganda, tombol Segarkan, localStorage rusak/tidak ada, jaringan gagal |
| `node tests/fuzz/explore.fuzz.mjs` | percobaan interaktif (laci, ganti DT, cari aneh, lembar detail, ukuran jendela, Kembali, hash aneh, reload) |
| `node tests/fuzz/scale.browser.mjs` | 2.000 salesman dan 5.000 toko di browser |
| `node tests/fuzz/slow.fuzz.mjs` | respons 8 detik: layar muat, tombol Masuk, submit ganda |
| `node tests/fuzz/scale.mjs` | 5.000 dan 50.000 baris DMS per DT di server |
| `node tests/fuzz/proto.repro.mjs` | reproduksi T-01 |

Invarian server: tanpa pengecualian lolos dari `doGet`; tanpa `NaN`/`Infinity`/`undefined`/`[object Object]`/`GMT+0900` di hasil sebelum `JSON.stringify`; `view=rank` tanpa kunci terlarang; kode salah hanya `{error}`; satu panggilan < 3 detik.
Invarian browser: tanpa galat konsol tak tertangani, tanpa kata `NaN|undefined|Infinity|[object Object]|null` di teks tampil, tanpa HTML hasil injeksi, layar login tetap bisa dipakai setelah galat.

## Diperbaiki

| Bug | Tingkat | Reproduksi | Akar penyebab | Status |
| --- | --- | --- | --- | --- |
| B-01 Ringkasan Monitoring Harian (kode pusat) menulis "Assortment NaN" dan "ECO NaN" di kartu tiap DT, kartu Total semua DT, dan kartu tiap DSR | tinggi | login `index.html` dengan kode pusat, tab Ringkasan; `tests/fuzz-browser.test.mjs` | komit 3300f70 mengubah `dsrCard` agar membaca angka mentah (`ssA`, `ssT`, `asA`, `asT`, `ecoA`, `ecoT`), tetapi `renderAllDt` dan daftar semua DSR masih mengirim teks `ssSub/asSub/ecoSub`, jadi `dsrCard` memformat `undefined`. Ditemukan fuzz browser saat respons dasar saja (bukan hanya mutasi) | diperbaiki: 91ef47d (kartu DT dan Total), b9025e8 (kartu per DSR) |
| B-02 Sel Sheet berisi HTML di kolom tanggal, jam, level dirender sebagai HTML (XSS tersimpan): skrip berjalan di browser pemirsa dan bisa membaca `mh_code` di localStorage | tinggi (syarat: ada yang menulis HTML ke Sheet; kode pusat adalah akses penuh) | `node tests/fuzz/xss.sweep.mjs` (486 jalur, 6 sink); `tests/fuzz-browser.test.mjs` | `tgl()` mengembalikan string asli untuk teks bukan tanggal dan dipakai langsung di template `innerHTML` (gs.js, stok.js); `hadir.js` menulis `c.jam` mentah; `level` KPI masuk atribut `class` tanpa dibatasi | diperbaiki: 12465fa |
| B-03 Cek Stok, Kehadiran, Ranking, Great Sales macet di layar "Memuat" tanpa tombol apa pun bila salinan tersimpan (`mh_*_cache`) berbentuk lain, mis. dari versi aplikasi sebelumnya; hanya hapus data situs yang memulihkan | tinggi | `tests/fuzz-browser-cache.test.mjs` (11 bentuk salinan) | `login()` memanggil `enter(salinan)` di luar `try/catch`; render melempar sebelum permintaan jaringan dibuat | diperbaiki: ec8a9f2 |
| B-04 Sel tanggal/jam `KEHADIRAN` yang diketik tangan (Sheet menyimpannya sebagai Date) keluar sebagai teks panjang `Mon Nov 02 2026 09:00:00 GMT+0900 ...`; halaman Kehadiran menampilkan "Data s.d. NaN undefined" dan hari tidak cocok | sedang | `tests/fuzz-regresi.test.mjs` (tes Date) | `respondHadir_` memakai `String(r[2])`, sedangkan stok dan Great Sales sudah memformat Date | diperbaiki: 77131ef (`cellText_`). Harness juga diperbaiki: Date dari sel dimutasi sebelumnya tidak dikenali `instanceof` di dalam vm, jadi jalur Date tidak pernah teruji |
| B-05 Header atau kolom hilang/berganti nama (GS_BANDED_SKU, GS_SCORECARD, GS_TOKO, GS_BULANAN, GS_PS, HARGA_PL, JUAL_SKU, SKU_FLAG) menulis teks "undefined" ke kode SKU, tanggal, merek, rekap | rendah | `tests/fuzz-regresi.test.mjs` | `String(r.kolom)` pada properti yang tidak ada | diperbaiki: 8cbe843 (`str_`), a0bd808 (GS_TOKO.outlet_kode), 90c549e (`fillCols_`: kolom wajib per tab diisi kosong di dua pembaca) |
| B-06 `HARGA_PL` berisi teks bukan angka (`abc`, `#N/A`) atau kolom harga hilang menghasilkan `NaN` di `hNew/hOld/sNew/sOld` sebelum JSON | rendah | `tests/fuzz-regresi.test.mjs` | `+r.h_old` tanpa memeriksa hasil; hanya string kosong yang ditangani | diperbaiki: 84b0679 (`numOrNull_`) |
| B-07 Tanggal berbulan 13 atau 00 (`2026-13-01`) tampil "1 undefined 2026" di catatan KPI dan di tanggal halaman | rendah | `tests/fuzz-regresi.test.mjs` (`gsTgl_`) | `GS_BULAN[+bulan]` tanpa pemeriksaan rentang 1-12 (server `gsTgl_`, klien `tgl()` di gs.js, stok.js, rank.js, fresh.js) | diperbaiki: 3993e64 (server), 12465fa (klien) |
| B-08 Tombol Masuk dengan kode kosong atau spasi mengirim permintaan ke Apps Script dan menampilkan "Server Apps Script bermasalah: missing_code" (Great Sales, Ranking, Cek Stok, Kehadiran) | rendah | `tests/fuzz-browser-kode.test.mjs` | handler submit tidak memeriksa kosong; hanya `app.js` punya pemeriksaan itu | diperbaiki: b712317 |
| B-09 Tombol Segarkan ditekan cepat menumpuk permintaan paralel ke Apps Script di semua halaman (10 klik menghasilkan 5 permintaan) | rendah | `tests/fuzz-browser-segarkan.test.mjs` | tanpa penanda sedang berjalan | diperbaiki: 99c41b1 |
| B-10 `doPost simpanHasil` menerima periode `2026-13`/`2026-00` dan menulis baris; body JSON `null` membalas `server_error: TypeError` | rendah | `tests/fuzz-regresi.test.mjs` | regex periode hanya dua digit; body hasil `JSON.parse` tidak diperiksa bertipe objek | diperbaiki: 25b1bb5 |
| T-01 Teks `constructor`, `__proto__`, `toString`, `hasOwnProperty` sebagai kode outlet, kode SKU, level-9, BU: respons memuat `NaN`, `"[object Object]"`, atau `TypeError: Cannot read properties of undefined` per DT (tertangkap per DT, halaman lain tetap jalan) | rendah (data nyata tidak berisi kata itu) | `node tests/fuzz/proto.repro.mjs`; atau `FUZZ_PROTO=1 node tests/fuzz/server.fuzz.mjs` | sekitar 70 peta `{}` di Code.gs berkunci teks dari Sheet; kunci warisan prototipe bentrok | diperbaiki: 13b7e35 (51 peta berkunci teks Sheet jadi `Object.create(null)`; `tests/protokey.test.mjs`; `proto.repro.mjs` 0 pelanggaran). Peta literal respons tetap `{}`; tidak ada sisa yang diketahui |
| T-03 Respons JSON literal `null` menampilkan "Cannot read properties of null (reading 'error')" di layar galat | rendah | `kind=json_null` di `browser.fuzz.mjs` | `d.error` tanpa memeriksa `d` | diperbaiki: 1a335f0 (`MHUtil.needObj` di kelima halaman; `tests/fuzz/cases.respons.mjs`) |
| T-05 `JUAL_SKU.mulai` yang diketik tangan dan menjadi Date keluar sebagai `String(Date)` | rendah | ubah `mulai` jadi Date di Sheet | `respondStok_` memakai `String(r.mulai)`; format yang benar (`yyyy-MM` atau tanggal) perlu keputusan pemilik | diperbaiki: 7d95dcc (`cellText_` format `yyyy-MM`) |

## Belum diperbaiki

| Bug | Tingkat | Reproduksi | Dugaan penyebab | Saran |
| --- | --- | --- | --- | --- |
| T-02 Sel tanggal berisi teks bukan tanggal di data yang tidak ditulis tool upload: `GS_BULANAN.periode` (rekap "undefined ZZZ"), `KEHADIRAN.tanggal` ("Data s.d. NaN"), `INVDate` DMS di Ringkasan pusat ("null November 2026") | rendah | `node tests/fuzz/browser.fuzz.mjs --seeds 3` (kind html/long) | `periode` ditulis `snapshotRows_` sendiri dan tanggal kehadiran ditulis tool upload sebagai `yyyy-MM-dd`; hanya sel yang diketik tangan yang bisa kotor | bila ingin ketat: validasi tanggal di server (`/^\d{4}-\d{2}-\d{2}$/`) dan buang baris tidak valid |
| T-04 `doGet(undefined)` membalas `server_error: TypeError` | rendah | `/tmp`-style: `ctx.doGet(undefined)` | Apps Script selalu mengirim `e` | tidak perlu diperbaiki |

## Hasil putaran terakhir

- Fuzz server: seed 1, 2, 5 dengan `FUZZ_N=1000` (24.200 panggilan per putaran), seed 21 dengan 600: 0 pelanggaran setelah perbaikan. Sebelum perbaikan: 28 sampai 160 pelanggaran per putaran (kelas B-04 sampai B-07, T-01).
- `tests/fuzz.test.mjs` (60 iterasi, tetap) dijalankan di `node --test tests/`.
- Fuzz browser: 20 jenis respons rusak (HTML 404/500/200, JSON terpotong, kosong, `null`, teks, angka, array, objek kosong, `no_data`, `bad_code`, `missing_code`, `unknown_dt`, `server_error` berisi HTML atau tanpa pesan, HTTP 500, jaringan putus, gagal 3x lalu pulih) dan 5 mode mutasi sah x 3 seed x 6 halaman = 210 pemuatan; temuan tersisa hanya kelas T-02 dan T-03. Mode `--stress` (kontrak server dilanggar: angka jadi teks, kunci hilang, semua daun null) menambah temuan kelas sama dan tidak ada galat jenis baru.
- Sapuan XSS: 486 jalur string, 6 sink, semuanya tertutup (B-02); sapuan ulang setelah perbaikan 0 sink.
- Login: 11 kode akses (kosong, spasi, 10.000 karakter, skrip, kontrol, emoji, RTL, huruf besar, spasi ujung, newline, benar), 9 keadaan localStorage rusak, tanpa localStorage, `setItem` penuh, tanpa IndexedDB, jaringan putus lalu pulih: 0 temuan setelah B-03, B-08, B-09.
- Jelajah interaktif (`explore.fuzz.mjs`): laci buka/tutup 40x, ganti DT 30x, 17 teks pencarian aneh pada semua kolom isian, lembar detail 15x, ukuran 360/768/1280 saat lembar terbuka, sidebar ke semua halaman + tombol Kembali, keluar lalu masuk, reload saat laci terbuka, 10 hash aneh per halaman: 0 temuan. (Satu laporan semu: halaman memantulkan teks pencarian "undefined" yang diketik penguji.)

## Yang sudah baik (tidak ada bug)

- Cross-DT: kode DT dengan `&dt=` DT lain tetap hanya melihat DT-nya sendiri (gs, stok, hadir, mentah); `view=rank` tidak memuat `outlet/sku/omzet/kode_akses/toko_kode` setelah 1.000+ mutasi.
- Kode salah (kosong, spasi, huruf besar, 10.000 karakter, karakter kontrol, array, objek, `__proto__`) hanya `{error}`; `admin=clearCache|snapshot` dengan kode DT ditolak.
- Waktu server: 5.000 baris DMS per DT 36-78 ms per respons, 50.000 baris < 650 ms.
- Browser: 2.000 salesman dan 5.000 toko tampil di bawah 2 detik; localStorage melempar (`SecurityError`), `setItem` penuh, IndexedDB melempar: login dan data tetap jalan.
