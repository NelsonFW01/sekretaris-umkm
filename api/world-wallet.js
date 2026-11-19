// api/world-wallet.js — Koin Dunia di SERVER. POST + Authorization: Bearer <Firebase ID token>
// Body: {"op":{"type":"get"}} | {"op":{"type":"earn","kind":"coin","n":1,"ref":"c:123"}} |
//       {"op":{"type":"spend","n":90,"ref":"tk:BLI>JKT:..."}} | {"op":{"type":"refund","of":"<ref spend>","n":72}}
// Pola sama dengan api/world-reward.js (token terverifikasi, rate limit, transact atomik ke worldWallet/{uid}).
import { createRtdb } from '../lib/rtdb.js';
import { createTokenVerifier } from '../lib/firebase-auth.js';
import { clientIp, createLimiter } from '../lib/ratelimit.js';
import { todayJakarta } from '../lib/dates.js';
import { parseBody } from '../lib/http.js';
import { applyOp } from '../lib/world-wallet.js';

const SAFE_KEY = /^[A-Za-z0-9_-]{3,128}$/;

export function createHandler(deps = {}) {
  const getRtdb = deps.rtdb ? () => deps.rtdb : (() => { let r = null; return () => (r ||= createRtdb()); })();
  const verifier = deps.verifier || createTokenVerifier();
  const now = deps.now || (() => Date.now());
  const perUid = deps.perUid || createLimiter({ max: 40, windowMs: 60_000 });
  const perIp = deps.perIp || createLimiter({ max: 120, windowMs: 60_000 });

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'https://sekretaris-umkm.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin'); res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!perIp.allow(clientIp(req))) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Terlalu banyak permintaan.' }); }

    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ''));
    let uid;
    try { ({ uid } = await verifier.verify(m ? m[1].trim() : '')); }
    catch (e) { return res.status(e && e.code === 'auth/certs-unavailable' ? 503 : 401).json({ error: (e && e.message) || 'Unauthorized', code: e && e.code }); }
    if (!SAFE_KEY.test(uid)) return res.status(401).json({ error: 'uid tidak valid' });
    if (!perUid.allow(uid)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Terlalu cepat.' }); }

    const op = parseBody(req).op;
    if (!op || typeof op !== 'object' || !['get', 'earn', 'spend', 'refund'].includes(op.type)) return res.status(400).json({ error: 'op tidak valid' });
    const t = now(), day = todayJakarta(new Date(t));
    let rtdb;
    try { rtdb = getRtdb(); } catch (e) { return res.status(500).json({ error: 'Server belum dikonfigurasi (FIREBASE_SERVICE_ACCOUNT).' }); }
    try {
      let out = null;
      const tx = await rtdb.transact(`worldWallet/${uid}`, (cur) => { out = applyOp(cur, op, { day, now: t }); return out.next; });
      const status = out.ok ? 200 : (out.error === 'Koin tidak cukup.' ? 402 : 400);
      return res.status(status).json({ ok: out.ok, error: out.error, w: out.w, earnedToday: out.earnedToday, left: out.left, granted: out.granted, spent: out.spent, refunded: out.refunded, dup: !!out.dup, committed: tx.committed });
    } catch (e) { console.error('[world-wallet]', e && e.message); return res.status(502).json({ error: 'Gagal memproses koin. Coba lagi nanti.' }); }
  };
}
export default createHandler();
