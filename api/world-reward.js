// api/world-reward.js
//
// Poin dari Dunia 3D → Dompet Poin, DIHITUNG & DICATAT DI SERVER.
//
//   POST /api/world-reward
//   Authorization: Bearer <Firebase ID token pengguna>      (didapat klien dari auth.currentUser.getIdToken())
//   Body: { "events": [ {"type":"cp","id":"gate"}, {"type":"coins","n":40},
//                       {"type":"visit","partner":"<uid mitra>"}, {"type":"tx"} ] }
//         events boleh kosong ([]) → hanya meminta status misi hari ini.
//   200: { ok, awarded, poin, status:{...}, results:[{type,status,poin}] }
//
// Keamanan (ringkas — rinciannya di lib/world-rewards.js):
//   • Identitas dari ID token yang DITANDATANGANI Google (lib/firebase-auth.js), bukan dari uid kiriman klien.
//   • Jumlah poin ditentukan server; klien hanya melaporkan jenis kejadian.
//   • Idempoten + batas harian; klaim paralel tidak bisa menggandakan poin karena penulisan ke
//     gameData/{uid} memakai compare-and-swap (lib/rtdb.js → transact).
//   • "Catat transaksi" diverifikasi ke transaksi/{uid}; kunjungan hanya dihitung untuk mitra yang benar-benar ada.
//
// Env: FIREBASE_SERVICE_ACCOUNT (sudah ada untuk notify/robot), APP_ORIGIN, opsional FIREBASE_PROJECT_ID.

import { createRtdb } from '../lib/rtdb.js';
import { createTokenVerifier } from '../lib/firebase-auth.js';
import { clientIp, createLimiter } from '../lib/ratelimit.js';
import { todayJakarta } from '../lib/dates.js';
import { parseBody } from '../lib/http.js';
import { RULES, applyEvents, hasTxOnDay, publicStatus, readWorld, sanitizeEvents } from '../lib/world-rewards.js';

const SAFE_KEY = /^[A-Za-z0-9_-]{3,128}$/;

/** Pabrik handler supaya dependensi bisa disuntik saat uji; `handler` default dipakai Vercel. */
export function createHandler(deps = {}) {
  const getRtdb = deps.rtdb ? () => deps.rtdb : (() => { let r = null; return () => (r ||= createRtdb()); })();
  const verifier = deps.verifier || createTokenVerifier();
  const now = deps.now || (() => Date.now());
  const perUid = deps.perUid || createLimiter({ max: 20, windowMs: 60_000 });
  const perIp = deps.perIp || createLimiter({ max: 90, windowMs: 60_000 });

  async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'https://sekretaris-umkm.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!perIp.allow(clientIp(req))) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Terlalu banyak permintaan.' }); }

    // 1) siapa pemanggilnya?
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ''));
    let uid;
    try { ({ uid } = await verifier.verify(m ? m[1].trim() : '')); }
    catch (e) {
      const unavailable = e && e.code === 'auth/certs-unavailable';
      return res.status(unavailable ? 503 : 401).json({ error: e && e.message ? e.message : 'Unauthorized', code: e && e.code });
    }
    if (!SAFE_KEY.test(uid)) return res.status(401).json({ error: 'uid tidak valid' });
    if (!perUid.allow(uid)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Terlalu cepat. Coba lagi sebentar.' }); }

    // 2) validasi event
    const body = parseBody(req);
    const se = sanitizeEvents(body.events === undefined ? [] : body.events);
    if (!se.ok) return res.status(400).json({ error: se.error });
    const events = se.events;

    const t = now();
    const day = todayJakarta(new Date(t));
    let rtdb;
    try { rtdb = getRtdb(); } catch (e) { console.error('[world-reward] rtdb:', e.message); return res.status(500).json({ error: 'Server belum dikonfigurasi (FIREBASE_SERVICE_ACCOUNT).' }); }

    try {
      // 3) verifikasi yang butuh baca database — SEBELUM transaksi atomik (fn transact harus murni)
      let hasTxToday = false;
      if (events.some((e) => e.type === 'tx')) {
        const row = await rtdb.get(`transaksi/${uid}`);
        hasTxToday = !!(row && hasTxOnDay(row.data, day, t));
      }
      const partners = new Set();
      const wantPartners = [...new Set(events.filter((e) => e.type === 'visit' && SAFE_KEY.test(e.partner) && e.partner !== uid).map((e) => e.partner))].slice(0, RULES.visit.perDay + 2);
      for (const p of wantPartners) {
        const prof = await rtdb.get(`users/${p}`);
        if (prof && typeof prof === 'object') partners.add(p);
      }

      // 4) tulis atomik: poin + status misi hari ini + riwayat dalam SATU node (gameData/{uid})
      let outcome = null;
      const tx = await rtdb.transact(`gameData/${uid}`, (cur) => {
        outcome = applyEvents(cur, events, { uid, day, now: t, hasTxToday, partners });
        return outcome.next; // undefined = tidak ada yang berubah → tidak menulis
      });
      const value = tx.value; // isi terakhir node gameData/{uid} (baru kalau ditulis, lama kalau tidak ada perubahan)
      const world = outcome ? outcome.world : readWorld(value, day);
      return res.status(200).json({
        ok: true,
        awarded: outcome ? outcome.awarded : 0,
        poin: Math.max(0, Number(value && value.poin) || 0),
        status: publicStatus(world, value && value.poin),
        results: outcome ? outcome.results : [],
        lines: outcome ? outcome.lines : [],
      });
    } catch (e) {
      console.error('[world-reward] gagal:', e && e.message);
      return res.status(502).json({ error: 'Gagal memproses poin. Coba lagi nanti.' });
    }
  }
  return handler;
}

export default createHandler();
