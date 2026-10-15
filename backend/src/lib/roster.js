import { query, tx } from './db.js';
import { getSettings } from './settings.js';
import { notify } from './notify.js';

/* ====================================================================================
   Rosters, duties, attendance and pay.
   Dates are Nepal calendar dates (YYYY-MM-DD). A shift is normally 6 hours.
   ==================================================================================== */
const MIN = 60000;
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const dowOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const weekStart = (d) => addDays(d, -((dowOf(d) + 6) % 7)); // Monday
const at = (date, time) => new Date(`${date}T${String(time).slice(0, 5)}:00+05:45`);
export const todayNpt = () => new Date(Date.now() + 345 * MIN).toISOString().slice(0, 10);
const eachDay = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

export const DUTY_TASKS = {
  Opening: ['Machine warm-up and a test shot', 'Check milk, ice and cup stock', 'Count the cash float', 'Open the station in the app'],
  Closing: ['Count the cash drawer and close the day', 'Count the shelves', 'Clean the machine and the counter', 'Close the station in the app'],
  Bar: ['Dial in the grinder (16 g double shot)', 'Keep the bar clean between drinks'],
  Counter: ['Say the pickup number when you hand over', 'Collect cash and mark it in the app'],
  Float: ['Restock the shelves from the back', 'Keep the pickup shelf tidy'],
};
const tasksFor = (duty) => [...new Set((duty || '').split(' + ').flatMap((d) => DUTY_TASKS[d.trim()] || []))];

export async function replaceTasks(db, shiftId, duty) {
  await db.query('DELETE FROM shift_tasks WHERE shift_id=$1 AND done_at IS NULL', [shiftId]);
  const kept = (await db.query('SELECT title FROM shift_tasks WHERE shift_id=$1', [shiftId])).rows.map((r) => r.title);
  let i = 0;
  for (const t of tasksFor(duty)) { if (!kept.includes(t)) await db.query('INSERT INTO shift_tasks(shift_id, title, sort) VALUES ($1,$2,$3)', [shiftId, t, i++]); }
}

/* ---------------------------------------------------------------- demand */
async function averageOrders(stationId, tpl) {
  const { rows } = await query(
    `SELECT (o.created_at AT TIME ZONE 'Asia/Kathmandu')::date AS d, extract(hour FROM o.created_at AT TIME ZONE 'Asia/Kathmandu')::int AS h, count(*)::int AS n
       FROM orders o WHERE o.station_id=$1 AND o.status <> 'cancelled' AND o.created_at > now() - interval '28 days' GROUP BY 1,2`, [stationId]);
  return { rows, tpl };
}
function avgFor(data, dow, tpl) {
  const startH = Number(String(tpl.start_time).slice(0, 2));
  const endH = startH + Math.ceil(Number(tpl.hours));
  const perDay = new Map();
  for (const r of data) {
    const d = new Date(r.d).toISOString().slice(0, 10);
    if (dowOf(d) !== dow) continue;
    if (r.h >= startH && r.h < endH) perDay.set(d, (perDay.get(d) || 0) + r.n);
  }
  return perDay.size ? [...perDay.values()].reduce((a, b) => a + b, 0) / perDay.size : 0;
}

/* ----------------------------------------------------------- auto assign */
/**
 * Fills the roster for a date range.
 * Rules: one shift a day per person, a fixed rest between shifts, a weekly cap on shifts and hours, approved leave and fixed days off
 * respected, preferred shift honoured when it can be, hours spread evenly, a bar-skilled person on every shift, a supervisor
 * preferred to open and close, and other stations' floaters used only when a station is short.
 */
