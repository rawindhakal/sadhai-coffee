import { query } from './db.js';
import { confirmPayment } from './orders.js';
import { returnUrl, webBase } from './payments.js';
import * as fonepay from './gateways/fonepay.js';

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#FBF4E8;color:#2A1810;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="max-width:380px;padding:28px;text-align:center">${body}</div></body></html>`;

/** GET /payments/:id/pay: sends the phone to Fonepay's web payment page with a signed request. */
export async function startPayment(paymentId) {
  const p = (await query('SELECT * FROM payments WHERE id=$1', [paymentId])).rows[0];
  if (!p || p.provider !== 'fonepay') return { status: 404, html: page('Not found', '<h2>That payment link is not valid.</h2>') };
  if (p.status !== 'pending') return { status: 200, html: page('Payment', `<h2>${p.status === 'paid' ? 'Already paid' : 'This payment is closed'}</h2><p>You can close this page.</p>`) };
  if (fonepay.method() !== 'web' || fonepay.missing().length) return { status: 400, html: page('Not ready', '<h2>This way of paying is not ready.</h2><p>Please pay with cash at the counter.</p>') };
  return { redirect: fonepay.requestUrl({ amount: p.amount, prn: p.provider_ref || fonepay.reference(p.id), returnUrl: returnUrl(), note: 'Sadhai Coffee' }) };
}

/** Fonepay sent the browser back with PRN, PS, RC, UID and a signature. Only a genuine, matching, successful answer pays the order. */
export async function fonepayReturn(q) {
  const done = (ok) => ({ html: page(ok ? 'Paid' : 'Not paid', ok
    ? `<h2>Payment received</h2><p>Your order is on its way to the barista. You can close this page.</p><p><a href="${esc(webBase())}/orders">See my orders</a></p><script>setTimeout(function(){try{window.close()}catch(e){}},2500)</script>`
    : '<h2>Payment not completed</h2><p>Nothing was charged. You can close this page and try again.</p>') });
  const p = (await query(`SELECT * FROM payments WHERE provider='fonepay' AND provider_ref=$1 ORDER BY created_at DESC LIMIT 1`, [String(q.PRN || '')])).rows[0];
  if (!p) return done(false);
  if (p.status === 'paid' || p.status === 'refunded') return done(p.status === 'paid');
  let r;
  try { r = fonepay.readCallback(q); } catch { return done(false); } // not genuine: leave it pending, the order times out
  if (!r.ok) { await confirmPayment(p.id, { outcome: 'failed', raw: { callback: r.raw } }); return done(false); }
  if (r.amount !== p.amount) { await confirmPayment(p.id, { outcome: 'failed', raw: { callback: r.raw, mismatch: true }, reason: 'The payment did not match the order' }); return done(false); }
  await confirmPayment(p.id, { ref: r.ref, raw: { callback: r.raw } });
  return done(true);
}
