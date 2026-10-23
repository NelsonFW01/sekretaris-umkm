// lib/http.js
//
// Helper kecil untuk endpoint server-ke-server (agen & robot).
// Endpoint ini SENGAJA tanpa header CORS: hanya robot UiPath / cron yang boleh memanggilnya,
// browser pengunjung tidak.

import { safeEqual } from './sign.js';

export function bearerToken(req) {
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : (req.headers?.['x-robot-key'] || '').toString().trim();
}

/** Cek ROBOT_API_KEY. Mengembalikan {ok:true} atau {ok:false,status,error}. */
export function robotAuth(req, env = process.env) {
  const key = env.ROBOT_API_KEY;
  if (!key || key.length < 16) {
    return { ok: false, status: 500, error: 'ROBOT_API_KEY belum diset (minimal 16 karakter) di Environment Variables.' };
  }
  const got = bearerToken(req);
  if (!got || !safeEqual(got, key)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

/** Cek CRON_SECRET (dikirim otomatis oleh Vercel Cron sebagai Authorization: Bearer ...). */
export function cronAuth(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET belum diset.' };
  const got = bearerToken(req);
  if (!got || !safeEqual(got, secret)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

/**
 * Daftar UID yang BOLEH disentuh robot/agen (env ROBOT_UID_ALLOWLIST="uid1,uid2").
 * Kosong = semua pengguna yang mengaktifkan "Agen Otomatis Harian". Berguna untuk peragaan lomba di
 * database sungguhan: robot hanya mengurus akun demo, tidak menyentuh pengguna/pelanggan lain.
 */
export function uidAllowlist(env = process.env) {
  return String(env.ROBOT_UID_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function uidAllowed(uid, env = process.env) {
  const list = uidAllowlist(env);
  return list.length === 0 || list.includes(uid);
}

export function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string' && b.trim()) {
    try { return JSON.parse(b); } catch { return {}; }
  }
  return {};
}

/** UID/ID Firebase hanya boleh huruf, angka, '_' dan '-' (cegah path traversal di URL RTDB). */
export function isSafeKey(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{3,128}$/.test(v);
}

export function reply(res, status, obj) {
  res.status(status).json(obj);
}
