// api/send-otp.js
//
// Mengirim kode verifikasi (OTP) lewat Mailjet. Catatan desain aplikasi lama: kode dibuat & diperiksa
// di browser (index.html) — endpoint ini hanya "pengirim email". Karena itu endpoint tidak bisa meminta
// login, tetapi dibatasi: format email/kode divalidasi, nama di-escape (tidak bisa menyisipkan HTML),
// pembatas laju per email & per IP, dan detail galat Mailjet tidak dibocorkan ke pemanggil.
// (Perbaikan sesungguhnya = OTP dibuat & diverifikasi di server, atau pakai Firebase Auth email link.)

import { escapeHtml } from '../lib/mail.js';
import { clientIp, createLimiter } from '../lib/ratelimit.js';

const perEmail = createLimiter({ max: 3, windowMs: 10 * 60_000 });
const perIp = createLimiter({ max: 10, windowMs: 10 * 60_000 });
export const __limiters = { perEmail, perIp }; // untuk uji

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,255}\.[^\s@<>"',;]{2,}$/;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'https://sekretaris-umkm.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, otp_code } = req.body || {};
  if (!email || !otp_code) return res.status(400).json({ error: 'Missing fields' });
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Format email tidak valid' });
  if (!/^\d{6}$/.test(String(otp_code))) return res.status(400).json({ error: 'Format kode tidak valid' });

  if (!perIp.allow(clientIp(req)) || !perEmail.allow(email.toLowerCase())) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ error: 'Terlalu banyak permintaan kode. Coba lagi beberapa menit lagi.' });
  }

  const MAILJET_API_KEY    = process.env.MAILJET_API_KEY;
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    return res.status(500).json({ error: 'MAILJET_API_KEY / MAILJET_SECRET_KEY belum diset di Vercel Environment Variables' });
  }
  const credentials = Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64');
  const displayName = String(name || email).slice(0, 80);

  try {
    const mjRes = await fetch(process.env.MAILJET_API_URL || 'https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: process.env.MAIL_FROM_EMAIL || 'nagoyaflora@gmail.com', Name: 'Sekretaris UMKM' },
          To: [{ Email: email, Name: displayName }],
          Subject: 'Kode Verifikasi Sekretaris UMKM',
          HTMLPart: `<p>Halo <b>${escapeHtml(displayName)}</b>,</p>
            <p>Kode verifikasi Sekretaris UMKM kamu:</p>
            <h2 style="font-size:36px;letter-spacing:8px;color:#1B4D4A;">${String(otp_code)}</h2>
            <p>Kode berlaku 2 menit. Jangan bagikan ke siapapun.</p>
            <p>- Tim Sekretaris UMKM</p>`
        }]
      })
    });

    const data = await mjRes.json().catch(() => ({}));
    if (data.Messages && data.Messages[0] && data.Messages[0].Status === 'success') {
      return res.status(200).json({ success: true });
    }
    console.error('Mailjet error:', JSON.stringify(data).slice(0, 300));
    return res.status(502).json({ error: 'Failed to send email' });
  } catch (e) {
    console.error('Fetch error:', e);
    return res.status(502).json({ error: 'Failed to send email' });
  }
}
