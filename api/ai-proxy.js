// api/ai-proxy.js
//
// Proxy aman untuk fitur AI (Asisten AI, Otak AI, Bikin Konten, SecurityAI, dll)
// saat pengguna BELUM mengisi API key Groq/OpenRouter miliknya sendiri.
//
// Kenapa file ini ada: sebelumnya, key admin (Groq & OpenRouter) ditulis
// langsung di index.html sebagai `const ADMIN_GROQ_KEY = "..."`. Karena
// index.html dikirim mentah-mentah ke browser SETIAP pengunjung, siapapun
// tinggal klik kanan → "View Page Source" untuk mencuri key itu. Sekarang key
// admin hanya hidup di server, sebagai Environment Variable di Vercel, dan
// tidak pernah dikirim ke browser sama sekali.
//
// Cara pakai dari client (lihat callAIProxy() di index.html):
//   fetch('/api/ai-proxy', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ provider: 'groq' | 'openrouter', payload: {...} })
//   })
// `payload` adalah body chat-completion standar ala OpenAI (model, messages,
// temperature, dst) — bentuknya sama persis dengan yang dulu dikirim langsung
// ke api.groq.com / openrouter.ai, jadi tidak perlu ubah logic parsing di client.
//
// WAJIB diset di Vercel → Project Settings → Environment Variables:
//   GROQ_API_KEY        = key baru dari console.groq.com/keys
//   OPENROUTER_API_KEY  = key baru dari openrouter.ai/keys
// (Key LAMA yang sempat bocor di index.html harus dianggap sudah bocor —
//  revoke/regenerate dulu di dashboard masing-masing, baru pasang yang baru
//  di sini. Key lama tetap bisa dipakai orang lain selama belum di-revoke.)

const UPSTREAM = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
  },
};

// Batas wajar supaya satu request nakal tidak menghabiskan kuota/biaya.
const MAX_TOKENS_CAP = 2048;

export default async function handler(req, res) {
  // Ganti '*' dengan domain aslimu (mis. https://sekretaris-umkm.vercel.app
  // atau domain custom-mu) kalau mau membatasi siapa saja yang boleh
  // memanggil endpoint ini langsung dari browser.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, payload } = req.body || {};
  const target = UPSTREAM[provider];
  if (!target) {
    return res.status(400).json({ error: 'provider harus "groq" atau "openrouter"' });
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) {
    return res.status(400).json({ error: 'payload.messages wajib berupa array' });
  }

  const apiKey = process.env[target.envKey];
  if (!apiKey) {
    return res.status(500).json({
      error: `${target.envKey} belum diset di Vercel Environment Variables`,
    });
  }

  // Teruskan payload apa adanya, tapi jaga max_tokens supaya tidak dieksploitasi.
  const safePayload = {
    ...payload,
    max_tokens: Math.min(payload.max_tokens || 1024, MAX_TOKENS_CAP),
  };

  try {
    const upstreamRes = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(safePayload),
    });
    const data = await upstreamRes.json().catch(() => ({}));
    return res.status(upstreamRes.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
