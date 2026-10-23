// api/cron-invoice-reminder.js
//
// Dijalankan OTOMATIS oleh Vercel Cron 1x/hari (lihat "crons" di vercel.json).
// Tugasnya: baca SEMUA tagihan semua user dari Firebase Realtime Database,
// lalu kirim email pengingat lewat Mailjet untuk tagihan yang:
//   - jatuh tempo 3 hari lagi   → sekali kirim
//   - jatuh tempo HARI INI     → sekali kirim
//   - sudah TELAT              → sekali kirim, lalu diulang tiap 3 hari
// Supaya tidak dobel-dobel, setiap kali kirim langsung dicatat balik ke
// Firebase di invoices/{uid}/{id}/remindersSent.
//
// Ini JALUR LAMA (tanpa AI, tanpa persetujuan manusia). Di mode lomba/produksi dengan robot UiPath,
// set ROBOT_MODE=1 → cron ini diam dan robot yang bekerja (lihat api/robot.js).
//
// WAJIB diset di Vercel Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT  → sama seperti yang dipakai api/notify.js
//   MAILJET_API_KEY / MAILJET_SECRET_KEY → sama seperti api/send-otp.js
//   CRON_SECRET → string acak bebas (Vercel otomatis kirim ini sebagai header
//                 `Authorization: Bearer …` saat memanggil cron; kita cek supaya
//                 orang lain tidak bisa iseng memicu endpoint ini manual)
// Opsional: MAIL_FROM_EMAIL (pengirim; default = alamat lama), MAIL_DRY_RUN=1 (tidak mengirim apa pun),
//           ROBOT_UID_ALLOWLIST="uid1,uid2" (hanya akun ini yang diurus), FIREBASE_DATABASE_URL.
//
// Uji manual (rahasia hanya lewat HEADER — tidak lagi lewat ?secret= karena URL tercatat di log):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain-kamu>/api/cron-invoice-reminder

import { createRtdb } from '../lib/rtdb.js';
import { cronAuth, isSafeKey, uidAllowed } from '../lib/http.js';
import { escapeHtml } from '../lib/mail.js';

const OVERDUE_REPEAT_DAYS = 3; // ulangi pengingat telat tiap berapa hari
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

function todayStr(){
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC — cukup akurat untuk pengecekan harian)
}

function daysBetween(dueDateStr, todayStrVal){
  const due = new Date(dueDateStr + 'T00:00:00Z');
  const today = new Date(todayStrVal + 'T00:00:00Z');
  return Math.round((due - today) / 86400000);
}

async function sendReminderEmail({ mailjetAuth, toEmail, toName, customerName, amount, dueDate, description, kind }){
  const rupiah = 'Rp ' + Math.round(Number(amount)||0).toLocaleString('id-ID');
  const subjectByKind = {
    d3: `Pengingat: tagihan jatuh tempo 3 hari lagi`,
    due: `Pengingat: tagihan jatuh tempo HARI INI`,
    overdue: `Tagihan sudah lewat jatuh tempo`,
  };
  const introByKind = {
    d3: `Ini pengingat kalau tagihan kamu akan jatuh tempo dalam <b>3 hari</b>.`,
    due: `Ini pengingat kalau tagihan kamu jatuh tempo <b>hari ini</b>.`,
    overdue: `Tagihan berikut sudah <b>melewati tanggal jatuh tempo</b>. Mohon segera diselesaikan ya.`,
  };
  // Nama & deskripsi diketik pengguna → WAJIB di-escape sebelum masuk HTML email.
  const nameHtml = escapeHtml(String(toName || toEmail).slice(0, 120));
  const custHtml = escapeHtml(String(customerName || '').slice(0, 120));
  const descHtml = description ? escapeHtml(String(description).slice(0, 200)) : '';

  const mjRes = await fetch(process.env.MAILJET_API_URL || 'https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${mailjetAuth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Messages: [{
        From: { Email: process.env.MAIL_FROM_EMAIL || 'nagoyaflora@gmail.com', Name: 'Sekretaris UMKM' },
        To: [{ Email: toEmail, Name: String(toName || toEmail).slice(0, 120) }],
        Subject: subjectByKind[kind] || 'Pengingat tagihan',
        HTMLPart: `<p>Halo <b>${nameHtml}</b>,</p>
          <p>${introByKind[kind] || ''}</p>
          <div style="background:#FAF6F0;border-left:4px solid #1B4D4A;padding:14px 16px;border-radius:8px;margin:14px 0;">
            <p style="margin:0 0 6px;"><b>${custHtml}</b>${descHtml ? ' — ' + descHtml : ''}</p>
            <p style="margin:0 0 6px;font-size:22px;color:#1B4D4A;"><b>${escapeHtml(rupiah)}</b></p>
            <p style="margin:0;color:#6B645A;">Jatuh tempo: ${escapeHtml(dueDate)}</p>
          </div>
          <p>- Tim Sekretaris UMKM</p>`
      }]
    })
  }).catch((e) => { throw new Error('Gagal terhubung ke Mailjet: ' + String(e?.message || e).slice(0, 100)); });
  const data = await mjRes.json().catch(() => ({}));
  const ok = data?.Messages?.[0]?.Status === 'success';
  return { ok, data };
}

