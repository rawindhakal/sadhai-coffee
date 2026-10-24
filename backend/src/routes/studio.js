import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { wrap, bad, notFound } from '../lib/http.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { audit } from '../lib/notify.js';
import { DEFS, describeRuntime, setRuntime, rt } from '../lib/runtime.js';
import { SITE_DEFAULTS, loadSite, mediaUrl } from '../lib/site.js';
import { getSettings } from '../lib/settings.js';
import { todayNpt, addDays } from '../lib/roster.js';

/** Owner-only: integration keys, pictures and website content. */
export const studio = Router();
studio.use(authenticate, requireRole('owner'));

/* ---------------- integrations and keys ---------------- */
studio.get('/integrations', wrap(async (_req, res) => res.json(await describeRuntime())));

studio.put('/integrations', wrap(async (req, res) => {
  const values = z.record(z.union([z.string(), z.boolean(), z.null()])).parse(req.body?.values || {});
  const changed = [];
  for (const [key, v] of Object.entries(values)) {
    if (!DEFS[key]) throw bad(`Unknown setting ${key}`);
    if (v === undefined) continue;
    try { await setRuntime(key, v === null ? '' : v, req.user.id); } catch (e) { throw bad(e.message); }
    changed.push(key);
  }
  if (changed.length) await audit(req.user.id, 'integrations.update', 'settings', null, { keys: changed }); // key names only, never values
  res.json({ ok: true, changed, settings: await describeRuntime() });
}));

