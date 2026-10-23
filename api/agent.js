// api/agent.js
//
// "OTAK" AGEN AI — dipanggil oleh ROBOT UiPath lewat HTTP Request (atau oleh cron cadangan).
//
//   POST /api/agent        Authorization: Bearer <ROBOT_API_KEY>
//   { "task": "invoice_followup" | "invoice_context" | "stock_reorder" | "daily_brief", "uid": "...", ... }
//
// Apa yang dilakukan: agen LLM (tool-calling, gratis: Groq / Gemini / OpenRouter) membaca data
// pengguna dari Firebase, memutuskan, lalu server MEMVALIDASI & menandatangani hasilnya.
// Endpoint ini TIDAK mengirim email, TIDAK memposting apa pun — hanya mengembalikan RENCANA.
// Yang mengeksekusi adalah robot UiPath; kasus berisiko menunggu persetujuan pemilik UMKM.
//
// Mode "otak eksternal": kalau body berisi `decisions` (mis. dari workflow n8n atau Agent Builder
// UiPath), server tidak memanggil LLM sendiri — keputusan itu langsung divalidasi dengan
// aturan & guardrail yang SAMA. Jadi otaknya bisa diganti tanpa mengurangi keamanan.

import { createRtdb } from '../lib/rtdb.js';
import { isSafeKey, parseBody, reply, robotAuth, uidAllowed } from '../lib/http.js';
import { policyFromEnv } from '../lib/policy.js';
import { describeInvoiceContext, planDailyBrief, planInvoiceFollowup, planStockReorder } from '../lib/tasks.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Method not allowed' });

  const auth = robotAuth(req);
  if (!auth.ok) return reply(res, auth.status, { ok: false, error: auth.error });

  const body = parseBody(req);
  const { task, uid } = body;
  if (!isSafeKey(uid)) return reply(res, 400, { ok: false, error: 'uid tidak valid' });
  if (!uidAllowed(uid)) return reply(res, 403, { ok: false, error: 'uid_tidak_diizinkan: ROBOT_UID_ALLOWLIST di server tidak memuat uid ini' });

  try {
    const rtdb = createRtdb();
    const decisions = Array.isArray(body.decisions) ? body.decisions : null;
    let result;
    switch (task) {
      case 'invoice_followup':
        result = await planInvoiceFollowup({
          rtdb, uid, policy: policyFromEnv(),
          invoiceIds: Array.isArray(body.invoiceIds) ? body.invoiceIds.filter(isSafeKey) : null,
          decisions,
        });
        break;
      case 'invoice_context': // untuk otak eksternal (n8n): data aman + prompt + skema tool; tanpa memanggil LLM
        result = await describeInvoiceContext({
          rtdb, uid, policy: policyFromEnv(),
          invoiceIds: Array.isArray(body.invoiceIds) ? body.invoiceIds.filter(isSafeKey) : null,
        });
        break;
      case 'stock_reorder':
        result = await planStockReorder({ rtdb, uid, decisions });
        break;
      case 'daily_brief':
        result = await planDailyBrief({ rtdb, uid, stats: body.stats || {} });
        break;
      default:
        return reply(res, 400, { ok: false, error: `task tidak dikenal: ${String(task)}. Pakai invoice_followup | invoice_context | stock_reorder | daily_brief` });
    }
    return reply(res, 200, result);
  } catch (e) {
    return reply(res, 500, { ok: false, error: String(e?.message || e).slice(0, 300) });
  }
}
