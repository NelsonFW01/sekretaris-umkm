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

const GEMINI_MODEL = 'gemini-flash-latest'; // sinkron dengan GEMINI_MODEL di index.html
const MAX_TOKENS_CAP = 2048; // batas wajar biar satu request nakal gak menghabiskan kuota/biaya

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
  // Ganti '*' dengan domain asli app kamu (mis. https://sekretaris-umkm.vercel.app)
  // kalau mau membatasi siapa saja yang boleh manggil endpoint ini langsung dari browser.
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  const key = cfg.key();
  if (!key) {
    return res.status(500).json({
      error: `${provider.toUpperCase()}_API_KEY belum diset di Environment Variables Vercel.`,
    });
  }

  const safePayload = cfg.capTokens(payload);

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
