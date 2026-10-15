import { query } from './db.js';
import { releaseDueOrders } from './orders.js';
import { notify } from './notify.js';
import { getSettings } from './settings.js';
import { normalizePhone } from './http.js';
import { addDays, closeStaleShifts, todayNpt } from './roster.js';

const CUSTOMER = `u.role='customer' AND u.active`;

/** Resolve an audience definition to customer ids. */
export async function audienceUsers(a) {
  let sql, params = [];
  switch (a.type) {
    case 'all': sql = `SELECT u.id FROM users u WHERE ${CUSTOMER}`; break;
    case 'inactive_14d':
      sql = `SELECT u.id FROM users u WHERE ${CUSTOMER} AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.status='picked_up')
              AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.created_at > now() - interval '14 days')`; break;
    case 'pass_expiring':
      sql = `SELECT DISTINCT u.id FROM users u JOIN passes p ON p.user_id=u.id WHERE ${CUSTOMER} AND p.status='active' AND p.used_cups < p.total_cups AND p.expires_at BETWEEN now() AND now() + interval '5 days'`; break;
    case 'station_visitors':
      sql = `SELECT DISTINCT u.id FROM users u JOIN orders o ON o.user_id=u.id WHERE ${CUSTOMER} AND o.station_id=$1 AND o.created_at > now() - interval '60 days'`; params = [a.station_id]; break;
    case 'phone':
      sql = `SELECT u.id FROM users u WHERE ${CUSTOMER} AND u.phone=$1`; params = [normalizePhone(a.phone)]; break;
    default: return [];
  }
  return (await query(sql, params)).rows.map((r) => r.id);
}

export async function deviceCounts(userIds) {
  if (!userIds.length) return { users: 0, devices: 0 };
  const { rows } = await query(`SELECT count(DISTINCT user_id)::int AS users, count(*)::int AS devices FROM push_tokens WHERE active AND user_id = ANY($1)`, [userIds]);
  return rows[0];
}

const inQuietHours = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kathmandu' }).format(new Date())); return h >= 21 || h < 7; };

