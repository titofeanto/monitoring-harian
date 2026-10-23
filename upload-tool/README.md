# Upload Data Monitoring Harian

Tool upload + indikator status untuk update data mentah per DT. Proyek Apps Script
terpisah dari API baca (`../google-apps-script/Code.gs`), terpasang di Sheet PUSAT.

- Web app: Execute as Me, akses Only myself. Buka URL `/exec`-nya sebagai pemilik, izinkan sekali.
- Pilih DT, lihat chip status (merah / kuning / hijau), upload file ke kotak yang sesuai.
- Upload menimpa tab DT yang sesuai, mengisi `CONFIG.tanggal_data` / `ngdms_tanggal_data`, dan
  membersihkan cache API 5 menit (lewat `admin=clearCache` dengan kode pusat).
- Backup 1 generasi di tab tersembunyi `(Backup) <TAB>`; tombol Pulihkan mengembalikannya.
- Riwayat upload di tab `(Log) Riwayat Upload` (per Sheet DT). Tab bantu ini tidak dibaca API live.

## Aturan indikator
| Kotak | Merah | Kuning | Hijau |
|---|---|---|---|
| Extract DMS | kosong, header salah, atau bulan beda dari CONFIG periode | INVDate terakhir < hari kerja terakhir | sudah sampai hari kerja terakhir |
| Report NGDMS | kosong / header salah | tanggal report terlambat > 2 hari | tanggal report terbaru |
| Target | tidak ada baris periode CONFIG | - | periode CONFIG ada |
| Norms SKU | kosong | belum diupload bulan ini | diupload bulan ini |
| Referensi | kosong / header salah | Hari Libur belum diisi tahun ini | terisi |

"Hari kerja terakhir" = hari ini, mundur melewati Minggu dan tanggal di `HARI_LIBUR`.
Peringatan lintas kotak: CONFIG periode ketinggalan, dan hasil bulan lalu belum disimpan ke
`HASIL_PERHITUNGAN`.

Update kode: edit file di folder ini, lalu `clasp push -f` dan `clasp deploy -i <deploymentId>`.

## KPI Great Sales
Kotak paling atas. Upload file "Monitoring DAILY KPI GREAT SALES.xlsx" tiap hari. Isi Summary ScoreCard
disimpan ke tab `GS_SCORECARD` di Sheet PUSAT (1 set baris per tanggal, jadi riwayat rank terbentuk),
daftar toko dari Perfect Stores, Weekly FOP, dan Banded ke `GS_OUTLET` (ganti total). Halaman
`great-sales.html` membaca keduanya lewat API (`?view=gs`); kode DT hanya melihat toko DT-nya.
Poin per KPI = bobot x min(aktual / target, 1), jumlahnya harus sama dengan SCORE di file.
