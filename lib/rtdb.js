// lib/rtdb.js
//
// Klien Firebase Realtime Database lewat REST + service account — TANPA dependency
// (konsisten dengan api/notify.js dan api/cron-invoice-reminder.js yang juga tanpa
// firebase-admin, sehingga project ini tetap jalan di Vercel tanpa `npm install` paket berat).
//
// Untuk pengujian: set FIREBASE_DATABASE_URL ke server tiruan dan FIREBASE_AUTH_MODE=none.

import { createSign } from 'node:crypto';

export const DEFAULT_DB_URL = 'https://sekretaris-umkm-default-rtdb.asia-southeast1.firebasedatabase.app';

export function parseServiceAccount(raw) {
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum diset.');
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { /* mungkin base64 */ }
  try { return JSON.parse(Buffer.from(String(raw), 'base64').toString('utf-8')); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT bukan JSON/base64 yang valid.'); }
}

export function createRtdb(opts = {}) {
  const env = opts.env || process.env;
  const dbUrl = String(opts.dbUrl || env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL).replace(/\/$/, '');
  const authMode = opts.authMode || env.FIREBASE_AUTH_MODE || 'service-account';
  const doFetch = opts.fetchImpl || fetch;
  let cache = null;

  async function accessToken() {
    if (authMode === 'none') return null;
    if (cache && cache.exp - 60_000 > Date.now()) return cache.token;

    const sa = parseServiceAccount(opts.serviceAccount || env.FIREBASE_SERVICE_ACCOUNT || env.FIREBASE_SERVICE_ACCOUNT_B64);
    const now = Math.floor(Date.now() / 1000);
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(signingInput).sign(sa.private_key, 'base64url');

    const res = await doFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${signature}`,
    });
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) throw new Error('Gagal ambil access token Firebase: ' + JSON.stringify(data).slice(0, 200));
    cache = { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return cache.token;
  }

  async function call(method, path, body) {
    const token = await accessToken();
    const clean = String(path).replace(/^\/+|\/+$/g, '');
    const res = await doFetch(`${dbUrl}/${clean}.json`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`RTDB ${method} /${clean} → HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  return {
    dbUrl,
    get: (p) => call('GET', p),
    set: (p, v) => call('PUT', p, v),
    update: (p, v) => call('PATCH', p, v),
    push: async (p, v) => (await call('POST', p, v))?.name,
    remove: (p) => call('DELETE', p),
  };
}
