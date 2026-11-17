# Sekretaris UMKM

🔗 **Demo langsung:** [sekretaris-umkm-two.vercel.app](https://sekretaris-umkm-two.vercel.app/)

🌺 **Edisi Bali:** seluruh tampilan bernuansa Bali di semua tab (palet emas–aubergine dengan aksen marun, judul bergaya prasasti, ornamen prada, sapaan *Om Swastiastu*). Semuanya ada di satu berkas, `index.html`, tanpa berkas tambahan. Bila WebGL tidak tersedia, tampilan otomatis memakai latar 2D.

| Bagian | Keterangan |
|---|---|
| 🏝️ Latar 3D hidup | Pura, sawah, pantai, dan lapak UMKM beranimasi di belakang aplikasi, mengikuti jam perangkat (fajar/siang/senja/malam). Berhenti sendiri saat layar pembuka/masuk atau saat dunia 3D terbuka agar hemat baterai. Diatur di **Pengaturan → Tampilan Bali** (Latar 3D Bali, Menu samping, Waktu di latar) |
| 🧭 Menu samping | Menu menjadi rel ikon di kiri; ketuk ikon untuk membuka panel, ketuk lagi atau ✕ untuk menutupnya sehingga latar Bali terlihat penuh. Bisa dimatikan (kembali ke tab bawah) |
| 🏪 Kios per menu | Setiap menu punya kios 3D di latar, misalnya *Kios Anggaran* untuk Catat Uang |
| 🪙 Dompet Poin | Tab **Game** kini menjadi **Dompet Poin**: saldo, **Misi Poin Hari Ini**, riwayat, top up, transfer, dan tukar hadiah. Poin didapat dari **aktivitas** (catat transaksi, checkpoint & koin di Dunia 3D, kunjungan ke Ruang Usaha mitra) dan **dihitung server** dengan batas harian. Mini-game lama tetap ada di bagian lipat *Mini-game (opsional)* — juga bisa dimainkan dari **Balai Dompet Poin** di dalam Dunia 3D (rincian di bawah) |
| 🧱 Dunia 3D Bali | Tombol emas **🧱 Dunia 3D** di tab **Peta** (header & chip), kartu **Dunia 3D Bali** di tab **Dompet Poin**, tombol 🧱 Dunia di rel menu/pojok. Dunia terbuka berpulau Bali: 7 checkpoint, koin, kendaraan, berenang, warga & lapak komunitas, **Ruang Usaha mitra**, **📍 Lokasi Nyata** (karakter mengikuti GPS-mu), dan pemain lain yang tampil live. Tamu juga boleh masuk (rincian di bawah) |
| 🗺️ Peta Nusantara | Dunia 3D kini **14 kota Indonesia** (Bali, Medan, Palembang, Jakarta, Bandung, Semarang, Yogyakarta, Surabaya, Pontianak, Balikpapan, Makassar, Manado, Jayapura, Labuan Bajo) lengkap dengan gedung, jalan raya, **tol berbayar**, bandara, pelabuhan, taman kota + **kolam renang**, dan landmark. Pindah kota dengan **memesan tiket pesawat/kapal** (Koin Dunia), naik di gerbang, lalu menonton **animasi rute** di peta Nusantara. Ada Papan Kerja, paket antar-kota, dan Paspor Nusantara |

### ⚡ Performa di HP & perbaikan navigasi

Mode hemat otomatis menyala di HP / layar sentuh / perangkat lambat (dan bisa dipilih manual di **Pengaturan → Tampilan Bali → Mode hemat tampilan**: Otomatis · Hemat · Penuh). Laptop tetap tampil penuh.

| Penyebab lambat di HP | Perbaikan |
|---|---|
| Blur kaca (`backdrop-filter`) bertumpuk di atas latar 3D yang bergerak | Dimatikan di mode hemat; latar panel dibuat lebih pekat (tetap gelap–emas) |
| Latar 3D tetap digambar saat panel menutupi seluruh layar HP | Dijeda otomatis saat panel penuh terbuka, dilanjutkan setelah panel selesai menutup |
| ±400 draw call per frame di latar 3D (padahal hanya ±12 rb segitiga) | Mesh statis (pura, gerbang, sawah, lapak, mahkota pohon kelapa) digabung per material → ±290 draw call, tampilan sama |
| Latar 3D selalu 24–40 fps walau thread utama sudah penuh | Pengatur beban: fps turun otomatis (min 12) bila latar memakan >40% waktu, naik lagi bila longgar |
| Animasi buka/tutup menu mengubah lebar/posisi tiap frame; hologram menganimasikan `top`/`width`/`height` | Di HP lebar panel tetap (hanya digeser); hologram memakai `transform` |
| Kelopak jatuh berfilter `drop-shadow`, `box-shadow` beranimasi | Di mode hemat: 4 kelopak tanpa filter, disembunyikan saat panel penuh, denyut tombol AI dimatikan |

Hasil ukur di emulasi HP (390×844, CPU diperlambat 4×; GL perangkat lunak, jadi hanya perbandingan relatif — bukan HP asli): buka panel 4,7 → 42 fps, panel terbuka diam 6,3 → 60 fps, scroll di panel 5,4 → 60 fps, tutup panel 6,2 → 32 fps.

**Bug lama diperbaiki:** `_distToRouteNow is not defined` saat navigasi GPS (variabel dihitung di `handleNavFix()` tetapi dipakai di callback `watchPosition`) — deteksi keluar jalur & hitung ulang rute kini jalan lagi.

### 🧱 Dunia 3D Bali

Pulau Bali mini yang bisa dijelajahi sebagai game. Warga komunitas tampil sebagai avatar blok 3D (udeng/kamen/jepun) di warungnya, ditemani warga NPC yang menyapa *Om Swastiastu*. Tamu (belum login) juga boleh masuk untuk melihat-lihat.

| Fitur | Keterangan |
|---|---|
| 🌀 Layar "portal" | Gerbang emas + tips, lalu kamera terbang masuk ke pulau; judul "Pulau Dewata · Dunia UMKM Bali" |
| 🎶 Suasana | Gamelan pelog, ombak, jangkrik/burung dibuat langsung oleh WebAudio (tanpa berkas audio) dan mulai saat menekan **Masuk ke Dunia**; siang/senja/malam mengikuti jam asli (bisa diganti ☀️); mute lewat 🔊 atau `M`. Latar 3D di balik aplikasi dijeda selama dunia terbuka agar tidak berat |
| 🚩 Checkpoint | 7 titik: Alun-alun, Candi Bentar, Pura Meru, Subak, Kolam Sakral, Titian Tengah, Puncak Dewata. Jatuh/KO → hidup lagi di checkpoint terakhir |
| 🏠 Recall | Tekan `B` / tombol 🏠 lalu diam 3 detik untuk pulang ke Alun-alun; batal bila bergerak/lompat/menyerang/KO |
| 😈 Mode Usil | Lempar kelapa 🥥 (`Q`) dan senggol 👋 (`E`) ke warga; mereka tumbang ala kartun ("OOF!") lalu muncul lagi. Bocah Usil NPC bisa membalas. **Hanya terlihat di layar pemain sendiri** (tidak ada yang dikirim ke pengguna lain); bisa dimatikan lewat tombol "Usil" / `U` |
| ⛩️ Titian Dewata | Rintangan rakit melayang di Kolam Sakral (ada yang bergerak) menuju puncak dengan peti harta; jatuh ke air = "KECEBUR" |
| 🪙 Koin & misi | 51 koin Rp tersebar + bonus checkpoint; baris misi dan minimap menunjuk tujuan berikutnya. Tombol **🪙** di kanan atas membuka **Misi Poin Hari Ini** (checkpoint, koin, kunjungan mitra, catat transaksi → poin Dompet Poin) |
| 🏛️ Balai Fitur | Pavilion di sekitar Alun-alun mewakili tiap tab aplikasi; masuk (`F`) → dunia menutup dan tab itu terbuka. **Pengecualian: Balai Dompet Poin** membuka misi harian + mini-game **di dalam dunia** tanpa keluar (tombol "Dompet Poin lengkap" membuka tabnya bila perlu) |
| 🛵 Kendaraan | Tombol 🚶 di kanan atas (atau `V`): jalan kaki, sepeda, motor, mobil. Karakter ikut naik, roda berputar, miring saat belok; `Shift` ngebut. Kendaraan tidak masuk laut dan otomatis diparkir saat masuk ruang usaha. Pilihan tersimpan |
| 🏊 Berenang | Masuk laut dari pantai → karakter otomatis berenang (gaya bebas saat bergerak, mengapung saat diam) dengan riak air & gelembung. Ombak membatasi sampai ± 80 m dari pantai; keluar ke daratan kembali berjalan |
| ➤ Panah arah | Panah emas **kecil putus-putus** di depan kaki karakter menunjukkan arah jalan; panah hijau kecil putus-putus menunjuk ke tujuan berikutnya bila jauh |
| 🏠 Ruang Usaha mitra | Ketuk warga yang punya usaha → **🏠 Kunjungi usaha** → masuk ke ruang usahanya: konter, rak produk, pemilik yang menyapa, dan **Papan Kinerja** (margin laba, tren laba 6 bulan, rentang omzet, jumlah transaksi, hari aktif, sumber pemasukan terbesar). Meja rapat 🤝 membuka chat untuk **Ajak Bisnis**. Tersedia juga *Warung Contoh* berlabel **DATA CONTOH** di dekat Alun-alun untuk mencoba tanpa data nyata, dan **🏠 Ruang usahaku** untuk melihat tampilan milik sendiri |
| 🎮 Kontrol | HP: joystick + tombol (🙏 emote, 🏠, 🥥, 👋, Lompat). Desktop: `WASD`/panah, `Spasi` lompat, `1/2/3` emote, `V` kendaraan, `F` masuk balai/ruang usaha, `Esc` keluar |
| 📍 Lokasi Nyata | Tombol 📍 di kanan atas dunia: karakter **mengikuti GPS-mu** (jalan kaki → sepeda → motor otomatis menurut kecepatan), dengan cincin akurasi biru seperti titik biru Google Maps, kecepatan, dan jarak tempuh. Otomatis menyala bila kamu sedang memakai **Bagikan Lokasi / rute / navigasi** di Peta (memakai posisi yang sama, tanpa membuka GPS kedua). Menyentuh kontrol manual menjeda mode ini; ketuk 📍 untuk kembali |
| 🧭 Rute di 3D | Saat rute atau navigasi dari Peta 2D aktif, rutenya tampil di dunia sebagai panah biru putus-putus menuju penanda tujuan 🏁 berikut nama dan jarak |
| 🟢 Pemain lain live | Pemain lain yang sedang berada di dunia tampil bergerak langsung (opsional, butuh aturan `worldPresence`) |


**Catatan privasi Lokasi Nyata:** posisi GPS hanya dipakai di layarmu sendiri untuk menggerakkan karakter; **tidak ditulis ke Firebase oleh fitur ini**. Skala gerak diperbesar (minimal ≈ 0,45 unit per meter) agar langkahmu terlihat; bila warga komunitas berdekatan, skala peta dipakai sehingga karakter sejajar dengan lapak sungguhan. Di luar area pulau karakter berhenti di pesisir. Tombol Bagikan Lokasi di Peta 2D tidak berubah dan tetap mengikuti pengaturan privasinya sendiri.

### 🗺️ Peta Nusantara — pesawat, kapal, tiket, kerja, dan paspor

Dunia 3D tidak lagi hanya Bali. Dari **Bandara Ngurah Rai** (Gerbang Keberangkatan di sisi utara landasan) atau **Pelabuhan Benoa** (dermaga barat) kamu bisa terbang/berlayar ke **13 kota lain**. Setiap kota dibangun prosedural saat pertama dikunjungi (±0,1–0,4 dtk, ±80–100 draw call, ±22 rb segitiga — ringan untuk HP) dan dibuang lagi saat pulang; dunia **selalu dimulai di Bali**.

| Kota | Landmark | Isi kota |
|---|---|---|
| Medan · Palembang · Jakarta · Bandung · Semarang · Yogyakarta · Surabaya · Pontianak · Balikpapan · Makassar · Manado · Jayapura · Labuan Bajo | Istana Maimun · Jembatan Ampera · Monumen Nasional · Gedung Sate · Lawang Sewu · Tugu Yogyakarta · Tugu Pahlawan · Tugu Khatulistiwa · Menara Kilang · Monumen Pinisi · Jembatan Soekarno · Jembatan Youtefa · Patung Komodo | Blok gedung bertingkat & rumah, jalan raya bermarka + lampu jalan + lalu lintas mobil, **jalan tol berbayar** (E-Toll 2 🪙, kendaraan ×1,5 lebih cepat), taman kota + **kolam renang**, bandara (terminal, landasan, apron, pesawat parkir), pelabuhan (dermaga, kapal, crane, kontainer), laut yang bisa direnangi |

**Cara bepergian (alur profesional seperti maskapai sungguhan):**

1. **Pesan dulu.** Tekan `F` di **Loket Tiket** bandara/pelabuhan (atau tombol 🗺️ di kanan atas) → peta rute bergaya jaringan penerbangan (kota = pil berlencana kode, garis putus-putus beranimasi). Pilih kota tujuan → pilih **kelas** (Ekonomi ×1 · Bisnis ×1,8 · Eksekutif ×3) → pilih **jadwal** → **Pesan & Bayar**.
2. **Tiket dibayar dengan Koin Dunia 🪙** (mata uang di dalam game, **bukan uang sungguhan**). Saldo awal 150 🪙; bertambah dari koin yang dipungut di dunia (otomatis masuk dompet), kunjungan landmark pertama (+10), cap paspor, dan pekerjaan.
3. **Harga mengikuti jarak** (haversine antar-kota): pesawat `45 + 0,085 × km`, kapal `15 + 0,035 × km` (kapal hanya untuk rute ≤ 1.800 km — kalah cepat, jauh lebih murah), dikali faktor kelas.
4. **Jadwal berangkat bergilir** (pesawat tiap 90 dtk, kapal tiap 150 dtk). **Check-in** dibuka 60 dtk (pesawat) / 90 dtk (kapal) sebelum berangkat dan ditutup 8 / 10 dtk sebelum berangkat; kamu harus **berada di gerbang** saat itu (otomatis naik bila sudah di gerbang, atau tekan tombol naik). Chip kecil di layar mengingatkan sisa waktu dan arah ke gerbang.
5. **Pembatalan:** refund **80%** sebelum check-in dibuka, **50%** saat check-in, **0** setelah check-in ditutup. Terlewat jadwal → otomatis batal dengan refund **30%**. **Carter** (berangkat sekarang, harga ×1,6) hanya dari gerbang.
6. **Animasi rute:** setelah naik, layar berganti ke **peta Nusantara bergaya jaringan rute** — pesawat/kapal bergerak di sepanjang garis putus-putus dengan awan lewat, bar progres, sisa waktu, dan daftar penumpang lain di penerbangan yang sama (opsional, lewat `worldFlights`). Tombol **Lewati ▸▸** muncul setelah 2,5 dtk. Tiba di kota tujuan karakter muncul di bandara/pelabuhan, dengan bonus kelas (Bisnis +4 🪙, Eksekutif +10 🪙).
7. **Jaga-jaga kehabisan koin:** tombol **🆘 Bantuan pulang** menambah saldo seadanya untuk tiket pulang ke Bali (jeda 5 menit).

**Sistem kerja & ekonomi (agar perjalanan punya tujuan):**

| Fitur | Keterangan |
|---|---|
| 📦 Papan Kerja (tiap kota) | 3 tawaran **kurir lokal** (6–26 🪙 sesuai jarak, batas 4 menit): ambil paket di papan, antar ke landmark/titik kota |
| ✈️ Paket antar-kota | 3 tawaran per kota (berganti tiap 10 menit): bawa paket ke kota lain; upah ≈ **1,4 × tiket ekonomi + 12 🪙** — untung bila naik ekonomi/kapal, rugi bila carter |
| 🛂 Paspor Nusantara | Cap tiap kota pertama kali dikunjungi (**+40 🪙**); lengkap 14 kota → **+300 🪙** dan gelar Pelancong Nusantara 🏆 |
| 🛣️ Tol | Jalan tol di tiap kota: gerbang tol memungut **2 🪙** untuk kendaraan (sepeda/motor/mobil), lalu kecepatan ×1,5 selama di tol |
| 🏊 Renang | Kolam renang kota dan laut di sekitar pelabuhan — karakter berenang otomatis (batas ombak ±80 m dari pantai) |
| 🧭 Navigasi | Minimap menunjuk gerbang, loket, papan kerja, dan tujuan pekerjaan; kamera tidak menembus gedung (otomatis maju bila terhalang) |

**Hasil uji (Playwright, Chromium + GL perangkat lunak):** ke-14 kota terbangun tanpa error (100–380 ms, 76–97 draw call, ±22 rb segitiga per kota; Bali bertambah hanya ±9 draw call dan ±1,5 rb segitiga untuk bandara & pelabuhan); alur pesan → check-in → naik → animasi rute → tiba → pulang ke Bali (jumlah collider, koin, checkpoint pulih persis); aturan harga, refund 80/50 %, tiket ganda ditolak, koin kurang ditolak, terlewat jadwal (refund 30 %); tol (−2 🪙, ×1,5); berenang di kolam; kurir lokal & paspor; presence antar kota; tata letak HP 390 px; serta seluruh tes regresi lama (dock, etalase, GPS, Dompet Poin, navigasi, mode tamu) tetap lolos.

**Dompet & anti-curang (jujur soal batasannya):** saldo Koin Dunia disimpan **di perangkat** (`localStorage`, kunci `umkm_nusa_v1_<uid>`) dan **bukan** Poin Dompet maupun uang sungguhan, jadi tidak ada klaim hadiah/penarikan yang bergantung padanya. Poin Dompet tetap hanya dihitung server (lihat bagian Dompet Poin). Karena dihitung di klien, saldo Koin Dunia bisa diubah pemilik perangkat — wajar untuk mata uang permainan; bila nanti Koin Dunia ingin ditukar ke Poin, pembelanjaan/saldo perlu dipindah ke server (lihat "Rencana tahap berikutnya").

**Rencana tahap berikutnya (tidak ada di versi ini):** pembelanjaan & saldo di server (jalur yang sama dengan `world-reward`), tukar Koin Dunia ↔ Poin dengan batas harian, gedung yang bisa dimasuki, penerbangan bersama komunitas (kursi sebaris, obrolan di kabin), cuaca & jam sibuk lalu lintas, lebih banyak detail tiap kota (pasar, stasiun KRL/MRT, bandara kecil).

**Aturan Firebase tambahan (opsional) — daftar penumpang sepenerbangan:**

```json
"worldFlights": {
  "$flight": {
    ".read": "auth != null",
    "$uid": {
      ".write": "auth != null && auth.uid === $uid",
      ".validate": "!newData.exists() || (newData.child('n').isString() && newData.child('n').val().length <= 24)"
    }
  }
}
```

Tanpa aturan ini fitur tetap berjalan; hanya daftar "penumpang lain" yang kosong. Aturan `worldPresence` yang sudah ada kini juga dipakai antarkota: posisi pemain di kota tujuan tampil hanya untuk pemain yang berada di kota yang sama (koordinat kota berjarak ±2.400 unit sehingga tidak saling terlihat).

### 🪙 Dompet Poin — poin dari aktivitas, dihitung server

Menu **Game** diubah menjadi **Dompet Poin** karena poin paling bermakna bila datang dari *pekerjaan nyata*, bukan hanya dari permainan acak. Tab ini tetap menjadi pusat saldo, riwayat, top up, transfer, dan Toko Poin; mini-game lama **tidak dihapus** (jadi bagian lipat opsional, dan tetap jadi cadangan untuk HP yang tidak kuat WebGL).

| Sumber poin | Poin | Batas | Diverifikasi server? |
|---|---|---|---|
| 📒 Catat transaksi hari ini | +10 | 1×/hari | **Ya** — server membaca `transaksi/{uid}` dan mencari transaksi bertanggal hari ini (WIB) |
| 🏠 Kunjungan **pertama** ke Ruang Usaha mitra (bertahan >4 detik) | +5 | tiap mitra 1× seumur akun, maks 3/hari | Sebagian — mitra harus benar-benar ada di `users/` dan bukan dirimu sendiri |
| 🚩 Checkpoint Dunia 3D (6 titik setelah Alun-alun) | Candi Bentar/Pura/Subak/Kolam +2, Titian +3, Puncak +6 | tiap checkpoint 1×/hari | Tidak (dunia berjalan di peramban) → nilainya kecil & dibatasi |
| 🪙 Koin Dunia 3D | 25 koin = +1 | maks 5 poin/hari | Tidak → kecil & dibatasi |
| **Total dari dunia & misi** | | **maks 40 poin/hari** | |

**Cara kerja anti-curang** (`api/world-reward.js`, `lib/world-rewards.js`, `lib/firebase-auth.js`):

- Klien (`bali-points.js`, di dalam `index.html`) hanya melaporkan **jenis kejadian**. **Jumlah poin dan batas harian ditentukan server**; uid diambil dari **Firebase ID token** yang ditandatangani Google (diverifikasi RS256 tanpa dependensi tambahan), bukan dari kiriman klien.
- Klaim **idempoten** dan ditulis **atomik** dengan compare-and-swap ETag Realtime Database (`transact` di `lib/rtdb.js`): 30 permintaan paralel yang sama hanya dihitung sekali (ada tesnya).
- Status misi harian disimpan di `gameData/{uid}/world` bersama saldo dan riwayat dalam **satu node**, sehingga poin dan catatan klaim tidak mungkin tidak sinkron. Mini-game lama kini menyimpan dengan `update()` dan **menggabung** selisih lokal dengan saldo server, sehingga tidak menimpa poin yang baru dikredit server.
- Tanpa login (tamu): dunia tetap bisa dijelajahi dan koin dunia terkumpul seperti biasa, tetapi **tidak ada poin dan tidak ada panggilan ke server**.
- Bila server belum dipasang / sedang offline: aktivitas disimpan di perangkat (antrean per akun, backoff otomatis) lalu dikirim begitu tersambung. Panel menampilkan "Server poin belum bisa dihubungi"; fitur lain tidak terpengaruh.

**Memasang sisi server** (Vercel; tanpa variabel lingkungan baru — memakai `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_DATABASE_URL`, `APP_ORIGIN` yang sudah ada; opsional `FIREBASE_PROJECT_ID`, bawaan `sekretaris-umkm`):

1. Salin ke repo: `api/world-reward.js`, `lib/world-rewards.js`, `lib/firebase-auth.js`, `lib/rtdb.js` (hanya **menambah** fungsi `transact`; fungsi lama tidak berubah), `tests/world-reward.test.js`, `tests/helpers/mock-rtdb.js`. Total fungsi Vercel menjadi 9 (batas paket Hobby 12).
2. Deploy, lalu coba: login → **Dunia 3D** → injak checkpoint → toast "+2 poin" dan saldo di tab Dompet Poin naik.
3. `POST /api/world-reward` dengan `Authorization: Bearer <ID token>` dan `{"events":[{"type":"cp","id":"gate"}]}` (kirim `{"events":[]}` untuk hanya membaca status misi).

**Aturan Firebase untuk `gameData`** (agar catatan klaim harian tidak bisa dihapus pengguna dari peramban). Contoh transisi yang tidak merusak fitur lama (mini-game, transfer, top up) — field lama tetap boleh ditulis klien, `world` **tanpa `.write`** sehingga hanya server (service account) yang bisa menulisnya:

```json
"gameData": {
  ".read": "auth != null",
  "$uid": {
    "poin":         { ".write": "auth != null" },
    "playsToday":   { ".write": "auth != null" },
    "lastPlayDate": { ".write": "auth != null" },
    "history":      { ".write": "auth != null" }
  }
}
```

Sesuaikan dengan aturan `gameData` yang sudah kamu pakai dan coba di Rules Playground (contoh ini belum diuji di Firebase; pastikan `update()` pada `gameData/{uid}` tetap lolos).

**Batas yang jujur — baca sebelum poin bernilai uang:**

- Yang dilindungi server hanyalah **poin dari dunia/misi**. Mini-game, transfer poin, dan top up masih berjalan di sisi klien seperti sebelumnya, sehingga pengguna yang mahir tetap bisa mengubah `gameData/{uid}/poin` langsung selama aturan database mengizinkan. Langkah berikutnya yang disarankan: pindahkan mini-game, transfer, dan penukaran hadiah ke endpoint server, lalu tutup `.write` untuk `poin`.
- Checkpoint dan koin dilaporkan peramban sehingga bisa dipalsukan; karena itu nilainya kecil dan ada batas harian (maks 40 poin/hari dari semua sumber dunia). Misi *catat transaksi* pun dapat dipenuhi dengan transaksi asal-asalan — batas 1×/hari membuat dampaknya kecil.
- **Perhatian hukum (bukan nasihat hukum):** permainan berbasis peluang (putar roda, tebak angka, gosok kartu) yang bisa dimainkan lebih banyak dengan **membeli** kesempatan/poin dan menghadiahkan sesuatu yang bernilai dapat dianggap perjudian atau undian menurut hukum di Indonesia. Poin yang didapat dari **usaha nyata** (misi, kunjungan, catat transaksi) jauh lebih aman. Sebelum diluncurkan komersial, minta pertimbangan ahli hukum; opsi aman: jadikan mini-game murni gratis tanpa pembelian kesempatan, atau hapus hadiah bernilai dari hasil acak.

### Etalase Usaha (opt-in) — melihat profit mitra dengan privasi terjaga

Pemilik **memutuskan sendiri**: **Pengaturan → Tampilan Bali → Etalase usaha di Dunia 3D** (bawaan **MATI**).

- Saat aktif, aplikasi menghitung otomatis dari catatan keuangan pemilik lalu menyimpan ringkasan di `worldShowcase/{uid}`: margin laba 90 hari (%), pertumbuhan 30 hari (%), tren laba 6 bulan (sudah dinormalisasi −100…100), **rentang** omzet/bulan, **rentang** jumlah transaksi, hari aktif, dan 3 sumber pemasukan terbesar (persentase).
- **Nominal rupiah persis, nama pelanggan, dan isi catatan tidak pernah dikirim.** Mematikan saklar langsung menghapus `worldShowcase/{uid}`. Ringkasan diperbarui otomatis tiap ±10 menit selama aplikasi terbuka.
- Pengunjung hanya melihat angka relatif dan keterangan "belum diaudit pihak ketiga"; keputusan bermitra tetap perlu verifikasi sendiri. Teks dari pengguna lain ditampilkan sebagai teks biasa (bukan HTML).
- Pemilik yang belum mengaktifkan etalase tampil sebagai "belum membuka Etalase Usaha" — pengunjung tetap bisa mengajak ngobrol.

**Aturan Firebase Realtime Database yang perlu ditambahkan** (di `rules` → bersama node lain):

```json
"worldShowcase": {
  ".read": "auth != null",
  "$uid": {
    ".write": "auth != null && auth.uid === $uid",
    ".validate": "newData.hasChildren(['v','trend','omzetBand','trxBand'])"
  }
}
```

Tanpa aturan ini saklar akan menampilkan pesan gagal menyimpan dan Papan Kinerja mitra tampil "tidak dapat dimuat" — fitur lain tidak terpengaruh.

### Aturan Firebase yang dipakai Dunia 3D

```json
"worldShowcase": {
  ".read": "auth != null",
  "$uid": {
    ".write": "auth != null && auth.uid === $uid",
    ".validate": "newData.hasChildren(['v','trend','omzetBand','trxBand'])"
  }
},
"worldPresence": {
  ".read": "auth != null",
  "$uid": {
    ".write": "auth != null && auth.uid === $uid",
    ".validate": "!newData.exists() || (newData.child('x').isNumber() && newData.child('z').isNumber() && newData.child('t').isNumber())"
  }
}
```

- `worldShowcase/{uid}`: ringkasan kinerja usaha, **hanya bila pemilik mengaktifkan Etalase Usaha** (penjelasan di atas).
- `worldPresence/{uid}`: posisi pemain *di dalam dunia* (x, z), arah, nama tampilan (maks. 24 huruf), dan waktu — **bukan GPS**; dihapus saat dunia ditutup atau koneksi putus. Tanpa aturan ini, posisi live berhenti sendiri dan warga online tetap tampil di sekitar lapaknya. Contoh aturan di atas belum diuji; sesuaikan dengan aturan yang sudah ada dan coba di Rules Playground.

**Catatan teknis:** dunia *membaca* data komunitas yang sudah ada (siapa online, dan lokasi sesuai pengaturan privasi — hanya `storeCoords`, GPS mentah tidak pernah ditampilkan ke pengguna lain). Koin dunia, jumlah KO, pilihan kendaraan, dan pengaturan suara/usil disimpan di browser pemain (`localStorage`: `baliWorld.v1`, `umkm_bali_veh`, `umkm_bali_live`, `umkm_bali_dock`, antrean poin per akun `umkm_poin_v1_<uid>`); **poin** sendiri hanya hidup di `gameData/{uid}` dan dikredit server. Three.js memakai tag skrip yang sudah ada di aplikasi (cdnjs r128); tidak ada pustaka atau permintaan jaringan baru. Peta 2D (Leaflet/Google), pencarian rute, navigasi, dan Bagikan Lokasi **tidak diubah**.

---

## 1. Tentang Produk

Sekretaris UMKM adalah aplikasi web (PWA) yang berperan sebagai asisten digital untuk pemilik usaha kecil, mencakup pencatatan keuangan, tagihan, stok, dan "Otak AI". Pemilik cukup menceritakan transaksi dengan bahasa sehari-hari, lalu aplikasi mencatat dan merangkumnya menjadi dashboard. Pekerjaan berulang seperti menagih pelanggan dan memantau stok dijalankan otomatis oleh robot UiPath, sementara agen AI hanya menyusun kalimat pengingat dan draf pesanan. Untuk kasus berisiko (nominal besar, telat lama, nada tegas), keputusan akhir tetap ada di tangan pemilik UMKM lewat tahap persetujuan.

## 2. Masalah Utama yang Diselesaikan

Menagih pelanggan dan memantau stok adalah pekerjaan harian yang berulang dengan alur yang jelas: cek tagihan → tentukan siapa yang perlu diingatkan → tulis pesan yang sopan → kirim → catat → ulangi besok. Pemilik UMKM sering lupa menagih, nada pesannya tidak konsisten, dan stok habis tanpa disadari. Akibatnya arus kas terganggu dan waktu pemilik habis untuk pekerjaan administratif, bukan untuk mengembangkan usaha.

## 3. Target Pengguna

- Pemilik UMKM / usaha rumahan di Indonesia (warung, toko, kuliner, reseller, jasa) yang masih mencatat manual atau lewat chat.
- Usaha dengan pelanggan yang membayar tempo (punya tagihan berjalan) dan stok barang yang perlu dipantau.
- Pelaku usaha yang tidak punya staf administrasi dan butuh "sekretaris" yang hemat biaya (memakai tier gratis AI).

## 4. Fitur Utama MVP yang Sudah Berfungsi

| Fitur | Keterangan |
|---|---|
| 💰 **Catat Uang** | Catat pemasukan/pengeluaran dengan menceritakan transaksi hari ini |
| 🧾 **Tagihan** | Tambah & pantau tagihan pelanggan beserta jatuh tempo; pembayaran online via Midtrans Snap |
| 📊 **Dashboard** | Grafik pemasukan vs pengeluaran per kategori dan tren transaksi |
| 🧠 **Otak AI** | Asisten AI untuk UMKM dengan pendekatan privacy-first |
| 🚚 **Agen Rantai Pasok** | Agen Otomatis Harian, Draf Tindakan Agen (persetujuan pemilik), dan Riwayat Agen |
| 🤖 **Robot UiPath + API robot** | `api/robot.js` (ping, snapshot, drafts, send, report) dengan aturan bisnis D-3, hari-H, dan telat tiap 3 hari |
| 📧 **Pengingat email otomatis** | Email tagihan dikirim via Mailjet, tidak terkirim ganda bila robot dijalankan dua kali |
| 🛡️ **Guardrail AI** | Server memvalidasi usulan AI (nominal, tautan, ancaman, injeksi), menempel angka & penerima dari database, dan menandatangani rencana (HMAC) |
| 🔔 Fitur pendukung | Login + OTP email, push notification (FCM), Bikin Konten, Galeri, Live, Video, Komunitas, Pasar Kongsi, Dompet Poin (+ mini-game) |

## 5. Status Pengembangan Proyek

**Status: ✅ Sudah pernah dikembangkan sebelumnya** (bukan dibangun baru khusus untuk kompetisi ini).

### Bagian yang sudah ada sebelumnya
Aplikasi dasar pertama kali dibuat untuk **IDCamp Developer Challenge 2026**, meliputi:
- Aplikasi web/PWA dengan Catat Uang, Tagihan, Dashboard, dan Otak AI
- Login dengan OTP email (`api/send-otp.js`) dan push notification (`api/notify.js`)
- Pembayaran online Midtrans (`api/create-transaction.js`)
- Proxy AI (`api/ai-proxy.js`) dan cron pengingat tagihan serta rantai pasok (`api/cron-*.js`)
- Fitur komunitas: Bikin Konten, Galeri, Live, Video, Komunitas, Pasar Kongsi, Dompet Poin (+ mini-game)

### Improvement untuk lomba (Automation Hackathon 2026)
- **Robot UiPath sebagai inti otomasi**: berjalan terjadwal di Orchestrator, menerapkan aturan bisnis, mengirim email, dan mengeksekusi draf yang disetujui (`api/robot.js`, folder `uipath/`).
- **Agen AI tool-calling gratis** (Groq / Gemini / OpenRouter, bisa diganti n8n) untuk menyusun pengingat, memilih nada, menandai kejanggalan, serta membuat draf pesanan stok dan ringkasan harian. Agen tidak pernah mengirim apa pun sendiri (`api/agent.js`, `lib/`).
- **Human-in-the-loop**: tab *Agen Rantai Pasok* untuk menyetujui/menolak kasus berisiko (nilai ≥ Rp 5 juta, telat ≥ 14 hari, nada tegas, bendera keamanan, semua draf stok/WA).
- **Lapisan keamanan baru**: validasi output AI, tanda tangan HMAC pada rencana, snapshot robot tanpa data pelanggan, log ber-hash, dan eksekusi idempoten.
- **Pembersihan keamanan versi lama**: kunci Groq pribadi tidak lagi disalin ke Firebase dan kunci peta tidak lagi ditanam di `index.html`.
- **Pengujian otomatis** (249 tes) serta server dan robot demo lokal tanpa API key.
- Cron lama dijadikan jalur cadangan (diam bila `ROBOT_MODE=1`).

> **Catatan jujur:** kompilasi robot di UiPath Studio asli dan eksekusi tak-berawak di Orchestrator belum bisa diuji di lingkungan pengembangan; panduan uji ada di `uipath/README.md`.

---

## Alur Kerja & Peran

| Pelaku | Tugas |
|---|---|
| **Robot UiPath** (inti) | Terjadwal di Orchestrator • membaca data minimal • menerapkan aturan bisnis • memanggil agen AI • mengirim email yang sah • menaruh draf • mengeksekusi draf yang disetujui • log & laporan |
| **Agen AI** | Menyusun kalimat, memilih nada, menandai kejanggalan, menyusun draf stok & ringkasan harian. **Tidak pernah mengirim apa pun** |
| **Server** | Memvalidasi usulan AI, menempelkan angka & penerima dari database, menandatangani rencana |
| **Pemilik UMKM** | Menyetujui/menolak kasus berisiko di tab *Agen Rantai Pasok* |

```
Orchestrator (jadwal) ─► ROBOT UiPath ──ping/snapshot──► /api/robot ─► Firebase RTDB
                            │  aturan bisnis (robot)
                            ├──────────► AGEN AI (/api/agent atau webhook n8n): usulan ─► validasi + tanda tangan server
                            ├─ rute "auto"     ─► robot mengirim email (Mailjet via server)
                            └─ rute "approval" ─► draf ─► PEMILIK menyetujui di aplikasi ─► putaran berikutnya robot mengirim
```

## Coba Cepat (tanpa akun, tanpa API key, data fiktif)

Butuh Node 22; tanpa `npm install`.

```bash
node tools/local-demo.mjs
node tools/robot-reference.mjs --base-url http://127.0.0.1:8787 --key demo-robot-key-lokal-1234567890
# buka http://127.0.0.1:8787/demo → "Konsol Pemilik"
```

## Pasang Sungguhan

1. Firebase + Vercel + Mailjet + API key AI gratis → [`docs/PANDUAN_SETUP.md`](docs/PANDUAN_SETUP.md) (variabel lingkungan di `.env.example`)
2. Robot UiPath → [`uipath/README.md`](uipath/README.md), [`uipath/orchestrator-setup.md`](uipath/orchestrator-setup.md)
3. Opsional: n8n sebagai otak agen → [`n8n/README.md`](n8n/README.md)
4. Sebelum submit: `npm run check:submit` lalu ikuti [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md)

## Pengujian

```bash
npm test               # tes otomatis tanpa jaringan, termasuk tests/world-reward.test.js (28 tes poin dunia)
npm run check:submit   # pemeriksa kebocoran kunci/sandi/PII, harus 0 temuan HIGH
```

Rincian: [`docs/UJI_COBA.md`](docs/UJI_COBA.md)

## Keamanan & Privasi (ringkas)

- Kunci AI hanya ada di server (Vercel).
- LLM tidak pernah melihat email/HP pelanggan; semua nominal dan penerima berasal dari database, bukan dari AI.
- Robot tidak menyusun isi email dan tidak memilih penerima; rencana bertanda tangan HMAC dengan `DRAFT_SIGNING_SECRET`.
- Log memakai ID ter-hash dan email disamarkan.
- Detail: [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md#keamanan-berlapis)

## Dokumen

[`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md) • [`docs/PANDUAN_SETUP.md`](docs/PANDUAN_SETUP.md) • [`docs/UJI_COBA.md`](docs/UJI_COBA.md) • [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md) • [`uipath/README.md`](uipath/README.md) • [`n8n/README.md`](n8n/README.md)

---

Dibuat untuk IDCamp Developer Challenge 2026, lalu dikembangkan untuk Automation Hackathon 2026.