async function overPromoCap(userId, cap) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='promo' AND created_at > now() - interval '24 hours'`, [userId]);
  return rows[0].n >= cap;
}

/** Sends a stored campaign now. Promo caps apply: nobody gets more than the daily limit. */
export async function processCampaign(id) {
  const claimed = await query(`UPDATE push_campaigns SET status='sending' WHERE id=$1 AND status='scheduled' RETURNING *`, [id]);
  const c = claimed.rows[0];
  if (!c) return null;
  try {
    const cap = (await getSettings()).promo_push_daily_cap;
    const users = await audienceUsers(c.audience);
    let sent = 0;
    for (let i = 0; i < users.length; i += 10) {
      await Promise.all(users.slice(i, i + 10).map(async (uid) => {
        if (await overPromoCap(uid, cap)) return;
        await notify(uid, { kind: 'promo', title: c.title, body: c.body, data: { campaign_id: c.id, url: '/offers' } });
        sent++;
      }));
    }
    await query(`UPDATE push_campaigns SET status='sent', sent_at=now(), recipients=$2 WHERE id=$1`, [id, sent]);
    return { sent, audience: users.length };
  } catch (e) {
    await query(`UPDATE push_campaigns SET status='failed' WHERE id=$1`, [id]);
    throw e;
  }
}

export async function runDueCampaigns() {
  const { rows } = await query(`SELECT id FROM push_campaigns WHERE status='scheduled' AND scheduled_for <= now() ORDER BY scheduled_for LIMIT 5`);
  for (const r of rows) await processCampaign(r.id).catch((e) => console.error('campaign failed', e.message));
  return rows.length;
}

/* ---------------------------------------------------------- automations */

// Each automation sends a given message to a given customer at most once (auto_push_log).
async function once(userId, key, msg) {
  const ins = await query('INSERT INTO auto_push_log(user_id, key) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [userId, key]);
  if (!ins.rowCount) return false;
  await notify(userId, msg);
  return true;
}
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' });

export async function runAutomations({ ignoreQuietHours = false } = {}) {
  const s = await getSettings();
  const out = { pass_expiry: 0, pass_low: 0, winback: 0, offers: 0, drops: 0, shift_reminder: 0, shifts_closed: 0 };
  const quiet = !ignoreQuietHours && inQuietHours();

  if (s.auto_pass_expiry) {
    const { rows } = await query(
      `SELECT p.id, p.user_id, p.code, p.total_cups - p.used_cups AS remaining, p.expires_at FROM passes p JOIN users u ON u.id=p.user_id AND u.active
        WHERE p.status='active' AND p.activated_at IS NOT NULL AND p.used_cups < p.total_cups AND p.expires_at BETWEEN now() AND now() + interval '3 days'`);
    for (const p of rows) if (await once(p.user_id, `pass_exp:${p.id}`, { kind: 'pass', title: `${p.remaining} cup${p.remaining > 1 ? 's' : ''} left on pass ${p.code}`, body: `It ends on ${fmtDay(p.expires_at)}. Use them at any Sadhai counter.`, data: { url: '/offers' } })) out.pass_expiry++;
  }
  if (s.auto_pass_low) {
    const { rows } = await query(
      `SELECT p.id, p.user_id, p.code, p.total_cups - p.used_cups AS remaining, p.expires_at FROM passes p JOIN users u ON u.id=p.user_id AND u.active
        WHERE p.status='active' AND p.activated_at IS NOT NULL AND p.used_cups < p.total_cups AND p.total_cups - p.used_cups <= 2 AND p.expires_at > now() + interval '3 days'`);
    for (const p of rows) if (await once(p.user_id, `pass_low:${p.id}:${p.remaining}`, { kind: 'pass', title: `${p.remaining === 1 ? 'One cup' : 'Two cups'} left on your pass`, body: `Renew before ${fmtDay(p.expires_at)} and keep your price.`, data: { url: '/offers' } })) out.pass_low++;
  }
  // Shift reminders are service messages for staff: sent the evening before.
  const hourNow = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kathmandu' }).format(new Date()));
  if (s.auto_shift_reminder && (ignoreQuietHours || (hourNow >= 17 && hourNow < 21))) {
    const { rows } = await query(
      `SELECT sh.id, sh.user_id, sh.start_at, sh.end_at, sh.duty, st.name AS station FROM shifts sh JOIN stations st ON st.id=sh.station_id
        WHERE sh.shift_date=$1 AND sh.status='scheduled' AND sh.published AND sh.user_id IS NOT NULL`, [addDays(todayNpt(), 1)]);
    const t = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
    for (const r of rows) if (await once(r.user_id, `shift:${r.id}`, { kind: 'system', title: `Tomorrow: ${t(r.start_at)} to ${t(r.end_at)} at ${r.station}`, body: r.duty ? `Your duty: ${r.duty}` : 'Open My shifts for your duties.', data: { url: '/station#shift' } })) out.shift_reminder++;
  }
  out.shifts_closed = (await closeStaleShifts()).closed;

  if (quiet) return { ...out, skipped: 'quiet hours (promotions resume at 07:00)' };

  const cap = s.promo_push_daily_cap;
  if (s.auto_winback) {
    const { rows } = await query(
      `SELECT u.id, (SELECT i.name FROM order_items i JOIN orders o2 ON o2.id=i.order_id JOIN products pr ON pr.id=i.product_id WHERE o2.user_id=u.id AND pr.kind='drink' GROUP BY i.name ORDER BY sum(i.qty) DESC LIMIT 1) AS fav
         FROM users u JOIN orders o ON o.user_id=u.id AND o.status='picked_up' WHERE ${CUSTOMER} GROUP BY u.id
       HAVING count(o.id) >= 2 AND max(o.created_at) BETWEEN now() - interval '45 days' AND now() - interval '14 days'
          AND NOT EXISTS (SELECT 1 FROM auto_push_log l WHERE l.user_id=u.id AND l.key LIKE 'winback:%' AND l.sent_at > now() - interval '30 days')`);
    for (const r of rows) {
      if (await overPromoCap(r.id, cap)) continue;
      if (await once(r.id, `winback:${new Date().toISOString().slice(0, 10)}`, { kind: 'promo', title: r.fav ? `Your ${r.fav} is one tap away` : 'Your coffee is one tap away', body: 'Order ahead and skip the wait.', data: { url: '/order' } })) out.winback++;
    }
  }
  const recent = `EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.created_at > now() - interval '60 days'`;
  if (s.auto_offers) {
    const { rows: offers } = await query(`SELECT * FROM daily_offers WHERE active AND starts_at <= now() AND ends_at > now() AND created_at > now() - interval '45 minutes'`);
    for (const o of offers) {
      const users = (await query(`SELECT u.id FROM users u WHERE ${CUSTOMER} AND ${recent} ${o.station_id ? 'AND o.station_id=$1' : ''})`, o.station_id ? [o.station_id] : [])).rows;
      for (const u of users) { if (await overPromoCap(u.id, cap)) continue; if (await once(u.id, `offer:${o.id}`, { kind: 'promo', title: o.title, body: o.blurb || 'Today only at your Sadhai counter.', data: { url: '/offers' } })) out.offers++; }
    }
  }
  if (s.auto_drops) {
    const { rows: drops } = await query(`SELECT * FROM drops WHERE active AND starts_at BETWEEN now() - interval '45 minutes' AND now() AND sold < cap`);
    for (const d of drops) {
      const users = (await query(`SELECT u.id FROM users u WHERE ${CUSTOMER} AND ${recent})`)).rows;
      for (const u of users) { if (await overPromoCap(u.id, cap)) continue; if (await once(u.id, `drop:${d.id}`, { kind: 'promo', title: d.name, body: `${d.cap.toLocaleString()} cups, then gone.`, data: { url: '/offers' } })) out.drops++; }
    }
  }
  return out;
}

export function startScheduler() {
  const tick = () => runDueCampaigns().catch((e) => console.error('scheduler', e.message));
  const auto = () => runAutomations().catch((e) => console.error('automations', e.message));
  setInterval(tick, 30_000).unref();
  setInterval(() => releaseDueOrders().catch((e) => console.error('release', e.message)), 30_000).unref();
  setInterval(auto, 10 * 60_000).unref();
  setTimeout(auto, 20_000).unref();
}
