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
| `--warm`, `--warm-hover`, `--warm-ink` | #A8461F, #8F3A18, #FFFFFF | #E08A5C, #EBA07A, #2A1204 | aksen hangat identitas: tombol Masuk di layar login |
| `--lime`, `--lime-edge`, `--lime-ink` | #D9F25A, #C3DF33, #0F172A | sama | tombol aksi utama `.btn.main` |
| `--amber-t` | #A3560A | #F5C26B | teks nada "hampir" |
| `--tint-1..4` | biru, hijau, oranye, cyan muda | versi gelap | latar 4 tile ringkasan |

Mode gelap otomatis lewat `prefers-color-scheme`. Setiap warna baru wajib punya pasangan gelap.

- Font **Geist** 400 sampai 700 (Google Fonts; tanpa jaringan jatuh ke system-ui). Dasar 14 px, judul bagian 16 px/700, angka tile 24 px/800, label 12 px/600 (tidak ada teks informatif di bawah 12 px).
- Radius: kartu 16, elemen dalam 11, chip dan tag bulat penuh (999), tile 14, laci/sidebar 0 (menempel di tepi).
- Bayangan: kartu `0 2px 10px rgba(15,60,130,.07)`, elemen mengambang `0 8px 28px rgba(15,60,130,.12)`.
- Ukuran sentuh (plan 027): di lebar < 1100 px atau layar sentuh semua tombol, chip, `select`, `input`, tombol urut tabel (`th-b`), tombol ikon header, kolom cari dan geser (`range`) minimal 44 px (kolom cari 48 px); chip memakai tinggi nyata 44 px, bukan pseudo-elemen, supaya terukur. Di >= 1100 px (penunjuk mouse) boleh lebih ringkas: chip 34 px, tombol ikon 40 px, kolom cari 42 px, sakelar 46x28. Teks minimum 12 px untuk semua teks yang membawa informasi (`small`, `em`, tag, `.wk`, label); pembeda "kosong" memakai bentuk (garis putus-putus), bukan opasitas.

## Kerangka halaman

