// Netlify runs this automatically after every form submission (event name: submission-created).
// It emails the submission to the company inbox and attaches the uploaded CV.
// Environment variables (set in Netlify): RESEND_API_KEY (required), MAIL_TO, MAIL_FROM.

const LABELS = { inquiry: 'Website inquiry', enquiry: 'Website inquiry', candidate: 'Job application', employer: 'Hiring request' };
const SKIP = new Set(['bot-field', 'form-name', 'ip', 'user_agent', 'referrer']);
const MAX_BYTES = 15 * 1024 * 1024;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const one = (s, n) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, n || 200);

exports.handler = async (event) => {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'bad json' }; }
  const payload = body.payload || {};
  const data = payload.data || {};
  const formName = one(payload.form_name || data['form-name'], 40);
  const title = LABELS[formName] || 'Website form';

  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('RESEND_API_KEY is not set'); return { statusCode: 500, body: 'not configured' }; }

  // Readable rows: prefer Netlify's human labels, fall back to raw field names.
  const rows = [];
  let replyTo = '';
  let who = '';
  const human = Array.isArray(payload.ordered_human_fields) ? payload.ordered_human_fields : null;
  const entries = human ? human.map((f) => [f.title, f.name, f.value]) : Object.keys(data).map((k) => [k, k, data[k]]);
  const files = [];
  entries.forEach(([label, name, value]) => {
    if (SKIP.has(name)) return;
    const raw = data[name];
    if (raw && typeof raw === 'object' && raw.url) { files.push(raw); return; }
    const v = Array.isArray(value) ? value.join(', ') : String(value == null ? '' : value).trim();
    if (!v) return;
    rows.push([String(label || name).replace(/\s*\*$/, ''), v.slice(0, 5000)]);
    if (!replyTo && /email/i.test(name) && /\S+@\S+\.\S+/.test(v)) replyTo = one(v, 200);
    if (!who && /name/i.test(name) && !/company|nationality/i.test(name)) who = one(v, 80);
  });

  const attachments = [];
  const notes = [];
  for (const f of files) {
    try {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error('file too large to attach');
      attachments.push({ filename: one(f.filename, 120).replace(/[^\w.\- ]/g, '_') || 'resume', content: buf.toString('base64') });
    } catch (e) {
      console.error('Could not attach file', e.message);
      notes.push('The CV could not be attached automatically. Download it in Netlify: Forms, ' + formName + '. File: ' + (f.filename || '') );
    }
  }

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0E1633"><h2 style="margin:0 0 12px">${esc(title)}</h2><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#566;font-weight:bold;border-bottom:1px solid #e5e8ef">${esc(k)}</td><td style="border-bottom:1px solid #e5e8ef;white-space:pre-wrap">${esc(v)}</td></tr>`).join('') +
    `</table>${attachments.length ? '<p><b>CV attached to this email.</b></p>' : ''}${notes.map((n) => `<p style="color:#a33">${esc(n)}</p>`).join('')}` +
    `<p style="color:#778;font-size:12px">Sent from the shajons.com website. Reply to this email to answer the sender.</p></div>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (notes.length ? '\n' + notes.join('\n') : '');

  const mail = {
    from: process.env.MAIL_FROM || 'Shajons Website <website@shajons.com>',
    to: [process.env.MAIL_TO || 'john@shajons.com'],
    subject: `${title}${who ? ' from ' + who : ''} | shajons.com`,
    html, text,
  };
  if (replyTo) mail.reply_to = replyTo;
  if (attachments.length) mail.attachments = attachments;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(mail),
  });
  if (!res.ok) { console.error('Resend error', res.status, await res.text()); return { statusCode: 502, body: 'send failed' }; }
  console.log('Emailed', title, who);
  return { statusCode: 200, body: 'ok' };
};
