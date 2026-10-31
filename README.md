# Monitoring Harian — GitHub Pages + Google Sheet

Google Sheet hanya menyimpan **data mentah**: target, extract DMS, norms
SKU, SKU Fokus, dan report NGDMS. Sheet tidak berisi rumus. Halaman ini
(di GitHub Pages) mengambil data mentah lewat Apps Script, lalu
**menghitung semua pencapaian dan insentif di browser** dengan aturan yang
sama seperti Monitoring v13.

```
Google Sheet  --(Apps Script, doGet)-->  JSON mentah  --(fetch)-->  Halaman GitHub Pages
 data mentah          API baca-saja                                hitung + tampilkan + simulasi
```

## Gratis, dan siapa bisa melihat apa

- **GitHub Pages gratis** untuk repo publik. **Apps Script gratis** untuk
  akun Google biasa.
- Karena repo publik, **kode sumber halaman ini bisa dilihat siapa saja**.
  Data DT (target, transaksi, Product Hierarchy) tidak ada di kode sumber.
  Data itu hanya keluar setelah seseorang memasukkan **kode akses tim** yang
  tersimpan di Sheet.
- Kode akses ini PIN bersama, bukan login sungguhan. Siapa pun yang tahu
  kodenya bisa melihat data semua DSR. Untuk mengganti kode, ubah nilainya
  di tab `CONFIG`. Tidak perlu deploy ulang.

## Langkah 1 — Buat Google Sheet dari template

1. Buka [sheets.google.com](https://sheets.google.com) > Blank spreadsheet.
2. **File > Import > Upload**, pilih
   `../sheet-raw-v3/Template_Data_Mentah_Monitoring.xlsx`.
3. Pilih **Replace spreadsheet**. **Hapus centang** "Convert text to
   numbers, dates, and formulas", lalu klik **Import data**.
4. Di tab `CONFIG`, ganti `kode_akses` dari `GANTI-KODE-INI` ke kode tim
   Anda. Cek `periode`, `hk_total`, `hk_run`, dan `tanggal_data`.
5. Isi data mentah. Isi tab `PANDUAN` dan `../sheet-raw-v3/KONSEP_SHEET.md`
   menjelaskan tiap tab dan kolomnya.
   - `DMS_EXTRACT` dan `NORMS_SKU` masih kosong.
   - Untuk tab dari file DMS (`DMS_EXTRACT`, `NORMS_SKU`, `NGDMS_ASRT`,
     `OUTLET_MASTER`): buka tabnya, pilih **File > Import > Upload** file
     asli > **Replace current sheet**, dan hapus centang "Convert text to
     numbers". Dengan cara ini, kode outlet 18 digit tetap utuh.

Nama tab dan header baris 1 tidak boleh diubah. Halaman mencari kolom lewat
nama header, jadi urutan kolom bebas.

### Ritme update

| Kapan | Tab |
|---|---|
| Harian | `DMS_EXTRACT` (ganti isi), `CONFIG`: `hk_run` dan `tanggal_data` |
| Setiap tarik report | `NGDMS_ASRT`, `CONFIG`: `ngdms_tanggal_data` |
| Akhir bulan, sebelum ganti periode | Klik **"Simpan hasil ke Sheet"** di web app (lihat "Rekap kuartal SS" di bawah) — kalau terlewat, bulan itu tidak bisa direkap lagi di kuartal berikutnya |
| Awal bulan | `TARGET` (tambah baris periode baru), `NORMS_SKU`, `CONFIG`: `periode` dan `hk_total` |
| Saat berubah | `SKU_FOKUS`, `DSR`, `OUTLET_MASTER`, `KPI`, `MASTER_PRODUK` |

## Langkah 2 — Pasang Apps Script

1. Di Sheet, buka **Extensions > Apps Script**.
2. Hapus isi `Code.gs` bawaan, tempel isi file
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs) dari paket ini.
3. Simpan (ikon disket atau `Ctrl+S`).
4. Uji dulu sebelum deploy: di dropdown fungsi (atas, sebelah tombol Run),
   pilih `testRead`, klik **Run**. Kali pertama akan diminta izin — pilih
   akun Google Anda, klik **Advanced > Buka (nama proyek) (tidak aman)**,
   lalu **Allow**. Ini normal untuk skrip milik sendiri yang belum
   dipublikasikan ke Google.
5. Buka **View > Logs** (atau `Ctrl+Enter`). Kalau semua tab terbaca,
   log berisi jumlah baris dan header tiap tab, plus ukuran respons. Kalau
   muncul error "Tab tidak ditemukan: ...", cek nama tab.

## Langkah 3 — Deploy sebagai Web App

1. Klik **Deploy > New deployment**.
2. Klik ikon gerigi di sebelah "Select type", pilih **Web app**.
3. Isi:
   - **Execute as**: `Me` (akun Anda)
   - **Who has access**: `Anyone`
