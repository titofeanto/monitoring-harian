# Nama dan identitas aplikasi

Dokumen ini untuk pemilik (Deputy Account Manager, area Timika dan Sorong, 6 salesman). Isinya: usulan nama, pedoman tampilan, prompt untuk membuat gambar, dan daftar tempat yang harus diganti bila nama dipakai. Nama di layar login diambil dari satu konstanta (`window.MH_APP_NAME` di `assets/config.js`), sekarang berisi "Tifa". Tempat lain belum diganti; itu keputusan pemilik.

## 1. Rekomendasi nama utama: "Tifa"

Alasan:

- Tifa adalah gendang tradisional Papua dan Maluku. Gendang mengumpulkan orang dan memberi ritme. Itu cocok dengan kerja tim salesman: ritme harian, kunjungan, ranking.
- Pendek (4 huruf), mudah dieja dan diketik di HP.
- Tidak mengacu ke merek besar yang kami kenal. Kami tidak bisa memastikan itu (lihat catatan pengecekan di bawah).

Pilihan tagline:

1. "Ritme jualan harian tim."
2. "Satu pukulan, satu hasil."
3. "Dengar angkanya, kejar targetnya."

Rekomendasi: **"Ritme jualan harian tim."** Paling lugas, tidak menjanjikan hasil, dan menyebut apa yang dikerjakan aplikasi.

## 2. Alternatif

| Nama | Alasan satu baris | Pro | Kontra |
|---|---|---|---|
| Noken | Tas rajut khas Papua; menampung semua KPI di satu tempat | Dekat dengan budaya setempat, mudah diingat | Sudah sangat umum dipakai (UNESCO, banyak usaha lokal), sulit dibedakan |
| Cenderawasih | Burung khas Papua; ranking dan puncak | Kuat dan membanggakan | Panjang (12 huruf), sulit diketik di HP, sering salah eja |
| Kompas Jualan | Menunjuk arah target harian | Artinya langsung jelas | Generik, banyak nama serupa, tidak khas daerah |
| Beat | Istilah lapangan untuk rute kunjungan | Pendek, akrab bagi salesman | Kata Inggris umum, mudah bentrok dengan nama lain |
| Rumah Sagu | Tempat berkumpul dan sumber pangan Papua | Hangat | Tidak jelas kaitannya dengan angka jualan; hindari bila ragu |

**Catatan pengecekan.** Pemilik perlu memeriksa sendiri kesamaan nama dan merek dagang sebelum dipakai resmi (pencarian di toko aplikasi, mesin pencari, dan pangkalan data merek). Kami tidak bisa memastikan nama bebas dipakai. Ini juga berlaku untuk "Tifa".

## 3. Pedoman identitas

**Motif penanda.** Pilih salah satu dan pakai konsisten:

- Garis ritme: batang vertikal tipis dengan tinggi berbeda, seperti denyut atau gelombang suara, yang sekaligus terbaca sebagai grafik batang. Ini yang dipakai di layar login (SVG inline buatan sendiri, `.lg-beat`).
- Bentuk gendang tifa yang disederhanakan (siluet, bukan ukiran).

**Palet.** Turunan dari tema di `DESIGN.md` (biru), ditambah satu aksen hangat dari kulit gendang untuk momen kunci (di aplikasi: tombol Masuk).

| Peran | Terang | Gelap | Catatan |
|---|---|---|---|
| Bidang merek | `#176DA6` (`--brand`) | `#0B2A47` (`--brand-deep`) | Putih di atasnya 5,6:1 dan 14,6:1 |
| Latar | `#EEF6FC` (`--bg`) | `#0A1424` | |
| Teks | `#0F172A` (`--ink`) | `#E8F1FB` | |
| Aksen hangat (terakota) | `#A8461F` (`--warm`) | `#E08A5C` | Teks putih di terang 5,9:1; teks `#2A1204` di gelap 6,7:1 |

Pakai aksen hangat di satu tempat per layar. Jangan di ikon, garis, dan latar sekaligus.

**Tipografi.** Tetap Geist (sudah dipakai seluruh aplikasi). Alasan: angka tabular rapi, terbaca jelas di HP kecil, dan satu keluarga huruf menjaga aplikasi ringan. Nama merek ditulis Geist 800 dengan jarak huruf rapat; tidak perlu huruf kedua.

**Hindari:** gradien biru-ungu, kilau (glow), kaca buram, ikon percikan atau bintang "AI", huruf mono sebagai gaya, maskot, bayangan tebal.

**Hormati budaya.** Pakai motif generik dan abstrak. Jangan meniru ukiran atau pola suku tertentu secara literal tanpa izin dari pemiliknya.

## 4. Prompt pembuat gambar

Prompt ditulis dalam bahasa Inggris supaya model gambar menurut dengan baik. Catatan Indonesia ada di bawah tiap prompt. Setiap prompt punya dua variasi (V1, V2). Palet: biru `#176DA6`, biru tua `#0B2A47`, latar terang `#EEF6FC`, aksen terakota `#A8461F` (gelap `#E08A5C`).

### A. Logo dan ikon aplikasi (1:1, 512x512)

