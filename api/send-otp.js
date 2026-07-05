export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://sekretaris-umkm.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, otp_code } = req.body;
  if (!email || !otp_code) return res.status(400).json({ error: 'Missing fields' });

  const MAILJET_API_KEY    = process.env.MAILJET_API_KEY;
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    return res.status(500).json({ error: 'MAILJET_API_KEY / MAILJET_SECRET_KEY belum diset di Vercel Environment Variables' });
  }
  const credentials = Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64');

  try {
    const mjRes = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: 'nagoyaflora@gmail.com', Name: 'Sekretaris UMKM' },
          To: [{ Email: email, Name: name || email }],
          Subject: 'Kode Verifikasi Sekretaris UMKM',
          HTMLPart: `<p>Halo <b>${name || email}</b>,</p>
            <p>Kode verifikasi Sekretaris UMKM kamu:</p>
            <h2 style="font-size:36px;letter-spacing:8px;color:#1B4D4A;">${otp_code}</h2>
            <p>Kode berlaku 2 menit. Jangan bagikan ke siapapun.</p>
            <p>- Tim Sekretaris UMKM</p>`
        }]
      })
    });

    const data = await mjRes.json();
    if (data.Messages && data.Messages[0].Status === 'success') {
      return res.status(200).json({ success: true });
    }
    console.error('Mailjet error:', data);
    return res.status(500).json({ error: 'Failed to send email', detail: data });
  } catch (e) {
    console.error('Fetch error:', e);
    return res.status(500).json({ error: e.message });
  }
}
