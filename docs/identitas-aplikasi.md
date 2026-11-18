# Nama dan identitas aplikasi

Keputusan pemilik (plan 031): aplikasi bernama **Jendela Jasper**, tagline **Monitoring Pencapaian Sales Harian**. Alasan dari pemilik: aplikasi ini memantau pencapaian sales harian, dan jendela berarti tempat melihat hasil. Bagian 1 sampai 5 di bawah ini adalah catatan terbaru. Usulan lama "Tifa" (bagian Arsip) tidak dipakai lagi.

## 1. Berkas merek (`assets/brand/`)

Lembar merek v2 (plan 032, 2816x1536) menggantikan lembar lama untuk semua potongan logo. Lembar lama tetap disimpan di `sumber/` sebagai arsip.

| Berkas | Isi | Ukuran (px) | Lama (px) |
|---|---|---|---|
| `sumber/lembar-logo-v2.jpg` | lembar merek terbaru pemilik (logo utama, horizontal, ikon/monogram, mono, gelap, palet) | 2816x1536 | |
| `sumber/lembar-logo.jpg`, `sumber/logo-utama.jpg` | lembar lama (arsip) | 2576x1405 | |
| `logo-gelap.png` | kotak Dark Background; latar diratakan jadi satu warna `#001F5B` persis (piksel dekat navy dipaksa navy, tanpa halo JPEG) supaya menyatu dengan bidang login | 621x444 | 520x430 |
| `logo-horizontal.png` | versi horizontal, latar kertas asli | 893x228 | 1010x205 |
| `logo-emblem.png` | logo utama dengan tagline, dipotong rapat tanpa lingkaran penuh, latar kertas asli | 579x426 | 545x485 |
| `ikon.svg` | ikon utama: ubin putih (radius ±22%, tepi abu tipis), monogram J-jendela navy, atap dan jendela amber, badge grafik | viewBox 512 | |
| `ikon-navy.svg` | sama, ubin navy, J putih (tema gelap, layar utama Android) | viewBox 512 | |
| `ikon-maskable.svg` | latar penuh navy tanpa sudut, J putih tanpa badge, 85% ukuran (zona aman 80%) | viewBox 512 | |
| `ikon-mono.svg` | satu warna (hitam) | viewBox 512 | |
| `favicon.svg` | varian sederhana tanpa badge dan tanpa atap: J-jendela putih, kisi kipas, satu jendela amber, ubin navy; dipakai juga di sidebar 28 px (`assets/nav.js`) | viewBox 512 | |
| `ikon-192.png`, `ikon-512.png`, `ikon-maskable-512.png` | ikon manifest PWA (any dan maskable terpisah) | 192, 512, 512 | |
| `apple-touch-icon-180.png` | ikon layar utama iOS, latar penuh navy tanpa transparan (J putih dan badge terbaca di layar utama terang maupun gelap; ubin putih akan menyatu dengan latar terang) | 180 | |
| `favicon-32.png`, `favicon-48.png` | favicon tab dari `favicon.svg` | 32, 48 | |
| `ikon-lembar.png` | lembar kontak ikon: 512, 192, 180, 64, 48, 32, pembesaran 4x dari 32 | 1330x700 | |

**Perbandingan resolusi lama dan baru.** Lembar baru 2816 px (lama 2576 px), tetapi tiap varian di dalamnya tidak lebih besar: logo gelap naik dari 520 ke 621 px lebar (+19%; kini cukup untuk logo login 300 px di layar 2x, sebelumnya kurang), emblem 545 ke 579 px (+6%), sedangkan horizontal turun dari 1010 ke 893 px (-12%) dan tidak lebih tajam. Jadi hasilnya lebih tajam hanya untuk logo gelap di login; potongan lain setara atau sedikit lebih kecil.

**Peringatan resolusi.** Potongan logo masih 500 sampai 900 px lebarnya. Di layar lebar atau dicetak akan terlihat kurang tajam. Pemilik sebaiknya mengunggah berkas asli beresolusi tinggi (SVG, atau PNG minimal 2000 px per varian, satu varian per berkas, latar transparan) untuk menggantikan `logo-gelap.png`, `logo-horizontal.png`, dan `logo-emblem.png`. Nama berkas dan rasio boleh tetap; ubah `width`/`height` di `<img class="lg-logo">` (dan `aspect-ratio` di `.lg-logo`, `assets/style.css`) bila rasionya berbeda.

