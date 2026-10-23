// lib/sign.js
//
// TANDA TANGAN ITEM RENCANA (HMAC-SHA256).
//
// Tujuan: robot (UiPath) hanya boleh MENGEKSEKUSI apa yang sudah divalidasi server.
// Setiap item rencana/draf membawa `sig` yang mengikat: pengguna, jenis, rute, penerima,
// subjek, isi. Kalau satu karakter berubah (mis. pengguna iseng mengedit draf lewat
// browser, atau perantara mengubah isi), tanda tangan gagal dan item ditolak.
//
// Yang ikut ditandatangani juga `amount`, `dueDate`, dan `planDate` (tanggal rencana dibuat): server memakainya saat
// eksekusi untuk menolak rencana BASI (nominal/tenggat tagihan sudah berubah, atau rencana otomatis dari hari lain).
//
// Catatan: pengguna TETAP boleh mengubah `status` draf jadi "disetujui" — itu memang
// tindakan persetujuan manusia dan tidak ikut ditandatangani.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function signingSecret(env = process.env) {
  return env.DRAFT_SIGNING_SECRET || env.ROBOT_API_KEY || '';
}

// Dikodekan sebagai larik JSON: batas antarbidang tak bisa dipindah dengan menyelipkan karakter pemisah di dalam isi bidang.
export const SIGNED_FIELDS = Object.freeze(['tipe', 'route', 'invoiceId', 'kind', 'to', 'subject', 'body', 'judul', 'pesan', 'wa', 'item', 'amount', 'dueDate', 'planDate']);

function canonical(uid, it) {
  return JSON.stringify([uid, ...SIGNED_FIELDS.map((f) => it[f])].map((v) => String(v ?? '')));
}

export function signItem(uid, item, secret = signingSecret()) {
  if (!secret) return null;
  return createHmac('sha256', secret).update(canonical(uid, item)).digest('hex').slice(0, 48);
}

export function verifyItem(uid, item, secret = signingSecret()) {
  if (!secret || !item || typeof item.sig !== 'string') return false;
  const expected = signItem(uid, item, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(item.sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Perbandingan rahasia berwaktu-konstan (hindari timing attack pada API key). */
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}
