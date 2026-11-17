// lib/firebase-auth.js
//
// Verifikasi Firebase ID token (JWT RS256) di server TANPA dependency (konsisten dengan lib/rtdb.js yang
// juga tanpa firebase-admin). Mengikuti panduan resmi Firebase "Verify ID tokens using a third-party JWT
// library": cek alg=RS256, kid ada di sertifikat publik Google, tanda tangan valid, exp/iat/auth_time
// masuk akal, aud = project ID, iss = https://securetoken.google.com/<project ID>, sub (uid) tidak kosong.
//
// Dipakai oleh api/world-reward.js agar server tahu SIAPA pemanggilnya dari token yang ditandatangani
// Google — bukan dari `uid` kiriman klien (yang bisa dipalsukan).
//
// Untuk pengujian: berikan `getCerts` (mengembalikan { kid: PEM kunci publik }) sehingga tidak perlu internet.

import { createVerify } from 'node:crypto';

export const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_S = 300;

export class AuthError extends Error {
  constructor(message, code = 'auth/invalid-token') { super(message); this.name = 'AuthError'; this.code = code; }
}

function decodePart(part, what) {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); }
  catch { throw new AuthError(`Token rusak (${what}).`); }
}

export function createTokenVerifier(opts = {}) {
  const env = opts.env || process.env;
  const projectId = opts.projectId || env.FIREBASE_PROJECT_ID || 'sekretaris-umkm';
  const doFetch = opts.fetchImpl || fetch;
  const now = opts.now || (() => Date.now());
  let cache = { certs: null, exp: 0 };

  async function loadCerts(force = false) {
    if (typeof opts.getCerts === 'function') return opts.getCerts();
    if (!force && cache.certs && cache.exp > now()) return cache.certs;
    const res = await doFetch(CERT_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new AuthError('Gagal mengambil kunci publik Google.', 'auth/certs-unavailable');
    const certs = await res.json();
    const m = /max-age=(\d+)/i.exec(res.headers.get('cache-control') || '');
    cache = { certs, exp: now() + (m ? Number(m[1]) : 3600) * 1000 };
    return certs;
  }

  /** @returns {Promise<{uid:string, email:string|null, claims:object}>} atau melempar AuthError */
  async function verify(idToken) {
    if (typeof idToken !== 'string' || idToken.length < 50 || idToken.length > 4096) throw new AuthError('Token tidak ada.');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new AuthError('Format token salah.');
    const header = decodePart(parts[0], 'header');
    const payload = decodePart(parts[1], 'payload');
    if (header.alg !== 'RS256') throw new AuthError('Algoritma token tidak didukung.');
    if (!header.kid) throw new AuthError('Token tanpa kid.');

    let certs = await loadCerts(false);
    if (!certs[header.kid] && typeof opts.getCerts !== 'function') certs = await loadCerts(true); // kunci baru dirotasi
    const pem = certs[header.kid];
    if (!pem) throw new AuthError('Kunci penandatangan token tidak dikenal.');

    let okSig = false;
    try { okSig = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(pem, Buffer.from(parts[2], 'base64url')); }
    catch { okSig = false; }
    if (!okSig) throw new AuthError('Tanda tangan token tidak valid.');

    const nowS = Math.floor(now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) throw new AuthError('Token kedaluwarsa. Muat ulang halaman.', 'auth/id-token-expired');
    if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_S > nowS) throw new AuthError('Token dari masa depan.');
    if (typeof payload.auth_time === 'number' && payload.auth_time - CLOCK_SKEW_S > nowS) throw new AuthError('Token dari masa depan.');
    if (payload.aud !== projectId) throw new AuthError('Token bukan untuk project ini.');
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('Penerbit token salah.');
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new AuthError('Token tanpa uid.');

    return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : null, claims: payload };
  }

  return { verify, projectId };
}
