import { Router } from 'express';
import { query } from '../lib/db.js';
import { wrap, notFound } from '../lib/http.js';
import { stationMenu, bestSellers, liveOffers } from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';
import { vapidPublicKey } from '../lib/push.js';

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
    payment_methods: ['cash', 'esewa', 'khalti', 'fonepay'],
    referral: { cap_month: s.referral_cap_month }, pass_use_by_days: s.pass_use_by_days, pass_valid_days: s.pass_valid_days,
    vapid_public_key: vapidPublicKey(),
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
