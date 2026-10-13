// Vercel Serverless Function: POST /api/contact
// Sends contact-form submissions via Resend.
// The API key is NEVER stored in code. Set these in Vercel > Settings > Environment Variables:
//   RESEND_API_KEY    - your Resend API key
//   CONTACT_TO_EMAIL  - the inbox that should receive inquiries
//   CONTACT_FROM_EMAIL (optional) - verified sender, defaults to Resend's test sender

const TYPE_LABELS = {
  general: '일반 문의',
  suggest: '장소 추천 / 제안',
  bug: '오류 신고',
  partner: '제휴 문의',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL || 'Travel Gourmet Log <onboarding@resend.dev>';
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY_MISSING' });
  }
  if (!to) {
    return res.status(500).json({ error: 'CONTACT_TO_EMAIL_MISSING' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const name = String(body.name || '').trim().slice(0, 30);
  const email = String(body.email || '').trim().slice(0, 100);
  const type = TYPE_LABELS[body.type] ? body.type : 'general';
  const message = String(body.message || '').trim().slice(0, 1000);
  const honeypot = String(body.website || '');

  // Silently accept bot submissions (honeypot filled) without sending
  if (honeypot) return res.status(200).json({ ok: true });

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const html = `
    <h2>새 문의가 도착했습니다</h2>
    <p><strong>이름:</strong> ${escapeHtml(name)}</p>
    <p><strong>이메일:</strong> ${escapeHtml(email)}</p>
    <p><strong>유형:</strong> ${escapeHtml(TYPE_LABELS[type])}</p>
    <p><strong>내용:</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[Travel Gourmet Log] ${TYPE_LABELS[type]} - ${name}`,
        html,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error:', r.status, detail);
      return res.status(502).json({ error: 'Failed to send' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact send failed:', err);
    return res.status(500).json({ error: 'Failed to send' });
  }
};