/* ---------------- pictures ---------------- */
const mediaJson = express.json({ limit: '6mb' });
const SVG_BAD = /<script|<foreignObject|<iframe|<object|<embed|<animate|<set\b|<use\b|<feImage|<handler|<a[\s>]|<!ENTITY|javascript:|data:\s*text\/html|&#x?[0-9a-f]+;|\bon[a-z]+\s*=|\bhref\s*=\s*["']\s*(?!#)|xlink:href\s*=\s*["']\s*(?!#)/i;
function sniff(buf, mime) {
  const h = buf.subarray(0, 12);
  if (mime === 'image/png') return h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  if (mime === 'image/jpeg') return h[0] === 0xff && h[1] === 0xd8;
  if (mime === 'image/webp') return h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/svg+xml') { const t = buf.toString('utf8'); return /<svg[\s>]/i.test(t) && !SVG_BAD.test(t); }
  return false;
}
studio.post('/media', mediaJson, wrap(async (req, res) => {
  const b = z.object({ filename: z.string().max(120), mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']), data: z.string().min(20) }).parse(req.body);
  const buf = Buffer.from(b.data.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length > 3 * 1024 * 1024) throw bad('That picture is larger than 3 MB. Use a smaller file.');
  if (!sniff(buf, b.mime)) throw bad(b.mime === 'image/svg+xml' ? 'That SVG contains scripts or unsafe parts and was refused.' : 'That file is not a real picture of that type.');
  const { rows } = await query('INSERT INTO media(filename, mime, size, data, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, mime', [b.filename.replace(/[^\w.\- ]/g, '_'), b.mime, buf.length, buf, req.user.id]);
  await audit(req.user.id, 'media.upload', 'media', rows[0].id, { filename: b.filename, size: buf.length });
  res.status(201).json({ id: rows[0].id, url: mediaUrl(rows[0].id, rows[0].mime) });
}));
studio.get('/media', wrap(async (_req, res) => {
  const { rows } = await query('SELECT id, filename, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 100');
  res.json(rows.map((m) => ({ ...m, url: mediaUrl(m.id, m.mime) })));
}));
studio.delete('/media/:id', wrap(async (req, res) => {
  await query('DELETE FROM media WHERE id=$1', [req.params.id]);
  await audit(req.user.id, 'media.delete', 'media', req.params.id);
  res.json({ ok: true });
}));

/* ---------------- website, kiosk and app content ---------------- */
const mid = z.string().uuid().nullable();
const sections = {
  hero: z.object({
    headline_en: z.string().max(80), headline_ne: z.string().max(120), sub_en: z.string().max(140), sub_ne: z.string().max(200),
    primary_cta: z.string().max(30), secondary_cta: z.string().max(30),
    portrait: mid.nullable().default(null),
  }),
  marquee: z.string().max(300),
  partners: z.object({
    headline: z.string().max(80), intro: z.string().max(400), requirements: z.array(z.string().max(160)).max(10),
    }),
  investors: z.object({
    headline: z.string().max(90), intro: z.string().max(400), why: z.array(z.string().max(300)).max(8), model: z.array(z.string().max(200)).max(8),
    metrics: z.array(z.object({ label: z.string().max(40), value: z.string().max(30), note: z.string().max(100).optional() })).max(8),
    roadmap: z.array(z.object({ when: z.string().max(30), what: z.string().max(200) })).max(8), use_of_funds: z.array(z.object({ label: z.string().max(50), pct: z.number().min(0).max(100) })).max(8),
    risks: z.array(z.string().max(240)).max(10), deck_url: z.string().max(300).refine((v) => v === '' || /^https:\/\//.test(v), 'Use an https:// address'), show_unit_economics: z.boolean(), contact_note: z.string().max(200),
  }),
};
studio.get('/site', wrap(async (_req, res) => res.json({ content: await loadSite(), defaults: SITE_DEFAULTS })));
studio.put('/site/:section', wrap(async (req, res) => {
  const schema = sections[req.params.section];
  if (!schema) throw notFound('Unknown section');
  const value = schema.parse(req.body);
  await query(`INSERT INTO site_content(key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=now()`, [req.params.section, JSON.stringify(value), req.user.id]);
  await audit(req.user.id, 'site.update', 'site', req.params.section);
  res.json({ ok: true, content: await loadSite(req.params.section) });
}));
studio.delete('/site/:section', wrap(async (req, res) => {
  await query('DELETE FROM site_content WHERE key=$1', [req.params.section]);
  await audit(req.user.id, 'site.reset', 'site', req.params.section);
  res.json({ ok: true, content: await loadSite(req.params.section) });
}));

/* ---------------- setup checklist: what is done and what is left ---------------- */
studio.get('/setup', wrap(async (req, res) => {
  const one = async (sql, p = []) => (await query(sql, p)).rows[0];
  const [st, menu, rec, ing, team, ros, site, enq, ownerUser] = await Promise.all([
    one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.station_id=s.id AND u.role='station' AND u.active) OR NOT EXISTS (SELECT 1 FROM station_managers m WHERE m.station_id=s.id))::int AS incomplete FROM stations s WHERE s.active`),
    one(`SELECT count(*)::int AS n FROM products WHERE active AND price > 0`),
    one(`SELECT count(*) FILTER (WHERE kind <> 'merch' AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.product_id=p.id))::int AS missing FROM products p WHERE active`),
    one(`SELECT count(*) FILTER (WHERE pack_price = 0)::int AS unpriced, count(*) FILTER (WHERE supplier_id IS NULL AND tracked)::int AS no_supplier FROM ingredients`),
    one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE COALESCE(p.hourly_rate,0) = 0)::int AS unpaid FROM users u LEFT JOIN staff_profiles p ON p.user_id=u.id WHERE u.role='station' AND u.active`),
    one(`SELECT count(*) FILTER (WHERE user_id IS NULL AND status='open')::int AS open, count(*) FILTER (WHERE user_id IS NOT NULL AND NOT published)::int AS unpublished, count(*)::int AS n FROM shifts WHERE shift_date BETWEEN $1 AND $2 AND status <> 'cancelled'`, [todayNpt(), addDays(todayNpt(), 6)]),
    one(`SELECT count(*)::int AS n FROM site_content WHERE key='hero'`),
    one(`SELECT count(*)::int AS n FROM enquiries WHERE status='new'`),
    one(`SELECT password_hash FROM users WHERE id=$1`, [req.user.id]),
  ]);
  const companyDone = rt('support_email') !== DEFS.support_email.def && rt('company_name') !== 'Sadhai Coffee';
  const usingDemoPassword = ownerUser?.password_hash ? await bcrypt.compare('Sadhai@123', ownerUser.password_hash) : false;
  const steps = [
    { key: 'security', title: 'Change the default owner password', done: !usingDemoPassword, detail: usingDemoPassword ? 'Still using the demo seed password (Sadhai@123) — change it before going live' : 'Custom owner password set', section: 'staff' },
    { key: 'stations', title: 'Add your stations and give each a manager and staff', done: st.n > 0 && st.incomplete === 0, detail: st.n ? (st.incomplete ? `${st.incomplete} of ${st.n} still need a manager or staff` : `${st.n} stations ready`) : 'No stations yet', section: 'stations' },
    { key: 'menu', title: 'Check the menu and the three drink prices', done: menu.n >= 5, detail: `${menu.n} items on the menu`, section: 'rules' },
    { key: 'recipes', title: 'Give every item its standard recipe', done: rec.missing === 0, detail: rec.missing ? `${rec.missing} items have no recipe` : 'All items have a recipe', section: 'recipes' },
    { key: 'ingredients', title: 'Enter ingredient prices and suppliers', done: ing.unpriced === 0 && ing.no_supplier === 0, detail: ing.unpriced || ing.no_supplier ? `${ing.unpriced} without a price, ${ing.no_supplier} without a supplier` : 'All priced', section: 'inventory' },
    { key: 'team', title: 'Add your team and their hourly rates', done: team.n > 0 && team.unpaid === 0, detail: team.n ? (team.unpaid ? `${team.unpaid} of ${team.n} have no hourly rate` : `${team.n} staff with rates`) : 'No staff yet', section: 'staff' },
    { key: 'roster', title: 'Fill and publish this week’s roster', done: ros.n > 0 && ros.open === 0 && ros.unpublished === 0, detail: ros.n ? `${ros.open} open slots, ${ros.unpublished} not published` : 'No shifts planned for the next 7 days', section: 'staff' },
    { key: 'company', title: 'Add your company details for the legal pages', done: companyDone, detail: companyDone ? 'Saved' : 'Still showing the placeholder name and email', section: 'rules' },
    { key: 'site', title: 'Make the home page yours', done: site.n > 0, detail: site.n ? 'Customised' : 'Using the built-in hero artwork', section: 'site' },
  ];
  res.json({ steps, done: steps.filter((s) => s.done).length, total: steps.length, enquiries: enq.n });
}));
