// api/robot.js
//
// ANTARMUKA DATA & AKSI untuk ROBOT UiPath (satu Vercel Function, beberapa "op" supaya hemat kuota
// jumlah function di paket gratis). Semua butuh:  Authorization: Bearer <ROBOT_API_KEY>
//
//   GET  ?op=ping                       cek koneksi + konfigurasi (tanpa membocorkan rahasia)
//   GET  ?op=snapshot[&uid=]            data ringkas pengguna yang mengaktifkan "Agen Otomatis Harian"
//   POST ?op=drafts   {uid,items[]}     robot menaruh draf (butuh persetujuan manusia) ke aplikasi
//   POST ?op=send     {uid,item,markOnly?} | {uid,draftId}   kirim 1 email pengingat (rute auto: item bertanda tangan dari agen;
//                     draf yang disetujui: cukup draftId, server membaca sendiri isi draf dari database)
//   POST ?op=report   {uid,ringkasan,stats,tools}     tulis laporan ke "Riwayat Agen" di aplikasi
//
// PRINSIP KEAMANAN
//  • Snapshot MINIM: tanpa nama/email/HP pelanggan — robot hanya perlu id, jumlah, tanggal, status (draf yang disetujui: hanya id-nya).
//  • Robot hanya boleh mengeksekusi ITEM BERTANDA TANGAN SERVER (lib/sign.js).
//  • Penerima email selalu dicocokkan ulang dengan data tagihan saat ini.
//  • Rute "approval" hanya boleh terkirim kalau draf-nya sudah berstatus "disetujui" oleh pemilik.
//  • Idempotent: menjalankan robot dua kali tidak mengirim dobel.

import { createRtdb } from '../lib/rtdb.js';
import { isSafeKey, parseBody, reply, robotAuth, uidAllowed, uidAllowlist } from '../lib/http.js';
import { DEFAULT_POLICY, classifyInvoice, policyFromEnv, urgensiStok } from '../lib/policy.js';
import { signingSecret, verifyItem } from '../lib/sign.js';
import { createDrafts, draftToItem, isStale } from '../lib/drafts.js';
import { loadOwner } from '../lib/tasks.js';
import { sendMail } from '../lib/mail.js';
import { isEmail, maskEmail, sanitizeText } from '../lib/validate.js';
import { listProviders } from '../lib/agent-core.js';
import { todayJakarta } from '../lib/dates.js';

const VERSION = '2.0.0';
const KINDS = ['d3', 'due', 'overdue'];

function getOp(req, body) {
  const q = req.query && typeof req.query === 'object' ? req.query : Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams);
  return { op: String(q.op || body.op || '').toLowerCase(), query: q };
}

const normPhone = (s) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 8 ? d : ''; };

// ───────────────────────── ping ─────────────────────────
function ping() {
  const env = process.env;
  return {
    ok: true, version: VERSION, today: todayJakarta(), timezone: 'Asia/Jakarta',
    robotMode: env.ROBOT_MODE === '1',
    aiProviders: listProviders(env).map((p) => ({ name: p.name, model: p.model })), // tanpa key
    mail: { configured: !!(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY && env.MAIL_FROM_EMAIL), dryRun: env.MAIL_DRY_RUN === '1' },
    signing: !!signingSecret(env),
    // true bila DRAFT_SIGNING_SECRET diisi dan BERBEDA dari ROBOT_API_KEY — pemegang kunci robot (termasuk n8n) lalu tidak bisa memalsukan tanda tangan
    signingSeparate: !!env.DRAFT_SIGNING_SECRET && env.DRAFT_SIGNING_SECRET !== env.ROBOT_API_KEY,
    uidAllowlist: uidAllowlist(env).length, // jumlah saja (0 = semua pengguna yang mengaktifkan agen); UID tidak dibocorkan
    policy: policyFromEnv(env),
  };
}