4. Klik **Deploy**. Kalau diminta izin lagi, ulangi seperti langkah 2.4.
5. Salin **Web app URL** yang muncul (diakhiri `/exec`). Simpan, dipakai di
   langkah berikutnya.

Setiap kali Anda mengubah isi `Code.gs`, ulangi dari **Deploy > Manage
deployments > (pilih deployment) > pensil edit > Deploy** supaya
perubahan kepakai — bukan `New deployment` lagi (itu akan membuat URL
baru).

## Langkah 4 — Siapkan repo GitHub

1. Buat akun GitHub kalau belum punya: [github.com/join](https://github.com/join) (gratis).
2. Buat repo baru: klik **+** di kanan atas > **New repository**. Beri
   nama (mis. `monitoring-harian`), pilih **Public**, jangan centang
   "Add a README" (folder ini sudah punya). Klik **Create repository**.
3. Isi `assets/config.js` di folder ini dengan URL dari Langkah 3.5:
   ```js
   window.APP_CONFIG = {
     APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec",
   };
   ```
4. Push folder ini ke repo yang baru dibuat. Folder sudah disiapkan sebagai
   git repository lokal, jadi tinggal:
   ```bash
   cd monitoring-harian-web
   git add -A
   git commit -m "Monitoring harian: halaman GitHub Pages + Apps Script"
   git branch -M main
   git remote add origin https://github.com/<akun-anda>/<nama-repo>.git
   git push -u origin main
   ```
   Ganti `<akun-anda>` dan `<nama-repo>` sesuai repo Anda. Kalau diminta
   login, GitHub sekarang pakai **Personal Access Token** sebagai
   pengganti password saat push lewat `git` — buat di
   [github.com/settings/tokens](https://github.com/settings/tokens) (scope
   `repo` saja cukup), pakai token itu sebagai password saat diminta.
   Kalau lebih nyaman tanpa command line, bisa juga drag-drop semua file
   dan folder ke halaman repo lewat tombol **Add file > Upload files** di
   GitHub.

## Langkah 5 — Nyalakan GitHub Pages

1. Di repo, buka **Settings > Pages**.
2. Di **Build and deployment > Source**, pilih **Deploy from a branch**.
3. Di **Branch**, pilih `main` dan folder `/ (root)`, klik **Save**.
4. Tunggu 1-2 menit. Halaman GitHub Pages memuat langsung sebagai file
   statis (`.nojekyll` di repo ini melewati proses build Jekyll), jadi
   tidak masuk antrean build.
5. URL-nya muncul di halaman Settings > Pages yang sama, bentuknya
   `https://<akun-anda>.github.io/<nama-repo>/`.

## Langkah 6 — Uji

1. Buka URL dari Langkah 5.5.
2. Masukkan kode akses yang Anda isi di `CONFIG!kode_akses`.
3. Kalau berhasil, tab Ringkasan menampilkan semua DSR. Di bawah tabel ada
   kotak status data. Merah = ada tab yang kosong atau salah isi, dengan
   rinciannya. Biru = data terbaca.
4. Pilih DSR untuk melihat rincian insentif, SS per BU, assortment E2E/E2S,
   toko, dan norms SKU. Coba tab Simulator dan Low Hanging Fruit.
5. Setelah mengganti data di Sheet, tunggu sampai 5 menit (lama cache),
   lalu klik **Keluar** dan masuk lagi. Untuk melihat perubahan seketika,
   jalankan fungsi `clearCache` dari editor Apps Script (dropdown fungsi >
   pilih `clearCache` > Run).

## Rekap kuartal SS dan recheck angka di Sheet

Di bawah tabel Secondary Sales tiap DSR ada **"Rekap SS 3 Bulan (Penyetaraan
Kuartal)"**: target dan aktual untuk periode aktif dan 2 bulan sebelumnya,
plus totalnya. Ini rekap untuk dicek, **tidak mengubah tier atau nominal
insentif bulanan** — itu tetap dihitung dari pencapaian bulan itu sendiri.

Tombol **"Simpan hasil ke Sheet"** (di sebelah kode akses, atas halaman)
menulis hasil hitung semua DSR untuk periode aktif ke tab
`HASIL_PERHITUNGAN` — angka yang sama persis dengan yang tampil di web
app, per DSR per bulan. Gunanya dua:

- **Recheck manual.** Kalau ada rumus atau logic yang dicurigai salah,
  bandingkan tab ini dengan angka di web app, atau buat rumus pembanding
  sendiri di kolom sebelahnya.
