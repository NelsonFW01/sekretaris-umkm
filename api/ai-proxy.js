// api/ai-proxy.js
//
// Proxy server — SATU-SATUNYA tempat API key provider (Groq/OpenRouter/Gemini) boleh berada.
// Key TIDAK PERNAH ditulis di index.html karena file itu dikirim mentah ke browser semua
// orang yang buka app-nya — begitu di-deploy, source index.html tetap bisa dibaca lewat
// "View Page Source" oleh siapa pun yang membuka linknya.
//
// index.html manggil endpoint ini (lihat callAIProxy()) kalau user belum isi API key
// pribadinya sendiri di ⚙️ Setting.
//
// WAJIB diset di Vercel → Project Settings → Environment Variables:
//   GROQ_API_KEY        = key baru dari console.groq.com/keys
//   OPENROUTER_API_KEY  = key baru dari openrouter.ai/settings/keys (opsional)
//   GEMINI_API_KEY      = key baru dari aistudio.google.com/apikey (opsional, kalau pakai provider gemini)
//
// (Key LAMA yang sempat bocor di index.html/repo/chat harus dianggap sudah bocor —
//  revoke/regenerate dulu di dashboard masing-masing provider, baru pasang yang baru di sini.
//  Key lama tetap bisa dipakai orang lain selama belum di-revoke.)

import { clientIp, createLimiter } from '../lib/ratelimit.js';

const GEMINI_MODEL = 'gemini-flash-latest'; // sinkron dengan GEMINI_MODEL di index.html
const MAX_TOKENS_CAP = 2048; // batas wajar biar satu request nakal gak menghabiskan kuota/biaya
const MAX_MESSAGES = 60;           // jumlah pesan per permintaan
const MAX_BODY_CHARS = 4_000_000;  // total teks (gambar base64 ikut dihitung) per permintaan; batas body Vercel ±4,5 MB

// Pembatas laju per IP (di memori; lihat lib/ratelimit.js untuk batasannya). AI_PROXY_RATE_PER_10MIN mengubah batas.
const limiter = createLimiter({ max: Number(process.env.AI_PROXY_RATE_PER_10MIN) || 120, windowMs: 10 * 60_000 });
export const __limiter = limiter; // untuk uji

// Hanya field yang benar-benar dipakai index.html yang diteruskan ke provider. Field lain (n, stream, user,
// logit_bias, parameter khusus provider, …) dibuang supaya pemanggil tidak bisa menyetel model/biaya sembarangan.
const OPENAI_FIELDS = ['model', 'messages', 'tools', 'tool_choice', 'temperature', 'top_p', 'max_tokens', 'response_format', 'stop'];
const GEMINI_FIELDS = ['contents', 'systemInstruction', 'generationConfig'];
const MODEL_RE = /^[A-Za-z0-9._:\/-]{1,100}$/;
export function pickPayload(payload, fields) {
  const out = {};
  for (const f of fields) if (payload[f] !== undefined) out[f] = payload[f];
  if ('model' in out && !MODEL_RE.test(String(out.model))) delete out.model;
  return out;
}

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: () => process.env.GROQ_API_KEY,
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }),
    messagesField: 'messages', // format ala OpenAI
    capTokens: (payload) => ({
      ...payload,
      max_tokens: Math.min(payload.max_tokens || 1024, MAX_TOKENS_CAP),
    }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: () => process.env.OPENROUTER_API_KEY,
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }),
    messagesField: 'messages', // format ala OpenAI
    capTokens: (payload) => ({
      ...payload,
      max_tokens: Math.min(payload.max_tokens || 1024, MAX_TOKENS_CAP),
    }),
  },
  gemini: {
    url: () =>
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    key: () => process.env.GEMINI_API_KEY,
    headers: () => ({ 'Content-Type': 'application/json' }), // Gemini pakai ?key= di URL, bukan header
    messagesField: 'contents', // format ala Gemini — BUKAN "messages"
    capTokens: (payload) => ({
      ...payload,
      generationConfig: {
        ...(payload.generationConfig || {}),
        maxOutputTokens: Math.min(
          (payload.generationConfig && payload.generationConfig.maxOutputTokens) || 1024,
          MAX_TOKENS_CAP
        ),
      },
    }),
  },
};

export default async function handler(req, res) {
  // index.html memanggil endpoint ini dari asal yang sama (fetch('/api/ai-proxy')), jadi CORS cukup untuk
  // domain aplikasi sendiri. Set APP_ORIGIN (mis. https://nama-app.vercel.app) bila domainmu berbeda.
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'https://sekretaris-umkm.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, payload } = req.body || {};
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    return res.status(400).json({
      error: `Provider tidak dikenal: ${provider}. Pakai salah satu dari: ${Object.keys(PROVIDERS).join(', ')}`,
    });
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload[cfg.messagesField])) {
    return res.status(400).json({ error: `payload.${cfg.messagesField} wajib berupa array` });
  }

  const msgs = payload[cfg.messagesField];
  if (msgs.length === 0 || msgs.length > MAX_MESSAGES) return res.status(400).json({ error: `jumlah pesan harus 1–${MAX_MESSAGES}` });
  if (JSON.stringify(msgs).length > MAX_BODY_CHARS) return res.status(413).json({ error: 'Permintaan terlalu besar' });

  if (!limiter.allow(clientIp(req))) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ error: 'Terlalu banyak permintaan AI dari alamat ini. Coba lagi beberapa menit lagi.' });
  }

  const key = cfg.key();
  if (!key) {
    return res.status(500).json({
      error: `${provider.toUpperCase()}_API_KEY belum diset di Environment Variables Vercel.`,
    });
  }

  const safePayload = cfg.capTokens(pickPayload(payload, cfg.messagesField === 'contents' ? GEMINI_FIELDS : OPENAI_FIELDS));
  if (safePayload.generationConfig) { // hanya pengaturan sampling yang aman
    const g = safePayload.generationConfig;
    safePayload.generationConfig = Object.fromEntries(['temperature', 'topP', 'maxOutputTokens', 'responseMimeType'].filter((k) => g[k] !== undefined).map((k) => [k, g[k]]));
  }

  try {
    const url = typeof cfg.url === 'function' ? cfg.url() : cfg.url;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: cfg.headers(key),
      body: JSON.stringify(safePayload),
    });
    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