// ───────────────────────── snapshot ─────────────────────────
async function snapshot(rtdb, onlyUid) {
  const settings = (await rtdb.get('agentSettings')) || {};
  const uids = Object.entries(settings)
    .filter(([id, v]) => v && v.autoDaily === true && isSafeKey(id) && uidAllowed(id))
    .map(([id]) => id)
    .filter((id) => !onlyUid || id === onlyUid);

  const today = todayJakarta();
  const policy = policyFromEnv();
  const users = [];
  for (const uid of uids) {
    const [invRaw, stokRaw, draftsRaw, owner] = await Promise.all([
      rtdb.get(`invoices/${uid}`), rtdb.get(`stokInventori/${uid}`), rtdb.get(`agentDrafts/${uid}`), loadOwner(rtdb, uid),
    ]);

    const invoices = Object.entries(invRaw || {})
      .filter(([, v]) => v && typeof v === 'object')
      .map(([id, v]) => ({
        id,
        amount: Number(v.amount) || 0,
        dueDate: v.dueDate || null,
        status: v.status === 'lunas' ? 'lunas' : 'belum_lunas',
        hasEmail: isEmail(v.customerEmail),
        hasPhone: !!normPhone(v.customerPhone),
        remindersSent: {
          d3: v.remindersSent?.d3 || null,
          due: v.remindersSent?.due || null,
          overdueLast: v.remindersSent?.overdueLast || null,
        },
      }));

    const stokMenipis = Object.values(stokRaw || {}).filter((s) => s && urgensiStok(s)).length;

    let tamperedDrafts = 0;
    const approvedDrafts = [];
    for (const [draftId, d] of Object.entries(draftsRaw || {})) {
      // hanya draf EMAIL (route approval) yang dikirim robot; draf WA/stok disetujui = manusia yang mengirim sendiri
      if (!d || d.status !== 'disetujui' || d.tipe !== 'pengingat_tagihan' || d.route !== 'approval' || d.executedAt) continue;
      const item = draftToItem(d);
      if (!verifyItem(uid, item)) { tamperedDrafts++; continue; } // isi draf diubah setelah dibuat server → abaikan
      approvedDrafts.push({ draftId, invoiceId: item.invoiceId, kind: item.kind }); // isi draf TIDAK dikirim ke robot; server membacanya sendiri saat send
    }

    users.push({ uid, namaUsaha: owner.storeName || owner.displayName || '', invoices, stokMenipis, approvedDrafts, tamperedDrafts });
  }
  return { ok: true, today, policy, users };
}

// ───────────────────────── send ─────────────────────────
async function sendReminder(rtdb, body) {
  const { uid, draftId, markOnly } = body;
  let { item } = body;
  if (!isSafeKey(uid)) return [400, { ok: false, error: 'uid tidak valid' }];
  // draf yang disetujui: robot hanya membawa draftId; isinya dibaca server dari database (lalu diverifikasi tanda tangannya di bawah)
  if (item === undefined && isSafeKey(draftId)) {
    const stored = await rtdb.get(`agentDrafts/${uid}/${draftId}`);
    if (stored && typeof stored === 'object') item = draftToItem(stored);
  }
  if (!item || typeof item !== 'object' || !verifyItem(uid, item)) {
    return [400, { ok: false, error: 'tanda_tangan_tidak_valid: item bukan hasil rencana server atau isinya berubah' }];
  }
  if (item.tipe !== 'pengingat_tagihan' || !KINDS.includes(item.kind) || !isEmail(item.to) || !isSafeKey(item.invoiceId)) {
    return [400, { ok: false, error: 'item bukan pengingat email yang valid' }];
  }

  // otorisasi eksekusi
  let draft = null;
  if (item.route === 'auto') {
    // boleh langsung
  } else if (item.route === 'approval' && isSafeKey(draftId)) {
    draft = await rtdb.get(`agentDrafts/${uid}/${draftId}`);
    const okDraft = draft && draft.status === 'disetujui' && !draft.executedAt && draft.sig === item.sig && draft.invoiceId === item.invoiceId;
    if (!okDraft) return [403, { ok: false, error: 'butuh_persetujuan_manusia: draf belum disetujui / sudah dieksekusi / tidak cocok' }];
  } else {
    return [403, { ok: false, error: 'butuh_persetujuan_manusia: rute approval harus lewat draf yang disetujui pemilik' }];
  }

  const today = todayJakarta();
  const inv = await rtdb.get(`invoices/${uid}/${item.invoiceId}`);
  const finish = async (reason) => {
    if (draftId && draft) await rtdb.update(`agentDrafts/${uid}/${draftId}`, { status: 'dilewati', executedAt: Date.now(), executedBy: 'uipath-robot', result: reason });
    return [200, { ok: true, sent: false, skipped: true, reason }];
  };
  if (!inv) return finish('tagihan_tidak_ditemukan');
  if (inv.status === 'lunas') return finish('sudah_lunas');
  if (!isEmail(inv.customerEmail) || String(inv.customerEmail).trim().toLowerCase() !== item.to.trim().toLowerCase()) return finish('penerima_berubah');
  // isi yang ditandatangani/disetujui memuat nominal & tenggat tertentu; bila tagihan sudah berubah, isinya tak lagi benar
  if (isStale(inv, item)) return finish('tagihan_berubah');
  // rencana otomatis hanya berlaku pada hari ia dibuat (robot merencanakan lalu mengirim dalam satu putaran); item lama tidak bisa diputar ulang
  if (item.route === 'auto' && item.planDate !== today) return [200, { ok: true, sent: false, skipped: true, reason: 'rencana_kedaluwarsa' }];

  // idempotensi
  const sent = inv.remindersSent && typeof inv.remindersSent === 'object' ? inv.remindersSent : {};
  if (item.route === 'auto') {
    const c = classifyInvoice(inv, today, policyFromEnv());
    if (!c.eligible || c.kind !== item.kind) return [200, { ok: true, sent: false, skipped: true, reason: c.skipReason || 'jenis_pengingat_berubah' }];
  } else if (item.kind === 'overdue' ? sent.overdueLast === today : !!sent[item.kind]) {
    return finish('sudah_dikirim');
  }

  const field = item.kind === 'overdue' ? 'remindersSent/overdueLast' : `remindersSent/${item.kind}`; // semantik sama dengan cron lama
  const invPath = `invoices/${uid}/${item.invoiceId}`;
  const prevValue = (item.kind === 'overdue' ? sent.overdueLast : sent[item.kind]) ?? null;
  const channel = markOnly ? 'smtp-robot' : 'mailjet-server';

  if (markOnly) {
    // robot sudah mengirim lewat SMTP-nya sendiri → server cukup mencatat
    await rtdb.update(invPath, { [field]: today });
  } else {
    if (String(process.env.MAIL_DRY_RUN || '') === '1') {
      return [200, { ok: true, sent: false, dryRun: true, reason: 'MAIL_DRY_RUN=1: email tidak benar-benar dikirim, status tagihan tidak diubah' }];
    }
    // TANDAI DULU, baru kirim: jendela balapan dua proses yang bersamaan menyusut dari "lamanya kirim email"
    // menjadi ±2 panggilan database. Bila pengiriman gagal, tanda dikembalikan sehingga bisa dicoba lagi.
    await rtdb.update(invPath, { [field]: today });
    let mail;
    try {
      const owner = await loadOwner(rtdb, uid);
      mail = await sendMail({ to: inv.customerEmail.trim(), toName: sanitizeText(inv.customerName, 80), subject: item.subject, text: item.body, replyTo: owner.email || undefined });
    } catch (e) {
      mail = { ok: false, error: `Gagal mengirim: ${String(e?.message || e).slice(0, 120)}` };
    }
    if (!mail.ok) {
      await rtdb.update(invPath, { [field]: prevValue }).catch(() => {});
      return [502, { ok: false, sent: false, error: mail.error, detail: mail.detail }];
    }
  }

  if (draftId && draft) {
    await rtdb.update(`agentDrafts/${uid}/${draftId}`, { status: 'dieksekusi', executedAt: Date.now(), executedBy: 'uipath-robot', result: markOnly ? 'dikirim_robot_smtp' : 'dikirim_server' });
  }
  await rtdb.push(`robotAudit/${uid}`, {
    ts: Date.now(), invoiceId: item.invoiceId, kind: item.kind, route: item.route, draftId: draftId || null,
    to: maskEmail(item.to), channel, aiGenerated: !!item.aiGenerated,
  });
  return [200, { ok: true, sent: true, invoiceId: item.invoiceId, kind: item.kind, to: maskEmail(item.to), channel }];
}