- **Sumber aktual bulan-bulan sebelumnya untuk rekap kuartal.**
  `DMS_EXTRACT` hanya menyimpan bulan berjalan (ditimpa tiap bulan), jadi
  begitu bulan tutup, satu-satunya cara aktualnya "diingat" untuk kuartal
  berikutnya adalah lewat tombol ini. Kalau lupa diklik, bulan itu tampil
  **"belum disimpan"** di rekap kuartal seterusnya — bukan dianggap Rp 0,
  tapi juga tidak bisa direkap lagi karena datanya sudah keburu hilang
  dari `DMS_EXTRACT`.

Klik tombolnya di akhir setiap bulan, sebelum mengganti `CONFIG!periode`
ke bulan berikutnya. Menyimpan ulang periode yang sama tidak menggandakan
baris (menimpa), jadi aman diklik berkali-kali kalau data direvisi.

## Masalah yang mungkin muncul

- **"APPS_SCRIPT_URL belum diisi di assets/config.js"** — Langkah 4.3
  belum dilakukan atau belum di-push.
- **"Kode akses salah"** — cek `CONFIG!kode_akses` di Sheet, huruf besar/
  kecil dan spasi berpengaruh.
- **"Tidak bisa terhubung ke Apps Script"** — cek URL di `config.js`
  memang diakhiri `/exec`, dan deployment masih aktif (Deploy > Manage
  deployments).
- **Data tidak berubah setelah Sheet diedit** — cache 5 menit (lihat
  Langkah 6.5), atau jalankan `clearCache` di editor Apps Script.
- **"kode outlet ... tersimpan sebagai angka"** — kolom kode di
  `DMS_EXTRACT` berubah jadi angka dan digit belakangnya hilang. Import
  ulang tab itu dengan "Convert text to numbers" tidak dicentang.
- **Norms SKU / SKU Fokus 0 semua** — cek `MASTER_PRODUK` berisi SKUCode
  yang ada di extract, dan `OUTLET_MASTER` berisi toko di `NORMS_SKU`.
- **"Gagal menyimpan: ..." saat klik "Simpan hasil ke Sheet"** — sama
  penyebabnya seperti gagal terhubung di atas (cek URL/deployment), atau
  deployment lama belum diperbarui setelah `Code.gs` diubah (Deploy >
  Manage deployments > pensil > Version: New version > Deploy).
- **Bulan tampil "belum disimpan" terus di rekap kuartal padahal sudah
  lewat** — tombol "Simpan hasil ke Sheet" belum sempat diklik sebelum
  `CONFIG!periode` diganti ke bulan berikutnya. Datanya di `DMS_EXTRACT`
  sudah tertimpa, jadi bulan itu tidak bisa direkap lagi; pastikan klik
  tombolnya tiap akhir bulan mulai sekarang.
- **"Tab TARGET tidak punya baris untuk periode ..."** — kolom `periode` di
  `TARGET` harus sama dengan `CONFIG!periode` (format `YYYY-MM`).

## Struktur file

```
index.html                    halaman utama (login + 3 tab)
assets/style.css               tampilan
assets/app.js                  mesin hitung dari data mentah + logika halaman
assets/config.js               URL Apps Script Anda (isi di Langkah 4.3)
google-apps-script/Code.gs      kode API, tempel ke Apps Script
google-apps-script/appsscript.json  manifes Apps Script (referensi; tidak perlu diedit manual)
.nojekyll                      supaya GitHub Pages memuat langsung tanpa proses build
```

## Cek Stok & Harga Naik (`cek-stok.html`)

Halaman untuk melihat sisa stok gudang barang yang harganya naik, scan barcode, dan **export Excel**
untuk komunikasi ke toko. Data di Sheet PUSAT (bukan Sheet DT):

| Tab | Isi | Diisi lewat |
|---|---|---|
| `HARGA_PL` | Daftar harga Unilever (harga lama dan baru per karton dan pcs, barcode, tanggal berlaku). Ganti total, semua DT. | Tool upload, kotak "Daftar Harga Unilever" (file SUMMARY PRICE LIST, sheet HARGA BARU + HARGA LAMA) |
| `STOK_GUDANG` | Stok karton/lusin/pcs per SKU per DT, Hanya baris DT di file yang diganti. | Tool upload, kotak "Stok Gudang DT" (Distributor Stock Report; DT dibaca dari file) |
| `JUAL_SKU` | Penjualan bulanan (GSV ribuan rupiah) per DT x SKU x bucket, dari compile Trend Sales. Ganti total. | Tool upload, kotak "Trend Penjualan (compile)" |
| `SKU_FLAG` | Daftar SKU per channel: `SAT` (Alfamart) dan `IDM`, dikunci dengan barcode. Upload satu channel tidak mengubah channel lain. | Tool upload, kotak "Daftar SKU SAT & IDM" |

