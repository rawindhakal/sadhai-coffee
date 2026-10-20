import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query } from '../lib/db.js';
import { wrap, bad, notFound, forbidden, normalizePhone } from '../lib/http.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { createOrder, fullOrder } from '../lib/orders.js';
import { sid } from './station.js';

// Self-ordering kiosk. The tablet is signed in as that station's staff account, so orders are pinned to the station.
export const kiosk = Router();
kiosk.use(authenticate, requireRole('station', 'manager', 'owner'));
kiosk.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down for a moment.' } }));

const orderSchema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(10).default(1), option_ids: z.array(z.string().uuid()).default([]) })).min(1).max(20),
  customer_name: z.string().trim().min(2, 'Enter your name').max(40),
  customer_phone: z.string(),
  payment: z.enum(['counter', 'pass', 'fonepay', 'esewa', 'khalti']),
  pass_code: z.string().trim().max(20).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept so we can call your order' }) }),
  note: z.string().max(200).optional(),
});

// A pass is used only when the code AND the phone number on the account both match.
async function passOwner(code, phone) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.role FROM passes p JOIN users u ON u.id=p.user_id
      WHERE upper(p.code)=upper($1) AND p.status='active' AND u.active AND u.role='customer'`, [code],
  );
  if (!rows[0] || rows[0].phone !== phone) throw forbidden('That pass code does not match this phone number');
  return rows[0];
}

kiosk.get('/pass-check', wrap(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const owner = await passOwner(String(req.query.code || ''), phone);
  const { rows } = await query(
    `SELECT total_cups - used_cups AS remaining FROM passes WHERE user_id=$1 AND status='active' AND expires_at > now() AND used_cups < total_cups`, [owner.id],
  );
  res.json({ ok: true, name: owner.name.split(' ')[0], passes: rows.length, remaining: rows.reduce((a, r) => a + r.remaining, 0) });
}));

kiosk.post('/orders', wrap(async (req, res) => {
  const stationId = await sid(req);
  const b = orderSchema.parse(req.body);
  const phone = normalizePhone(b.customer_phone);
  let user = null;
  let method = b.payment === 'counter' ? 'cash' : b.payment;
  if (b.payment === 'pass') {
    if (!b.pass_code) throw bad('Enter your pass code');
    user = await passOwner(b.pass_code, phone);
  } else {
    user = (await query(`SELECT id, name, phone, role FROM users WHERE phone=$1 AND role='customer' AND active`, [phone])).rows[0] || null;
  }
  const out = await createOrder(user, { items: b.items, station_id: stationId, payment_method: method, channel: 'kiosk', customer_name: b.customer_name, customer_phone: phone, note: b.note });
  res.status(201).json(out);
}));

kiosk.get('/orders/:id', wrap(async (req, res) => {
  const o = await fullOrder(req.params.id, undefined, { reveal: true });
  if (!o) throw notFound('Order not found');
  const stationId = await sid(req);
  if (o.station_id !== stationId) throw forbidden();
  res.json({ id: o.id, pickup_code: o.pickup_code, handover_code: o.handover_code, status: o.status, payment_status: o.payment_status, payment_method: o.payment_method, total: o.total, customer_name: o.customer_name, payment_id: o.payment_id });
}));
