# Sekretaris UMKM Indonesia

> **Asisten AI untuk pelaku usaha budaya dan UMKM Nusantara**: catat uang dengan suara, jualan lewat live commerce, belanja di Pasar Dunia, saling kongsi stok antar-UMKM, dan jelajahi pasar budaya Bali di Dunia 3D.

Produk ini didaftarkan ke **BUDAYA GO! 2026** (Kementerian Kebudayaan RI)
· Kategori **Inovasi Digital** · Subtema **Digital Commerce dan Ekonomi Budaya**.

| | |
|---|---|
| **Versi** | 2.1 (menambah Pasar Dunia dan menu bawah untuk HP) |
| **Bentuk** | Aplikasi web satu berkas (`index.html`), responsif untuk HP dan laptop |
| **Bahasa antarmuka** | Indonesia (dengan terjemahan otomatis ID ↔ EN) |
| **Tim** | Nelson Ferdinand Wangsaputra (ketua), Mario Cahyana, Reynard Adrian Tjakrasendjaja |

---

## Daftar Isi

1. [Masalah yang dijawab](#masalah-yang-dijawab)
2. [Akar budaya](#akar-budaya)
3. [Fitur](#fitur)
4. [Pasar Dunia](#pasar-dunia-social-commerce)
5. [Teknologi](#teknologi)
6. [Arsitektur singkat](#arsitektur-singkat)
7. [Cara menjalankan](#cara-menjalankan)
8. [Konfigurasi](#konfigurasi)
9. [Alur penggunaan](#alur-penggunaan)
10. [Status dan batasan](#status-dan-batasan)
11. [Keamanan dan privasi](#keamanan-dan-privasi)
12. [Roadmap](#roadmap)
13. [Tim dan kontak](#tim-dan-kontak)

---

## Masalah yang dijawab

Pelaku usaha budaya, seperti perajin kain endek, pemahat kayu, pembuat kuliner khas, dan pedagang pasar seni, umumnya bekerja tanpa pencatatan keuangan yang rapi, kesulitan menjangkau pasar di luar sekitar tokonya, dan berjalan sendiri-sendiri saat membeli bahan baku atau mengirim barang. Tiga hambatan itu membuat produk budaya yang bagus sulit tumbuh menjadi usaha yang berkelanjutan.

Sekretaris UMKM menjawabnya dengan satu aplikasi:

1. **Administrasi tanpa ribet.** Pemilik usaha cukup bicara atau mengetik, AI mencatat transaksi, tagihan, dan stok.
2. **Akses pasar.** Konten produk dibuat dengan bantuan AI, ditampilkan di galeri publik dan Pasar Dunia, dan dijual lewat siaran langsung dengan pesanan yang dicatat otomatis.
3. **Gotong royong ekonomi.** Pasar Kongsi mempertemukan UMKM untuk menukar stok berlebih, patungan belanja bahan baku, dan berbagi rute kurir.

## Akar budaya

Unsur budaya dalam produk ini bukan hiasan. Ia menentukan cara kerja fitur dan jenis pengguna yang dilayani.

- **Gotong royong sebagai logika produk.** Pasar Kongsi dirancang dengan prinsip "bukan saingi UMKM lain, tetapi gotong royong". Tiga mekanisme intinya (tukar stok lebih, kongsi belanja, bagi rute kurir) adalah bentuk digital dari praktik patungan dan saling bantu yang hidup di komunitas pedagang Indonesia.
- **UMKM budaya sebagai pengguna utama.** Data tempat di Dunia 3D memetakan pelaku usaha budaya Bali berdasarkan lokasinya, misalnya kain endek dan patung kayu di Pasar Seni Sukawati, lukisan dan anyaman di Pasar Seni Ubud, kopi dan kerajinan rotan di kawasan sawah Tegalalang, serta sesajen dan kerajinan bambu di sekitar Pura Besakih.
- **Peta Nusantara.** Jelajah 14 kota dengan komoditas khas tiap daerah (kopi Kintamani, songket Palembang, batik tulis Yogyakarta, tenun ikat Flores, noken Papua, dan seterusnya) yang dapat dikirim sebagai "paket UMKM" antar-kota. Di tiap kota tujuan, pemain disambut cutscene tari dan musik khas daerah (misalnya Pendet di Bali, Tor-Tor di Medan).
- **Dunia 3D Bali.** Latar aplikasi dan dunia jelajah menampilkan pura, sawah terasering, pantai, dan lapak UMKM, lengkap dengan elemen seperti penjor dan canang, serta sapaan *Om Swastiastu*.

> Catatan jujur: unsur Bali saat ini kuat di sisi data tempat, visual, dan konteks pengguna. Pendalaman nilai (misalnya konsultasi formal dengan pemangku adat dan komunitas perajin) ada di [Roadmap](#roadmap).

## Fitur

**Navigasi.** Di HP (layar sampai 700 px) menu ada di bilah bawah: *Catat*, *Dashboard*, *Asisten AI* (tombol tengah), *Pasar*, dan *Lainnya*. Tombol *Lainnya* membuka panel "Semua Menu" yang dikelompokkan (Keuangan, Jualan & Konten, Komunitas & Dunia, AI & Akun). Mengetuk menu yang sedang aktif menyembunyikan panel agar latar 3D dan nama kiosnya terlihat penuh; ketuk lagi untuk kembali. Di laptop dan tablet menu berupa rel ikon di sisi kiri. Pilihan tampilan HP dapat diubah di **Pengaturan → Menu samping**.

| Modul | Fungsi |
|---|---|
| 💰 **Catat Uang** | Ceritakan transaksi lewat suara atau teks, AI mengubahnya menjadi catatan pemasukan/pengeluaran terstruktur. Ada pemindaian struk dengan OCR dan ekspor ke Excel. |
| 🧾 **Tagihan** | Pencatatan piutang dan utang beserta pengingat. |
| 📊 **Dashboard** | Grafik pemasukan vs pengeluaran per kategori dan tren transaksi. |
| 📸 **Bikin Konten** | Unggah foto produk, AI membuat *caption* siap posting. Tersedia tampilan *exploded view* 3D. |
| 🌍 **Galeri** | Etalase publik karya UMKM se-Indonesia, dengan fitur *boost* agar produk tampil di posisi atas. |
| 🛍️ **Pasar Dunia** | Toko online sosial: feed produk, beli dengan koin game, kurir kota, paspor belanja, afiliasi, dan ulasan. Lihat [bagian khusus](#pasar-dunia-social-commerce). |
| 📺 **LIVE** | Siaran langsung (WebRTC lewat LiveKit) dengan **AI Order Taker** yang mencatat pesanan dari komentar penonton. Ekspor pesanan masuk. |
| 🎥 **Video** | Galeri rekaman sesi live. |
| 👥 **Komunitas** | Profil pengguna, status online, peta lokasi UMKM, dan peta jelajah Dunia 3D. |
| 🤝 **Pasar Kongsi** | Pasar antar-UMKM: *Stok Lebih*, *Kongsi Belanja* (patungan beli bahan), dan *Rute Kurir*. Berbeda dari Pasar Dunia, yang melayani pembeli akhir. |
| 🧠 **Otak AI** | Jaringan saraf mini yang dilatih **di browser pengguna** dari riwayat transaksinya, untuk memprediksi laba harian, mengenali hari terkuat, dan mendeteksi anomali. Minimal 5 hari berbeda dengan transaksi. |
| 🚚 **Agen Rantai Pasok** | Agen AI berbasis *tool-calling* yang membaca stok dan pemasok, mencari kecocokan di Pasar Kongsi, lalu menyiapkan **draf tindakan**. Pemilik usaha yang memutuskan (*human-in-the-loop*). Dapat mengirim rekomendasi pembelian ke SAP (mode simulasi tersedia). |
| 🤖 **Nego Harga AI** | Penjual mengaktifkan asisten AI untuk menawar dengan pembeli; pembayaran lewat Midtrans milik penjual sendiri. |
| 🪙 **Dompet Poin** | Misi harian (misalnya mencatat transaksi) yang memberi poin, plus Dunia 3D dan mini-game opsional. |
| 🗺️ **Peta RI / Dunia 3D** | Jelajah dunia 3D, naik pesawat atau kapal antar-14 kota, pilih kursi dan ngobrol dengan teman sebelah, mode pilot/nahkoda, cutscene disambut tari dan musik daerah, Papan Kerja (antar paket UMKM antar-kota), dan Paspor Nusantara. Masuk ke Ruang Usaha mitra untuk melihat ringkasan kinerja (bila pemilik mengizinkan) dan rak produk Pasar Dunia mereka. |
| ⚙️ **Pengaturan** | Mode tampilan Bali (Otomatis/Hemat/Penuh), menu samping, terjemahan ID ↔ EN, notifikasi, kunci API AI, integrasi SAP, dan ringkasan harian lewat WhatsApp. |

## Pasar Dunia (social commerce)

Pasar Dunia mempertemukan UMKM dengan pembeli akhir di dalam dunia bersama, bukan sekadar katalog. Pasar Kongsi melayani sesama UMKM; Pasar Dunia melayani pembeli.

| Fitur | Cara kerja |
|---|---|
| **Feed dan posting** | Penjual memposting foto produk (nama, harga, stok, kategori: Produk, Oleh-oleh, Paket wisata). Pembeli mencari berdasarkan kata kunci atau kategori, dan membuka profil toko dengan mengetuk nama toko. |
| **Toko 3D** | Di Ruang Usaha 3D, rak dinding menampilkan hingga 6 produk dari postingan penjual yang sama, dan tombol "Belanja di Toko Ini" membuka tokonya. |
| **Live shopping** | Saat menonton siaran, tombol "Beli dari live" membuka toko penyiar. |
| **Beli dan escrow koin** | Koin pembeli ditahan saat memesan dan baru dicairkan ke penjual setelah pembeli menekan "Terima". |
| **Kurir kota** | Pesanan yang sudah dibayar menjadi antaran. Pemain lain mengambil antaran, menyerahkannya, dan mendapat upah koin. |
| **Paspor belanja** | Tiap pembelian memberi stempel kota (oleh-oleh memberi stempel ganda). |
| **Afiliasi** | Tombol Bagikan membuat tautan `?pasar=…&ref=…`; pembeli yang datang lewat tautan itu memberi komisi 5% kepada pembagi. |
| **Ulasan** | Setelah pesanan selesai, pembeli memberi bintang 1–5 dan ulasan singkat; rata-rata tampil di kartu produk. |
| **Tiket dan oleh-oleh** | Kategori Oleh-oleh dan Paket wisata, dengan tautan ke Peta RI untuk memesan tiket di game. |

> **Penting:** semua transaksi Pasar Dunia memakai **koin game**, bukan uang nyata. Escrow, pencairan, dan komisi saat ini berjalan di sisi klien (lihat [Status dan batasan](#status-dan-batasan)). Pembayaran uang nyata lewat payment gateway belum terhubung ke Pasar Dunia.

## Teknologi

| Lapisan | Yang dipakai |
|---|---|
| Antarmuka | HTML, CSS, JavaScript murni (tanpa *framework*) dalam satu berkas |
| Grafik dan ekspor | Chart.js 4.4, SheetJS (Excel) |
| 3D | Three.js r128 (Dunia 3D dan latar Bali, dengan mode hemat untuk HP) |
| Peta dan rute | Leaflet, Leaflet Routing Machine, OpenStreetMap, OSRM |
| AI bahasa | Groq (Llama 3.3 70B, Llama 4 Scout) sebagai utama, Gemini dan OpenRouter sebagai cadangan otomatis |
| OCR | Tesseract (di browser) |
| Akun dan data | Firebase Authentication dan Realtime Database |
| Live streaming | LiveKit (token lewat Cloudflare Worker) |
| Media | Cloudinary (unggah video) |
| Pembayaran | Midtrans (kunci milik masing-masing penjual, dipakai pada Nego Harga AI) |
| Integrasi bisnis | SAP Purchase Requisition (mode simulasi tersedia) |
| Notifikasi | Firebase Cloud Messaging, EmailJS |

Font: Plus Jakarta Sans, Inter, JetBrains Mono, Cinzel.

## Arsitektur singkat

```
 Browser (index.html)
   │
   ├── Firebase Auth / Realtime DB ── akun, profil, komunitas, Pasar Kongsi, poin,
   │                                   Pasar Dunia (shopPosts, shopOrders, shopReviews)
   ├── Groq → Gemini → OpenRouter ──── AI (kunci pengguna, atau lewat /api/ai-proxy)
   ├── LiveKit (+ Cloudflare Worker) ─ siaran langsung
   ├── Cloudinary ──────────────────── rekaman video
   ├── OSM / OSRM ──────────────────── peta dan rute
   └── Backend serverless (terpisah) ─ /api/ai-proxy, /api/create-transaction,
                                       /api/send-otp, /api/delete-video, /api/world-reward
```

Pelatihan model **Otak AI** berjalan lokal di browser, sehingga riwayat transaksi tidak dikirim ke layanan AI luar untuk pelatihan.

## Cara menjalankan

### Cara cepat (coba lokal)

1. Salin `index.html` ke satu folder.
2. Jalankan server statis, misalnya:
   ```bash
   python3 -m http.server 8080
   ```
3. Buka `http://localhost:8080` di browser (disarankan Chrome atau Edge terbaru).
4. Perlu internet, karena pustaka, peta, Firebase, dan AI dimuat dari jaringan.
5. Daftar akun dengan email, lalu isi kunci API AI di **Pengaturan → API Key AI** (lihat di bawah).

> Membuka berkas dengan klik ganda (`file://`) bisa membuat login, notifikasi, dan sebagian fitur gagal. Gunakan server lokal atau hosting.

### Hosting

Aplikasi dirancang untuk hosting statis (misalnya GitHub Pages atau Vercel). Setelah mengganti `index.html`, muat ulang paksa atau hapus cache di perangkat agar versi lama tidak terpakai. Untuk memakai kunci AI bawaan, pembayaran, OTP, dan hadiah Dunia 3D, endpoint `/api/*` harus tersedia di domain yang sama (lihat [Konfigurasi](#konfigurasi)).

## Konfigurasi

### 1. Firebase

Di awal `index.html` terdapat objek `firebaseConfig`. Ganti dengan proyek Firebase milik Anda sendiri bila memasang ulang.

1. Buat proyek di [console.firebase.google.com](https://console.firebase.google.com).
2. Aktifkan **Authentication** (email/password), **Realtime Database**, dan **Storage**.
3. Salin konfigurasi web ke `firebaseConfig`, pastikan `databaseURL` terisi.
4. **Pasang Rules database** (jangan tinggalkan *test mode*): buka Realtime Database → tab **Rules**, tempel isi `firebase-rules-LENGKAP.json`, uji di **Rules Playground**, lalu **Publish**. Tanpa blok `shopPosts`, `shopOrders`, dan `shopReviews`, Pasar Dunia tidak dapat menyimpan data.

### 2. Kunci AI

Buka **Pengaturan → 🔑 API Key AI**, isi salah satu atau semuanya. Kunci tersimpan di browser pengguna.

| Urutan | Penyedia | Sumber kunci |
|---|---|---|
| 1 (utama) | Groq | console.groq.com/keys |
| 2 (cadangan) | Gemini | aistudio.google.com/apikey |
| 3 (cadangan akhir) | OpenRouter | openrouter.ai/keys |

Bila dikosongkan, aplikasi memakai `/api/ai-proxy` (kunci milik pengelola di sisi server). Kuota dapat habis pada jam sibuk.

### 3. Endpoint backend

Berkas `index.html` memanggil lima endpoint serverless yang **tidak ada di dalam berkas ini**:

| Endpoint | Untuk |
|---|---|
| `/api/ai-proxy` | AI dengan kunci pengelola |
| `/api/create-transaction` | Membuat transaksi Midtrans |
| `/api/send-otp` | Verifikasi nomor telepon |
| `/api/delete-video` | Menghapus rekaman |
| `/api/world-reward` | Mengkredit poin Dunia 3D dengan verifikasi server |

Tanpa endpoint ini, fitur terkait tidak berjalan, tetapi fitur lain tetap bisa dipakai bila pengguna mengisi kunci AI sendiri.

### 4. Opsional

- **Midtrans:** isi Server Key dan Client Key milik penjual di Profil agar tombol "Bayar Sekarang" pada Nego AI masuk ke akun penjual. Sandbox cukup untuk uji coba.
- **SAP:** kosongkan semua kolom untuk mode simulasi.
- **Ringkasan harian:** isi nomor WhatsApp di Profil.

## Alur penggunaan

1. **Daftar/masuk** dan pilih negara/bahasa.
2. **Isi nama dan nama toko** di Profil agar tampil di galeri dan komunitas.
3. **Catat uang** setiap hari lewat suara atau teks.
4. **Bikin konten** dari foto produk, lalu tampilkan di **Galeri**.
5. **Jual di Pasar Dunia:** buka *Pasar → ➕ Jual*, isi nama, harga, stok, kategori, dan foto. Produk muncul di feed dan di rak Ruang Usaha 3D-mu.
6. **Jualan live**, pesanan masuk tercatat otomatis.
7. **Belanja dan antar:** pembeli memesan dengan koin; pemain lain bisa mengambil antaran sebagai kurir; pembeli menekan "Terima" lalu memberi ulasan.
8. **Kongsi**: tawarkan stok lebih atau ikut patungan belanja di Pasar Kongsi.
9. Setelah data cukup, **latih Otak AI** untuk prediksi dan deteksi anomali.
10. Jelajahi **Dunia 3D** untuk mengumpulkan poin, mengunjungi Ruang Usaha mitra, dan bepergian antar-kota.

## Status dan batasan

Bagian ini sengaja ditulis apa adanya.

- Setiap fitur perlu **diuji langsung** dan diberi tangkapan layar sebelum diklaim "berfungsi" di proposal.
- Backend `/api/*` berada di luar berkas dan harus aktif untuk fitur kunci bawaan, pembayaran, OTP, dan poin Dunia 3D.
- Integrasi SAP berjalan dalam **mode simulasi** kecuali kredensial SAP diisi.
- Pembayaran Midtrans memakai kunci milik penjual; pengujian sandbox tidak sama dengan transaksi riil.
- **Pasar Dunia memakai koin game, bukan uang nyata.** Saldo koin tersimpan di perangkat pemain, dan escrow, pencairan, serta komisi dijalankan di sisi klien, sehingga dapat dimanipulasi. Jangan dipakai untuk uang nyata sebelum dipindah ke server dan payment gateway.
- Kurir kota di Pasar Dunia masih **simulasi** (waktu tunggu tetap 45 detik, tanpa lokasi nyata). Upah kurir dicetak sistem, bukan diambil dari pembeli.
- Live shopping baru berupa tombol menuju toko penyiar; belum ada beli satu ketuk di dalam video. Posting produk baru berupa foto; video belum didukung.
- Paket wisata dan oleh-oleh belum terhubung dengan mitra atau UMKM nyata.
- Sudah diuji di Chromium tanpa tampilan (headless) dengan Firebase tiruan: alur beli, antar, terima, pencairan koin, pencarian, dan ulasan. **Belum diuji:** dua pemain nyata dalam satu alur, rak produk 3D di WebGL, tampilan di HP sungguhan, suara cutscene di HP, dan aturan Firebase di simulator.
- Cakupan budaya saat ini berpusat pada Bali dan komoditas 14 kota; belum ada modul bahasa daerah atau arsip pengetahuan budaya.
- Belum ada data pengguna aktif atau omzet yang terdokumentasi; angka semacam itu tidak boleh dicantumkan sebelum bisa diverifikasi.
- Latar 3D berat di HP lama; gunakan **Mode hemat** di Pengaturan. Pada mode hemat atau tanpa 3D, fitur "ketuk menu aktif untuk melihat latar" tidak berfungsi.

## Keamanan dan privasi

- Konfigurasi web Firebase memang tampil di sisi klien, tetapi keamanannya bergantung pada **Firebase Security Rules**. Pastikan aturan membatasi data pribadi (profil, transaksi, chat, tagihan) hanya untuk pemiliknya.
- Rules Pasar Dunia membatasi: postingan hanya dapat dibuat atas uid pemiliknya (harga minimal Rp1.000, stok 0–999, ukuran foto dibatasi); pesanan hanya dapat berpindah status berurutan (dibayar → diambil kurir → diantar → selesai) dan harganya tidak dapat diubah; ulasan hanya oleh pembeli pesanan yang sudah selesai, satu kali per pesanan.
- **Risiko yang diketahui pada Rules saat ini:** `gameData/$uid/poin`, `rewards`, `redemptions`, `topupRequests`, `pointTransfers`, `gallery`, `liveSessions`, dan `pasarKongsi` dapat ditulis oleh pengguna login mana pun, dan `users` (termasuk email) dapat dibaca semua pengguna login. Perketat sebelum poin atau koin bernilai nyata.
- Kunci AI yang diisi pengguna tersimpan di `localStorage` browser masing-masing. Jangan memakai kunci berbayar di perangkat bersama.
- Server Key Midtrans tidak boleh berada di kode klien; simpan di sisi server.
- Preset unggah Cloudinary yang bersifat *unsigned* sebaiknya dibatasi (jenis berkas, ukuran, folder).
- Data pribadi pengguna dikelola dengan mengacu pada **UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi**. Fitur *etalase usaha* di Dunia 3D bawaannya **mati**, dan tidak pernah membagikan nominal rupiah persis.
- Kode memakai fungsi *escape* (`escapeHtml` dan sejenisnya) pada banyak titik untuk konten buatan pengguna, tetapi `innerHTML` dipakai di banyak tempat. Audit XSS menyeluruh tetap disarankan sebelum dipakai umum. Modul Pasar Dunia menampilkan teks buatan pengguna lewat `textContent`.

## Roadmap

| Jangka | Target |
|---|---|
| **Berikutnya** | Chat pembeli–penjual dari kartu produk; notifikasi pesanan; video produk pendek; perketat Rules poin dan koin; ujicoba dua pemain nyata dan di HP sungguhan; prototipe AR "lihat produk di ruanganmu". |
| **6–12 bulan** | Payment gateway dengan escrow di server dan kurir sungguhan (misalnya lewat agregator ongkir); verifikasi penjual, moderasi konten, dan alur refund; uji lapangan dengan sejumlah UMKM budaya Bali (kain endek, ukiran, kuliner); dokumentasikan data penggunaan; pindahkan backend ke layanan terkelola; konsultasi budaya dengan komunitas perajin. |
| **1–2 tahun** | Perluas ke daerah lain dengan kurator budaya lokal; modul atribusi dan asal-usul produk budaya; kemitraan nyata untuk paket wisata dan oleh-oleh; kerja sama dengan pasar seni, koperasi, dan jasa kurir. |
| **3–5 tahun** | Jaringan Pasar Kongsi lintas provinsi; kemitraan promosi budaya ke pasar luar negeri berbasis bukti; eksplorasi VR untuk Dunia 3D. |

## Tim dan kontak

| Peran | Nama |
|---|---|
| Ketua kelompok | Nelson Ferdinand Wangsaputra |
| Anggota 1 | Mario Cahyana |
| Anggota 2 | Reynard Adrian Tjakrasendjaja |

Kontak korespondensi: `[email aktif tim]`

---

*BUDAYA GO! 2026 · Tema: Indonesia Cultural Power · Subtema: Inventing the Future from Indonesian Culture.*
