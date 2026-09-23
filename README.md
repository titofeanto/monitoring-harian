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
