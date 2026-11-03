# Sekretaris UMKM

🔗 **Demo langsung:** [sekretaris-umkm-two.vercel.app](https://sekretaris-umkm-two.vercel.app/)

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
| 🔔 Fitur pendukung | Login + OTP email, push notification (FCM), Bikin Konten, Galeri, Live, Video, Komunitas, Pasar Kongsi, Game |

## 5. Status Pengembangan Proyek

**Status: ✅ Sudah pernah dikembangkan sebelumnya** (bukan dibangun baru khusus untuk kompetisi ini).

### Bagian yang sudah ada sebelumnya
Aplikasi dasar pertama kali dibuat untuk **IDCamp Developer Challenge 2026**, meliputi:
- Aplikasi web/PWA dengan Catat Uang, Tagihan, Dashboard, dan Otak AI
- Login dengan OTP email (`api/send-otp.js`) dan push notification (`api/notify.js`)
- Pembayaran online Midtrans (`api/create-transaction.js`)
- Proxy AI (`api/ai-proxy.js`) dan cron pengingat tagihan serta rantai pasok (`api/cron-*.js`)
- Fitur komunitas: Bikin Konten, Galeri, Live, Video, Komunitas, Pasar Kongsi, Game

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
npm test               # 249 tes otomatis, tanpa jaringan
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
