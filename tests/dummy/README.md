# Data dummy end-to-end

SEMUA data di sini FIKTIF: nama toko, salesman, produk, angka, dan kode akses (`dummy-pusat`, `dummy-dt-tmk`, `dummy-dt-srg`, hanya untuk tes). Tidak ada data, nama, atau ID Sheet nyata.

## Cara menjalankan

- `npm run dummy` menulis `tests/ui/fixtures/dummy-*.json` (7 berkas). Hasilnya identik tiap kali (PRNG berbenih, "sekarang" dibekukan di 2026-11-18).
- `node --test tests/` menjalankan `tests/dummy.test.mjs` bersama tes lain.
- Lihat di halaman: `node tests/ui/shot.mjs great-sales skor dummy-gs-pusat 390 light` (pola sama untuk `ranking`, `cek-stok`, `kehadiran`, `index` dengan `dummy-rank`, `dummy-stok`, `dummy-hadir`, `dummy-mh`). Server uji sudah menerima `?fx=dummy-...` tanpa perubahan.

## Varian fixture

- `dummy-rank-tanpadata.json` (`buildDummy({ tanpaData: true })`): tanpa tab `GS_TREND_ASRT` (Assortment `tanpaData` di semua DSR) dan DSR 202 tanpa toko di laporan PS. Dipakai `tests/ui/rank-tanpadata.test.mjs` untuk jalur "Belum ada data" di lembar detail DSR. Fixture `dummy-*.json` utama tidak berubah. Tile Ringkasan 5 dan 7 tidak punya fixture sendiri: `tests/ui/tiles.test.mjs` menyuntik 3 sampai 8 tile ke `.kpis` lewat `tests/ui/tiles-harness.html`.

## Cara kerja

`dataset.mjs` membangun isi Sheet palsu (pusat + dua Sheet DT). `fakeSpreadsheet.mjs` membungkusnya sebagai `SpreadsheetApp`. `build-fixtures.mjs` memuat `Code.gs` asli lewat `loadGs` dan memanggil `doGet` seperti produksi, jadi rumus tidak ditulis dua kali.

## Isi dataset

- Dua DT: `D01` Dummy Timika (31 toko monitoring) dan `D02` Dummy Sorong (30), plus toko REMARK OTHERS dan INACTIVE.
- Enam salesman (kode angka 101-103, 201-203, karena Monitoring Harian hanya membaca kode angka): tiga bintang, dua sedang, satu tertinggal. 101 dan 201 kembar tepat di Weekly FOP Foods. Salesman 203 punya < 5 toko di beberapa BU.
- Toko WEEKLY (3-4 minggu), BIWEEKLY, MONTHLY, belum order; channel SPM dan MINIS. Toko "4 minggu" memakai invoice Minggu 1 Nov (minggu ISO 44).
- Salesman 101 dan 201 sengaja kembar pada skor total ranking (plan 022): PS 3 Full + 3 Lite + 2 Not dari 8 toko; R2G SS, E2E, E2S tercapai penuh, Pasti Untung 2/4, Pasti Laku 1/2 (disetel tanpa PRNG di akhir `buildDummy`). `rank_min_toko` dummy = 8, sehingga 203 (7 toko) masuk `belumCukup` pada skor total. Riwayat `GS_TREND_ASRT` berskala sama dengan lines bulan data: bintang jauh di atas Q4 2025, tertinggal belum mengejar.
- 4 BU x 6 basepack x 2 SKU; Banded 2 SKU per BU per channel.
- Perfect Store FULL, LITE, NOT PERFECT; stok dengan dua parent WC >= 100 per DT dan beberapa WC rendah; kehadiran 14 hari (terlambat, geo 0, tidak hadir).
- Riwayat bulanan 2026-08..10 (`GS_BULANAN`, `GS_BULANAN_ASRT`) dan `GS_TREND_ASRT` (`dist_kode | outlet_kode | periode | lines`) untuk 2025-10..2025-12 dan 2026-01..10, sebagian toko baru dan sebagian berlubang. Dibaca `Code.gs` untuk target Assortment per toko (baseline Q4 2025 + 15%).

- Menu Kategori (plan 034, `tests/dummy/kategori.mjs`): tab pusat `GS_KAT_BULAN` (Jan 2025 sampai Okt 2026), `GS_KAT_MINGGU` (potongan minggu dipotong di batas bulan, 91 hari terakhir, bulan cutoff, dan Nov 2025 sampai `LY_END`, plus Senin-Selasa 16-17 Nov setelah cutoff 15 Nov), `GS_KAT_PRODUK` (dua SKU terakhir sengaja tidak dipetakan). 13 brand fiktif, 8 Category Key, 4 division. Deret harian dibangkitkan dulu, baru dipotong ke tab bulan dan minggu, jadi dua tab konsisten. Ada toko yang berhenti beli kategori, merek yang tak pernah dibeli toko tertentu, toko INACTIVE yang berhenti sejak Maret 2026, dan satu toko (D01 A1001, Merek Teh) dengan retur: nilai negatif di Sep dan 3 Nov 2026. PRNG turunan (`sub('kategori')`), jadi data lain tidak bergeser. Fixture: `dummy-kategori.json` (pusat) dan `dummy-kategori-tmk.json` (akun DT).

## Menambah kasus

Ubah `DT_DEFS` di `dataset.mjs` (pola toko per salesman: `'4'`, `'3'`, `'2'`, `'1'`, `'0'` = jumlah minggu order; `buProb`; `rasio` target) atau tab pusat di `buildDummy`, jalankan `npm run dummy`, lalu tambahkan pengecekan di `tests/dummy.test.mjs`.
