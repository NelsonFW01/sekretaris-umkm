// api/create-transaction.js
//
// v2 — Uang LANGSUNG masuk ke akun Midtrans milik masing-masing PENJUAL,
// bukan ke satu akun pusat. Setiap penjual isi Server Key & Client Key
// Midtrans miliknya sendiri lewat Profil di aplikasi (disimpan di Firebase
// path privat "sellerMidtransKeys/{uid}"). Endpoint ini TIDAK menyimpan
// key siapapun secara statis, tidak punya fallback ke akun manapun — kalau
// penjual belum atur Midtrans sendiri, transaksi DITOLAK dengan pesan jelas
// (supaya duit tidak pernah diam-diam nyasar ke akun yang salah).
//
// Alur:
//   1. Client kirim { sellerUid, itemId, itemName, amount, customerName }
//   2. Server ambil { serverKey, clientKey } milik sellerUid dari Firebase,
//      lewat Firebase Admin (Service Account) — path ini TIDAK BISA dibaca
//      oleh client manapun lewat Firebase SDK biasa, cuma server ini yang
//      bisa baca (Service Account otomatis bypass Firebase Rules).
//   3. Server generate Snap Token pakai Server Key penjual tsb -> transaksi
//      tercatat di akun Midtrans penjual itu sendiri.
//   4. clientKey ikut dikirim balik ke browser (memang aman terbuka) supaya
//      client bisa load Snap.js dengan key penjual yang benar.
//
// ATURAN FIREBASE REALTIME DATABASE yang WAJIB kamu tambahkan
// (Firebase Console -> Realtime Database -> Rules) supaya Server Key tidak
// pernah bisa dibaca lewat Firebase SDK oleh siapapun (termasuk penjualnya
// sendiri setelah tersimpan -- dia cuma bisa MENULIS/menimpa, tidak MEMBACA
// balik, sama seperti kalau ganti password):
//
//   "sellerMidtransKeys": {
//     "$uid": {
//       ".read": false,
//       ".write": "auth != null && auth.uid === $uid"
//     }
//   }
//
// (Gabungkan blok ini ke dalam rules yang sudah ada, jangan timpa semuanya.)
//
// WAJIB diset di Vercel -> Project Settings -> Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT  = isi JSON service account Firebase dalam satu baris
//                               (SAMA PERSIS dengan yang dipakai api/notify.js --
//                               kalau sudah pernah diisi untuk notifikasi, tidak
//                               perlu isi ulang)
//   FIREBASE_DATABASE_URL     = https://sekretaris-umkm-default-rtdb.asia-southeast1.firebasedatabase.app
//                               (opsional, defaultnya sudah otomatis pakai project ini)
//   MIDTRANS_IS_PRODUCTION    = "true" kalau semua penjual sudah pakai akun
//                               Midtrans Production. Kosongkan/"false" untuk
//                               Sandbox (testing, tidak charge uang asli).
//                               Ini berlaku sama untuk SEMUA penjual sekaligus
//                               (bukan per-penjual) -- nyalakan pas sudah siap live.

const MAX_GROSS_AMOUNT = 50_000_000; // batas wajar, cegah salah input jadi milyaran / disalahgunakan
const DEFAULT_DB_URL = 'https://sekretaris-umkm-default-rtdb.asia-southeast1.firebasedatabase.app';

async function getFirebaseAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Gagal ambil access token Firebase: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'https://sekretaris-umkm.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT belum diset di Vercel Environment Variables' });
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid' });
  }

  const { sellerUid, itemId, itemName, amount, customerName, customerPhone } = req.body || {};

  if (!sellerUid || typeof sellerUid !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(sellerUid)) {
    return res.status(400).json({ error: 'sellerUid wajib diisi -- tidak bisa memproses pembayaran tanpa tahu penjualnya siapa.' });
  }
  const grossAmount = Math.round(Number(amount));
  if (!grossAmount || grossAmount <= 0 || !Number.isFinite(grossAmount)) {
    return res.status(400).json({ error: 'amount harus angka positif' });
  }
  if (grossAmount > MAX_GROSS_AMOUNT) {
    return res.status(400).json({
      error: `amount melebihi batas maksimum (Rp ${MAX_GROSS_AMOUNT.toLocaleString('id-ID')})`,
    });
  }
  if (!itemName || typeof itemName !== 'string') {
    return res.status(400).json({ error: 'itemName wajib diisi' });
  }

  const dbUrl = (process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL).replace(/\/$/, '');

  // Ambil Server Key & Client Key MILIK PENJUAL ini (bukan key global/pusat)
  let sellerServerKey, sellerClientKey;
  try {
    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const keyRes = await fetch(`${dbUrl}/sellerMidtransKeys/${encodeURIComponent(sellerUid)}.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const keyData = await keyRes.json().catch(() => null);
    sellerServerKey = keyData && keyData.serverKey;
    sellerClientKey = keyData && keyData.clientKey;
  } catch (e) {
    return res.status(500).json({ error: 'Gagal mengambil data Midtrans penjual: ' + e.message });
  }

  if (!sellerServerKey || !sellerClientKey) {
    return res.status(400).json({
      error: 'Penjual ini belum mengatur Midtrans miliknya sendiri di Profil. Minta penjual isi Server Key & Client Key dulu, atau lanjut lewat WhatsApp untuk sementara.',
    });
  }

  const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || '').toLowerCase() === 'true';
  const snapUrl = isProduction
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  // order_id WAJIB unik per transaksi menurut aturan Midtrans
  const safeItemId = (itemId || 'item').toString().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'item';
  const orderId = `KONGSI-${safeItemId}-${Date.now()}`;

  const body = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    item_details: [
      {
        id: safeItemId,
        price: grossAmount,
        quantity: 1,
        name: String(itemName).slice(0, 50),
      },
    ],
    customer_details: {
      first_name: (customerName || 'Pembeli').toString().slice(0, 50),
      phone: (customerPhone || '').toString().slice(0, 20),
    },
    credit_card: { secure: true },
  };

  try {
    const authHeader = 'Basic ' + Buffer.from(sellerServerKey + ':').toString('base64');
    const upstreamRes = await fetch(snapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });
    const data = await upstreamRes.json().catch(() => ({}));
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: (data.error_messages && data.error_messages.join(', ')) || 'Gagal membuat transaksi Midtrans -- cek Server Key penjual masih valid atau tidak.',
        detail: data,
      });
    }
    return res.status(200).json({
      token: data.token,
      redirect_url: data.redirect_url,
      orderId,
      clientKey: sellerClientKey, // dikirim balik supaya client bisa load Snap.js dengan key penjual yang benar
      isProduction,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
