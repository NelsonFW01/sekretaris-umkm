# Sekretaris UMKM

Asisten untuk pemilik UMKM: tagihan, stok, kasir, dan "Otak AI". Dibuat untuk **IDCamp Developer Challenge 2026**, lalu dikembangkan untuk
**Automation Hackathon 2026** dengan **robot UiPath sebagai inti otomasi** dan **agen AI tool-calling gratis** sebagai otaknya —
sementara **pemilik UMKM tetap memegang keputusan** untuk kasus berisiko.

## Masalah yang diotomasi

Menagih pelanggan dan memantau stok adalah pekerjaan harian yang berulang dan alurnya jelas: cek tagihan → tentukan siapa yang perlu diingatkan →
tulis pesan yang sopan → kirim → catat → ulangi besok. Pemilik UMKM sering lupa, nadanya tidak konsisten, dan stok habis tanpa terasa.

## Apa yang dikerjakan siapa

| Pelaku | Tugas |
|---|---|
| **Robot UiPath** (inti) | berjalan terjadwal di Orchestrator • membaca data minimal • menerapkan **aturan bisnis** (D-3, hari-H, telat tiap 3 hari) • memanggil agen AI • **mengirim email** yang sah • menaruh draf • mengeksekusi draf yang sudah disetujui • log & laporan |
| **Agen AI** (gratis) | menyusun kalimat pengingat, memilih nada, menandai kejanggalan, menyusun draf pesanan stok & ringkasan harian. Tool-calling (Groq / Gemini / OpenRouter), dapat diganti n8n. **Tidak pernah mengirim apa pun** |
| **Server** | memvalidasi usulan AI (nominal, tautan, ancaman, teks injeksi), menempelkan angka & penerima dari database, menandatangani rencana |
| **Pemilik UMKM** | menyetujui/menolak kasus berisiko di tab **Agen Rantai Pasok**: nilai ≥ Rp 5 juta, telat ≥ 14 hari, nada tegas, ada bendera keamanan, semua draf stok/WA |

```
Orchestrator (jadwal) ─► ROBOT UiPath ──ping/snapshot──► /api/robot ─► Firebase RTDB
                            │  aturan bisnis (robot)
                            ├──────────► AGEN AI (/api/agent atau webhook n8n): usulan ─► validasi + tanda tangan server
                            ├─ rute "auto"     ─► robot mengirim email (Mailjet via server)
                            └─ rute "approval" ─► draf ─► PEMILIK menyetujui di aplikasi ─► putaran berikutnya robot mengirim
```

## Coba dalam 1 menit (tanpa akun, tanpa API key, data fiktif)

Butuh Node 22; tidak perlu `npm install` (nol dependensi).

```bash
node tools/local-demo.mjs        # server demo + database, email, dan LLM TIRUAN di memori
node tools/robot-reference.mjs --base-url http://127.0.0.1:8787 --key demo-robot-key-lokal-1234567890
# lalu buka http://127.0.0.1:8787/demo  →  "Konsol Pemilik": setujui/tolak draf, lihat Kotak Keluar email simulasi
```

Hasil: 5 email simulasi, 9 draf (7 tagihan + 2 stok), 0 galat; dijalankan lagi → 0 (tidak ada pengiriman ganda).
Robot UiPath yang sebenarnya ada di [`uipath/`](uipath/README.md); skrip di atas hanya robot referensi dengan alur identik.

## Pasang sungguhan

1. **Firebase + Vercel + Mailjet + API key AI gratis** → [`docs/PANDUAN_SETUP.md`](docs/PANDUAN_SETUP.md) (lengkap dengan variabel lingkungan di `.env.example`).
2. **Robot UiPath** (rakit di Studio, aset & Time Trigger di Orchestrator) → [`uipath/README.md`](uipath/README.md), [`uipath/orchestrator-setup.md`](uipath/orchestrator-setup.md).
3. **Opsional: n8n sebagai otak agen** → [`n8n/README.md`](n8n/README.md).
4. **Sebelum mengirim ke lomba:** `npm run check:submit` lalu ikuti [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md).

## Peta folder