export default async function handler(req, res) {
  // Rahasia HANYA lewat header Authorization (dibandingkan dengan waktu konstan) — bukan ?secret= di URL.
  const auth = cronAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.status === 401
      ? 'Unauthorized. Endpoint ini cuma boleh dipicu Vercel Cron atau manual dengan header "Authorization: Bearer CRON_SECRET".'
      : auth.error });
  }

  // Mode robot: kalau ROBOT_MODE=1, pengingat tagihan ditangani robot UiPath (lihat api/robot.js).
  // Cron lama ini diam supaya tidak ada email ganda. Tanpa ROBOT_MODE perilakunya TIDAK berubah.
  if (process.env.ROBOT_MODE === '1') {
    return res.status(200).json({ ok: true, skipped: true, reason: 'ROBOT_MODE=1: pengingat tagihan ditangani robot UiPath.' });
  }

  const dryRun = String(process.env.MAIL_DRY_RUN || '') === '1';
  const MAILJET_API_KEY = process.env.MAILJET_API_KEY;
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;
  if (process.env.FIREBASE_AUTH_MODE !== 'none' && !process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT belum diset' });
  }
  if (!dryRun && (!MAILJET_API_KEY || !MAILJET_SECRET_KEY)) return res.status(500).json({ error: 'MAILJET_API_KEY / MAILJET_SECRET_KEY belum diset' });

  const mailjetAuth = Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64');
  const today = todayStr();
  const summary = { checked: 0, sent: 0, skipped: 0, usersSkipped: 0, dryRun: 0, errors: [] };

  try {
    const rtdb = createRtdb(); // FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL (opsional)

    // Ambil SEMUA tagihan semua user sekaligus (hemat request dibanding per-user)
    const allInvoices = await rtdb.get('invoices');
    if (!allInvoices || typeof allInvoices !== 'object') return res.status(200).json({ ok: true, message: 'Belum ada tagihan sama sekali.', summary });

    for (const uid of Object.keys(allInvoices)) {
      // hanya UID yang aman dipakai di path & (bila diset) ada di ROBOT_UID_ALLOWLIST
      if (!isSafeKey(uid) || !uidAllowed(uid)) { summary.usersSkipped++; continue; }
      const userInvoices = allInvoices[uid] && typeof allInvoices[uid] === 'object' ? allInvoices[uid] : {};
      for (const invId of Object.keys(userInvoices)) {
        const inv = userInvoices[invId];
        summary.checked++;
        if (!inv || typeof inv !== 'object' || !isSafeKey(invId)) { summary.skipped++; continue; }
        if (inv.status === 'lunas' || !inv.customerEmail || !inv.dueDate) { summary.skipped++; continue; }
        if (!DATE_RE.test(String(inv.dueDate)) || !EMAIL_RE.test(String(inv.customerEmail))) { summary.skipped++; continue; }

        const d = daysBetween(inv.dueDate, today);
        const sent = inv.remindersSent && typeof inv.remindersSent === 'object' ? inv.remindersSent : {};
        let kind = null;

        if (d === 3 && !sent.d3) kind = 'd3';
        else if (d === 0 && !sent.due) kind = 'due';
        else if (d < 0) {
          const lastOverdue = sent.overdueLast && DATE_RE.test(String(sent.overdueLast)) ? daysBetween(sent.overdueLast, today) : null;
          if (lastOverdue === null || Math.abs(lastOverdue) >= OVERDUE_REPEAT_DAYS) kind = 'overdue';
        }

        if (!kind) { summary.skipped++; continue; }
        if (dryRun) { summary.dryRun++; continue; } // MAIL_DRY_RUN=1: tidak mengirim & tidak mencatat apa pun

        try {
          const { ok } = await sendReminderEmail({
            mailjetAuth,
            toEmail: inv.customerEmail,
            toName: inv.customerName,
            customerName: inv.customerName,
            amount: inv.amount,
            dueDate: inv.dueDate,
            description: inv.description,
            kind,
          });
          if (ok) {
            summary.sent++;
            const patch = kind === 'overdue'
              ? { [`remindersSent/overdueLast`]: today }
              : { [`remindersSent/${kind}`]: today };
            await rtdb.update(`invoices/${uid}/${invId}`, patch);
          } else {
            summary.errors.push(`${uid}/${invId}: Mailjet gagal kirim`);
          }
        } catch (e) {
          summary.errors.push(`${uid}/${invId}: ${String(e.message).slice(0, 150)}`);
        }
      }
    }

    return res.status(200).json({ ok: true, date: today, dryRun: dryRun || undefined, summary });
  } catch (e) {
    return res.status(500).json({ error: String(e.message).slice(0, 300), summary });
  }
}
