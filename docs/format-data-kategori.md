# Format data menu Kategori

Menu Kategori menganalisa toko per Category Key (S&OP Category). Tampilan dan rumusnya mengikuti halaman By Category v3 di dashboard Power BI. Data diisi pemilik tiap minggu dari ekspor Power BI (`Extract BW HANA` digabung `ID Product Hierarchy`).

Hirarki baris: Division > Category Key > Brand. Di tiga tab di bawah, kolom `division` = DIVISION, `category` = Category Key, `brand` = BRAND dari `ID Product Hierarchy`.

Semua tab ada di Sheet pusat. Baris 1 = header, data mulai baris 2. `dist_kode` dan `outlet_kode` harus sama dengan tab `GS_TOKO` (kode toko tanpa awalan kode DT). `gsv` = rupiah, boleh negatif (retur). Baris dengan toko yang tidak ada di `GS_TOKO` atau DT yang tidak ada di `DAFTAR_DT` dibuang dan dihitung di `catatan`.

## Tab `GS_KAT_BULAN`

Satu baris per toko x brand x bulan. Baris dengan GSV nol tidak perlu dikirim.

| periode | dist_kode | outlet_kode | division | category | brand | gsv |
|---|---|---|---|---|---|---|
| 2025-01 | DT01 | 1000123 | FOODS | Bumbu dan Saus | Merek Dapur A | 4190900 |
| 2026-09 | DT01 | 1000123 | FOODS | Minuman | Merek Teh | -900000 |

Cakupan: bulan penuh dari Januari tahun lalu sampai bulan penuh terakhir sebelum bulan cutoff (lihat bagian cutoff). Tahun lalu harus lengkap sampai Desember, karena ABS FY LY dihitung dari seluruh baris tahun lalu. Contoh dengan cutoff 15 Nov 2026: `2025-01` sampai `2026-10`.

## Tab `GS_KAT_MINGGU`

Potongan minggu (Senin sampai Minggu) yang dipotong di batas bulan, supaya tidak ada baris yang melintasi dua bulan. Awal dan akhir dua-duanya inklusif.

| awal | akhir | dist_kode | outlet_kode | division | category | brand | gsv |
|---|---|---|---|---|---|---|---|
| 2026-11-02 | 2026-11-08 | DT01 | 1000123 | FOODS | Bumbu dan Saus | Merek Dapur A | 627000 |
| 2026-10-26 | 2026-10-31 | DT01 | 1000123 | FOODS | Bumbu dan Saus | Merek Dapur A | 150000 |
| 2026-11-01 | 2026-11-01 | DT01 | 1000123 | FOODS | Bumbu dan Saus | Merek Dapur A | 90000 |

Minggu 26 Okt sampai 1 Nov 2026 dikirim sebagai dua baris: 26-31 Okt dan 1 Nov. Cakupan, semuanya sampai cutoff (hari terakhir data boleh lewat cutoff, baris setelah cutoff diabaikan):

1. Semua minggu dari awal bulan cutoff sampai cutoff (untuk ABS YTD TY bulan berjalan dan L3 bulan).
2. Semua minggu dalam 91 hari terakhir sampai cutoff (untuk RR 13, RR 5, LW, L2W, L3W). Tab bulan juga memuat bulan-bulan ini; tidak masalah, server tidak menjumlahkan dua sumber untuk hari yang sama.
3. Semua minggu dari awal bulan cutoff tahun lalu sampai `LY_END` (cutoff dikurangi 364 hari), untuk ABS YTD LY.

## Tab `GS_KAT_PRODUK`

Pemetaan SKU ke hirarki. Dipakai untuk menyambung stok gudang (tab `STOK_GUDANG`) ke kategori. SKU yang tidak ada di sini dijumlah ke "Tanpa kategori" dan dihitung di `catatan`.

| sku | category | brand | division |
|---|---|---|---|
| 700011 | Bumbu dan Saus | Merek Dapur A | FOODS |

## Cara menghitung cutoff

1. Tanggal data terakhir = `akhir` terbesar di `GS_KAT_MINGGU`.
2. `cutoff` = hari Minggu terakhir pada atau sebelum tanggal itu. Contoh: data sampai Selasa 17 Nov 2026, cutoff = Minggu 15 Nov 2026.
3. `LY_END` = cutoff dikurangi 364 hari (Minggu 16 Nov 2025). Cutoff bergeser tiap minggu, jadi isi ulang tab minggu setiap pekan.

Penggabungan di server (dua sumber tidak dijumlah untuk hari yang sama):

- ABS YTD TY = baris bulan tahun cutoff + baris minggu dengan `awal` setelah akhir bulan penuh terakhir.
- ABS YTD LY = baris bulan tahun lalu sebelum bulan cutoff + baris minggu tahun lalu dengan `awal` di awal bulan cutoff tahun lalu atau sesudahnya dan `akhir` sampai `LY_END`.
- ABS FY LY = semua baris bulan tahun lalu.
- RR, LW, L2W, L3W dari baris minggu saja. LM, L2M, L3M dari baris bulan (bulan cutoff sendiri dari baris minggu).

## Ukuran

Perkiraan 400 toko x 40 brand: tab bulan paling banyak sekitar 380 ribu baris (24 bulan). Kirim tanpa baris nol; banyak toko tidak membeli semua brand, jadi isi nyata jauh lebih kecil. Tab minggu jauh lebih kecil (sekitar 20 potongan per seri). Server menghitung dan hanya mengirim ringkasan per toko x brand ke aplikasi.

## Tab kosong atau tidak ada

Kalau `GS_KAT_BULAN` atau `GS_KAT_MINGGU` kosong atau tidak ada, menu Kategori menampilkan keadaan kosong yang menyebut tab yang harus diisi. Bukan galat. `GS_KAT_PRODUK` boleh kosong: hanya kolom stok yang terpengaruh.

## Data dummy untuk tes

`tests/dummy/kategori.mjs` membangkitkan ketiga tab untuk dua DT dummy (lihat `tests/dummy/README.md`). Semua fiktif.