- **Header ramping** `.top`: satu baris, `position: sticky`, gradien 165° dari `--brand-2` ke `--brand-deep`, tanpa sudut membulat, padding atas memakai `env(safe-area-inset-top)`. Isi berurutan: tombol menu (44 px, hanya < 900 px), judul bagian aktif `h1.top-h` (18 px/700, id `greetBig`, diisi `setTab` / `openTab`), baris kecil 12 px `.top-s` (tanggal data, lingkup/DT; di HP baris sendiri di bawah judul, boleh membungkus, header <= 110 px di 390 px; satu baris di desktop). Judul tab Low Hanging Fruit di header ringkas "Peluang" (`HDR_SHORT` di `app.js`), nama panjang tetap di menu dan kartu, status data, tombol muat ulang 40 px. Tidak ada hero, pil tautan, atau sapaan besar di header. Teks putih di atas gradien 4,9:1 sampai 14,6:1.
- **Navigasi samping `.side`** (dibuat `assets/nav.js`, satu daftar item untuk semua halaman; tambah KPI baru di sana). Empat grup berjudul huruf kapital kecil: Umum (Ranking, tautan ke `ranking.html`, terlihat di semua halaman), Great Sales (Skor, Weekly FOP, Banded, Assortment, Perfect Store, Toko), Monitoring Harian (Ringkasan, Simulator, Low Hanging Fruit), Alat (Cek Stok, Kehadiran). Item = ikon SVG 18 px + label penuh, tinggi 44 px di HP / 40 px di desktop, radius `--r-s`, hover `--surface-2`. Item aktif: `aria-current="page"`, latar `--brand-soft`, teks `--brand`, garis kiri 3 px (kontras 4,8:1 sampai 4,9:1). Di Great Sales dan Monitoring Harian item bagian adalah tombol tab sungguhan (`data-tab` / `id="tab-ring|sim|fruit"` + `aria-controls`) sehingga `setTab` / `openTab` tetap bekerja; di halaman lain item yang sama berupa tautan (`great-sales.html#fop`, dst.).
- **Sidebar tetap (>= 900 px)**: grid dua kolom `248px 1fr` pada `#appScreen`, sidebar `sticky` setinggi layar, tepi kanan `--line`. **Laci (< 900 px)**: sidebar `fixed` lebar `min(300px, 86vw)` bergeser dari kiri 220 ms, scrim `rgba(15,23,42,.45)` di belakangnya. Ditutup oleh pilihan item, ketuk scrim, tombol X, atau Esc. Saat dibuka fokus pindah ke item pertama, `aria-expanded` pada tombol menu, `body` tidak bisa digulir, Tab terkurung di laci; saat tertutup laci `inert` dan `visibility:hidden`, fokus kembali ke tombol menu. Gerakan mati untuk `prefers-reduced-motion`. Tidak ada lagi bar tab di bawah.
- **Isi** `main`: lebar maks 1100 px di tengah ruang kanan, padding 16 px di HP dan 24 px di desktop, jarak antar kartu 12 px. Chip DT di baris sendiri paling atas. Tidak ada tarikan ke atas menimpa header. Penjelasan aturan yang panjang dibungkus `details.how` ("Cara baca") yang tertutup bawaan; informasi tidak dihapus.
- **Status data** (titik + teks) di header: hijau berdenyut = terbaru, kuning berkedip = memperbarui, merah = gagal. Tombol `i` membuka penjelasan tiga warna.
- **Login** (plan 026, satu komponen untuk `index`, `great-sales`, `cek-stok`, `kehadiran`, `ranking`; CSS `.lg-*` di `style.css`, perilaku tampil/sembunyi di `util.js`). Tipografis dan asimetris, bukan kartu melayang. HP: bidang atas `.lg-brand` (tinggi 45% layar, 220 sampai 460 px) solid `--brand` (gelap: `--brand-deep`) berisi nama aplikasi (`window.MH_APP_NAME` di `assets/config.js`, sekarang "Tifa", Geist 800, rata kiri) dan satu gambar: motif garis ritme `.lg-beat` (20 batang putih tipis berbeda tinggi, SVG inline, statis). Di bawahnya bidang `--bg` dengan formulir rata kiri (maks 360 px, bukan kartu): judul halaman 18 px/700, label "Kode akses" di atas kolom (bukan placeholder), kolom 52 px tipe `password` (`autocomplete="current-password"`, `autocapitalize="off"`, `spellcheck="false"`) dengan tombol teks "Tampilkan"/"Sembunyikan" 44 px (`aria-pressed`), pesan galat `.lg-err` (`role="alert"`, menempel di bawah kolom, kolom tidak dikosongkan, `aria-invalid` bersinkron), tombol **Masuk** 52 px radius 6 px warna aksen `--warm`, teks bantu satu kalimat. Memeriksa kode: tombol nonaktif bertulisan "Memeriksa kode…". >= 900 px: dua kolom, kiri bidang merek penuh tinggi, kanan formulir 360 px. Gerak: batang naik sekali saat dimuat (<= 400 ms), mati untuk `prefers-reduced-motion`. Pesan galat kode salah: "Kode tidak cocok. Periksa huruf besar/kecil atau minta kode baru." Mekanisme login dan penyimpanan kode tidak berubah.
- **Identitas** (`docs/identitas-aplikasi.md`): nama usulan "Tifa", motif garis ritme, satu aksen hangat terakota `--warm` (terang #A8461F, gelap #E08A5C; teks putih/`#2A1204` di atasnya 5,9:1 / 6,7:1) hanya untuk momen kunci (tombol Masuk). Judul tab, manifest, dan ikon PWA belum diganti; daftar tempat ganti nama ada di dokumen itu.
- **Memuat**: bar progres + perkiraan detik dari rata-rata waktu muat sebelumnya (assets/boot.js). Layar login tidak pernah berkedip kalau kode sudah tersimpan.

## Komponen

- **Kartu `.card`** dengan judul `h2` + chip ikon 28 px (`.ci`). Teks bantu `.hint` 13 px di bawah judul.
- **Hero `.hero`**: ikon bulat bergradien, judul, tiga angka dengan garis pemisah vertikal (`.hero-units`), bar progres 8 px bergradien, meta di bawah bar.
- **Tile `.kpi` / `.tile`**: 2 kolom di HP, 4 di desktop, latar tint bergantian. Label 12 px/700, angka 24 px/800 berwarna, keterangan 12 px. Tile ringkasan di >= 761 px: jumlah kolom mengikuti jumlah tile (2, 3, 6 tile), tidak ada slot kosong. Jumlah ganjil: tile terakhir melebar penuh di HP.
- **Kartu data `.rk`**: kepala (ikon status bulat 34 px, nama 14 px/600 maks 2 baris, keterangan 12 px, tag di kanan), lalu garis, lalu 2 sampai 5 kolom angka dipisah garis vertikal (`.rk-s`, `.two`, `.four`, `.five`): label 12 px, angka 16 px/800, keterangan 12 px. Warna angka mengikuti nada: `okc` hijau, `amb` oranye, `neg` merah.
- **Toolbar daftar**: kolom cari 42 px dengan tombol hapus bulat, baris chip filter (geser horizontal, tiap chip memuat jumlah, chip kosong diredupkan), baris meta (jumlah kanan). Filter bawaan = yang perlu ditindak. Kalau pencarian membuat filter kosong, filter kembali ke bawaan. Daftar dibatasi 60 baris dengan tombol "Tampilkan lebih banyak (N lagi)".
- **Tag dan pil** (`.tag`, `.pill`, `.lv`): bulat penuh, 12 px/700, latar lembut dengan teks berwarna. `.tag.b` (biru, 12 px) dipakai sebagai penanda "Update mingguan" untuk angka yang diisi manual seminggu sekali (Rank, %DR).
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
- **Skor total DSR (plan 022)**: `view=rank` juga memuat `total` (`computeDsrTotals_`, `rankTotal_`): lima KPI berbobot (PS 10, FOP 16, Assortment 16, Banded 12, R2G 12; kunci `rank_w_*` di GS_CONFIG), semua BU digabung, toko diatribusikan ke salesman dengan qty bersih total terbanyak. Dilarang tambahan bidang: per KPI hanya `pct, skor, bobot, tanpaData, n` dan hitungan ringkas tingkat DSR (`rankKpiPublic_`; untuk Assortment: `lines, target, tokoNaik, tanpaBaseline`, semuanya jumlah tanpa nama toko). **R2G (`computeDsrR2g_`) adalah salinan rumus `assets/app.js` (SS, E2E, E2S, Pasti Untung, Pasti Laku); bila rumus insentif Monitoring Harian berubah, ubah juga di Code.gs** (`tests/dsrtotal.test.mjs` no. 9 membandingkan keduanya pada data dummy).
- **Papan Total dan lembar detail (plan 023)**: segmen "Total" (bawaan) / "Per KPI" di atas daftar; Per KPI = papan BU lama. Server lama tanpa `total` menyembunyikan segmen dan memakai Per KPI. Baris total `.rk.rk-total`: medali/nomor (`MHUtil.isMedal`), nama, "{DT} · {n} toko", skor satu desimal di kanan, bar tipis, lalu lima chip `.kd` (PS, FOP, Asrt, Banded, R2G) berhuruf supaya tidak hanya bergantung warna. Warna chip dan cincin lewat `MHUtil.kpiTone(pct)` (tampilan saja): >=100% hijau (`ok`), 70-99% kuning (`mid`), <70% merah (`bad`), tanpa data abu; teks "Belum ada data", bukan 0. Ketuk baris membuka lembar `.sheet` (`role="dialog"`, `aria-labelledby`, Esc/scrim/tombol tutup 44 px, fokus kembali ke baris): header `.card-head` (nama, DT, "#n dari N", skor), lima `kpiRow` (cincin, capaian, Bobot, Poin = skor x bobot / 100, rincian buka-tutup), lalu selisih ke peringkat di atas dan KPI dengan poin hilang terbesar (selisih dan poin hanya tampilan dari angka server). Responsif: < 900 px bottom sheet (maks 720 px di tengah), 900-1199 px panel kanan 420 px dengan scrim, >= 1200 px dua kolom dengan panel sticky 400 px yang otomatis memilih DSR akun atau peringkat 1. Teks WhatsApp/Salin varian "Ranking total" (10 teratas, tiga KPI terendah). `tests/ui/ranktotal.test.mjs` menguji papan ini.
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

## Rasio layar yang didukung

Diperiksa otomatis oleh `node tests/ui/layout-audit.mjs` (semua halaman x 8 lebar x terang/gelap; keluaran JSON + tabel jumlah temuan per kategori) dan sebagian oleh `tests/ui/layout-audit.test.mjs`. Lebar < 500 px memakai iframe pembungkus karena Chrome headless tidak mau lebih sempit.

| Perangkat | Lebar (CSS px) | Orientasi | Sidebar | Isi `main` |
|---|---|---|---|---|
| HP kecil | 360 | potret | laci | 1 kolom, penuh |
| HP umum | 390 | potret | laci | 1 kolom, penuh |
| HP besar | 430 | potret | laci | 1 kolom, penuh |
| HP lanskap | 844 (tinggi 390) | lanskap | laci (dapat digulir) | 1 kolom, header <= 25% tinggi |
| iPad mini | 768 | potret | laci | 1 kolom penuh (maks 1100) |
| iPad lanskap / kecil | 1024 | lanskap | tetap 248 px | sisa lebar (sekitar 776) |
| Laptop | 1280 | - | tetap 248 px | maks 1100, di tengah |
| Layar lebar | 1536 | - | tetap 248 px | maks 1100, tidak meregang |

Aturan kolom per breakpoint: < 900 px sidebar laci dan satu kolom; >= 900 px sidebar tetap; grid dua kolom hanya bila ada panel pendamping (Ranking >= 1200 px: daftar + panel detail; Ringkasan Monitoring Harian: kartu DSR dua kolom); `.kpi-list` di dalam kartu dibatasi 620 px dari 768 px supaya panah tidak jauh dari isinya; blok harga Cek Stok dan filter brand dibatasi 420 px. Tidak boleh ada gulir mendatar halaman pada seluruh matriks (tabel padat menggulir di dalam `.scroll`, dengan bayangan tepi kiri/kanan murni CSS yang hilang di ujung dan kolom pertama lengket). Ambang audit: sentuh >= 44 px (<= 1024 px), teks >= 12 px, kontras >= 4,5:1. Hasil audit setelah plan 027: nol temuan sentuh, teks, kontras, gulir mendatar.

**Grid layar lebar (plan 027)**: `.rk-list` (kecuali `.rkn-list` Ranking) dan `#csList` (Cek Stok): satu kolom di HP; 768-1199 px satu kolom maks 720 px; >= 1200 px dua kolom `repeat(2,minmax(0,1fr))` jarak 16 px (daftar lega `.lega` jarak kolom 32 px). Ranking tetap tata letak daftar + panel detail.

### Pengecualian terukur

Hal yang sengaja tidak mengikuti ambang, dicatat satu per satu:

1. **Penunjuk mouse >= 1100 px**: chip 34 px, tombol ikon 40 px, kolom cari 42 px tidak diaudit (audit sentuh hanya <= 1024 px); mouse tidak butuh 44 px dan raksasa di desktop terlihat janggal.
2. **Ellipsis nama salesman di panel Ranking >= 1280 px** (`.it-i .nm`, 4 temuan di `rank-kpi`): nama panjang dipotong satu baris, nama lengkap ada di lembar detail dan teks WhatsApp.
3. **Panah urut `th .th-a::before`**: glyph dekoratif (12 px, opasitas .4 saat belum diurutkan); status urut dibawa `aria-sort`.
4. **Sel libur `.hd td.lib`** (Kehadiran): opasitas .6 pada sel tanpa teks informasi; arti ada di legenda.
5. **Tile 4, 5 atau lebih dari 6 buah** di >= 761 px tetap 4 kolom (belum ada contoh 5 tile); tile sisa tidak diisi.

## Daftar periksa fitur baru

1. Memakai token, bukan warna baru. Ada pasangan gelap.
2. Judul bagian pakai chip ikon. Ada teks bantu satu kalimat.
3. Daftar panjang punya cari, filter berhitung, dan batas baris.
4. Ada keadaan kosong, memuat, dan gagal yang jelas.
5. Angka tabular, label kecil, satuan jelas, warna sesuai makna.
6. Target sentuh minimal sesuai ukuran di atas, tidak ada geser horizontal di 390 px (kecuali tabel padat di `.scroll`).
7. Teks bahasa Indonesia sederhana, tanpa singkatan yang tidak dikenal tim.
8. Versi aset (`?v=`) dinaikkan di HTML supaya HP tidak memakai CSS lama.

## Aturan tambahan (plan 029)
- `.card-head` di <= 560 px boleh membungkus: pil (`.tag`/`.lv`) pindah ke baris sendiri di bawah judul; judul maksimal dua baris.
- Nama di `.it-i .nm` membungkus maksimal dua baris (line-clamp), bukan ellipsis satu baris.
- Tile ringkasan 5 dan 7 memakai grid 6/12 kolom dengan span agar baris terakhir penuh; 2, 3, 4, 6 sudah tanpa slot kosong.
- Daftar `.lega` dua kolom (>= 1200 px): garis pemisah item kedua dari terakhir disembunyikan.
- Label kecil di grid empat kolom (Assortment) dipendekkan ("rata-rata") agar maksimal dua baris.