// ───────────────────────── report ─────────────────────────
async function writeReport(rtdb, body) {
  const { uid } = body;
  if (!isSafeKey(uid)) return [400, { ok: false, error: 'uid tidak valid' }];
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(Math.round(Number(v)), 1_000_000) : 0);
  const stats = {};
  for (const [k, v] of Object.entries(body.stats && typeof body.stats === 'object' ? body.stats : {}).slice(0, 20)) {
    if (/^[A-Za-z0-9_]{1,30}$/.test(k)) stats[k] = num(v);
  }
  const tools = (Array.isArray(body.tools) ? body.tools : []).slice(0, 20).map((t) => sanitizeText(t, 40)).filter(Boolean);
  const id = await rtdb.push(`agentRuns/${uid}`, {
    ringkasan: sanitizeText(body.ringkasan, 800) || '-',
    toolsDipanggil: tools, stats, sumber: 'uipath-robot', ts: Date.now(),
  });
  return [200, { ok: true, runId: id }];
}

// ───────────────────────── handler ─────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = robotAuth(req);
  if (!auth.ok) return reply(res, auth.status, { ok: false, error: auth.error });

  const body = req.method === 'POST' ? parseBody(req) : {};
  const { op, query } = getOp(req, body);

  try {
    if (op === 'ping' && req.method === 'GET') return reply(res, 200, ping());
    const rtdb = createRtdb();

    if (op === 'snapshot' && req.method === 'GET') {
      const only = query.uid && isSafeKey(String(query.uid)) ? String(query.uid) : null;
      return reply(res, 200, await snapshot(rtdb, only));
    }
    if (req.method === 'POST') {
      if (isSafeKey(body.uid) && !uidAllowed(body.uid)) {
        return reply(res, 403, { ok: false, error: 'uid_tidak_diizinkan: ROBOT_UID_ALLOWLIST di server tidak memuat uid ini' });
      }
      if (op === 'drafts') {
        if (!isSafeKey(body.uid)) return reply(res, 400, { ok: false, error: 'uid tidak valid' });
        const r = await createDrafts(rtdb, body.uid, body.items, { sumber: 'uipath-robot' });
        return reply(res, 200, { ok: true, ...r });
      }
      if (op === 'send') { const [s, o] = await sendReminder(rtdb, body); return reply(res, s, o); }
      if (op === 'report') { const [s, o] = await writeReport(rtdb, body); return reply(res, s, o); }
    }
    return reply(res, 400, { ok: false, error: `op tidak dikenal atau method salah: ${op || '(kosong)'} [${req.method}]` });
  } catch (e) {
    return reply(res, 500, { ok: false, error: String(e?.message || e).slice(0, 300) });
  }
}