| Folder / berkas | Isi |
|---|---|
| `index.html`, `firebase-messaging-sw.js` | aplikasi web (PWA) — tab **Agen Rantai Pasok**: Agen Otomatis Harian, Draf Tindakan Agen, Riwayat Agen |
| `api/robot.js` | API untuk robot: `ping`, `snapshot`, `drafts`, `send`, `report` (kunci robot) |
| `api/agent.js` | otak agen: `invoice_followup`, `invoice_context`, `stock_reorder`, `daily_brief` |
| `api/cron-*.js`, `api/ai-proxy.js`, `api/notify.js`, `api/send-otp.js`, `api/create-transaction.js` | fitur lama (cron kini jalur cadangan; diam bila `ROBOT_MODE=1`) |
| `lib/` | inti tanpa dependensi: aturan (`policy`), agen tool-calling (`agent-core`, `tasks`, `prompts`), guardrail (`validate`), tanda tangan (`sign`), Firebase REST (`rtdb`), email (`mail`) |
| `uipath/` | robot UiPath (Coded Workflow C#), panduan Studio & Orchestrator, harness uji |
| `n8n/` | workflow n8n (otak alternatif) + panduan |
| `tools/` | server demo lokal, robot referensi, pengisi data demo Firebase (`seed:mock`), pembersih sisa kunci lama (`cleanup-legacy`), pemeriksa kebocoran (`check:submit`), uji mutasi (`mutation-test`) |
| `samples/` | data contoh fiktif dengan 17 kasus tepi + hasil yang diharapkan |
| `tests/` | 249 tes otomatis (node:test) |
| `docs/` | arsitektur, panduan setup, hasil uji, checklist lomba |

## Pengujian

```bash
npm test             # 249 tes (dengan alat opsional), ± 40 detik, tanpa jaringan: database, email, dan LLM adalah tiruan lokal
npm run check:submit # pemeriksa kebocoran: kunci API, sandi, PII — harus 0 temuan HIGH sebelum dikirim
npm run test:n8n     # opsional, butuh n8n terpasang: N8N_BIN=/path/ke/n8n npm run test:n8n
node tools/mutation-test.mjs   # opsional, ± 35 menit: merusak 170 titik logika keamanan, tes harus gagal pada tiap perusakan
```

Yang dibuktikan, antara lain: aturan robot = aturan server (uji diferensial & fuzz); robot C# dikompilasi dengan .NET dan hasilnya identik dengan robot Node;
LLM yang "nakal" (nominal, tanggal, atau denda karangan, tautan penyerang, ancaman, instruksi tersembunyi) ditahan dan dialihkan ke persetujuan manusia;
item yang diubah satu karakter ditolak; menjalankan dua kali tidak mengirim ganda; n8n sungguhan (2.30) menghasilkan rencana yang identik dengan agen bawaan; ke-170 perusakan kode keamanan (uji mutasi) terdeteksi tes; peninjau keamanan terpisah mencoba membobol dan temuannya ditambal.
Rincian kasus dan hasilnya: [`docs/UJI_COBA.md`](docs/UJI_COBA.md).

## Tanya-jawab singkat

**Apakah aplikasi ini memakai QRFY?** Tidak. Tidak ada integrasi QRFY di kode. Pembayaran online memakai Midtrans Snap lewat `api/create-transaction.js` (metode yang muncul mengikuti pengaturan akun Midtrans penjual, mis. QRIS/VA/e-wallet),
dan pemilik mengisi ID rekening / tautan pembayaran sendiri di profil (kolom bebas; tidak ada integrasi QRIS khusus); rincian itulah yang ditempelkan server ke email pengingat.

**Apakah syarat lomba mewajibkan AI agentic?** Yang diwajibkan: UiPath sebagai inti, robot yang benar-benar berjalan, nilai yang bisa berkembang, masalah yang berulang dan jelas alurnya;
AI/aplikasi lain boleh asalkan perannya dijelaskan, dan peran manusia untuk validasi/persetujuan dijelaskan. Lapisan agentic di sini memenuhi semuanya (tabel peran di atas).

**Perlu n8n?** Tidak. Agen AI sudah ada di server. n8n adalah pilihan bila ingin otak berupa alur visual.

**Apakah AI-nya benar-benar gratis?** Tier gratis Groq, Gemini, atau OpenRouter (isi minimal satu API key di Vercel); kuota dan model mengikuti kebijakan penyedia dan bisa berubah.
Tanpa API key, sistem tetap jalan dengan template aman (`aiGenerated:false`).

**Apa yang belum diuji?** Kompilasi di UiPath Studio asli dan menjalankan robot tak-berawak di Orchestrator tidak bisa diuji di lingkungan pengembangan ini
(kelas dasar `CodedWorkflow` hanya tiruan di harness). Panduannya mengikuti dokumentasi resmi UiPath; langkah yang perlu kamu uji ada di `uipath/README.md`.

## Keamanan & privasi (ringkas)

- Kunci AI hanya ada di server (Vercel). Versi lama menyalin kunci Groq pribadi pemilik ke Firebase — **dihapus**; `tools/cleanup-legacy.mjs` membersihkan sisanya.
- Kunci peta (GraphHopper/ORS/Mapillary) tidak lagi ditanam di `index.html` (dibaca dari `window.APP_API_KEYS`).
- LLM tidak pernah melihat email/HP pelanggan (kontak yang diketik di kolom nama/deskripsi pun dihapus sebelum masuk prompt); teks yang mencurigakan disembunyikan; semua nominal & penerima dari database, bukan dari AI.
- Robot tidak menyusun isi email dan tidak memilih penerima; rencana bertanda tangan HMAC (nominal, tenggat, dan tanggal rencana ikut terikat) dengan rahasia yang tidak dipegang robot/n8n (`DRAFT_SIGNING_SECRET`). Snapshot untuk robot tanpa data pelanggan; item `auto` hanya lewat memori robot, tidak masuk log.
- Log robot memakai ID pengguna ter-hash dan email disamarkan; CSV menetralkan sel berawalan `= + - @`.
- Endpoint & cron lama diperketat seminimal mungkin (lihat `docs/SUBMISSION_CHECKLIST.md` untuk risiko bawaan yang masih ada). Panduan lengkap: [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md#keamanan-berlapis).

## Dokumen

[`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md) • [`docs/PANDUAN_SETUP.md`](docs/PANDUAN_SETUP.md) • [`docs/UJI_COBA.md`](docs/UJI_COBA.md) • [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md) • [`uipath/README.md`](uipath/README.md) • [`n8n/README.md`](n8n/README.md)

Dibuat untuk IDCamp Developer Challenge 2026 dan Automation Hackathon 2026.
