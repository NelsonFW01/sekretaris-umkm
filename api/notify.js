// Catatan: endpoint lama ini TIDAK memakai login (token FCM milik tiap perangkat dikirim oleh aplikasi). Karena itu
// dibatasi: asal CORS = domain aplikasi, token harus berbentuk token FCM, jumlah token & panjang teks dibatasi,
// tautan klik hanya boleh relatif / di domain aplikasi, dan nilai `data` hanya teks pendek.
// (Perbaikan sesungguhnya = wajibkan Firebase ID token dan kirim hanya ke token milik penerima.)
import { clientIp, createLimiter } from '../lib/ratelimit.js';

const limiter = createLimiter({ max: Number(process.env.NOTIFY_RATE_PER_10MIN) || 120, windowMs: 10 * 60_000 });
export const __limiter = limiter; // untuk uji
const TOKEN_RE = /^[A-Za-z0-9_:.-]{20,4096}$/;
const MAX_TOKENS = 20;

/** Tautan klik: '/' relatif (bukan '//'), atau https di domain aplikasi; selain itu '/'. */
export function safeClickUrl(u, origin = process.env.APP_ORIGIN || 'https://sekretaris-umkm.vercel.app') {
  const s = String(u || '/').trim().slice(0, 500);
  if (/^\/(?![/\\])/.test(s)) return s;
  try { const x = new URL(s); if (x.protocol === 'https:' && x.origin === new URL(origin).origin) return x.href; } catch { /* abaikan */ }
  return '/';
}
function safeData(d) {
  const out = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  for (const [k, v] of Object.entries(d).slice(0, 10)) {
    if (/^[A-Za-z0-9_]{1,40}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) out[k] = String(v).slice(0, 200);
  }
  return out;
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

  const { token, tokens, title, body, icon, tag, url, data } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title wajib diisi' });
  const targets = token ? [token] : (Array.isArray(tokens) ? tokens : []);
  if (targets.length === 0) return res.status(400).json({ error: 'Harap isi token atau tokens' });
  if (targets.length > MAX_TOKENS) return res.status(400).json({ error: `maksimal ${MAX_TOKENS} token per permintaan` });
  if (!targets.every((t) => typeof t === 'string' && TOKEN_RE.test(t))) return res.status(400).json({ error: 'token tidak valid' });
  if (!limiter.allow(clientIp(req))) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ error: 'Terlalu banyak permintaan notifikasi. Coba lagi nanti.' });
  }
  const clickUrl = safeClickUrl(url);
  const safeIcon = /^\/[A-Za-z0-9._/-]{1,100}$/.test(String(icon || '')) && !String(icon).includes('//') ? icon : '/icon-192.png';
  const safeTag = /^[A-Za-z0-9_-]{1,50}$/.test(String(tag || '')) ? tag : 'umkm';

  // Buat JWT untuk OAuth2 Google
  const getAccessToken = async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
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
    return tokenData.access_token;
  };

  let accessToken;
  try { accessToken = await getAccessToken(); } catch (e) { return res.status(500).json({ error: 'Gagal mengambil akses FCM' }); }
  if (!accessToken) return res.status(500).json({ error: 'Gagal mengambil akses FCM' });
  const projectId = serviceAccount.project_id;
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const notification = {
    title: String(title).slice(0, 100),
    body: String(body || '').slice(0, 200),
  };

  const webpushData = {
    ...safeData(data),
    tag: safeTag,
    url: clickUrl,
  };

  const sendOne = async (tok) => {
    const message = {
      message: {
        token: tok,
        notification,
        webpush: {
          notification: {
            icon: safeIcon,
            tag: safeTag,
            click_action: clickUrl,
          },
          data: webpushData,
        },
      },
    };
    try {
      const r = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      return await r.json();
    } catch (e) {
      return { error: e.message };
    }
  };

  const results = [];

  results.push(...await Promise.all(targets.map(sendOne)));

  return res.status(200).json({ ok: true, results });
}