```
Flat vector app icon and wordmark lockup for a sales-team app named "Tifa".
Subject: a row of 7 thin vertical rounded bars of different heights that reads
as a drum rhythm and as a bar chart; the tallest bar is terracotta #A8461F, the
others are white. Background: solid blue #176DA6. Square 1:1, 512x512, centered,
generous padding (safe zone 20%). Wordmark "Tifa" in a bold geometric sans
(Geist-like), tight letter-spacing, left-aligned under the icon in the lockup
version. Flat two-color plus one accent, crisp edges, no outline.
Dark version: same shapes on solid navy #0B2A47, accent #E08A5C.
Negative prompt: no gradient, no glow, no sparkles, no 3D, no glass, no
shadow, no mascot, no photo texture, no text other than the name "Tifa".
V1: bars only (icon). V2: simplified drum silhouette with the rhythm bars as the drum skin.
```

Catatan: minta versi terang dan gelap. Untuk ikon PWA, pakai V1 (paling terbaca kecil). Ikon belum diganti di aplikasi.

### B. Ilustrasi layar login (3:4 HP, 16:9 laptop)

```
Typographic-graphic composition for an app login background. A huge bold
white word "Tifa" aligned top-left, and along the bottom edge a row of about
20 thin vertical rounded bars of varied heights (rhythm / pulse), all white,
bottom-aligned. Solid flat background blue #176DA6. No people, no devices,
no icons. Large empty space between word and bars. Flat, graphic, poster-like.
Negative prompt: no gradient, no glow, no sparkles, no 3D, no glass, no
smiling people, no stock illustration, no extra text.
Aspect ratio 3:4 for phone, 16:9 for laptop (two separate images).
V1: bars full width. V2: bars cluster to the left half, right half left empty.
```

Catatan: login di aplikasi sekarang sudah memakai komposisi ini lewat HTML/CSS/SVG, jadi gambar ini opsional (untuk materi cetak atau poster).

### C. Gambar berbagi WhatsApp (1200x630)

```
Link-preview card 1200x630 for the app "Tifa". Left third: the word "Tifa" in
bold white sans on solid blue #176DA6. Right two thirds: a row of thin
vertical rounded white bars of different heights, one bar terracotta #A8461F.
Below the word, one short line in white: "Ritme jualan harian tim."
Flat, minimal, high contrast, wide margins.
Negative prompt: no gradient, no glow, no sparkles, no 3D, no glass, no
people, no phone mockup, no extra text.
V1: text left, bars right. V2: bars across the bottom, text top-left.
```

### D. Set ikon menu (7 ikon, satu gaya)

```
A consistent set of 7 line icons on a transparent background, 24x24 grid,
2 px stroke, round caps and joins, single color #176DA6 (one icon state per
file), no fill, no shadow. Hand-drawn feel on a strict grid, not a default
icon-library look. Icons: (1) Skor: a ring with a notch; (2) Weekly FOP: a
calendar with a bar; (3) Banded: two stacked bands; (4) Assortment: four small
squares of different sizes; (5) Perfect Store: a storefront with a check;
(6) Toko: a shop awning; (7) Ranking: three bars of different heights with the
tallest in the middle.
Negative prompt: no gradient, no glow, no sparkles, no 3D, no emoji, no
filled shapes, no text.
V1: sharp corners. V2: slightly rounded corners (2 px radius).
```

Catatan: ikon menu di aplikasi saat ini berupa SVG garis di `assets/nav.js`; set ini hanya bila pemilik ingin mengganti.

## 5. Suara dan kalimat

Kalimat pendek, bahasa Indonesia sehari-hari, lugas. Sebut apa yang terjadi dan langkah berikutnya. Bukan jargon, bukan sapaan hangat berlebihan.

| Hindari | Pakai |
|---|---|
| "Selamat datang kembali!" | "Masuk" |
| "Oops, terjadi kesalahan!" | "Kode tidak cocok. Periksa huruf besar/kecil atau minta kode baru." |
| "Mohon tunggu sebentar..." | "Memeriksa kode…" |
| "Tingkatkan performa tim Anda" | "Ritme jualan harian tim." |

Jangan mengarang nomor kontak atau nama orang. Bantuan login: "Kode dari Deputy Account Manager atau pimpinan DT Anda."

## 6. Daftar tempat ganti nama

Belum diganti pada tugas ini (menunggu keputusan pemilik). Konstanta nama layar login: `window.MH_APP_NAME` di `assets/config.js`.

| Tempat | Isi sekarang | Catatan |
|---|---|---|
| `<title>` di `index.html`, `great-sales.html`, `cek-stok.html`, `kehadiran.html`, `ranking.html`, `admin-status.html` | nama halaman | judul tab dan hasil berbagi |
| `manifest.webmanifest` | `name` "Monitoring Harian DSR", `short_name` "Monitoring", `description` | nama di layar utama HP setelah pasang |
| `<meta name="apple-mobile-web-app-title">` di semua HTML | "Monitoring" | nama ikon di iOS |
| Ikon PWA `assets/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | ikon lama | ganti dengan hasil prompt A |
| `assets/nav.js` baris 44 | kotak `MH` dan judul "Monitoring Harian" + "KPI dan alat tim" di kepala laci menu | ganti `MH` dan judul; baris 28 nama grup "Monitoring Harian" |
| `README.md`, `DESIGN.md` | "Monitoring Harian" | judul dokumen |
| `upload-tool/Index.html` | judul "Upload Data Monitoring Harian" | Apps Script terpisah |
| `assets/app.js`, `gs.js`, `stok.js`, `hadir.js`, `rank.js`, `boot.js` | teks "Monitoring Harian" di pesan/komentar | cari dengan perintah di bawah; sebagian hanya komentar |
| Judul Sheet dan Apps Script | nama proyek | opsional, tidak terlihat pengguna |

Cara cari semua: `grep -rn "Monitoring Harian" --include=*.html --include=*.js --include=*.json --include=*.webmanifest .`
