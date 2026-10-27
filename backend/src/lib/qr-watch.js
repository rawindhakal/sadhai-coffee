import WebSocket from 'ws';
import { query } from './db.js';
import { rt } from './runtime.js';
import { confirmPayment } from './orders.js';
import * as nepalpay from './gateways/nepalpay.js';

/**
 * Listens to NCHL's NepalPay QR WebSocket channel (STOMP) for one payment until it is paid, fails for good, or 15 minutes pass.
 * The server tells us what happened to the QR we showed, so no polling is needed. A restart picks the open payments up again.
 */
const open = new Map();
const NUL = '\0';
const frame = (cmd, headers, body = '') => `${cmd}\n${Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${body}${NUL}`;

export function watchNepalpay(payment) {
  if (open.has(payment.id) || nepalpay.missing().length) return;
  const ref = payment.provider_ref || nepalpay.reference(payment.id);
  const left = Math.max(10_000, 15 * 60_000 - (Date.now() - new Date(payment.created_at).getTime()));
  let ws;
  const stop = () => { clearTimeout(timer); open.delete(payment.id); try { ws?.close(); } catch { /* already closed */ } };
  const timer = setTimeout(stop, left);
  open.set(payment.id, stop);
  try {
    ws = new WebSocket(nepalpay.wsUrl(), ['v12.stomp', 'v11.stomp']);
  } catch (e) { console.error('nepalpay ws', e.message); stop(); return; }
  ws.on('open', () => ws.send(frame('CONNECT', { 'accept-version': '1.2,1.1', 'heart-beat': '10000,10000' })));
  ws.on('error', (e) => { console.error('nepalpay ws', e.message); stop(); });
  ws.on('close', () => { clearTimeout(timer); open.delete(payment.id); });
  ws.on('message', async (data) => {
    const text = data.toString();
    if (text === '\n') return; // heart-beat
    const cmd = text.split('\n', 1)[0];
    if (cmd === 'CONNECTED') {
      ws.send(frame('SUBSCRIBE', { id: 'sub-0', destination: '/user/nqrws/check-txn-status' }));
      ws.send(frame('SEND', { destination: '/nqrws/check-txn-status', 'content-type': 'application/json' },
        JSON.stringify({ merchant_id: nepalpay.merchantId(), request_id: ref, username: rt('nepalpay_username'), api_token: nepalpay.encryptToken() })));
    } else if (cmd === 'MESSAGE') {
      let m;
      try { m = JSON.parse(text.slice(text.indexOf('\n\n') + 2).replace(/\0$/, '')); } catch { return; }
      if (m.txn_id && m.txn_id !== ref && m.request_id !== ref) return;
      const r = nepalpay.readMessage(m);
      if (!r.done) return;
      if (r.ok) { await confirmPayment(payment.id, { ref: m.txn_id || ref, raw: { nepalpay: m } }).catch((e) => console.error('nepalpay confirm', e.message)); stop(); }
      else await query(`UPDATE payments SET raw = COALESCE(raw,'{}'::jsonb) || $2::jsonb WHERE id=$1`, [payment.id, JSON.stringify({ nepalpay_last: m })]).catch(() => {});
    }
  });
}

/** After a restart: listen again for payments that are still waiting. */
export async function resumeWatchers() {
  if (nepalpay.missing().length) return;
  const { rows } = await query(`SELECT * FROM payments WHERE provider='nepalpay' AND status='pending' AND created_at > now() - interval '15 minutes'`);
  rows.forEach(watchNepalpay);
}
