import { Router } from 'express';
import { query } from '../lib/db.js';
import { wrap, notFound } from '../lib/http.js';
import { stationMenu, bestSellers, liveOffers } from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';
import { vapidPublicKey } from '../lib/push.js';
import { rt } from '../lib/runtime.js';
import { loadSite } from '../lib/site.js';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';
import { notify, audit } from '../lib/notify.js';

export const pub = Router();

const km = (a, b, c, d) => {
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

pub.get('/config', wrap(async (_req, res) => {
  const s = await getSettings();
  res.json({
    brand: 'Sadhai Coffee', tagline: 'Good coffee, every day.', tagline_ne: 'सधैं राम्रो कफी।',
    pass: { price: s.pass_price, cups: s.pass_cups, valid_days: s.pass_valid_days },
    pricing: { hot: s.price_hot, flavored: s.price_flavored, iced: s.price_iced },
    partner_share_pct: s.partner_share_pct,
    payment_methods: ['cash', 'fonepay'],
    referral: { cap_month: s.referral_cap_month }, pass_use_by_days: s.pass_use_by_days, pass_valid_days: s.pass_valid_days,
    vapid_public_key: vapidPublicKey(),
    site: { company: rt('company_name'), address: rt('company_address'), support_email: rt('support_email'), privacy_email: rt('privacy_email') },
  });
}));

pub.get('/stations', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, code, name, name_ne, address, district, lat, lng, opens, closes, is_open, accepting_orders, prep_target_seconds, operator_type, partner_name,
            ((now() AT TIME ZONE 'Asia/Kathmandu')::time BETWEEN opens AND closes) AS within_hours,
            (SELECT count(*)::int FROM orders o WHERE o.station_id=stations.id AND o.status IN ('placed','preparing')) AS queue
       FROM stations WHERE active ORDER BY name`,
  );
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  const out = rows.map((s) => ({
    ...s,
    open_now: s.is_open && s.within_hours,
    wait_minutes: Math.max(1, Math.ceil((s.queue * s.prep_target_seconds) / 60)),
    distance_km: Number.isFinite(lat) && Number.isFinite(lng) && s.lat ? Math.round(km(lat, lng, Number(s.lat), Number(s.lng)) * 10) / 10 : null,
  }));
  if (Number.isFinite(lat)) out.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  res.json(out);
}));

pub.get('/stations/:id/menu', wrap(async (req, res) => {
  const { rows } = await query('SELECT id, name FROM stations WHERE id=$1 AND active', [req.params.id]);
  if (!rows[0]) throw notFound('Station not found');
  res.json({ station: rows[0], categories: await stationMenu(req.params.id) });
}));

pub.get('/drops/active', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT d.*, p.name AS product_name FROM drops d JOIN products p ON p.id=d.product_id
      WHERE d.active AND d.ends_at >= now() ORDER BY d.starts_at`,
  );
  res.json(rows.map((d) => ({ ...d, remaining: Math.max(0, d.cap - d.sold), live: new Date(d.starts_at) <= new Date() && d.sold < d.cap })));
}));

