import { query } from './db.js';
import { rt } from './runtime.js';
import { confirmPayment } from './orders.js';
import { startPlan, simulatorAllowed, webUrl } from './payments.js';
import * as esewa from './gateways/esewa.js';
import * as fonepay from './gateways/fonepay.js';
import * as nepalpay from './gateways/nepalpay.js';

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;

/** Where to send the customer's browser once the gateway is done with them. */
async function landing(payment, result) {
  const web = webUrl();
  if (payment.order_id) return `${web}/order/${payment.order_id}?pay=${result}`;
  if (payment.pass_id) return `${web}/account?pass=${result}`;
  return `${web}/owner#rules?pay_test=${result}`;
}

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#FBF4E8;color:#2A1810;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="max-width:380px;padding:28px;text-align:center">${body}</div></body></html>`;

/** GET /payments/:id/pay: the first step. Posts the signed form to eSewa, redirects to Fonepay, or shows the built-in test page. */
export async function startPayment(paymentId) {
  const { rows } = await query(`SELECT p.*, o.pickup_code FROM payments p LEFT JOIN orders o ON o.id=p.order_id WHERE p.id=$1`, [paymentId]);
  const p = rows[0];
  if (!p || !['esewa', 'fonepay', 'nepalpay'].includes(p.provider)) return { status: 404, html: page('Not found', '<h2>That payment link is not valid.</h2>') };
  if (p.status !== 'pending') return { redirect: await landing(p, p.status === 'paid' ? 'ok' : 'failed') };
  const plan = startPlan(p, p.pickup_code ? `Sadhai ${p.pickup_code}` : 'Sadhai Coffee');
  if (plan.type === 'redirect') return { redirect: plan.url };
  if (plan.type === 'form') {
    const inputs = Object.entries(plan.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    const host = new URL(plan.action).origin;
    return {
      csp: `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action ${host}`,
      html: page('Opening eSewa', `<h2 style="margin:0 0 8px">Opening eSewa…</h2><p>Paying ${money(p.amount)} to Sadhai Coffee.</p>
        <form id="f" method="POST" action="${esc(plan.action)}">${inputs}<noscript><button type="submit" style="padding:12px 24px;font-size:16px">Continue to eSewa</button></noscript></form>
        <script>document.getElementById('f').submit()</script>`),
    };
  }
  if (!simulatorAllowed(p)) return { status: 400, html: page('Not ready', '<h2>This payment method is not ready yet.</h2><p>Please pay with cash at the counter.</p>') };
  return {
    html: page('Test payment', `<p style="background:#F2A81D;border-radius:99px;display:inline-block;padding:4px 14px;font-weight:700">TEST MODE</p>
      <h2 style="margin:12px 0 4px">${p.provider === 'nepalpay' ? 'NepalPay' : 'Fonepay'} test payment</h2><p>${money(p.amount)} to Sadhai Coffee. No real money moves.</p>
      <form method="POST" action="/payments/${esc(p.id)}/simulate" style="display:flex;gap:10px;justify-content:center;margin-top:18px">
        <button name="outcome" value="paid" style="padding:12px 20px;font-size:16px;background:#2F5D46;color:#fff;border:0;border-radius:12px">Pay</button>
        <button name="outcome" value="failed" style="padding:12px 20px;font-size:16px;background:#fff;border:1px solid #D9C8AE;border-radius:12px">Fail</button></form>`),
  };
}

/** The built-in test page's answer. */
export async function simulate(paymentId, outcome) {
  const p = (await query('SELECT * FROM payments WHERE id=$1', [paymentId])).rows[0];
  if (!p || !simulatorAllowed(p) || p.status !== 'pending') return { redirect: p ? await landing(p, p.status === 'paid' ? 'ok' : 'failed') : webUrl() };
  const paid = outcome === 'paid';
  await confirmPayment(p.id, paid ? { ref: `TEST-${Date.now()}`, raw: { simulated: true } } : { outcome: 'failed', raw: { simulated: true } });
  return { redirect: await landing(p, paid ? 'ok' : 'failed') };
}

async function byRef(ref, provider) {
  const { rows } = await query(`SELECT * FROM payments WHERE provider=$1 AND (provider_ref=$2 OR id::text=$2) ORDER BY created_at DESC LIMIT 1`, [provider, ref]);
  return rows[0];
}

/** eSewa sent the browser back with ?data=. */
export async function esewaReturn(dataB64) {
  let d;
  try { d = esewa.readCallback(dataB64); } catch { return { redirect: `${webUrl()}/order?pay=failed` }; }
  const p = await byRef(d.transaction_uuid, 'esewa');
  if (!p) return { redirect: `${webUrl()}/order?pay=failed` };
  // A payment that already failed (for example the order was cancelled first) still has to be looked at: if the money did arrive it must be refunded.
  if (p.status === 'paid' || p.status === 'refunded') return { redirect: await landing(p, p.status === 'paid' ? 'ok' : 'failed') };
  const total = Math.round(Number(String(d.total_amount).replace(/,/g, '')));
  if (String(d.status).toUpperCase() !== 'COMPLETE') {
    await confirmPayment(p.id, { outcome: 'failed', raw: { callback: d } });
    return { redirect: await landing(p, 'failed') };
  }
  if (total !== p.amount || d.product_code !== esewa.productCode()) {
    await confirmPayment(p.id, { outcome: 'failed', raw: { callback: d, mismatch: true }, reason: 'The payment did not match the order' });
    return { redirect: await landing(p, 'failed') };
  }
  // Signed answer says paid. Ask eSewa once more. Live mode needs eSewa to agree; Sandbox may accept the signed answer if eSewa cannot be reached.
  const st = await esewa.checkStatus({ uuid: d.transaction_uuid, amount: p.amount });
  if (st && st.state === 'COMPLETE') {
    await confirmPayment(p.id, { ref: d.transaction_code || st.ref, raw: { callback: d, status_check: st.raw } });
    return { redirect: await landing(p, 'ok') };
  }
  if (!st && esewa.mode() === 'sandbox') {
    await confirmPayment(p.id, { ref: d.transaction_code, raw: { callback: d, status_check: 'unreachable' } });
    return { redirect: await landing(p, 'ok') };
  }
  return { redirect: await landing(p, 'pending') }; // the minute-by-minute check will settle it
}

/** eSewa sent the browser to the failure address. */
export async function esewaFailed(paymentId) {
  const p = (await query('SELECT * FROM payments WHERE id=$1', [paymentId])).rows[0];
  if (!p) return { redirect: webUrl() };
  if (p.status === 'pending') await confirmPayment(p.id, { outcome: 'failed', raw: { eSewa: 'failure_url' } });
  return { redirect: await landing((await query('SELECT * FROM payments WHERE id=$1', [paymentId])).rows[0], 'failed') };
}

/** Fonepay sent the browser back with PRN, PS, RC, UID and a signature. */
export const fonepayReturn = (q) => signedReturn('fonepay', fonepay, q);
export const nepalpayReturn = (q) => signedReturn('nepalpay', nepalpay, q);
async function signedReturn(provider, gw, q) {
  const p = await byRef(String(q.PRN || ''), provider);
  if (!p) return { redirect: `${webUrl()}/order?pay=failed` };
  if (p.status === 'paid' || p.status === 'refunded') return { redirect: await landing(p, p.status === 'paid' ? 'ok' : 'failed') };
  let r;
  try { r = gw.readCallback(q); } catch { return { redirect: await landing(p, 'failed') }; } // not genuine: leave it pending, the order times out
  if (!r.ok) {
    await confirmPayment(p.id, { outcome: 'failed', raw: { callback: r.raw } });
    return { redirect: await landing(p, 'failed') };
  }
  if (r.amount !== p.amount) {
    await confirmPayment(p.id, { outcome: 'failed', raw: { callback: r.raw, mismatch: true }, reason: 'The payment did not match the order' });
    return { redirect: await landing(p, 'failed') };
  }
  await confirmPayment(p.id, { ref: r.ref, raw: { callback: r.raw } });
  return { redirect: await landing(p, 'ok') };
}

export const paymentDetail = async (id) => (await query('SELECT * FROM payments WHERE id=$1', [id])).rows[0];
