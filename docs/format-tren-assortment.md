# Format data tren Assortment per toko

Data ini dipakai untuk menghitung baseline Q4 2025 per toko. Target Assortment toko = baseline x (1 + `asrt_growth`), awalnya +15%.

## Tab `GS_TREND_ASRT` (Sheet pusat)

Baris 1 = header, data mulai baris 2.

| dist_kode | outlet_kode | periode | lines |
|---|---|---|---|
| DT01 | 1000123 | 2025-10 | 9 |
| DT01 | 1000123 | 2025-12 | 11 |
| DT01 | 1000456 | 2025-11 | 4 |

- `dist_kode`: kode distributor (DT). `outlet_kode`: kode toko tanpa awalan kode DT.
- `periode`: bulan, format `YYYY-MM`.
- `lines`: jumlah basepack (LEVEL-9) berbeda dengan qty bersih >= MOQ (3) di toko itu dalam bulan tersebut. Aturannya sama dengan perhitungan Assortment di aplikasi. Mohon hitung dengan aturan yang sama, kalau tidak baseline tidak sebanding.

## Cara mengisi

1. Buka Sheet pusat, buka (atau buat) tab `GS_TREND_ASRT`.
2. Tempel header di atas, lalu tempel datanya di bawah header.
3. Minimal isi bulan `2025-10`, `2025-11`, `2025-12`. Bulan lain boleh ada, tidak dipakai untuk baseline.

## Aturan baseline

- Baseline = rata-rata `lines` bulan Q4 2025 yang ada barisnya. Bulan tanpa baris tidak dihitung nol.
- Toko tanpa baris Q4 2025 tidak punya target dan tidak masuk penyebut skor (dilaporkan sebagai `tanpaBaseline`).
- Tab kosong atau tidak ada: fitur nonaktif, tidak ada galat.

## Mengubah parameter

- Pertumbuhan: isi baris `asrt_growth` di tab `GS_CONFIG` (kolom key = `asrt_growth`, value = `0,15` atau `0.15`). Contoh 20% = `0,2`.
- Rentang baseline: konstanta `ASRT_BASE_FROM` dan `ASRT_BASE_TO` di `google-apps-script/Code.gs`.