export async function autoAssign({ stationIds, from, to, replace = true, userId = null }) {
  const s = await getSettings();
  const out = { created: 0, kept: 0, unfilled: [], warnings: [], hours: {} };
  const stations = (await query('SELECT id, name FROM stations WHERE id = ANY($1) AND active', [stationIds])).rows;
  const tplAll = (await query(`SELECT * FROM shift_templates WHERE active AND station_id = ANY($1) ORDER BY station_id, start_time`, [stationIds])).rows;
  if (!tplAll.length) { out.warnings.push('No shift times are set for these stations yet.'); return out; }

  // people who may work
  const staff = (await query(
    `SELECT u.id, u.name, u.station_id, p.* FROM users u JOIN staff_profiles p ON p.user_id=u.id WHERE u.role='station' AND u.active AND p.active`)).rows;
  const profile = new Map(staff.map((u) => [u.id, u]));

  if (replace) {
    await query(`DELETE FROM shifts WHERE station_id = ANY($1) AND shift_date BETWEEN $2 AND $3 AND auto_assigned AND status IN ('scheduled','open') AND checked_in_at IS NULL`, [stationIds, from, to]);
  }
  const existing = (await query(
    `SELECT id, station_id, template_id, user_id, shift_date::text AS d, start_at, end_at, duty FROM shifts WHERE shift_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
    [addDays(from, -14), addDays(to, 14)])).rows;
  const leave = (await query(`SELECT user_id, from_date::text AS f, to_date::text AS t FROM time_off WHERE status='approved' AND to_date >= $1 AND from_date <= $2`, [from, to])).rows;
  const onLeave = (uid, d) => leave.some((l) => l.user_id === uid && l.f <= d && d <= l.t);

  const mine = new Map(); // user -> shifts
  const add = (sh) => { if (!sh.user_id) return; if (!mine.has(sh.user_id)) mine.set(sh.user_id, []); mine.get(sh.user_id).push(sh); };
  existing.filter((e) => e.user_id).forEach((e) => add({ user_id: e.user_id, d: e.d, start: new Date(e.start_at), end: new Date(e.end_at), tpl: e.template_id }));
  const weekMin = (uid, d) => (mine.get(uid) || []).filter((x) => weekStart(x.d) === weekStart(d)).reduce((a, x) => a + (x.end - x.start) / MIN, 0);
  const weekCount = (uid, d) => (mine.get(uid) || []).filter((x) => weekStart(x.d) === weekStart(d)).length;

  const demandData = new Map();
  for (const st of stations) demandData.set(st.id, (await averageOrders(st.id)).rows);
  const slotsCreated = [];

  for (const date of eachDay(from, to)) {
    for (const st of stations) {
      const tpls = tplAll.filter((t) => t.station_id === st.id);
      const firstId = tpls[0]?.id, lastId = tpls[tpls.length - 1]?.id;
      for (const tpl of tpls) {
        const startAt = at(date, tpl.start_time), endAt = new Date(startAt.getTime() + Number(tpl.hours) * 60 * MIN);
        const have = existing.filter((e) => e.station_id === st.id && e.template_id === tpl.id && e.d === date && e.user_id).length
          + slotsCreated.filter((c) => c.station_id === st.id && c.template_id === tpl.id && c.d === date).length;
        const avg = avgFor(demandData.get(st.id), dowOf(date), tpl);
        const required = Math.max(tpl.min_staff, Math.min(tpl.max_staff, Math.ceil(avg / s.orders_per_staff_shift)));
        out.kept += have > 0 ? have : 0;
        for (let k = have; k < required; k++) {
          const assigned = [...existing, ...slotsCreated].filter((e) => e.station_id === st.id && e.template_id === tpl.id && e.d === date && e.user_id).map((e) => profile.get(e.user_id));
          const needBar = !assigned.some((p) => p?.skills?.includes('bar'));
          const isEdge = tpl.id === firstId || tpl.id === lastId;
          let best = null, bestScore = Infinity;
          for (const u of staff) {
            const home = u.station_id === st.id;
            if (!home && !u.can_float) continue;
            if ((mine.get(u.id) || []).some((x) => x.d === date)) continue;
            if (u.days_off.includes(dowOf(date)) || onLeave(u.id, date)) continue;
            if (weekCount(u.id, date) >= u.max_shifts_week) continue;
            if (weekMin(u.id, date) + Number(tpl.hours) * 60 > s.max_weekly_hours * 60) continue;
            const restMs = s.min_rest_hours * 60 * MIN;
            if ((mine.get(u.id) || []).some((x) => (x.end <= startAt && startAt - x.end < restMs) || (x.start >= endAt && x.start - endAt < restMs))) continue;
            let score = weekMin(u.id, date);
            if (u.preferred_shift !== 'any' && u.preferred_shift !== tpl.kind && !(u.preferred_shift === 'morning' && tpl.kind === 'midday')) score += 90;
            if (!home) score += 400;
            if ((mine.get(u.id) || []).some((x) => x.d === addDays(date, -1) && x.tpl === tpl.id)) score += 25;
            if (needBar && !u.skills.includes('bar')) score += 700;
            if (isEdge && (u.position === 'supervisor' || u.position === 'all_rounder')) score -= 200;
            score += (parseInt(u.id.slice(0, 4), 16) % 10) / 10; // stable tie-break
            if (score < bestScore) { best = u; bestScore = score; }
          }
          const row = { station_id: st.id, template_id: tpl.id, d: date, start: startAt, end: endAt };
          if (best) { slotsCreated.push({ ...row, user_id: best.id, rate: best.hourly_rate }); add({ user_id: best.id, d: date, start: startAt, end: endAt, tpl: tpl.id }); }
          else { slotsCreated.push({ ...row, user_id: null }); out.unfilled.push({ date, station: st.name, shift: tpl.name }); }
        }
      }
    }
  }

  await tx(async (db) => {
    for (const c of slotsCreated) {
      await db.query(
        `INSERT INTO shifts(station_id, template_id, user_id, shift_date, start_at, end_at, status, auto_assigned, hourly_rate, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)`,
        [c.station_id, c.template_id, c.user_id, c.d, c.start, c.end, c.user_id ? 'scheduled' : 'open', c.rate ?? null, userId]);
      if (c.user_id) out.created++;
    }
  });
  await assignDuties({ stationIds, from, to });

  const mins = (await query(`SELECT user_id, sum(extract(epoch FROM (end_at - start_at)) / 3600)::numeric(6,1) AS h FROM shifts WHERE shift_date BETWEEN $1 AND $2 AND user_id IS NOT NULL AND status <> 'cancelled' AND station_id = ANY($3) GROUP BY 1`, [from, to, stationIds])).rows;
  for (const m of mins) out.hours[profile.get(m.user_id)?.name || m.user_id] = Number(m.h);
  if (out.unfilled.length) out.warnings.push(`${out.unfilled.length} shift slot${out.unfilled.length > 1 ? 's are' : ' is'} still open. Add staff, allow someone to float, or assign by hand.`);
  return out;
}

/* ---------------------------------------------------------------- duties */
/** Gives each person on a shift a duty (bar, counter, float), rotating so nobody is stuck on one. The first shift of the day opens, the last closes. */
export async function assignDuties({ stationIds, from, to }) {
  const rows = (await query(
    `SELECT sh.id, sh.station_id, sh.template_id, sh.user_id, sh.shift_date::text AS d, sh.duty, sh.auto_assigned, sh.start_at, p.skills, p.position
       FROM shifts sh LEFT JOIN staff_profiles p ON p.user_id=sh.user_id WHERE sh.station_id = ANY($1) AND sh.shift_date BETWEEN $2 AND $3 AND sh.user_id IS NOT NULL AND sh.status <> 'cancelled'
      ORDER BY sh.shift_date, sh.start_at`, [stationIds, from, to])).rows;
  const hist = (await query(`SELECT user_id, duty FROM shifts WHERE user_id IS NOT NULL AND duty IS NOT NULL AND shift_date BETWEEN $1 AND $2 AND status <> 'cancelled'`, [addDays(from, -7), addDays(from, -1)])).rows;
  const count = new Map();
  const bump = (uid, duty) => { for (const d of String(duty).split(' + ')) count.set(`${uid}:${d}`, (count.get(`${uid}:${d}`) || 0) + 1); };
  hist.forEach((h) => bump(h.user_id, h.duty));
  const n = (uid, d) => count.get(`${uid}:${d}`) || 0;

  const days = new Map();
  for (const r of rows) { const k = `${r.station_id}|${r.d}`; if (!days.has(k)) days.set(k, []); days.get(k).push(r); }
  const updates = [];
  for (const group of days.values()) {
    const byTpl = new Map();
    for (const r of group) { const k = r.template_id || r.start_at.toISOString(); if (!byTpl.has(k)) byTpl.set(k, []); byTpl.get(k).push(r); }
    const order = [...byTpl.values()].sort((a, b) => a[0].start_at - b[0].start_at);
    order.forEach((people, i) => {
      const pool = people.filter((p) => p.auto_assigned || !p.duty);
      const tag = [];
      let free = [...pool];
      const openClose = (name) => {
        const pick = free.slice().sort((a, b) => ((b.position === 'supervisor' || b.position === 'all_rounder') - (a.position === 'supervisor' || a.position === 'all_rounder')) || (n(a.user_id, name) - n(b.user_id, name)))[0];
        if (pick) tag.push([pick.id, name]);
      };
      if (i === 0) openClose('Opening');
      if (i === order.length - 1) openClose('Closing');
      const duties = free.length === 1 ? ['Bar + Counter'] : free.length === 2 ? ['Bar', 'Counter'] : ['Bar', 'Counter', ...Array(Math.max(0, free.length - 2)).fill('Float')];
      const chosen = new Map();
      for (const duty of duties) {
        const need = duty.startsWith('Bar') ? 'bar' : 'counter';
        const cand = free.filter((p) => (p.skills || []).includes(need) || (duty === 'Float'));
        const pick = (cand.length ? cand : free).slice().sort((a, b) => n(a.user_id, duty.split(' + ')[0]) - n(b.user_id, duty.split(' + ')[0]))[0];
        if (!pick) continue;
        chosen.set(pick.id, duty);
        free = free.filter((p) => p.id !== pick.id);
      }
      for (const p of pool) {
        const t = tag.filter(([id]) => id === p.id).map(([, nme]) => nme);
        const duty = [...t, chosen.get(p.id) || 'Float'].join(' + ');
        updates.push([p.id, duty]); bump(p.user_id, duty);
      }
    });
  }
  await tx(async (db) => { for (const [id, duty] of updates) { await db.query('UPDATE shifts SET duty=$2 WHERE id=$1', [id, duty]); await replaceTasks(db, id, duty); } });
  return updates.length;
}

/* ------------------------------------------------------------- publishing */
export async function publish({ stationIds, from, to }) {
  const { rows } = await query(
    `UPDATE shifts SET published=true WHERE station_id = ANY($1) AND shift_date BETWEEN $2 AND $3 AND user_id IS NOT NULL AND status='scheduled' AND NOT published RETURNING user_id, shift_date`, [stationIds, from, to]);
  const by = new Map();
  for (const r of rows) by.set(r.user_id, (by.get(r.user_id) || 0) + 1);
  for (const [uid, n] of by) await notify(uid, { kind: 'system', title: 'Your roster is ready', body: `${n} shift${n > 1 ? 's' : ''} from ${from} to ${to}. Open My shifts to see the times and your duties.`, data: { url: '/station#shift' } });
  return { published: rows.length, people: by.size };
}

/* ------------------------------------------------------------ attendance */
const roundTo5 = (m) => Math.max(0, Math.round(m / 5) * 5);
/** Paid minutes: scheduled time when you arrive and leave within the grace window, otherwise the real time (never more than 60 minutes past the end). */
export function settle(shift, checkedIn, checkedOut, graceMin) {
  const g = graceMin * MIN;
  const start = new Date(shift.start_at), end = new Date(shift.end_at);
  const from = Math.abs(checkedIn - start) <= g ? start : checkedIn;
  let to = Math.abs(checkedOut - end) <= g ? end : checkedOut;
  to = new Date(Math.min(to.getTime(), end.getTime() + 60 * MIN));
  return roundTo5((to - from) / MIN);
}
export const shiftFlags = (sh, graceMin = 10) => {
  const f = [];
  if (sh.status === 'absent') f.push('Did not check in');
  if (sh.checked_in_at && new Date(sh.checked_in_at) - new Date(sh.start_at) > graceMin * MIN) f.push('Late');
  if (sh.checked_out_at && sh.status === 'completed' && new Date(sh.end_at) - new Date(sh.checked_out_at) > graceMin * MIN) f.push('Left early');
  if (sh.adjust_reason && /auto-closed/i.test(sh.adjust_reason)) f.push('No check-out');
  if (sh.paid_minutes != null && sh.paid_minutes > ((new Date(sh.end_at) - new Date(sh.start_at)) / MIN) + 30) f.push('Overtime');
  return f;
};

/** Run every few minutes: shifts nobody checked out of are closed at their end, shifts nobody came to are marked absent. */
export async function closeStaleShifts() {
  const s = await getSettings();
  const open = (await query(`SELECT * FROM shifts WHERE status='checked_in' AND end_at < now() - interval '2 hours'`)).rows;
  for (const sh of open) {
    const mins = settle(sh, new Date(sh.checked_in_at), new Date(sh.end_at), s.checkin_grace_minutes);
    await query(`UPDATE shifts SET status='completed', checked_out_at=end_at, paid_minutes=$2, adjust_reason='Auto-closed: no check-out' WHERE id=$1`, [sh.id, mins]);
  }
  const gone = await query(`UPDATE shifts SET status='absent', paid_minutes=0 WHERE status='scheduled' AND published AND user_id IS NOT NULL AND end_at < now() - interval '2 hours' RETURNING id`);
  return { closed: open.length, absent: gone.rowCount };
}

/* --------------------------------------------------------------- payroll */
/** Pay for a period from completed shifts: regular hours at the hourly rate, overtime beyond 8 a day or 48 a week at the overtime rate. */
export async function computePayroll(from, to, { userIds = null } = {}) {
  const s = await getSettings();
  const shifts = (await query(
    `SELECT sh.*, u.name, p.hourly_rate AS profile_rate FROM shifts sh JOIN users u ON u.id=sh.user_id LEFT JOIN staff_profiles p ON p.user_id=u.id
      WHERE sh.status='completed' AND sh.shift_date BETWEEN $1 AND $2 AND ($3::uuid[] IS NULL OR sh.user_id = ANY($3)) ORDER BY sh.shift_date`, [from, to, userIds])).rows;
  const adj = (await query(`SELECT * FROM payroll_adjustments WHERE month BETWEEN date_trunc('month', $1::date) AND $2::date AND ($3::uuid[] IS NULL OR user_id = ANY($3)) AND run_id IS NULL`, [from, to, userIds])).rows;
  const people = new Map();
  for (const sh of shifts) {
    const p = people.get(sh.user_id) || { user_id: sh.user_id, name: sh.name, rate: Number(sh.hourly_rate ?? sh.profile_rate ?? 0), days: new Map(), shifts: 0, minutes: 0 };
    const m = sh.adjusted_minutes ?? sh.paid_minutes ?? 0;
    p.days.set(sh.shift_date.toISOString ? sh.shift_date.toISOString().slice(0, 10) : String(sh.shift_date).slice(0, 10), (p.days.get(String(sh.shift_date.toISOString ? sh.shift_date.toISOString().slice(0, 10) : sh.shift_date)) || 0) + m);
    p.shifts++; p.minutes += m; p.rate = Number(sh.hourly_rate ?? sh.profile_rate ?? p.rate);
    people.set(sh.user_id, p);
  }
  for (const a of adj) if (!people.has(a.user_id)) {
    const u = (await query('SELECT u.name, p.hourly_rate FROM users u LEFT JOIN staff_profiles p ON p.user_id=u.id WHERE u.id=$1', [a.user_id])).rows[0];
    if (u) people.set(a.user_id, { user_id: a.user_id, name: u.name, rate: Number(u.hourly_rate || 0), days: new Map(), shifts: 0, minutes: 0 });
  }
  const dailyCap = s.daily_regular_hours * 60, weeklyCap = s.weekly_regular_hours * 60;
  const lines = [];
  for (const p of people.values()) {
    const dailyOT = [...p.days.values()].reduce((a, m) => a + Math.max(0, m - dailyCap), 0);
    const weeks = new Map();
    for (const [d, m] of p.days) weeks.set(weekStart(d), (weeks.get(weekStart(d)) || 0) + m);
    const weeklyOT = [...weeks.values()].reduce((a, m) => a + Math.max(0, m - weeklyCap), 0);
    const overtime = Math.min(p.minutes, Math.max(dailyOT, weeklyOT));
    const regular = p.minutes - overtime;
    const gross = (regular / 60) * p.rate + (overtime / 60) * p.rate * s.overtime_multiplier;
    const adjustments = adj.filter((a) => a.user_id === p.user_id).reduce((a, x) => a + Number(x.amount), 0);
    const deductions = (gross * s.ssf_employee_pct) / 100;
    lines.push({
      user_id: p.user_id, name: p.name, regular_minutes: regular, overtime_minutes: overtime, hourly_rate: p.rate, shifts: p.shifts,
      gross: r2(gross), adjustments: r2(adjustments), deductions: r2(deductions), net: r2(gross + adjustments - deductions), employer_cost: r2(gross + (gross * s.ssf_employer_pct) / 100),
      adjustment_items: adj.filter((a) => a.user_id === p.user_id).map((a) => ({ label: a.label, amount: Number(a.amount) })),
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name));
}
const r2 = (n) => Math.round(n * 100) / 100;

export async function labour(stationIds, start, end) {
  const { rows } = await query(
    `SELECT COALESCE(sum(COALESCE(adjusted_minutes, paid_minutes, 0)),0)::int AS minutes,
            COALESCE(sum(COALESCE(adjusted_minutes, paid_minutes, 0) / 60.0 * COALESCE(hourly_rate, 0)),0)::int AS cost
       FROM shifts WHERE station_id = ANY($1) AND status='completed' AND start_at >= $2 AND start_at < $3`, [stationIds, start, end]);
  return { hours: Math.round(rows[0].minutes / 6) / 10, cost: rows[0].cost };
}