- Update Apps Script API (`google-apps-script/Code.gs`, endpoint `?view=stok`) lalu deploy ulang di deployment yang sama.
- Kode DT hanya melihat stok DT-nya. Kode pusat melihat semua DT lewat chip.
- Harga naik/turun dihitung dari selisih harga baru vs lama per karton. SKU baru yang tidak ada di HARGA LAMA dicocokkan lewat barcode (kemasan sama); kalau tidak ketemu, ditandai BARU.
- Biaya beli dan MAP dari laporan stok tidak pernah dikirim ke Sheet.
- Stok total pcs = karton × isi + lusin × 12 + pcs.

### Analisa stok SAT dan IDM

Di halaman Cek Stok, pilih **SAT (Alfamart)** atau **IDM** untuk melihat apakah stok DT masih cukup untuk SKU di daftar itu.

- Sumber penjualan: compile Trend Sales (tab `JUAL_SKU`, upload di kotak "Trend Penjualan (compile)"). Isinya GSV per bulan per DT x SKU x bucket. Bucket: SAT (Store Banner ALFAMART), IDM (outlet DC IDM atau banner INDOMARET), lalu GT atau LMT menurut Sheet2 compile, sisanya LAIN.
- Qty ditaksir = GSV ÷ harga karton tanpa PPN (harga yang berlaku sekarang). Bisa meleset beberapa persen karena harga bulan lalu dan promo.
- Rata-rata jual per minggu: **13 minggu** = 3 bulan terakhir, **5 minggu** = 1 bulan terakhir. Dasar bisa **semua channel** (stok dipakai bersama) atau **khusus SAT/IDM**.
- Cover (minggu) = stok dalam karton ÷ rata-rata jual per minggu.
- Status: Habis, Kritis (cover kurang dari 1 minggu), Menipis (kurang dari 2 minggu), Aman, Tanpa penjualan (ada stok, tidak ada jual di rentang itu), Tidak ada di laporan (SKU belum ada di laporan stok DT).
- Pembanding tahun lalu: 3 bulan terakhir vs 3 bulan yang sama tahun lalu, dan pola 2 bulan ke depan tahun lalu. Kalau pola itu naik, kolom "kurang untuk 2 minggu" sudah memperhitungkannya.
- Data trend hanya sampai bulan compile terakhir. Bulan berjalan belum masuk; ganti compile tiap awal bulan.
- Barcode yang sama di dua SKU (mis. kemasan ML ke G) digabung jadi satu baris. Export Excel mengikuti daftar yang tampil. IDM Pareto diberi badge.
- Batas minggu ada di `CFG` di `assets/stok.js`. Kolom RPP laporan stok tidak dipakai.

### Status data di header

Bubble di header tiga halaman memakai aturan yang sama dengan tool upload: tanggal yang seharusnya sudah ada = hari ini
kalau hari kerja, kalau Minggu atau libur mundur ke hari kerja terakhir. Hijau "Sudah update", kuning "Telat N hari".
Stok dianggap telat kalau lebih dari 2 hari. Ketuk tombol i untuk melihat tanggal data dan pukul pengambilan.
Libur hanya dikenali di halaman Monitoring Harian (tab `HARI_LIBUR`); halaman lain hanya mengecualikan Minggu.

### Stock otomatis dari SBA Logbook App

Stock distributor yang diunggah tim di SBA Logbook App ikut terkirim ke tab `STOK_GUDANG` (aksi `simpanStok`),
jadi tidak perlu upload dua kali. Hanya DT yang ada di `DAFTAR_DT` yang diterima; DT lain diabaikan.

Tanpa token, karena repo SBA publik. Server menolak (balasan `skipped`) DT yang tidak terdaftar, laporan yang lebih
lama dari yang tersimpan, dan laporan dengan jumlah SKU kurang dari 50% data tersimpan. Isi tab sebelum ditimpa
disalin ke tab tersembunyi `(Backup) STOK_GUDANG` (satu generasi). Kotak "Stok Gudang DT" di tool upload tetap
ada sebagai cadangan manual.

## Banner maintenance (`admin-status.html`)

Halaman admin untuk memunculkan pemberitahuan di Monitoring Daily, Cek Stok, dan SBA Logbook App.

- Buka `admin-status.html`, isi kode admin, pilih Normal, Banner (kuning, aplikasi tetap bisa dipakai), atau Tutup aplikasi (layar penuh), isi pesan, Simpan.
- Status disimpan di Script property `STATUS_JSON` Apps Script dan dibaca publik lewat `?view=status`. Aplikasi mengecek tiap 5 menit dan saat dibuka kembali.
- Kode admin tidak ada di repo. Hanya hash-nya di Script property `ADMIN_HASH`. Ganti kode lewat bagian "Ganti kode admin". Lima kode salah menahan semua percobaan 15 menit.
- Skrip pembaca (`assets/status-banner.js`) berdiri sendiri, jadi tetap jalan kalau skrip utama aplikasi gagal. Kalau Apps Script tidak terjangkau, SBA memakai `status.json` di repo sebagai cadangan.
