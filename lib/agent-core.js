// lib/agent-core.js
//
// MESIN AGEN — loop tool-calling yang berjalan di server, bisa memakai LLM GRATIS mana pun
// yang kompatibel dengan format OpenAI (Groq, Google Gemini lewat endpoint OpenAI-compatible,
// OpenRouter model ":free"). Tidak butuh framework berbayar dan tidak butuh server tambahan:
// cukup dijalankan sebagai Vercel Function.
//
// Siklus agen (Rasakan → Rencanakan → Bertindak → Lapor) di sini:
//   1. LLM membaca konteks + daftar tool
//   2. LLM boleh memanggil tool BACA-SAJA (mis. riwayat pelanggan, cari tawaran Kongsi)
//   3. LLM menutup dengan memanggil tool "terminal" berisi rencana terstruktur
//   4. Pemanggil (lib/tasks.js) memvalidasi rencana itu — LLM tidak pernah mengeksekusi apa pun
//
// Ketahanan (penting untuk kuota gratis):
//   - urutan provider bisa diatur (AGENT_PROVIDER_ORDER), yang tak punya API key dilewati
//   - kena 429 / 5xx / timeout → otomatis pindah ke provider berikutnya
//   - semua provider gagal → runAgent mengembalikan ok:false; pemanggil memakai template cadangan

const PROVIDER_DEFS = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-120b', // sama dengan yang dipakai index.html
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-flash-latest', // sama dengan api/ai-proxy.js
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'openai/gpt-oss-120b:free',
  },
};

export function listProviders(env = process.env) {
  const order = String(env.AGENT_PROVIDER_ORDER || 'groq,gemini,openrouter')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = [];
  for (const name of order) {
    const def = PROVIDER_DEFS[name];
    if (!def) continue;
    const key = env[def.keyEnv];
    if (!key) continue;
    out.push({
      name,
      key,
      baseUrl: String(env[`${name.toUpperCase()}_BASE_URL`] || def.baseUrl).replace(/\/$/, ''),
      model: env[def.modelEnv] || def.defaultModel,
    });
  }
  return out;
}

