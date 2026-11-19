// lib/world-wallet.js — aturan murni Koin Dunia (tanpa impor; mudah diuji). Saldo disimpan di worldWallet/{uid}.
export const WALLET = { start: 150, earnPerDay: 400, maxSpend: 2000, kinds: { coin: 5, cp: 15, stamp: 40, job: 120, bonus: 10 }, refsKeep: 40 };
const int = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : NaN);

export function readWallet(cur, day) {
  const o = cur && typeof cur === 'object' ? cur : {};
  return { w: Number.isFinite(o.w) ? Math.max(0, Math.floor(o.w)) : WALLET.start, day, earned: o.day === day ? Math.max(0, int(o.earned) || 0) : 0, refs: o.refs && typeof o.refs === 'object' ? { ...o.refs } : {} };
}
function pack(s, now) {
  const keys = Object.keys(s.refs).sort((a, b) => (s.refs[b].t || 0) - (s.refs[a].t || 0)).slice(0, WALLET.refsKeep), refs = {};
  keys.forEach((k) => { refs[k] = s.refs[k]; });
  return { w: s.w, day: s.day, earned: s.earned, refs, u: now };
}
/** op: {type:'get'} | {type:'earn',kind,n,ref} | {type:'spend',n,ref} | {type:'refund',of,n}. Murni: tidak menyentuh jaringan. */
export function applyOp(cur, op, { day, now }) {
  const s = readWallet(cur, day), view = (extra) => ({ ok: true, w: s.w, earnedToday: s.earned, left: Math.max(0, WALLET.earnPerDay - s.earned), ...extra });
  const fail = (error) => ({ ok: false, error, next: undefined, w: s.w, earnedToday: s.earned });
  const ref = typeof op.ref === 'string' && /^[A-Za-z0-9:_>#.-]{3,80}$/.test(op.ref) ? op.ref : null;
  if (op.type === 'get') return { ...view(), next: cur ? undefined : pack(s, now) };
  if (ref && s.refs[ref]) return { ...view({ dup: true }), next: undefined };
  if (op.type === 'earn') {
    const cap = WALLET.kinds[op.kind], n = int(op.n);
    if (!cap) return fail('Jenis koin tidak dikenal.');
    if (!(n >= 1) || n > cap) return fail('Jumlah koin tidak valid.');
    const give = Math.min(n, WALLET.earnPerDay - s.earned);
    if (give <= 0) return fail('Batas koin harian tercapai.');
    s.w += give; s.earned += give; if (ref) s.refs[ref] = { t: now, k: 'e', n: give };
    return { ...view({ granted: give }), next: pack(s, now) };
  }
  if (op.type === 'spend') {
    const n = int(op.n);
    if (!(n >= 1) || n > WALLET.maxSpend) return fail('Jumlah tidak valid.');
    if (!ref) return fail('ref wajib untuk pembelian.');
    if (s.w < n) return fail('Koin tidak cukup.');
    s.w -= n; s.refs[ref] = { t: now, k: 's', n, r: 0 };
    return { ...view({ spent: n }), next: pack(s, now) };
  }
  if (op.type === 'refund') {
    const e = s.refs[op.of], n = int(op.n);
    if (!e || e.k !== 's') return fail('Pembelian asal tidak ditemukan.');
    const room = e.n - (e.r || 0), give = Math.min(room, n);
    if (!(give >= 1)) return fail('Tidak ada yang bisa dikembalikan.');
    e.r = (e.r || 0) + give; s.w += give;
    return { ...view({ refunded: give }), next: pack(s, now) };
  }
  return fail('Operasi tidak dikenal.');
}
