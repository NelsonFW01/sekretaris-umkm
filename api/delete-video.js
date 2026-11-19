// api/delete-video.js  (Vercel Serverless Function)
//
// Menghapus FILE video live di Cloudinary. Ini harus di server karena butuh API Secret
// (jangan pernah menaruh secret di index.html).
//
// Isi Environment Variables di Vercel (Project → Settings → Environment Variables):
//   CLOUDINARY_API_KEY      = (dari Cloudinary Dashboard → Settings → API Keys)
//   CLOUDINARY_API_SECRET   = (dari tempat yang sama)
// Opsional (sudah ada nilai bawaan dari proyekmu):
//   CLOUDINARY_CLOUD_NAME   = ddqjgwpgl
//   FIREBASE_API_KEY        = apiKey web Firebase
//   ADMIN_EMAIL             = nagoyaflora@gmail.com
//
// Keamanan: pemanggil harus login Firebase (ID token diverifikasi), hanya boleh menghapus
// file di folder "liveVideos" miliknya sendiri; admin boleh menghapus milik siapa pun.

const crypto = require('crypto');

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'ddqjgwpgl';
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const FB_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAGVWXc3W6gkAc4mSxAFqoVI1gcqCNom_g';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nagoyaflora@gmail.com').toLowerCase();

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ error: 'CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET belum diisi di Vercel' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return res.status(401).json({ error: 'Belum login' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const publicId = String((body && body.publicId) || '');

    // Hanya karakter aman, dan harus berada di folder liveVideos
    if (!/^[A-Za-z0-9_\-\/]{3,200}$/.test(publicId) || publicId.split('/').indexOf('liveVideos') === -1) {
      return res.status(400).json({ error: 'publicId tidak valid' });
    }

    // 1) Verifikasi ID token Firebase
    const lk = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FB_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!lk.ok) return res.status(401).json({ error: 'Token tidak valid' });
    const user = ((await lk.json()).users || [])[0];
    if (!user) return res.status(401).json({ error: 'Pengguna tidak ditemukan' });
    const uid = user.localId;
    const isAdmin = String(user.email || '').toLowerCase() === ADMIN_EMAIL;

    // 2) Kepemilikan: nama file dibuat "<uid>_<waktu>" oleh aplikasi
    const fileName = publicId.split('/').pop();
    if (!isAdmin && fileName.indexOf(uid + '_') !== 0) {
      return res.status(403).json({ error: 'Bukan video milikmu' });
    }

    // 3) Hapus di Cloudinary (Upload API "destroy", bertanda tangan SHA-1)
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = 'invalidate=true&public_id=' + publicId + '&timestamp=' + timestamp;
    const signature = crypto.createHash('sha1').update(toSign + API_SECRET).digest('hex');
    const form = new URLSearchParams({
      public_id: publicId,
      invalidate: 'true',
      timestamp: String(timestamp),
      api_key: API_KEY,
      signature
    });
    const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/video/destroy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: (out.error && out.error.message) || 'Cloudinary menolak' });

    // result: "ok" (terhapus) atau "not found" (sudah tidak ada) — dua-duanya dianggap berhasil
    return res.status(200).json({ ok: true, result: out.result });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
};