export class LlmError extends Error {
  constructor(message, { status = 0, skipProvider = false, retrySame = false, rateLimited = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.skipProvider = skipProvider;
    this.retrySame = retrySame;
    this.rateLimited = rateLimited;
  }
}

function classifyHttpError(p, status, text) {
  const snippet = String(text).slice(0, 200).replace(/\s+/g, ' ');
  const msg = `${p.name}: HTTP ${status} ${snippet}`;
  if (status === 401 || status === 403 || status === 404) return new LlmError(msg, { status, skipProvider: true }); // key/model salah
  if (status === 429) return new LlmError(msg, { status, rateLimited: true });                                    // kuota habis
  if (status >= 500 || status === 408 || status === 425) return new LlmError(msg, { status });                    // gangguan sementara
  if (status === 400 && /tool_use_failed|failed_generation|invalid[_ ]?(tool|function)|malformed/i.test(text)) {
    return new LlmError(msg, { status, retrySame: true });                                                         // model salah format tool
  }
  return new LlmError(msg, { status, skipProvider: true });
}

async function callProvider(p, { messages, tools, maxTokens, timeoutMs, fetchImpl, env }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` };
  if (p.name === 'openrouter') {
    headers['HTTP-Referer'] = env.APP_URL || 'https://sekretaris-umkm.vercel.app';
    headers['X-Title'] = 'Sekretaris UMKM';
  }
  let res;
  try {
    res = await fetchImpl(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: p.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new LlmError(`${p.name}: ${e?.name === 'TimeoutError' ? 'timeout' : (e?.message || 'gagal terhubung')}`);
  }
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(p, res.status, text);

  let data;
  try { data = JSON.parse(text); } catch { throw new LlmError(`${p.name}: respons bukan JSON`); }
  if (data?.error) {
    // OpenRouter kadang membalas HTTP 200 dengan {error:{...}}
    const code = Number(data.error.code) || 0;
    throw classifyHttpError(p, code || 502, JSON.stringify(data.error));
  }
  const message = data?.choices?.[0]?.message;
  if (!message) throw new LlmError(`${p.name}: respons tanpa message`);
  return { message, usage: data.usage || {}, model: data.model || p.model };
}

function preview(x, n = 300) {
  let s;
  try { s = typeof x === 'string' ? x : JSON.stringify(x); } catch { s = String(x); }
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function normalizeAssistant(msg, calls) {
  const out = { role: 'assistant', content: typeof msg.content === 'string' ? msg.content : null };
  if (calls.length) {
    out.tool_calls = calls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.function?.name, arguments: tc.function?.arguments ?? '{}' },
      ...(tc.extra_content ? { extra_content: tc.extra_content } : {}), // tanda tangan "thought" Gemini
    }));
  }
  return out;
}

function toolMessage(id, obj) {
  return { role: 'tool', tool_call_id: id, content: JSON.stringify(obj) };
}

/**
 * Jalankan satu agen sampai ia memanggil tool terminal.
 * @param {object} o
 * @param {string} o.system      prompt sistem
 * @param {string} o.user        pesan pengguna (konteks + data)
 * @param {Array<{def:{name:string,description:string,parameters:object}, handler?:(args:object)=>Promise<any>|any}>} o.tools
 * @param {string} o.terminal    nama tool yang mengakhiri loop (hasil akhir)
 * @param {(content:string)=>object|null} [o.parseText] cadangan: ambil hasil dari teks bila model tidak memanggil tool
 */
export async function runAgent({
  system, user, tools, terminal, parseText,
  maxTurns = 6, maxTokens = 1800, timeoutMs = 25_000, deadlineAt = 0,
  providers, fetchImpl = fetch, env = process.env,
}) {
  const trace = [];
  const provs = providers || listProviders(env);
  if (!provs.length) {
    return {
      ok: false, terminal: null, trace, provider: null, model: null, turns: 0, usage: { prompt: 0, completion: 0 },
      error: 'Tidak ada API key LLM (GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY) yang diset.',
    };
  }

  const toolDefs = tools.map((t) => ({ type: 'function', function: t.def }));
  const handlers = new Map(tools.filter((t) => t.handler).map((t) => [t.def.name, t.handler]));
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  const dead = new Set();
  const usage = { prompt: 0, completion: 0 };
  let current = null;
  let lastError = null;
  let terminalArgs = null;
  let nudged = false;
  let provider = null;
  let model = null;
  let turns = 0;

  async function chat() {
    const order = current ? [current, ...provs.filter((p) => p !== current)] : provs;
    for (const p of order) {
      if (dead.has(p.name)) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (deadlineAt && Date.now() > deadlineAt) throw new LlmError('batas waktu agen habis');
        try {
          const r = await callProvider(p, { messages, tools: toolDefs, maxTokens, timeoutMs, fetchImpl, env });
          current = p;
          return { ...r, provider: p };
        } catch (e) {
          lastError = e;
          trace.push({ type: 'llm_error', provider: p.name, error: String(e.message).slice(0, 200) });
          if (e.skipProvider || e.rateLimited) { dead.add(p.name); break; }
          if (e.retrySame && attempt === 0) continue;
          break; // timeout / 5xx → coba provider lain
        }
      }
    }
    throw lastError || new LlmError('semua provider gagal');
  }

  try {
    for (; turns < maxTurns; turns++) {
      const r = await chat();
      provider = r.provider.name;
      model = r.model;
      usage.prompt += Number(r.usage.prompt_tokens) || 0;
      usage.completion += Number(r.usage.completion_tokens) || 0;

      const msg = r.message;
      const calls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((tc, i) => ({ ...tc, id: tc.id || `call_${turns}_${i}` }));
      messages.push(normalizeAssistant(msg, calls));

      if (calls.length) {
        for (const tc of calls) {
          const name = tc.function?.name;
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {
            trace.push({ type: 'tool_error', name, error: 'argumen bukan JSON' });
            messages.push(toolMessage(tc.id, { error: 'argumen bukan JSON yang valid' }));
            continue;
          }
          if (name === terminal) {
            terminalArgs = args;
            trace.push({ type: 'terminal', name, args: preview(args) });
            messages.push(toolMessage(tc.id, { ok: true }));
            continue;
          }
          const handler = handlers.get(name);
          let result;
          if (!handler) result = { error: `tool tidak dikenal: ${name}` };
          else {
            try { result = await handler(args); } catch (e) { result = { error: String(e?.message || e).slice(0, 200) }; }
          }
          trace.push({ type: 'tool', name, args: preview(args), result: preview(result) });
          messages.push(toolMessage(tc.id, result));
        }
        if (terminalArgs) { turns++; break; }
        continue;
      }

      // Tanpa tool call: coba baca JSON dari teks, atau dorong sekali agar memanggil tool terminal.
      const parsed = parseText ? parseText(typeof msg.content === 'string' ? msg.content : '') : null;
      if (parsed) { terminalArgs = parsed; trace.push({ type: 'text_json' }); turns++; break; }
      if (!nudged && turns < maxTurns - 1) {
        nudged = true;
        messages.push({ role: 'user', content: `Panggil tool ${terminal} sekarang berisi hasil akhirmu. Jangan balas dengan teks biasa.` });
        continue;
      }
      break;
    }
  } catch (e) {
    lastError = e;
  }

  return {
    ok: !!terminalArgs,
    terminal: terminalArgs,
    trace, provider, model, turns, usage,
    error: terminalArgs ? null : String(lastError?.message || 'Agen tidak menghasilkan rencana akhir.').slice(0, 300),
  };
}