**Catatan jujur tentang logo.** Logo dibuat generator gambar raster dan punya cacat kecil: segitiga oranye kecil dekat huruf J, huruf A di "JASPER" tertimpa garis zig-zag, ikon kecil di versi horizontal terlalu rapat, dan ikon kilau bintang kecil. Dipakai apa adanya untuk sekarang. Rekomendasi: gambar ulang sebagai vektor (SVG) bersih sebelum logo dipakai resmi atau dicetak. Ikon aplikasi adalah gambar vektor sendiri yang meniru monogram pemilik (bukan jiplakan piksel); versi final sebaiknya digambar desainer.

**Aturan ikon.** Ruang aman: biarkan minimal 12% sisi kosong di sekeliling monogram pada ubin. Ukuran minimum: 32 px (di bawah 48 px pakai `favicon.svg`/`favicon-*.png`, tanpa badge dan atap, karena badge dan chevron atap menyatu). Varian: putih (`ikon.svg`, bawaan), navy (`ikon-navy.svg`, latar gelap), mono (`ikon-mono.svg`, cetak hitam-putih). Tanpa gradien, bayangan, atau kilau; warna hanya navy, amber, putih, dan abu tepi.

## 2. Warna merek (palet resmi di lembar v2)

| Peran | Nilai | Token |
|---|---|---|
| Navy (bidang merek, ubin ikon, theme-color, manifest, blok login) | `#001F5B` | `--logo-navy` |
| Amber (aksen, tombol Masuk, jendela dan grafik di ikon) | `#F8991C` | `--logo-amber` |
| Abu (tagline, tepi) | `#6D6E71` | `--logo-gray` |

