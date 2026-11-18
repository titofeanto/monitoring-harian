# Sistem tampilan Monitoring Harian

Acuan: aplikasi Stok Opname dan Radar Sonik (https://ulisonik.github.io/radar-sonik/), dipelajari dari tampilan dan UI/UX-nya saja (tanpa menyalin kode, teks, atau data). Fungsi aplikasi itu tidak ikut dipakai. Semua halaman (Monitoring Harian, KPI Great Sales, tool upload) memakai sistem yang sama. Kerjakan fitur baru dengan ketelitian yang sama: tiap rasio, ukuran, dan perilaku di bawah ini disengaja.

## Prinsip

1. **HP dulu.** Pengguna memakai HP. Rancang di lebar 390 px, lalu lebarkan ke desktop (isi maks 1100 px).
2. **Satu pola per kebutuhan.** Daftar toko selalu kartu `.rk`, ringkasan selalu tile berwarna, judul bagian selalu `h2` dengan chip ikon. Jangan bikin pola baru kalau pola lama cukup.
3. **Angka mudah dibaca.** Angka utama besar dan tebal, label kecil di atasnya, satuan atau keterangan di bawahnya. Angka selalu `tabular-nums`.
4. **Warna bermakna.** Hijau = tercapai, kuning = mendekati (80% ke atas), merah = jauh, biru = netral atau info. Jangan pakai warna hanya untuk hiasan.
5. **Status selalu terlihat.** Layar tidak boleh kosong atau menggantung: tampilkan salinan terakhir, indikator memperbarui, atau pesan gagal beserta jalan keluarnya.
6. **Tindakan merusak minta konfirmasi di tempat** (kotak merah inline), bukan dialog bawaan browser.

## Token (assets/style.css)

| Token | Terang | Gelap | Dipakai untuk |
|---|---|---|---|
| `--bg` | #EEF6FC | #0A1424 | latar halaman |
| `--surface` | #FFFFFF | #12203A | kartu |
| `--surface-2` | #F3F9FD | #192A4A | isi kartu, isian, baris |
| `--line` | #D4E8F6 | #27406A | garis pemisah |
| `--ink` / `--ink-2` | #0F172A / #5A6777 | #E8F1FB / #9FB4D0 | teks utama / pendukung |
| `--brand` | #176DA6 | #4AA9E8 | aksi, item sidebar aktif |
| `--brand-2`, `--brand-deep` | #1B76B3, #0F3F66 | #1A5F8F, #0B2A47 | gradien header halaman (bar ramping) |
| `--head-1`, `--head-2` | #176DA6, #135A8C | #1A5F8F, #164E78 | gradien `.card-head`; putih di atasnya 5,6:1 sampai 8,8:1 |
| `--cyan` | #30A0E5 | #4AA9E8 | ujung gradien ikon dan bar |
| `--ok` / `--ok-bg` | #12724A / #DDF6E8 | #6CC592 / #16382B | tercapai |
| `--warn-ink` / `--warn-bg` | #8A4708 / #FDEBD3 | #F2D878 / #3A3110 | perlu perhatian |
| `--minus` / `--minus-bg` | #B83829 / #F8DED7 | #F59A86 / #3C2220 | kurang, bahaya |
| `--gold`, `--silver`, `--bronze` | #E0A800, #9AA5B1, #B8743A | sama | lencana medali peringkat |
| `--lime`, `--lime-edge`, `--lime-ink` | #D9F25A, #C3DF33, #0F172A | sama | tombol aksi utama `.btn.main` |
| `--amber-t` | #A3560A | #F5C26B | teks nada "hampir" |
| `--tint-1..4` | biru, hijau, oranye, cyan muda | versi gelap | latar 4 tile ringkasan |

Mode gelap otomatis lewat `prefers-color-scheme`. Setiap warna baru wajib punya pasangan gelap.

- Font **Geist** 400 sampai 700 (Google Fonts; tanpa jaringan jatuh ke system-ui). Dasar 14 px, judul bagian 16 px/700, angka tile 24 px/800, label 11 sampai 12 px/600.
- Radius: kartu 16, elemen dalam 11, chip dan tag bulat penuh (999), tile 14, laci/sidebar 0 (menempel di tepi).
- Bayangan: kartu `0 2px 10px rgba(15,60,130,.07)`, elemen mengambang `0 8px 28px rgba(15,60,130,.12)`.
- Ukuran sentuh: tombol 44 px, chip 34 px, tombol ikon 40 px, kolom cari 42 px, sakelar 46x28.

## Kerangka halaman

- **Header ramping** `.top`: satu baris, `position: sticky`, gradien 165° dari `--brand-2` ke `--brand-deep`, tanpa sudut membulat, padding atas memakai `env(safe-area-inset-top)`. Isi berurutan: tombol menu (44 px, hanya < 900 px), judul bagian aktif `h1.top-h` (18 px/700, id `greetBig`, diisi `setTab` / `openTab`), baris kecil 12 px `.top-s` (tanggal data, lingkup/DT; membungkus di HP, satu baris di desktop), status data, tombol muat ulang 40 px. Tidak ada hero, pil tautan, atau sapaan besar di header. Teks putih di atas gradien 4,9:1 sampai 14,6:1.
- **Navigasi samping `.side`** (dibuat `assets/nav.js`, satu daftar item untuk semua halaman; tambah KPI baru di sana). Empat grup berjudul huruf kapital kecil: Umum (Ranking, tautan ke `ranking.html`, terlihat di semua halaman), Great Sales (Skor, Weekly FOP, Banded, Assortment, Perfect Store, Toko), Monitoring Harian (Ringkasan, Simulator, Low Hanging Fruit), Alat (Cek Stok, Kehadiran). Item = ikon SVG 18 px + label penuh, tinggi 44 px di HP / 40 px di desktop, radius `--r-s`, hover `--surface-2`. Item aktif: `aria-current="page"`, latar `--brand-soft`, teks `--brand`, garis kiri 3 px (kontras 4,8:1 sampai 4,9:1). Di Great Sales dan Monitoring Harian item bagian adalah tombol tab sungguhan (`data-tab` / `id="tab-ring|sim|fruit"` + `aria-controls`) sehingga `setTab` / `openTab` tetap bekerja; di halaman lain item yang sama berupa tautan (`great-sales.html#fop`, dst.).
- **Sidebar tetap (>= 900 px)**: grid dua kolom `248px 1fr` pada `#appScreen`, sidebar `sticky` setinggi layar, tepi kanan `--line`. **Laci (< 900 px)**: sidebar `fixed` lebar `min(300px, 86vw)` bergeser dari kiri 220 ms, scrim `rgba(15,23,42,.45)` di belakangnya. Ditutup oleh pilihan item, ketuk scrim, tombol X, atau Esc. Saat dibuka fokus pindah ke item pertama, `aria-expanded` pada tombol menu, `body` tidak bisa digulir, Tab terkurung di laci; saat tertutup laci `inert` dan `visibility:hidden`, fokus kembali ke tombol menu. Gerakan mati untuk `prefers-reduced-motion`. Tidak ada lagi bar tab di bawah.
- **Isi** `main`: lebar maks 1100 px di tengah ruang kanan, padding 16 px di HP dan 24 px di desktop, jarak antar kartu 12 px. Chip DT di baris sendiri paling atas. Tidak ada tarikan ke atas menimpa header. Penjelasan aturan yang panjang dibungkus `details.how` ("Cara baca") yang tertutup bawaan; informasi tidak dihapus.
- **Status data** (titik + teks) di header: hijau berdenyut = terbaru, kuning berkedip = memperbarui, merah = gagal. Tombol `i` membuka penjelasan tiga warna.
- **Login**: layar penuh bergradien, kartu putih radius 24 di tengah.
- **Memuat**: bar progres + perkiraan detik dari rata-rata waktu muat sebelumnya (assets/boot.js). Layar login tidak pernah berkedip kalau kode sudah tersimpan.

## Komponen

- **Kartu `.card`** dengan judul `h2` + chip ikon 28 px (`.ci`). Teks bantu `.hint` 13 px di bawah judul.
- **Hero `.hero`**: ikon bulat bergradien, judul, tiga angka dengan garis pemisah vertikal (`.hero-units`), bar progres 8 px bergradien, meta di bawah bar.
- **Tile `.kpi` / `.tile`**: 2 kolom di HP, 4 di desktop, latar tint bergantian. Label 12 px/700, angka 24 px/800 berwarna, keterangan 11,5 px. Jumlah ganjil: tile terakhir melebar penuh di HP.
- **Kartu data `.rk`**: kepala (ikon status bulat 34 px, nama 14 px/600 maks 2 baris, keterangan 12 px, tag di kanan), lalu garis, lalu 2 sampai 5 kolom angka dipisah garis vertikal (`.rk-s`, `.two`, `.four`, `.five`): label 11 px, angka 16 px/800, keterangan 11 px. Warna angka mengikuti nada: `okc` hijau, `amb` oranye, `neg` merah.
- **Toolbar daftar**: kolom cari 42 px dengan tombol hapus bulat, baris chip filter (geser horizontal, tiap chip memuat jumlah, chip kosong diredupkan), baris meta (jumlah kanan). Filter bawaan = yang perlu ditindak. Kalau pencarian membuat filter kosong, filter kembali ke bawaan. Daftar dibatasi 60 baris dengan tombol "Tampilkan lebih banyak (N lagi)".
- **Tag dan pil** (`.tag`, `.pill`, `.lv`): bulat penuh, 11 sampai 12 px/700, latar lembut dengan teks berwarna. `.tag.b` (biru, 10 px) dipakai sebagai penanda "Update mingguan" untuk angka yang diisi manual seminggu sekali (Rank, %DR).
- **Tombol**: utama biru, `plain` biru muda, `danger` merah muda, `sm` bulat. Nonaktif = opacity .45.
- **Kotak info**: `.banner` / `.notice` kuning, `.confirm` merah (konfirmasi inline), `.empty` untuk kosong (tulis apa yang harus dilakukan berikutnya).
- **Toast**: pil gelap 24 px dari bawah layar, hilang sendiri 2,2 detik, dipakai untuk hasil tindakan singkat.
- **Dasar sidebar `.side-foot`** (dibuat `nav.js`): menempel di dasar laci/sidebar (`position:sticky`, tetap terlihat walau menu panjang), garis atas `--line`, baris "Akun" 13 px dan tombol `.side-out` "Ganti akun / Keluar" (tinggi 44 px, latar `--minus-bg`, teks `--minus`). Tombol ini membuka dialog konfirmasi, tidak langsung keluar.
- **Dialog konfirmasi `dialog.dlg-confirm`**: `<dialog>` asli (bukan `window.confirm`), judul "Keluar dari akun ini?", penjelasan, tombol `Batal` (fokus awal) dan `Keluar` (`.btn.danger`, id `logoutBtn` sehingga handler logout tiap halaman tetap satu-satunya yang menghapus kode dan salinan data). Esc dan ketuk latar = batal; fokus kembali ke tombol pemicu.
- **Akordeon** `details.box`: ikon panah berputar 180° saat terbuka.
- **Modal**: latar gelap .72, kotak radius 24, ditutup lewat tombol bulat atau ketuk di luar.

## Komponen gaya Radar Sonik

- **Header kartu `.card-head`**: latar gradien `--head-1` ke `--head-2`, keluar dari padding kartu (sudut atas ikut kartu), ikon bulat 28 px (`.ci`, SVG, bukan emoji), judul 15 px/700 putih (`h2`), subjudul 11,5 px (`.ch-s`) hanya berisi fakta yang sudah tampil (kosongkan bila tidak ada), pil status di kanan selalu putih. Dipakai di semua kartu isi (Great Sales lewat `ciTitle`, Monitoring Harian lewat `wrapCards`, Cek Stok, Kehadiran). Kartu Akun tetap polos.
- **Ikon status `.st`** (18 px): `bad` silang, `mid` jam, `ok` centang; `role="img"` + `aria-label` "Belum capai" / "Hampir" / "Tercapai", jadi tidak bergantung warna. Dibuat oleh `MHUtil.stIcon`. Hanya dipasang pada sel yang SUDAH punya klasifikasi dari data (kelas `okc`/`amb`/`neg`, atau level hijau/kuning/merah); jangan membuat ambang baru. Legenda `MHUtil.stLegend()` ("Arti ikon:") ditaruh di atas daftar yang memakainya.
- **Urut**: setiap daftar punya pemilih "Urut:" (`select`, urutan awal = "Bawaan"); tabel padat (`.scroll table`) otomatis dapat judul kolom berupa tombol dengan `aria-sort` (klik: naik, turun, awal) lewat `assets/util.js`; kolom pertama lengket di kiri. Semua hanya mengurutkan baris yang sudah dimuat. Tabel yang tidak boleh urut diberi class `nosort`. Sel angka dua baris: angka utama tebal, keterangan kecil abu.
- **Panel peringkat** (halaman Ranking, `ranking.html` + `assets/rank.js`): daftar bernomor `.rkn-list`; medali SVG (`aria-label` "Peringkat n") dan latar `--warn-bg` hanya untuk baris ber-rank server 1-3, maksimal 5 baris (`MHUtil.isMedal`); nilai kembar pada rank sama mendapat medali sama, rank 4 ke atas memakai nomor biasa. Penjelasan aturan (hint) dan kartu "Kirim pengingat" dilipat dalam `details` tertutup; nama tebal, keterangan "{n} dari {m} toko ...", nilai persen di kanan (`.rk-val`). Di layar 900 px ke atas kontrol di kolom kiri dan panel di kolom kanan (`.rk-layout`).
- **Tombol aksi utama `.btn.main`**: lime dengan tepi `--lime-edge`, teks navy, satu per layar (kirim WhatsApp, simpan hasil).

## Halaman Ranking bersama

- `ranking.html` terbuka untuk **akun mana pun** (DT atau pusat) dan terlihat di menu semua halaman (grup Umum). Data dari `?view=rank` (`respondRank_`), dihitung untuk semua DT tanpa filter cakupan.
- **Chip ruang lingkup** di baris atas: "Semua DT" (bawaan, nomor = peringkat gabungan `rank`) dan satu chip per DT (hanya baris DT itu, nomor = `rankDt`, peringkat di dalam DT). Lalu chip BU dan chip KPI (FOP, Banded, Assortment), satu papan terlihat sekali. Medali mengikuti nomor yang tampil.
- **Penanda "DT Anda"** (`.tag.b` + tepi kiri `--brand` pada `.rk.mine`) untuk salesman dari DT akun yang sedang masuk. Akun pusat tanpa penanda.
- **Batas data lintas DT (keputusan pemilik, jangan dilebarkan)**: akun DT melihat nama/kode salesman dan skor DT lain untuk menambah persaingan antar tim. Server hanya mengirim `kode, nama, dt_kode, dt_nama, n, nilai`, `rank`, `rankDt`, dan angka ringkas KPI (weekly, spm, hit, lines, toko sebagai jumlah) lewat `rankPublicRow_`. Dilarang: nama/kode toko, SKU, omzet, kode akses. Kode akses tetap wajib.
- Tab Ranking di Great Sales dihapus; `great-sales.html#ranking` mengalihkan ke `ranking.html`. Server lama tanpa mode `rank` menampilkan "API belum diperbarui. Deploy ulang Apps Script."

## Baris KPI sederhana (cincin persen)

Tujuan: sekali lihat tahu posisi, rincian hanya bila diketuk. Hanya tampilan yang meniru aplikasi contoh; tanpa teks, logo, atau data darinya. Dipakai di Great Sales (Skor, FOP, Banded, Assortment, Perfect Store) dan Monitoring Harian (Ringkasan).

- **`.kpi-row`** dibuat `MHUtil.kpiRow`: grid cincin | isi | panah. Cincin `.ring` 90 px, garis 9 px, jejak `--line`, isi hijau/oranye/merah, persen tebal di tengah (`role="img"`, `aria-label` "{nama}: {persen}%"). Isi: ikon status `.st` + nama 15 px/700, angka capaian 26 px/800, lalu `Target N` dan `Sisa Target N` 13 px abu. Jarak antar baris 28 px (`.kpi-list`), tanpa bingkai.
- **Panah `.kpi-toggle`**: bulat 44 px, `aria-expanded` + `aria-controls`, chevron berputar. Rincian `.kpi-detail` tertutup (`hidden`) dengan garis putus-putus; status buka diingat selama halaman terbuka walau data dimuat ulang.
- **Rincian `.bar-item`** (`MHUtil.barItem`): nama + (persen) tebal | `Sisa Target`; **bar tipis `.bar-thin`** 10 px bulat penuh; angka capaian kiri, target kanan.
- **KPI tanpa target** (target 0 atau kosong): tanpa cincin dan tanpa panah, hanya nama, angka besar, dan Target bila ada.
- **Kartu putih lembut `.soft-card`**: radius 24, bayangan tipis; untuk skor Great Sales dan ringkasan Perfect Store (persen tebal kiri, `Sisa N Toko` kanan, bar dua warna Full/Lite, legenda kecil).
- **Daftar lega `.rk-list.lega`**: baris tanpa latar kartu, pemisah putus-putus (FOP, Banded, Perfect Store).
- **Aturan warna (tampilan saja, tanpa ambang bisnis baru)**: bila server memberi level (`green/amber/red`) atau kelas `okc/amb/neg`, itu yang dipakai (`MHUtil.toneOf`). Bila tidak ada klasifikasi untuk KPI itu, hijau hanya bila persen >= 100, selain itu merah.
- **Persen cincin bukan rumus KPI baru**: nilai server, atau aktual/target yang sudah ada. Cincin dibatasi 0-100 untuk gambar; teks di tengah memakai angka asli dibulatkan, dan angka sebenarnya selalu tampil sebagai teks. Gerakan isi cincin mati untuk `prefers-reduced-motion`. Tidak ada teks di bawah 12 px.

## Perilaku

- Bagian terakhir yang dipakai diingat (per halaman); `great-sales.html#fop` atau `index.html#sim` membuka bagian itu langsung.
- Salinan data terakhir disimpan di HP supaya layar langsung terisi; data baru menyusul dan status di header berubah. Kalau pengguna sudah mengisi sesuatu, layar tidak diganti diam-diam.
- Gerakan dimatikan untuk `prefers-reduced-motion`.
- Pencarian, filter, dan urutan memakai satu pola yang sama di semua daftar (lihat `mountList` di `assets/gs.js`).
- Setiap halaman diuji di 390 px terang, 390 px gelap (laci tertutup dan terbuka), dan 1200 px terang dan gelap sebelum dirilis. `tests/ui/nav.test.mjs` menguji laci dan sidebar; `tests/ui/rank.test.mjs` menguji halaman Ranking.

## Daftar periksa fitur baru

1. Memakai token, bukan warna baru. Ada pasangan gelap.
2. Judul bagian pakai chip ikon. Ada teks bantu satu kalimat.
3. Daftar panjang punya cari, filter berhitung, dan batas baris.
4. Ada keadaan kosong, memuat, dan gagal yang jelas.
5. Angka tabular, label kecil, satuan jelas, warna sesuai makna.
6. Target sentuh minimal sesuai ukuran di atas, tidak ada geser horizontal di 390 px (kecuali tabel padat di `.scroll`).
7. Teks bahasa Indonesia sederhana, tanpa singkatan yang tidak dikenal tim.
8. Versi aset (`?v=`) dinaikkan di HTML supaya HP tidak memakai CSS lama.
