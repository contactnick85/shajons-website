// Netlify Function: emails every website form (with the CV attached) to the company inbox.
// Environment variables (set in Netlify, never in code):
//   RESEND_API_KEY  required. API key from resend.com (domain shajons.com verified there)
//   MAIL_TO         optional. Defaults to john@shajons.com
//   MAIL_FROM       optional. Defaults to "Shajons Website <website@shajons.com>"

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_FORMS = {
  inquiry: 'Website inquiry',
  candidate: 'Job application',
  employer: 'Hiring request',
};
const ALLOWED_EXT = /\.(pdf|doc|docx|rtf|txt)$/i;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = (s, n) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, n || 200);
const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid request' }); }

  const form = clean(p.form, 20);
  if (!ALLOWED_FORMS[form]) return json(400, { error: 'Unknown form' });
  if (p.fields && p.fields['bot-field']) return json(200, { ok: true }); // honeypot: pretend success

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(500, { error: 'Email is not configured' });

  const fields = p.fields && typeof p.fields === 'object' ? p.fields : {};
  const rows = [];
  let replyTo = '';
  let who = '';
  Object.keys(fields).slice(0, 40).forEach((k) => {
    if (k === 'bot-field' || k === 'form-name') return;
    const v = Array.isArray(fields[k]) ? fields[k].join(', ') : fields[k];
    const val = String(v == null ? '' : v).trim().slice(0, 5000);
    if (!val) return;
    rows.push([clean(k, 60), val]);
    if (!replyTo && /email/i.test(k) && /\S+@\S+\.\S+/.test(val)) replyTo = clean(val, 200);
    if (!who && /name/i.test(k) && !/company|nationality/i.test(k)) who = clean(val, 80);
  });
  if (!rows.length) return json(400, { error: 'Empty form' });

  const attachments = [];
  if (p.resume && p.resume.data) {
    const name = clean(p.resume.name, 120).replace(/[^\w.\- ]/g, '_') || 'resume';
    if (!ALLOWED_EXT.test(name)) return json(400, { error: 'Please upload a PDF or Word document.' });
    const bytes = Math.floor((String(p.resume.data).length * 3) / 4);
    if (bytes > MAX_FILE_BYTES) return json(400, { error: 'File too large' });
    attachments.push({ filename: name, content: String(p.resume.data) });
  }

  const subject = `${ALLOWED_FORMS[form]}${who ? ' from ' + who : ''} | shajons.com`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0E1633"><h2 style="margin:0 0 12px">${esc(ALLOWED_FORMS[form])}</h2><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#566;font-weight:bold;border-bottom:1px solid #e5e8ef">${esc(k)}</td><td style="border-bottom:1px solid #e5e8ef;white-space:pre-wrap">${esc(v)}</td></tr>`).join('') +
    `</table>${attachments.length ? '<p>CV attached to this email.</p>' : ''}<p style="color:#778;font-size:12px">Sent from the shajons.com website form. Reply to this email to answer the sender.</p></div>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const payload = {
    from: process.env.MAIL_FROM || 'Shajons Website <website@shajons.com>',
    to: [process.env.MAIL_TO || 'john@shajons.com'],
    subject, html, text,
  };
  if (replyTo) payload.reply_to = replyTo;
  if (attachments.length) payload.attachments = attachments;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return json(502, { error: 'Email service error' });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('Send failed', e);
    return json(502, { error: 'Email service unreachable' });
  }
};
