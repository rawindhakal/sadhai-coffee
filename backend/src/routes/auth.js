import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../lib/db.js';
import { wrap, bad, normalizePhone, HttpError } from '../lib/http.js';
import { authenticate, signAccess, issueRefresh, hashToken } from '../lib/auth.js';
import { issueSignupLadder } from '../lib/orders.js';
import { notify } from '../lib/notify.js';

export const auth = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a minute.' } });

const publicUser = (u) => ({
  id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, station_id: u.station_id, lang: u.lang,
  referral_code: u.referral_code, beans: u.beans, notif_offers: u.notif_offers, warehouse: !!u.warehouse,
});

const genCode = (name) => `${name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'S')}${crypto.randomInt(100, 999)}`;

async function session(u) {
  return { user: publicUser(u), access_token: signAccess(u), refresh_token: await issueRefresh(u.id) };
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string(),
  password: z.string().min(6).max(72),
  email: z.string().email().optional().or(z.literal('')),
  referral_code: z.string().trim().max(20).optional(),
  lang: z.enum(['en', 'ne']).optional(),
});

auth.post('/register', limiter, wrap(async (req, res) => {
  const b = registerSchema.parse(req.body);
  const phone = normalizePhone(b.phone);
  const hash = await bcrypt.hash(b.password, 10);
  const user = await tx(async (db) => {
    const exists = await db.query('SELECT 1 FROM users WHERE phone=$1', [phone]);
    if (exists.rowCount) throw new HttpError(409, 'This number already has an account. Sign in instead.');
    let referrer = null;
    if (b.referral_code) {
      referrer = (await db.query('SELECT id FROM users WHERE referral_code=$1 AND active', [b.referral_code.toUpperCase()])).rows[0];
      if (!referrer) throw bad('That referral code does not exist');
    }
    let code;
    for (let i = 0; i < 5; i++) {
      code = genCode(b.name);
      if (!(await db.query('SELECT 1 FROM users WHERE referral_code=$1', [code])).rowCount) break;
    }
    const { rows } = await db.query(
      `INSERT INTO users(phone, name, email, password_hash, lang, referral_code, referred_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [phone, b.name, b.email || null, hash, b.lang || 'en', code, referrer?.id || null],
    );
    if (referrer) await db.query('INSERT INTO referrals(referrer_id, referee_id) VALUES ($1,$2)', [referrer.id, rows[0].id]);
    await issueSignupLadder(rows[0].id, db);
    return rows[0];
  });
  await notify(user.id, { kind: 'info', title: 'Your first Americano is free', body: 'Order ahead in the app. One per customer. Valid 14 days.' });
  res.status(201).json(await session(user));
}));

auth.post('/login', limiter, wrap(async (req, res) => {
  const b = z.object({ phone: z.string(), password: z.string() }).parse(req.body);
  const phone = normalizePhone(b.phone);
  const { rows } = await query('SELECT * FROM users WHERE phone=$1', [phone]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(b.password, u.password_hash))) throw new HttpError(401, 'Phone number or password is wrong');
  await query('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]);
  res.json(await session(u));
}));

auth.post('/refresh', limiter, wrap(async (req, res) => {
  const { refresh_token } = z.object({ refresh_token: z.string() }).parse(req.body);
  const h = hashToken(refresh_token);
  const { rows } = await query(
    `UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1 AND NOT revoked AND expires_at > now() RETURNING user_id`, [h],
  );
  if (!rows[0]) throw new HttpError(401, 'Please sign in again', 'refresh_invalid');
  const u = (await query('SELECT * FROM users WHERE id=$1 AND active', [rows[0].user_id])).rows[0];
  if (!u) throw new HttpError(401, 'Please sign in again');
  res.json(await session(u));
}));

auth.post('/logout', wrap(async (req, res) => {
  const t = req.body?.refresh_token;
  if (t) await query('UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1', [hashToken(t)]);
  res.json({ ok: true });
}));

export const me = Router();
me.use(authenticate);
me.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  const station = req.user.station_id ? (await query('SELECT id, name, code FROM stations WHERE id=$1', [req.user.station_id])).rows[0] : null;
  res.json({ ...publicUser(rows[0]), station });
}));
me.patch('/', wrap(async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(2).max(60).optional(), email: z.string().email().optional(), lang: z.enum(['en', 'ne']).optional(),
    push_token: z.string().max(400).optional(), notif_offers: z.boolean().optional(), current_password: z.string().optional(), new_password: z.string().min(6).max(72).optional(),
  }).parse(req.body);
  if (b.new_password) {
    const u = (await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!b.current_password || !(await bcrypt.compare(b.current_password, u.password_hash))) throw bad('Your current password is wrong');
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await bcrypt.hash(b.new_password, 10)]);
    await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [req.user.id]);
  }
  await query(
    `UPDATE users SET name=COALESCE($2,name), email=COALESCE($3,email), lang=COALESCE($4,lang), push_token=COALESCE($5,push_token), notif_offers=COALESCE($6,notif_offers) WHERE id=$1`,
    [req.user.id, b.name, b.email, b.lang, b.push_token, b.notif_offers],
  );
  const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  res.json(publicUser(rows[0]));
}));

// Account deletion (required by Google Play and the App Store). Personal data is erased; order and payment records stay,
// pseudonymised, because they are financial records the business must keep.
me.delete('/', wrap(async (req, res) => {
  const { password } = z.object({ password: z.string() }).parse(req.body);
  if (req.user.role !== 'customer') throw bad('Staff accounts are removed by the owner under Team.');
  const u = (await query('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Your password is wrong');
  const live = (await query(`SELECT count(*)::int AS n FROM orders WHERE user_id=$1 AND status IN ('awaiting_payment','placed','preparing','ready')`, [u.id])).rows[0].n;
  if (live) throw new HttpError(409, 'You have an order in progress. Pick it up or cancel it, then delete your account.', 'order_in_progress');
  await tx(async (db) => {
    await db.query(
      `UPDATE users SET name='Deleted customer', phone=$2, email=NULL, password_hash=$3, push_token=NULL, referral_code=NULL, active=false, lang='en' WHERE id=$1`,
      [u.id, `deleted:${u.id}`, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 6)],
    );
    await db.query('DELETE FROM refresh_tokens WHERE user_id=$1', [u.id]);
    await db.query('DELETE FROM notifications WHERE user_id=$1', [u.id]);
    await db.query('DELETE FROM push_tokens WHERE user_id=$1', [u.id]);
    await db.query(`UPDATE coupons SET status='expired' WHERE user_id=$1 AND status='active'`, [u.id]);
    await db.query(`UPDATE passes SET status='expired' WHERE user_id=$1 AND status='active'`, [u.id]);
    await db.query(`UPDATE orders SET customer_name=NULL, note=NULL, rating_note=NULL WHERE user_id=$1`, [u.id]);
    await db.query(`INSERT INTO audit_log(actor_id, action, entity, entity_id) VALUES ($1,'account.delete','user',$2)`, [u.id, String(u.id)]);
  });
  res.json({ ok: true });
}));

// A copy of everything we hold about the signed-in customer.
me.get('/export', wrap(async (req, res) => {
  const [user, orders, coupons, passes, referrals] = await Promise.all([
    query('SELECT id, name, phone, email, lang, beans, referral_code, created_at FROM users WHERE id=$1', [req.user.id]),
    query(`SELECT o.pickup_code, o.status, o.total, o.discount, o.payment_method, o.created_at, s.name AS station,
                  (SELECT json_agg(json_build_object('item', i.name, 'qty', i.qty, 'price', i.unit_price)) FROM order_items i WHERE i.order_id=o.id) AS items
             FROM orders o JOIN stations s ON s.id=o.station_id WHERE o.user_id=$1 ORDER BY o.created_at`, [req.user.id]),
    query('SELECT kind, title, status, expires_at FROM coupons WHERE user_id=$1', [req.user.id]),
    query('SELECT total_cups, used_cups, status, purchased_at, expires_at FROM passes WHERE user_id=$1', [req.user.id]),
    query('SELECT status, created_at FROM referrals WHERE referrer_id=$1 OR referee_id=$1', [req.user.id]),
  ]);
  res.setHeader('Content-Disposition', 'attachment; filename="sadhai-my-data.json"');
  res.json({ exported_at: new Date().toISOString(), profile: user.rows[0], orders: orders.rows, coupons: coupons.rows, passes: passes.rows, referrals: referrals.rows });
}));

// Device registration for push notifications. A token belongs to one user: signing in on a shared phone moves it.
me.post('/push-token', wrap(async (req, res) => {
  const b = z.object({ token: z.string().min(10).max(4000), platform: z.enum(['android', 'ios', 'web']), device_label: z.string().max(80).optional(), app_version: z.string().max(20).optional() }).parse(req.body);
  await query(
    `INSERT INTO push_tokens(user_id, platform, token, device_label, app_version) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (token) DO UPDATE SET user_id=$1, platform=$2, device_label=$4, app_version=$5, active=true, last_seen_at=now()`,
    [req.user.id, b.platform, b.token, b.device_label || null, b.app_version || null],
  );
  res.status(201).json({ ok: true });
}));
me.delete('/push-token', wrap(async (req, res) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);
  await query('DELETE FROM push_tokens WHERE token=$1 AND user_id=$2', [token, req.user.id]);
  res.json({ ok: true });
}));