Tombol Masuk (`--warm` = amber, teks `--warm-ink` = navy): kontras 7,1:1. Hover terang `#E08A10` (teks navy, 5,8:1); hover gelap `#FFAE45` (8,5:1). Biru tema aplikasi `--brand` (#176DA6) tidak diganti. Tema gelap memakai navy resmi yang sama untuk bidang merek (tidak dicerahkan).

## 3. Nama pendek di layar utama

`manifest.webmanifest`: `name` "Jendela Jasper", `short_name` "Jasper". Alasan: nama ikon di layar utama Android dipotong sekitar 12 karakter, dan "Jendela Jasper" (14 karakter) akan terpotong menjadi "Jendela Jas…". iOS memakai `apple-mobile-web-app-title` "Jendela Jasper" (boleh dua baris).

## 4. Peringatan merek dagang

Periksa sendiri kesamaan nama "Jendela Jasper" sebelum dipakai resmi: toko aplikasi, mesin pencari, dan pangkalan data merek (DJKI untuk Indonesia). Kami tidak bisa memastikan nama bebas dipakai. "Jendela" dan "Jasper" adalah kata umum, dan ada kemungkinan merek lain yang mirip.

## 5. Tempat nama dipakai

Konstanta: `window.MH_APP_NAME` dan `window.MH_APP_TAGLINE` di `assets/config.js`.

| Tempat | Isi |
|---|---|
| Layar login (`.lg-logo` alt, `.lg-tag`), 5 halaman | logo gelap + tagline |
| Kepala menu samping (`assets/nav.js`) | monogram J-jendela sederhana (`favicon.svg`) 28 px + nama + tagline |
| `<title>`, `application-name`, `apple-mobile-web-app-title`, `og:title`, `og:description`, `description` di semua HTML | "Jendela Jasper" atau "{Halaman} · Jendela Jasper" |
| `manifest.webmanifest` | nama, `short_name`, deskripsi, warna navy, ikon baru |
| `<link rel="icon">` (SVG, 32, 48) dan `apple-touch-icon` | berkas `assets/brand/` |
| `sw.js` | cache `mh-shell-v3` (menarik ikon dan logo baru) |

Nama halaman dan fitur ("Monitoring Harian", "Great Sales", "Cek Stok", "Kehadiran", "Ranking") tetap sebagai nama halaman. Belum diganti dan di luar cakupan: `upload-tool/` (Apps Script terpisah, judul "Upload Data Monitoring Harian"), judul proyek Sheet dan Apps Script, `README.md`. Tidak ada lagi tempat "belum diganti" di aplikasi web utama.

---

# Arsip: usulan "Tifa" (tidak dipakai)

Bagian di bawah ini adalah usulan awal sebelum pemilik memilih Jendela Jasper. Disimpan sebagai arsip; palet terakota, motif batang ritme, dan daftar "belum diganti" sudah tidak berlaku.

Dokumen ini untuk pemilik (Deputy Account Manager, area Timika dan Sorong, 6 salesman). Isinya: usulan nama, pedoman tampilan, prompt untuk membuat gambar, dan daftar tempat yang harus diganti bila nama dipakai. Nama di layar login diambil dari satu konstanta (`window.MH_APP_NAME` di `assets/config.js`), sekarang berisi "Tifa". Tempat lain belum diganti; itu keputusan pemilik.

## A1. Rekomendasi nama utama: "Tifa"

Alasan:

- Tifa adalah gendang tradisional Papua dan Maluku. Gendang mengumpulkan orang dan memberi ritme. Itu cocok dengan kerja tim salesman: ritme harian, kunjungan, ranking.
- Pendek (4 huruf), mudah dieja dan diketik di HP.
- Tidak mengacu ke merek besar yang kami kenal. Kami tidak bisa memastikan itu (lihat catatan pengecekan di bawah).

Pilihan tagline:

1. "Ritme jualan harian tim."
2. "Satu pukulan, satu hasil."
3. "Dengar angkanya, kejar targetnya."

Rekomendasi: **"Ritme jualan harian tim."** Paling lugas, tidak menjanjikan hasil, dan menyebut apa yang dikerjakan aplikasi.

## A2. Alternatif

| Nama | Alasan satu baris | Pro | Kontra |
|---|---|---|---|
| Noken | Tas rajut khas Papua; menampung semua KPI di satu tempat | Dekat dengan budaya setempat, mudah diingat | Sudah sangat umum dipakai (UNESCO, banyak usaha lokal), sulit dibedakan |
| Cenderawasih | Burung khas Papua; ranking dan puncak | Kuat dan membanggakan | Panjang (12 huruf), sulit diketik di HP, sering salah eja |
| Kompas Jualan | Menunjuk arah target harian | Artinya langsung jelas | Generik, banyak nama serupa, tidak khas daerah |
| Beat | Istilah lapangan untuk rute kunjungan | Pendek, akrab bagi salesman | Kata Inggris umum, mudah bentrok dengan nama lain |
| Rumah Sagu | Tempat berkumpul dan sumber pangan Papua | Hangat | Tidak jelas kaitannya dengan angka jualan; hindari bila ragu |

**Catatan pengecekan.** Pemilik perlu memeriksa sendiri kesamaan nama dan merek dagang sebelum dipakai resmi (pencarian di toko aplikasi, mesin pencari, dan pangkalan data merek). Kami tidak bisa memastikan nama bebas dipakai. Ini juga berlaku untuk "Tifa".

## A3. Pedoman identitas

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

## A4. Prompt pembuat gambar

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

## A5. Suara dan kalimat

Kalimat pendek, bahasa Indonesia sehari-hari, lugas. Sebut apa yang terjadi dan langkah berikutnya. Bukan jargon, bukan sapaan hangat berlebihan.

| Hindari | Pakai |
|---|---|
| "Selamat datang kembali!" | "Masuk" |
| "Oops, terjadi kesalahan!" | "Kode tidak cocok. Periksa huruf besar/kecil atau minta kode baru." |
| "Mohon tunggu sebentar..." | "Memeriksa kode…" |
| "Tingkatkan performa tim Anda" | "Ritme jualan harian tim." |

Jangan mengarang nomor kontak atau nama orang. Bantuan login: "Kode dari Deputy Account Manager atau pimpinan DT Anda."

## A6. Daftar tempat ganti nama (arsip)

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
