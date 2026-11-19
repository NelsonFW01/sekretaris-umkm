# Paket Koin Dunia (server)

Salin ke root repo (struktur folder sama):

| Berkas | Letak | Fungsi |
|---|---|---|
| `api/world-wallet.js` | `api/` | Endpoint Vercel: verifikasi token Firebase, batas permintaan, tulis atomik ke `worldWallet/{uid}` |
| `lib/world-wallet.js` | `lib/` | Aturan saldo murni (tanpa impor): saldo awal 150, batas 400 koin/hari, beli, refund, anti-ganda |
| `tests/world-wallet.test.js` | `tests/` | Tes otomatis (`npm test`) |

Tidak ada env baru (memakai `FIREBASE_SERVICE_ACCOUNT`, `APP_ORIGIN`). Total fungsi Vercel jadi 10 dari batas 12 (Hobby).

## Aturan Firebase (gabungkan, jangan timpa)
```json
"worldWallet": { "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": false } }
```

## Contoh panggilan
`POST /api/world-wallet` dengan `Authorization: Bearer <ID token>` dan body:
`{"op":{"type":"get"}}` · `{"op":{"type":"earn","kind":"coin","n":1,"ref":"c:123"}}` ·
`{"op":{"type":"spend","n":90,"ref":"tk:BLI>JKT:1"}}` · `{"op":{"type":"refund","of":"tk:BLI>JKT:1","n":72}}`

Catatan jujur: `earn` dilaporkan klien (checkpoint/koin tidak bisa diverifikasi server), jadi dibatasi per jenis dan 400/hari.
Saldo, beli, dan refund sepenuhnya diputuskan server. Klien `index.html` belum disambungkan ke endpoint ini.
