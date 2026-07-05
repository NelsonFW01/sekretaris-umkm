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
// WAJIB diset di Vercel Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT  → sama seperti yang dipakai api/notify.js
//   MAILJET_API_KEY / MAILJET_SECRET_KEY → sama seperti api/send-otp.js
//   CRON_SECRET → string acak bebas (Vercel otomatis kirim ini sebagai
//                 Authorization header saat memanggil cron; kita cek supaya
//                 orang lain tidak bisa iseng memicu endpoint ini manual)
//
// Kalau kamu mau TEST manual (bukan nunggu jadwal cron), kamu bisa buka:
//   https://<domain-kamu>/api/cron-invoice-reminder?secret=ISI_CRON_SECRET_KAMU

const DB_URL = 'https://sekretaris-umkm-default-rtdb.asia-southeast1.firebasedatabase.app';
const OVERDUE_REPEAT_DAYS = 3; // ulangi pengingat telat tiap berapa hari

function todayStr(){
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC — cukup akurat untuk pengecekan harian)
}

function daysBetween(dueDateStr, todayStrVal){
  const due = new Date(dueDateStr + 'T00:00:00Z');
  const today = new Date(todayStrVal + 'T00:00:00Z');
  return Math.round((due - today) / 86400000);
}

async function getFirebaseAccessToken(serviceAccount){
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if(!tokenData.access_token) throw new Error('Gagal ambil access token: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
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

  const mjRes = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { Authorization: `Basic ${mailjetAuth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Messages: [{
        From: { Email: 'nagoyaflora@gmail.com', Name: 'Sekretaris UMKM' },
        To: [{ Email: toEmail, Name: toName || toEmail }],
        Subject: subjectByKind[kind] || 'Pengingat tagihan',
        HTMLPart: `<p>Halo <b>${toName || toEmail}</b>,</p>
          <p>${introByKind[kind] || ''}</p>
          <div style="background:#FAF6F0;border-left:4px solid #1B4D4A;padding:14px 16px;border-radius:8px;margin:14px 0;">
            <p style="margin:0 0 6px;"><b>${customerName}</b>${description ? ' — ' + description : ''}</p>
            <p style="margin:0 0 6px;font-size:22px;color:#1B4D4A;"><b>${rupiah}</b></p>
            <p style="margin:0;color:#6B645A;">Jatuh tempo: ${dueDate}</p>
          </div>
          <p>- Tim Sekretaris UMKM</p>`
      }]
    })
  });
  const data = await mjRes.json().catch(() => ({}));
  const ok = data?.Messages?.[0]?.Status === 'success';
  return { ok, data };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const querySecret = req.query?.secret;
  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManualTest = cronSecret && querySecret === cronSecret;
  if (!isVercelCron && !isManualTest) {
    return res.status(401).json({ error: 'Unauthorized. Endpoint ini cuma boleh dipicu Vercel Cron atau manual dengan ?secret=CRON_SECRET.' });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const MAILJET_API_KEY = process.env.MAILJET_API_KEY;
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;
  if (!serviceAccountJson) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT belum diset' });
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) return res.status(500).json({ error: 'MAILJET_API_KEY / MAILJET_SECRET_KEY belum diset' });

  let serviceAccount;
  try { serviceAccount = JSON.parse(serviceAccountJson); }
  catch { return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid' }); }

  const mailjetAuth = Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64');
  const today = todayStr();
  const summary = { checked: 0, sent: 0, skipped: 0, errors: [] };

  try {
    const accessToken = await getFirebaseAccessToken(serviceAccount);

    // Ambil SEMUA tagihan semua user sekaligus (hemat request dibanding per-user)
    const allRes = await fetch(`${DB_URL}/invoices.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const allInvoices = await allRes.json();
    if (!allInvoices) return res.status(200).json({ ok: true, message: 'Belum ada tagihan sama sekali.', summary });

    for (const uid of Object.keys(allInvoices)) {
      const userInvoices = allInvoices[uid] || {};
      for (const invId of Object.keys(userInvoices)) {
        const inv = userInvoices[invId];
        summary.checked++;
        if (inv.status === 'lunas' || !inv.customerEmail || !inv.dueDate) { summary.skipped++; continue; }

        const d = daysBetween(inv.dueDate, today);
        const sent = inv.remindersSent || {};
        let kind = null;

        if (d === 3 && !sent.d3) kind = 'd3';
        else if (d === 0 && !sent.due) kind = 'due';
        else if (d < 0) {
          const lastOverdue = sent.overdueLast ? daysBetween(sent.overdueLast, today) : null;
          if (!sent.overdueLast || Math.abs(lastOverdue) >= OVERDUE_REPEAT_DAYS) kind = 'overdue';
        }

        if (!kind) { summary.skipped++; continue; }

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
            await fetch(`${DB_URL}/invoices/${uid}/${invId}.json`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            });
          } else {
            summary.errors.push(`${uid}/${invId}: Mailjet gagal kirim`);
          }
        } catch (e) {
          summary.errors.push(`${uid}/${invId}: ${e.message}`);
        }
      }
    }

    return res.status(200).json({ ok: true, date: today, summary });
  } catch (e) {
    return res.status(500).json({ error: e.message, summary });
  }
}