// One call for the customer home screen: menu, best sellers, offers of the day and live drops for a station.
pub.get('/stations/:id/home', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, code, name, name_ne, address, district, lat, lng, opens, closes, is_open, accepting_orders, operator_type, partner_name,
            ((now() AT TIME ZONE 'Asia/Kathmandu')::time BETWEEN opens AND closes) AS within_hours FROM stations WHERE id=$1 AND active`, [req.params.id]);
  const st = rows[0];
  if (!st) throw notFound('Station not found');
  const [categories, best, offers, drops] = await Promise.all([
    stationMenu(st.id), bestSellers(st.id), liveOffers({ query }, st.id),
    query(`SELECT d.*, p.name AS product_name FROM drops d JOIN products p ON p.id=d.product_id WHERE d.active AND d.starts_at <= now() AND d.ends_at >= now() AND d.sold < d.cap`),
  ]);
  const products = categories.flatMap((c) => c.products);
  res.json({
    station: { ...st, open_now: st.is_open && st.within_hours },
    categories,
    best_sellers: best.map((id) => products.find((p) => p.id === id)).filter((p) => p && p.available),
    offers: offers.map((o) => {
      const p = products.find((x) => x.id === o.product_id);
      return { id: o.id, title: o.title, title_ne: o.title_ne, blurb: o.blurb, scope: o.scope, pct: o.pct, offer_price: o.offer_price, product_id: o.product_id, category_id: o.category_id,
        product_name: p?.name || null, original_price: p?.offer?.original ?? p?.list_price ?? null, ends_at: o.ends_at, remaining: o.max_uses == null ? null : Math.max(0, o.max_uses - o.used) };
    }),
    drops: drops.rows.map((d) => ({ ...d, remaining: d.cap - d.sold })),
  });
}));

// Public website, kiosk and app content (hero pictures and text). Pictures the owner uploaded come back as urls.
pub.get('/site', wrap(async (_req, res) => { res.setHeader('Cache-Control', 'public, max-age=60'); res.json(await loadSite()); }));

// Uploaded pictures are immutable (new upload = new id), so they cache for a year. Only <img> use is expected.
pub.get('/media/:file', wrap(async (req, res) => {
  const id = req.params.file.split('.')[0];
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Picture not found');
  const { rows } = await query('SELECT mime, data FROM media WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('Picture not found');
  res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(rows[0].data);
}));

// Unit economics for the investor page. Shown only when the owner switches it on, from the live standard recipes and prices.
pub.get('/site/economics', wrap(async (_req, res) => {
  const inv = await loadSite('investors');
  if (!inv.show_unit_economics) return res.json({ enabled: false });
  const { rows } = await query(
    `SELECT price_tier AS tier, count(*)::int AS items, round(avg(price))::int AS price, round(avg(cost))::int AS cost FROM products WHERE active AND price_tier IS NOT NULL GROUP BY 1 ORDER BY min(price)`);
  res.json({ enabled: true, note: 'Per cup, from the current standard recipes and prices, before labour, rent and payment fees.', tiers: rows.map((r) => ({ ...r, margin: r.price - r.cost, food_cost_pct: Math.round((r.cost / r.price) * 1000) / 10 })) });
}));

// Partner and investor enquiries: open to anyone, so rate limited, consent-based and checked for bots.
const enquiryLimit = rateLimit({ windowMs: 60 * 60_000, limit: 6, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages from this connection. Please try again later.' } });
pub.post('/enquiries', enquiryLimit, wrap(async (req, res) => {
  const b = z.object({
    kind: z.enum(['partner', 'investor', 'other']), name: z.string().trim().min(2).max(80), email: z.string().email().max(120).optional().or(z.literal('')),
    phone: z.string().trim().max(30).optional(), org: z.string().trim().max(100).optional(), city: z.string().trim().max(60).optional(),
    message: z.string().trim().max(1000).optional(), extra: z.record(z.union([z.string().max(100), z.number()])).optional(), consent: z.literal(true, { errorMap: () => ({ message: 'Please agree so we can contact you' }) }),
    website: z.string().max(0).optional(), // hidden field: real people leave it empty
  }).parse(req.body);
  if (!b.email && !b.phone) return res.status(400).json({ error: 'Add an email or a phone number so we can reply.' });
  const ip = crypto.createHash('sha256').update(`${req.ip}|${process.env.JWT_SECRET || 'x'}`).digest('hex').slice(0, 24);
  const { rows } = await query(
    `INSERT INTO enquiries(kind, name, email, phone, org, city, message, extra, consent, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING id`,
    [b.kind, b.name, b.email || null, b.phone || null, b.org || null, b.city || null, b.message || null, JSON.stringify(b.extra || {}), ip]);
  const owners = (await query(`SELECT id FROM users WHERE role='owner' AND active`)).rows;
  for (const o of owners) await notify(o.id, { kind: 'system', title: `New ${b.kind} enquiry`, body: `${b.name}${b.org ? `, ${b.org}` : ''}${b.city ? ` in ${b.city}` : ''}`, data: { url: '/owner#enquiries' } });
  await audit(null, 'enquiry.new', 'enquiry', rows[0].id, { kind: b.kind });
  res.status(201).json({ ok: true });
}));
