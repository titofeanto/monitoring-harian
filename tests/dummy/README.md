# Data dummy end-to-end

SEMUA data di sini FIKTIF: nama toko, salesman, produk, angka, dan kode akses (`dummy-pusat`, `dummy-dt-tmk`, `dummy-dt-srg`, hanya untuk tes). Tidak ada data, nama, atau ID Sheet nyata.

## Cara menjalankan

- `npm run dummy` menulis `tests/ui/fixtures/dummy-*.json` (7 berkas). Hasilnya identik tiap kali (PRNG berbenih, "sekarang" dibekukan di 2026-11-18).
- `node --test tests/` menjalankan `tests/dummy.test.mjs` bersama tes lain.
- Lihat di halaman: `node tests/ui/shot.mjs great-sales skor dummy-gs-pusat 390 light` (pola sama untuk `ranking`, `cek-stok`, `kehadiran`, `index` dengan `dummy-rank`, `dummy-stok`, `dummy-hadir`, `dummy-mh`). Server uji sudah menerima `?fx=dummy-...` tanpa perubahan.

## Cara kerja

`dataset.mjs` membangun isi Sheet palsu (pusat + dua Sheet DT). `fakeSpreadsheet.mjs` membungkusnya sebagai `SpreadsheetApp`. `build-fixtures.mjs` memuat `Code.gs` asli lewat `loadGs` dan memanggil `doGet` seperti produksi, jadi rumus tidak ditulis dua kali.

## Isi dataset

- Dua DT: `D01` Dummy Timika (31 toko monitoring) dan `D02` Dummy Sorong (30), plus toko REMARK OTHERS dan INACTIVE.
- Enam salesman (kode angka 101-103, 201-203, karena Monitoring Harian hanya membaca kode angka): tiga bintang, dua sedang, satu tertinggal. 101 dan 201 kembar tepat di Weekly FOP Foods. Salesman 203 punya < 5 toko di beberapa BU.
- Toko WEEKLY (3-4 minggu), BIWEEKLY, MONTHLY, belum order; channel SPM dan MINIS. Toko "4 minggu" memakai invoice Minggu 1 Nov (minggu ISO 44).
- 4 BU x 6 basepack x 2 SKU; Banded 2 SKU per BU per channel.
- Perfect Store FULL, LITE, NOT PERFECT; stok dengan dua parent WC >= 100 per DT dan beberapa WC rendah; kehadiran 14 hari (terlambat, geo 0, tidak hadir).
- Riwayat bulanan 2026-08..10 (`GS_BULANAN`, `GS_BULANAN_ASRT`) dan `GS_TREND_ASRT` (`dist_kode | outlet_kode | periode | lines`) untuk 2025-10..2025-12 dan 2026-01..10, sebagian toko baru dan sebagian berlubang. Tab ini belum dibaca `Code.gs` (untuk plan 021), jadi belum masuk fixture.

## Menambah kasus

Ubah `DT_DEFS` di `dataset.mjs` (pola toko per salesman: `'4'`, `'3'`, `'2'`, `'1'`, `'0'` = jumlah minggu order; `buProb`; `rasio` target) atau tab pusat di `buildDummy`, jalankan `npm run dummy`, lalu tambahkan pengecekan di `tests/dummy.test.mjs`.
