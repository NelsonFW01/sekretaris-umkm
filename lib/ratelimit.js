// lib/ratelimit.js
//
// Pembatas laju sederhana di memori (per instans serverless). BUKAN pertahanan lengkap — di Vercel tiap
// instans punya memori sendiri dan bisa dingin-mulai — tetapi cukup untuk menahan penyalahgunaan ringan
// (spam OTP, menguras kuota AI) tanpa menambah layanan/dependency baru. Untuk perlindungan sungguhan
// pakai Vercel WAF / Upstash Redis rate limit.

export function createLimiter({ max, windowMs, now = () => Date.now(), maxKeys = 5000 }) {
  const hits = new Map(); // key → [timestamp, ...]
  return {
    /** true = boleh; false = kena batas. Setiap panggilan yang boleh dihitung. */
    allow(key) {
      const k = String(key || 'anon').slice(0, 200);
      const t = now();
      const arr = (hits.get(k) || []).filter((x) => t - x < windowMs);
      if (arr.length >= max) { hits.set(k, arr); return false; }
      arr.push(t);
      hits.set(k, arr);
      if (hits.size > maxKeys) { // buang kunci tertua supaya memori tidak membengkak
        for (const [kk, v] of hits) { if (!v.length || t - v[v.length - 1] >= windowMs) hits.delete(kk); if (hits.size <= maxKeys * 0.8) break; }
      }
      return true;
    },
    reset() { hits.clear(); },
  };
}

/** IP pemanggil (Vercel mengisi x-forwarded-for; entri pertama = klien). */
export function clientIp(req) {
  const xf = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers?.['x-real-ip'] || '') || 'anon';
}
