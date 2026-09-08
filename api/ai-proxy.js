// api/ai-proxy.js
//
// Proxy server — SATU-SATUNYA tempat API key provider (Groq/Gemini/OpenRouter) boleh berada.
// Key TIDAK PERNAH ditulis di index.html karena file itu dikirim mentah ke browser semua
// orang yang buka app-nya (repo private tidak melindungi ini — begitu di-deploy, source
// index.html tetap bisa dibaca lewat "View Page Source" oleh siapa pun yang membuka linknya).
//
// index.html sudah otomatis manggil endpoint ini (lihat callAIProxy()) kalau user tidak
// isi key pribadi sendiri di ⚙️ Setting. Kamu HANYA perlu:
//   1. Taruh file ini di folder api/ project Vercel kamu.
//   2. Di Vercel Project Settings → Environment Variables, isi:
//        GROQ_API_KEY        = gsk_... (key Groq kamu)
//        GEMINI_API_KEY      = AQ.Ab8... (key Gemini kamu)
//        OPENROUTER_API_KEY  = (opsional)
//   3. Deploy. Selesai — jangan pernah tempel key-nya di file lain manapun yang ikut ke repo.

const GEMINI_MODEL = 'gemini-flash-latest'; // sinkron dengan GEMINI_MODEL di index.html

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: () => process.env.GROQ_API_KEY,
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }),
    body: (payload) => JSON.stringify(payload) // payload sudah gaya OpenAI: {model, messages, tools?, tool_choice?}
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: () => process.env.OPENROUTER_API_KEY,
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }),
    body: (payload) => JSON.stringify(payload)
  },
  gemini: {
    url: () => `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    key: () => process.env.GEMINI_API_KEY,
    headers: () => ({ 'Content-Type': 'application/json' }), // Gemini pakai ?key= di URL, bukan header
    body: (payload) => JSON.stringify(payload) // payload sudah gaya Gemini: {contents, generationConfig}
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider, payload } = req.body || {};
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    return res.status(400).json({ error: `Provider tidak dikenal: ${provider}` });
  }

  const key = cfg.key();
  if (!key) {
    return res.status(500).json({ error: `${provider.toUpperCase()}_API_KEY belum diset di Environment Variables Vercel.` });
  }

  try {
    const url = typeof cfg.url === 'function' ? cfg.url() : cfg.url;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: cfg.headers(key),
      body: cfg.body(payload)
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
