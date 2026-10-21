// POST /api/subscribe — adds the email to the systeme.io list (tag lista-hso-fascination).
// The API key lives only in the Vercel env var SYSTEME_API_KEY.

const API = 'https://api.systeme.io/api';
const TAG_ID = 2240073; // lista-hso-fascination
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function systeme(path, options) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'X-API-Key': process.env.SYSTEME_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function findContactId(email) {
  const r = await systeme('/contacts?email=' + encodeURIComponent(email), { method: 'GET' });
  if (r.status !== 200) throw new Error('lookup ' + r.status);
  const item = (r.body.items || [])[0];
  return item ? item.id : null;
}

async function subscribe(email) {
  let id = await findContactId(email);
  if (!id) {
    const r = await systeme('/contacts', {
      method: 'POST',
      body: JSON.stringify({ email, locale: 'en' }),
    });
    if (r.status === 201) {
      id = r.body.id;
    } else if (r.status === 422) {
      // Created in parallel by a double submit: look it up again.
      id = await findContactId(email);
    }
    if (!id) throw new Error('create ' + r.status);
  }
  const t = await systeme('/contacts/' + id + '/tags', {
    method: 'POST',
    body: JSON.stringify({ tagId: TAG_ID }),
  });
  if (t.status !== 204) throw new Error('tag ' + t.status);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const body = req.body || {};
  const fromForm = !(req.headers['content-type'] || '').includes('application/json');
  const email = String(body.email || '').trim().toLowerCase();

  // Honeypot: real people never fill the hidden "website" field.
  if (body.website) {
    return fromForm ? res.redirect(303, '/thank-you') : res.status(200).json({ ok: true });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fromForm
      ? res.redirect(303, '/free-report?error=email')
      : res.status(400).json({ ok: false, error: 'email' });
  }

  try {
    await subscribe(email);
  } catch (err) {
    console.error('subscribe failed:', err.message);
    return fromForm
      ? res.redirect(303, '/free-report?error=server')
      : res.status(502).json({ ok: false, error: 'server' });
  }

  return fromForm ? res.redirect(303, '/thank-you') : res.status(200).json({ ok: true });
};
