// lib/mail.js
//
// Pengirim email via Mailjet (kredensial sama dengan api/send-otp.js).
// Penerima SELALU diambil dari data tagihan di database oleh pemanggil — bukan dari output AI.
//
// Env: MAILJET_API_KEY, MAILJET_SECRET_KEY, MAIL_FROM_EMAIL (pengirim terverifikasi di Mailjet),
//      MAIL_FROM_NAME (opsional), MAIL_DRY_RUN=1 (tidak benar-benar kirim — untuk uji/demo aman).

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function textToHtml(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * @returns {Promise<{ok:boolean, dryRun?:boolean, status?:number, error?:string, detail?:string}>}
 */
export async function sendMail({ to, toName, subject, text, replyTo }, { env = process.env, fetchImpl = fetch } = {}) {
  if (String(env.MAIL_DRY_RUN || '') === '1') return { ok: true, dryRun: true };

  const apiKey = env.MAILJET_API_KEY;
  const secret = env.MAILJET_SECRET_KEY;
  const from = env.MAIL_FROM_EMAIL;
  if (!apiKey || !secret) return { ok: false, error: 'MAILJET_API_KEY / MAILJET_SECRET_KEY belum diset' };
  if (!from) return { ok: false, error: 'MAIL_FROM_EMAIL belum diset (alamat pengirim yang sudah diverifikasi di Mailjet)' };

  const auth = Buffer.from(`${apiKey}:${secret}`).toString('base64');
  const url = env.MAILJET_API_URL || 'https://api.mailjet.com/v3.1/send';
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      signal: AbortSignal.timeout(Number(env.MAIL_TIMEOUT_MS) || 15_000),
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Messages: [{
          From: { Email: from, Name: env.MAIL_FROM_NAME || 'Sekretaris UMKM' },
          To: [{ Email: to, Name: toName || to }],
          ...(replyTo ? { ReplyTo: { Email: replyTo } } : {}),
          Subject: subject,
          TextPart: text,
          HTMLPart: textToHtml(text),
        }],
      }),
    });
  } catch (e) {
    return { ok: false, error: 'Gagal terhubung ke Mailjet', detail: String(e?.message || e).slice(0, 200) };
  }
  const data = await res.json().catch(() => ({}));
  if (data?.Messages?.[0]?.Status === 'success') return { ok: true };
  return { ok: false, status: res.status, error: 'Mailjet gagal kirim', detail: JSON.stringify(data).slice(0, 300) };
}
