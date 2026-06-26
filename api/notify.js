export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT belum diset di Vercel Environment Variables' });
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid' });
  }

  const { token, tokens, title, body, icon, tag, url, data } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title wajib diisi' });

  // Buat JWT untuk OAuth2 Google
  const getAccessToken = async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
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
    return tokenData.access_token;
  };

  const accessToken = await getAccessToken();
  const projectId = serviceAccount.project_id;
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const notification = {
    title: String(title).slice(0, 100),
    body: String(body || '').slice(0, 200),
  };

  const webpushData = {
    tag: tag || 'umkm',
    url: url || '/',
    ...(data || {}),
  };

  const sendOne = async (tok) => {
    const message = {
      message: {
        token: tok,
        notification,
        webpush: {
          notification: {
            icon: icon || '/icon-192.png',
            tag: tag || 'umkm',
            click_action: url || '/',
          },
          data: webpushData,
        },
      },
    };
    try {
      const r = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      return await r.json();
    } catch (e) {
      return { error: e.message };
    }
  };

  const results = [];

  if (token) {
    results.push(await sendOne(token));
  } else if (Array.isArray(tokens) && tokens.length > 0) {
    const all = await Promise.all(tokens.map(sendOne));
    results.push(...all);
  } else {
    return res.status(400).json({ error: 'Harap isi token atau tokens' });
  }

  return res.status(200).json({ ok: true, results });
}
