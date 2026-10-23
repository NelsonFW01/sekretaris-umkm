// api/cron-supply-chain-agent.js
//
// Agen Rantai Pasok HARIAN versi server (Vercel Cron) — JALUR CADANGAN tanpa robot UiPath.
//
// Catatan perbaikan: file versi sebelumnya bernama `cron-supply-chain-agent` (TANPA .js) sehingga
// Vercel tidak pernah men-deploy-nya, dan ia memakai `firebase-admin` padahal project ini tidak
// punya package.json. Versi ini memakai mesin agen bersama (lib/) yang tanpa dependency.
//
// Kalau ROBOT_MODE=1 (mode lomba/produksi dengan robot UiPath), cron ini otomatis diam —
// robot UiPath yang menjadi pelaku utama, sehingga tidak ada kerja ganda.
//
// ENV: CRON_SECRET, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL (opsional),
//      GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY (minimal satu), ROBOT_MODE (opsional)

import { createRtdb } from '../lib/rtdb.js';
import { cronAuth, isSafeKey, uidAllowed } from '../lib/http.js';
import { createDrafts } from '../lib/drafts.js';
import { planStockReorder } from '../lib/tasks.js';

export default async function handler(req, res) {
  const auth = cronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (process.env.ROBOT_MODE === '1') {
    return res.status(200).json({ ok: true, skipped: true, reason: 'ROBOT_MODE=1: tugas ini ditangani robot UiPath.' });
  }

  try {
    const rtdb = createRtdb();
    const settings = (await rtdb.get('agentSettings')) || {};
    const uids = Object.entries(settings)
      .filter(([id, v]) => v && v.autoDaily === true && isSafeKey(id) && uidAllowed(id)) // hormati ROBOT_UID_ALLOWLIST
      .map(([id]) => id);

    const results = [];
    for (const uid of uids) {
      try {
        const plan = await planStockReorder({ rtdb, uid });
        const { created, skipped } = await createDrafts(rtdb, uid, plan.items.filter((i) => i.route === 'approval'), { sumber: 'cron', requireSig: false });
        await rtdb.push(`agentRuns/${uid}`, {
          ringkasan: plan.summary, toolsDipanggil: ['cron-supply-chain-agent'], sumber: 'cron', ts: Date.now(),
          stats: { stokMenipis: plan.stats.stokMenipis, drafDibuat: created.length, drafDilewati: skipped.length },
        });
        results.push({ uid, aiUsed: plan.aiUsed, provider: plan.provider, stokMenipis: plan.stats.stokMenipis, drafDibuat: created.length, warnings: plan.warnings });
      } catch (e) {
        results.push({ uid, error: String(e.message).slice(0, 200) });
      }
    }
    return res.status(200).json({ ok: true, processed: uids.length, results });
  } catch (e) {
    return res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
}
