import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../lib/db.js';
import { wrap, bad, notFound, forbidden, conflict, normalizePhone } from '../lib/http.js';
import { authenticate, requireRole, scopeStations, assertStationAccess } from '../lib/auth.js';
import { audit, notify } from '../lib/notify.js';
import { getSettings } from '../lib/settings.js';
import { addDays, autoAssign, assignDuties, computePayroll, publish, replaceTasks, settle, shiftFlags, todayNpt } from '../lib/roster.js';

/* ====================================================================================
   People: staff profiles and pay rates, shift times, rosters, attendance, time off, payroll.
   Owners see everything. Managers run their own stations' rosters and attendance but not pay rates or payroll.
   Staff see their own shifts, duties, hours and payslips.
   ==================================================================================== */
export const hr = Router();
hr.use(authenticate);
const managerUp = requireRole('manager', 'owner');
const ownerOnly = requireRole('owner');
const staffRoles = requireRole('station', 'manager', 'owner');

const date = z.string().regex(/^\d{4}-\d\d-\d\d$/);
const time = z.string().regex(/^\d\d:\d\d$/);
async function scoped(req) {
  const all = await scopeStations(req.user);
  if (req.query.station_id || req.body?.station_id) {
    const id = req.query.station_id || req.body.station_id;
    if (!all.includes(id)) throw forbidden('This station is not yours');
    return [id];
  }
  return all;
}
const clean = (row, isOwner) => { if (isOwner) return row; const { hourly_rate, ...rest } = row; return rest; };
const profileSchema = z.object({
  position: z.enum(['barista', 'cashier', 'supervisor', 'all_rounder']).optional(), skills: z.array(z.enum(['bar', 'counter'])).min(1).optional(),
  hourly_rate: z.number().min(0).max(5000).optional(), max_shifts_week: z.number().int().min(1).max(7).optional(), days_off: z.array(z.number().int().min(0).max(6)).max(6).optional(),
  preferred_shift: z.enum(['morning', 'evening', 'any']).optional(), can_float: z.boolean().optional(), joined_on: date.optional(), emergency_phone: z.string().max(30).optional(), notes: z.string().max(300).optional(), active: z.boolean().optional(),
});

/* ------------------------------------------------------------ directory */
hr.get('/staff', managerUp, wrap(async (req, res) => {
  const ids = await scoped(req);
  const wk = todayNpt();
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.active, u.station_id, s.name AS station_name, u.last_login_at, p.employee_code, p.position, p.skills, p.hourly_rate, p.max_shifts_week, p.days_off, p.preferred_shift, p.can_float, p.joined_on, p.emergency_phone, p.notes,
            COALESCE(p.active, true) AS profile_active,
            (SELECT COALESCE(sum(extract(epoch FROM (sh.end_at - sh.start_at)) / 3600),0)::numeric(5,1) FROM shifts sh WHERE sh.user_id=u.id AND sh.status <> 'cancelled' AND sh.shift_date >= date_trunc('week', $2::date) AND sh.shift_date < date_trunc('week', $2::date) + interval '7 days') AS week_hours,
            (SELECT json_build_object('date', sh.shift_date, 'start', sh.start_at, 'station', st.name, 'duty', sh.duty) FROM shifts sh JOIN stations st ON st.id=sh.station_id WHERE sh.user_id=u.id AND sh.status IN ('scheduled','checked_in') AND sh.end_at > now() ORDER BY sh.start_at LIMIT 1) AS next_shift
       FROM users u LEFT JOIN staff_profiles p ON p.user_id=u.id LEFT JOIN stations s ON s.id=u.station_id
      WHERE u.role='station' AND (u.station_id = ANY($1) OR p.can_float) ORDER BY s.name NULLS LAST, u.name`, [ids, wk]);
  res.json(rows.map((r) => clean(r, req.user.role === 'owner')));
}));

hr.post('/staff', ownerOnly, wrap(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2).max(60), phone: z.string(), password: z.string().min(6).max(72), station_id: z.string().uuid() }).merge(profileSchema).parse(req.body);
  const out = await tx(async (db) => {
    const u = (await db.query(`INSERT INTO users(name, phone, password_hash, role, station_id) VALUES ($1,$2,$3,'station',$4) RETURNING id, name, phone, station_id`, [b.name, normalizePhone(b.phone), await bcrypt.hash(b.password, 10), b.station_id])).rows[0];
    const n = (await db.query(`SELECT count(*)::int + 1 AS n FROM staff_profiles`)).rows[0].n;
    await db.query(
      `INSERT INTO staff_profiles(user_id, employee_code, position, skills, hourly_rate, max_shifts_week, days_off, preferred_shift, can_float, joined_on, emergency_phone, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [u.id, `SC-${String(n).padStart(4, '0')}`, b.position || 'barista', b.skills || ['bar', 'counter'], b.hourly_rate ?? 0, b.max_shifts_week ?? 6, b.days_off || [], b.preferred_shift || 'any', b.can_float ?? false, b.joined_on || todayNpt(), b.emergency_phone || null, b.notes || null]);
    await audit(req.user.id, 'staff.create', 'user', u.id, { station: b.station_id }, db);
    return u;
  });
  res.status(201).json(out);
}));

hr.patch('/staff/:id', managerUp, wrap(async (req, res) => {
  const b = profileSchema.extend({ station_id: z.string().uuid().optional(), name: z.string().min(2).max(60).optional() }).parse(req.body);
  const u = (await query(`SELECT id, station_id FROM users WHERE id=$1 AND role='station'`, [req.params.id])).rows[0];
  if (!u) throw notFound('Staff member not found');
  await assertStationAccess(req.user, u.station_id);
  if (req.user.role !== 'owner' && (b.hourly_rate !== undefined || b.station_id)) throw forbidden('Only the owner changes pay rates and home stations');
  await tx(async (db) => {
    await db.query('INSERT INTO staff_profiles(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [u.id]);
    const cols = ['position', 'skills', 'hourly_rate', 'max_shifts_week', 'days_off', 'preferred_shift', 'can_float', 'joined_on', 'emergency_phone', 'notes', 'active'].filter((c) => b[c] !== undefined);
    if (cols.length) await db.query(`UPDATE staff_profiles SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE user_id=$1`, [u.id, ...cols.map((c) => b[c])]);
    if (b.station_id) await db.query('UPDATE users SET station_id=$2 WHERE id=$1', [u.id, b.station_id]);
    if (b.name) await db.query('UPDATE users SET name=$2 WHERE id=$1', [u.id, b.name]);
    await audit(req.user.id, 'staff.update', 'user', u.id, { fields: [...cols, ...(b.station_id ? ['station'] : [])] }, db);
  });
  res.json({ ok: true });
}));

/* ---------------------------------------------------------- shift times */
hr.get('/templates', managerUp, wrap(async (req, res) => {
  const ids = await scoped(req);
  res.json((await query(`SELECT t.*, s.name AS station_name FROM shift_templates t JOIN stations s ON s.id=t.station_id WHERE t.station_id = ANY($1) AND t.active ORDER BY s.name, t.start_time`, [ids])).rows);
}));
hr.put('/templates/:stationId', managerUp, wrap(async (req, res) => {
  await assertStationAccess(req.user, req.params.stationId);
  const list = z.array(z.object({ name: z.string().min(2).max(30), kind: z.enum(['morning', 'midday', 'evening', 'any']), start_time: time, hours: z.number().min(1).max(12).default(6), min_staff: z.number().int().min(0).max(10), max_staff: z.number().int().min(1).max(12) })).min(1).max(6).parse(req.body);
  await tx(async (db) => {
    await db.query('UPDATE shift_templates SET active=false WHERE station_id=$1', [req.params.stationId]);
    for (const [i, t] of list.entries()) await db.query(`INSERT INTO shift_templates(station_id, name, kind, start_time, hours, min_staff, max_staff, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [req.params.stationId, t.name, t.kind, t.start_time, t.hours, t.min_staff, Math.max(t.max_staff, t.min_staff), i]);
    await audit(req.user.id, 'roster.times', 'station', req.params.stationId, { shifts: list.length }, db);
  });
  res.json({ ok: true });
}));

/* --------------------------------------------------------------- roster */
hr.get('/roster', managerUp, wrap(async (req, res) => {
  const ids = await scoped(req);
  const from = date.parse(req.query.from), to = date.parse(req.query.to);
  const [shifts, templates] = await Promise.all([
    query(
      `SELECT sh.id, sh.station_id, st.name AS station_name, sh.template_id, sh.user_id, u.name AS user_name, sh.shift_date::text AS date, sh.start_at, sh.end_at, sh.status, sh.published, sh.duty, sh.auto_assigned,
              sh.checked_in_at, sh.checked_out_at, sh.paid_minutes, sh.adjusted_minutes, sh.adjust_reason, sh.note, t.name AS template_name, t.kind,
              (SELECT count(*)::int FROM shift_tasks k WHERE k.shift_id=sh.id) AS tasks, (SELECT count(*)::int FROM shift_tasks k WHERE k.shift_id=sh.id AND k.done_at IS NOT NULL) AS tasks_done
         FROM shifts sh JOIN stations st ON st.id=sh.station_id LEFT JOIN users u ON u.id=sh.user_id LEFT JOIN shift_templates t ON t.id=sh.template_id
        WHERE sh.station_id = ANY($1) AND sh.shift_date BETWEEN $2 AND $3 AND sh.status <> 'cancelled' ORDER BY sh.shift_date, sh.start_at, u.name`, [ids, from, to]),
    query(`SELECT t.*, s.name AS station_name FROM shift_templates t JOIN stations s ON s.id=t.station_id WHERE t.station_id = ANY($1) AND t.active ORDER BY t.start_time`, [ids]),
  ]);
  const leave = (await query(`SELECT t.user_id, u.name, t.from_date::text AS f, t.to_date::text AS t FROM time_off t JOIN users u ON u.id=t.user_id WHERE t.status='approved' AND t.to_date >= $1 AND t.from_date <= $2`, [from, to])).rows;
  res.json({ shifts: shifts.rows, templates: templates.rows, leave });
}));

hr.post('/roster/shifts', managerUp, wrap(async (req, res) => {
  const b = z.object({ station_id: z.string().uuid(), user_id: z.string().uuid().nullable().optional(), date, template_id: z.string().uuid().optional(), start: time.optional(), hours: z.number().min(1).max(12).optional(), duty: z.string().max(60).optional(), note: z.string().max(200).optional() }).parse(req.body);
  await assertStationAccess(req.user, b.station_id);
  let start = b.start, hours = b.hours ?? 6, tplId = b.template_id || null;
  if (tplId) { const t = (await query('SELECT * FROM shift_templates WHERE id=$1 AND station_id=$2', [tplId, b.station_id])).rows[0]; if (!t) throw notFound('Shift time not found'); start = String(t.start_time).slice(0, 5); hours = b.hours ?? Number(t.hours); }
  if (!start) throw bad('Choose a shift time or a start time');
  const startAt = new Date(`${b.date}T${start}:00+05:45`), endAt = new Date(startAt.getTime() + hours * 3600e3);
  let rate = null;
  if (b.user_id) {
    const u = (await query(`SELECT u.id, p.hourly_rate FROM users u LEFT JOIN staff_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='station' AND u.active`, [b.user_id])).rows[0];
    if (!u) throw notFound('Staff member not found');
    rate = u.hourly_rate;
  }
  try {
    const { rows } = await query(
      `INSERT INTO shifts(station_id, template_id, user_id, shift_date, start_at, end_at, status, duty, note, hourly_rate, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [b.station_id, tplId, b.user_id || null, b.date, startAt, endAt, b.user_id ? 'scheduled' : 'open', b.duty || null, b.note || null, rate, req.user.id]);
    if (b.user_id) { if (!b.duty) await assignDuties({ stationIds: [b.station_id], from: b.date, to: b.date }); else await tx((db) => replaceTasks(db, rows[0].id, b.duty)); }
    await audit(req.user.id, 'roster.add', 'shift', rows[0].id, { date: b.date, user: b.user_id });
    res.status(201).json({ id: rows[0].id });
  } catch (e) { if (e.code === '23505') throw conflict('That person already has a shift that day.'); throw e; }
}));

hr.patch('/roster/shifts/:id', managerUp, wrap(async (req, res) => {
  const b = z.object({ user_id: z.string().uuid().nullable().optional(), duty: z.string().max(60).optional(), note: z.string().max(200).optional(), cancel: z.boolean().optional() }).parse(req.body);
  const sh = (await query('SELECT * FROM shifts WHERE id=$1', [req.params.id])).rows[0];
  if (!sh) throw notFound('Shift not found');
  await assertStationAccess(req.user, sh.station_id);
  if (['checked_in', 'completed'].includes(sh.status)) throw conflict('This shift has already started. Use Adjust hours instead.');
  try {
    if (b.cancel) await query(`UPDATE shifts SET status='cancelled' WHERE id=$1`, [sh.id]);
    else {
      if (b.user_id !== undefined) {
        let rate = null;
        if (b.user_id) { const u = (await query(`SELECT p.hourly_rate FROM users u LEFT JOIN staff_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='station' AND u.active`, [b.user_id])).rows[0]; if (!u) throw notFound('Staff member not found'); rate = u.hourly_rate; }
        await query(`UPDATE shifts SET user_id=$2, status=$3, hourly_rate=$4, auto_assigned=false, published=false, duty=NULL WHERE id=$1`, [sh.id, b.user_id, b.user_id ? 'scheduled' : 'open', rate]);
        if (b.user_id) await assignDuties({ stationIds: [sh.station_id], from: sh.shift_date.toISOString?.().slice(0, 10) || String(sh.shift_date), to: sh.shift_date.toISOString?.().slice(0, 10) || String(sh.shift_date) });
      }
      if (b.duty !== undefined) { await query('UPDATE shifts SET duty=$2, auto_assigned=false WHERE id=$1', [sh.id, b.duty || null]); await tx((db) => replaceTasks(db, sh.id, b.duty)); }
      if (b.note !== undefined) await query('UPDATE shifts SET note=$2 WHERE id=$1', [sh.id, b.note || null]);
    }
    await audit(req.user.id, 'roster.edit', 'shift', sh.id, b);
    res.json({ ok: true });
  } catch (e) { if (e.code === '23505') throw conflict('That person already has a shift that day.'); throw e; }
}));

hr.post('/roster/auto-assign', managerUp, wrap(async (req, res) => {
  const b = z.object({ station_id: z.string().uuid().optional(), from: date, to: date, replace: z.boolean().default(true) }).parse(req.body);
  if (b.to < b.from || (Date.parse(b.to) - Date.parse(b.from)) / 864e5 > 31) throw bad('Choose a range of up to 31 days');
  const ids = b.station_id ? (await assertStationAccess(req.user, b.station_id), [b.station_id]) : await scopeStations(req.user);
  const out = await autoAssign({ stationIds: ids, from: b.from, to: b.to, replace: b.replace, userId: req.user.id });
  await audit(req.user.id, 'roster.auto', 'roster', null, { from: b.from, to: b.to, created: out.created, unfilled: out.unfilled.length });
  res.json(out);
}));
hr.post('/roster/publish', managerUp, wrap(async (req, res) => {
  const b = z.object({ station_id: z.string().uuid().optional(), from: date, to: date }).parse(req.body);
  const ids = b.station_id ? (await assertStationAccess(req.user, b.station_id), [b.station_id]) : await scopeStations(req.user);
  const out = await publish({ stationIds: ids, from: b.from, to: b.to });
  await audit(req.user.id, 'roster.publish', 'roster', null, { from: b.from, to: b.to, ...out });
  res.json(out);
}));

/* ------------------------------------------------------------ attendance */
hr.get('/attendance', managerUp, wrap(async (req, res) => {
  const ids = await scoped(req);
  const s = await getSettings();
  const { rows } = await query(
    `SELECT sh.id, sh.shift_date::text AS date, sh.start_at, sh.end_at, sh.status, sh.checked_in_at, sh.checked_out_at, sh.paid_minutes, sh.adjusted_minutes, sh.adjust_reason, sh.duty, u.name, st.name AS station_name,
            (SELECT count(*)::int FROM shift_tasks k WHERE k.shift_id=sh.id) AS tasks, (SELECT count(*)::int FROM shift_tasks k WHERE k.shift_id=sh.id AND k.done_at IS NOT NULL) AS tasks_done
       FROM shifts sh JOIN users u ON u.id=sh.user_id JOIN stations st ON st.id=sh.station_id
      WHERE sh.station_id = ANY($1) AND sh.shift_date BETWEEN $2 AND $3 AND sh.status IN ('checked_in','completed','absent') ORDER BY sh.start_at DESC LIMIT 300`, [ids, date.parse(req.query.from), date.parse(req.query.to)]);
  res.json(rows.map((r) => ({ ...r, flags: shiftFlags(r, s.checkin_grace_minutes), minutes: r.adjusted_minutes ?? r.paid_minutes })));
}));
hr.post('/shifts/:id/adjust', managerUp, wrap(async (req, res) => {
  const b = z.object({ minutes: z.number().int().min(0).max(960), reason: z.string().trim().min(3).max(200), present: z.boolean().optional() }).parse(req.body);
  const sh = (await query('SELECT * FROM shifts WHERE id=$1', [req.params.id])).rows[0];
  if (!sh) throw notFound('Shift not found');
  await assertStationAccess(req.user, sh.station_id);
  if (['scheduled', 'open', 'cancelled'].includes(sh.status)) throw conflict('This shift has not been worked yet.');
  const locked = (await query(`SELECT 1 FROM payroll_runs WHERE status IN ('approved','paid') AND $1::date BETWEEN period_from AND period_to LIMIT 1`, [sh.shift_date])).rowCount;
  if (locked) throw conflict('Payroll for this date is already approved. Ask the owner.');
  await query(`UPDATE shifts SET adjusted_minutes=$2, adjust_reason=$3, status='completed' WHERE id=$1`, [sh.id, b.minutes, `${b.reason} (${req.user.name})`]);
  await audit(req.user.id, 'shift.adjust', 'shift', sh.id, { minutes: b.minutes, reason: b.reason });
  res.json({ ok: true });
}));

/* -------------------------------------------------------------- time off */
hr.get('/time-off', managerUp, wrap(async (req, res) => {
  const ids = await scoped(req);
  const { rows } = await query(
    `SELECT t.id, t.user_id, u.name, st.name AS station_name, t.from_date::text AS from_date, t.to_date::text AS to_date, t.kind, t.reason, t.status, t.created_at FROM time_off t JOIN users u ON u.id=t.user_id LEFT JOIN stations st ON st.id=u.station_id
      WHERE (u.station_id = ANY($1)) AND ($2::text IS NULL OR t.status=$2) ORDER BY (t.status='requested') DESC, t.from_date DESC LIMIT 100`, [ids, req.query.status || null]);
  res.json(rows);
}));
hr.post('/time-off/:id/decide', managerUp, wrap(async (req, res) => {
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  const t = (await query(`SELECT t.*, u.station_id FROM time_off t JOIN users u ON u.id=t.user_id WHERE t.id=$1`, [req.params.id])).rows[0];
  if (!t) throw notFound('Request not found');
  await assertStationAccess(req.user, t.station_id);
  await query(`UPDATE time_off SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1`, [t.id, approve ? 'approved' : 'rejected', req.user.id]);
  if (approve) await query(`UPDATE shifts SET status='cancelled' WHERE user_id=$1 AND shift_date BETWEEN $2 AND $3 AND status IN ('scheduled','open') AND checked_in_at IS NULL`, [t.user_id, t.from_date, t.to_date]);
  await notify(t.user_id, { kind: 'system', title: approve ? 'Time off approved' : 'Time off not approved', body: `${String(t.from_date).slice(0, 10)} to ${String(t.to_date).slice(0, 10)}`, data: { url: '/station#shift' } });
  await audit(req.user.id, approve ? 'timeoff.approve' : 'timeoff.reject', 'time_off', t.id);
  res.json({ ok: true });
}));

/* ======================================================= my shifts (staff) */
async function myShifts(userId, from, to) {
  const { rows } = await query(
    `SELECT sh.id, sh.shift_date::text AS date, sh.start_at, sh.end_at, sh.status, sh.duty, sh.note, st.name AS station_name, sh.station_id, sh.checked_in_at, sh.checked_out_at, COALESCE(sh.adjusted_minutes, sh.paid_minutes) AS minutes,
            COALESCE((SELECT json_agg(json_build_object('id', k.id, 'title', k.title, 'done', k.done_at IS NOT NULL) ORDER BY k.sort) FROM shift_tasks k WHERE k.shift_id=sh.id), '[]') AS tasks
       FROM shifts sh JOIN stations st ON st.id=sh.station_id WHERE sh.user_id=$1 AND sh.published AND sh.status <> 'cancelled' AND sh.shift_date BETWEEN $2 AND $3 ORDER BY sh.start_at`, [userId, from, to]);
  return rows;
}
hr.get('/me', staffRoles, wrap(async (req, res) => {
  const today = todayNpt();
  const s = await getSettings();
  const month = today.slice(0, 7) + '-01';
  const [profile, shifts, done, off, pay] = await Promise.all([
    query('SELECT employee_code, position, skills, hourly_rate, preferred_shift, days_off, max_shifts_week FROM staff_profiles WHERE user_id=$1', [req.user.id]),
    myShifts(req.user.id, addDays(today, -1), addDays(today, 21)),
    query(`SELECT COALESCE(sum(COALESCE(adjusted_minutes, paid_minutes, 0)),0)::int AS minutes, count(*)::int AS shifts FROM shifts WHERE user_id=$1 AND status='completed' AND shift_date >= $2`, [req.user.id, month]),
    query(`SELECT id, from_date::text AS from_date, to_date::text AS to_date, kind, reason, status FROM time_off WHERE user_id=$1 AND to_date >= $2 ORDER BY from_date`, [req.user.id, addDays(today, -30)]),
    query(`SELECT l.*, r.period_from::text AS period_from, r.period_to::text AS period_to, r.status AS run_status, r.paid_at FROM payroll_lines l JOIN payroll_runs r ON r.id=l.run_id WHERE l.user_id=$1 AND r.status IN ('approved','paid') ORDER BY r.period_to DESC LIMIT 12`, [req.user.id]),
  ]);
  const rate = Number(profile.rows[0]?.hourly_rate || 0);
  const inWindow = shifts.filter((x) => new Date(x.end_at) > new Date());
  const current = shifts.find((x) => x.status === 'checked_in') || null;
  const next = inWindow.find((x) => x.status === 'scheduled') || null;
  const early = s.checkin_early_minutes * 60000;
  res.json({
    profile: profile.rows[0] || null, today: today, shifts, current, next,
    can_check_in: !current && !!next && Date.now() >= new Date(next.start_at).getTime() - early,
    month: { minutes: done.rows[0].minutes, shifts: done.rows[0].shifts, estimated_pay: Math.round((done.rows[0].minutes / 60) * rate * 100) / 100, rate },
    time_off: off.rows, payslips: pay.rows,
  });
}));
hr.post('/me/check-in', staffRoles, wrap(async (req, res) => {
  const s = await getSettings();
  const now = new Date();
  const sh = (await query(`SELECT * FROM shifts WHERE user_id=$1 AND status='scheduled' AND published AND end_at > now() ORDER BY start_at LIMIT 1`, [req.user.id])).rows[0];
  if (!sh) throw conflict('You have no shift to start right now.');
  if (now.getTime() < new Date(sh.start_at).getTime() - s.checkin_early_minutes * 60000) throw conflict(`Your shift starts at ${new Date(sh.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' })}. You can start ${s.checkin_early_minutes} minutes before.`);
  await query(`UPDATE shifts SET status='checked_in', checked_in_at=$2 WHERE id=$1`, [sh.id, now]);
  await audit(req.user.id, 'shift.check_in', 'shift', sh.id);
  res.json({ ok: true, shift_id: sh.id });
}));
hr.post('/me/check-out', staffRoles, wrap(async (req, res) => {
  const s = await getSettings();
  const sh = (await query(`SELECT * FROM shifts WHERE user_id=$1 AND status='checked_in' ORDER BY start_at LIMIT 1`, [req.user.id])).rows[0];
  if (!sh) throw conflict('You are not on a shift.');
  const open = (await query(`SELECT count(*)::int AS n FROM shift_tasks WHERE shift_id=$1 AND done_at IS NULL`, [sh.id])).rows[0].n;
  const now = new Date();
  const minutes = settle(sh, new Date(sh.checked_in_at), now, s.checkin_grace_minutes);
  const rate = sh.hourly_rate ?? (await query('SELECT hourly_rate FROM staff_profiles WHERE user_id=$1', [req.user.id])).rows[0]?.hourly_rate ?? 0;
  await query(`UPDATE shifts SET status='completed', checked_out_at=$2, paid_minutes=$3, hourly_rate=$4 WHERE id=$1`, [sh.id, now, minutes, rate]);
  await audit(req.user.id, 'shift.check_out', 'shift', sh.id, { minutes, open_tasks: open });
  res.json({ ok: true, minutes, open_tasks: open });
}));
hr.post('/me/tasks/:id/toggle', staffRoles, wrap(async (req, res) => {
  const t = (await query(`SELECT k.id, k.done_at FROM shift_tasks k JOIN shifts sh ON sh.id=k.shift_id WHERE k.id=$1 AND sh.user_id=$2`, [req.params.id, req.user.id])).rows[0];
  if (!t) throw notFound('Task not found');
  await query('UPDATE shift_tasks SET done_at=$2, done_by=$3 WHERE id=$1', [t.id, t.done_at ? null : new Date(), t.done_at ? null : req.user.id]);
  res.json({ done: !t.done_at });
}));
hr.post('/me/time-off', staffRoles, wrap(async (req, res) => {
  const b = z.object({ from_date: date, to_date: date, kind: z.enum(['leave', 'sick', 'other']).default('leave'), reason: z.string().max(200).optional() }).parse(req.body);
  if (b.to_date < b.from_date) throw bad('The end date is before the start date');
  const { rows } = await query(`INSERT INTO time_off(user_id, from_date, to_date, kind, reason) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.user.id, b.from_date, b.to_date, b.kind, b.reason || null]);
  const mgrs = (await query(`SELECT user_id AS id FROM station_managers WHERE station_id=$1 UNION SELECT id FROM users WHERE role='owner' AND active`, [req.user.station_id])).rows;
  for (const m of mgrs) await notify(m.id, { kind: 'system', title: `Time off request from ${req.user.name}`, body: `${b.from_date} to ${b.to_date}`, data: { url: '/manager#people' } });
  res.status(201).json({ id: rows[0].id });
}));
hr.delete('/me/time-off/:id', staffRoles, wrap(async (req, res) => {
  const r = await query(`DELETE FROM time_off WHERE id=$1 AND user_id=$2 AND status='requested' RETURNING id`, [req.params.id, req.user.id]);
  if (!r.rowCount) throw conflict('Only requests that are still waiting can be withdrawn');
  res.json({ ok: true });
}));

/* =================================================================== payroll */
hr.get('/payroll/preview', ownerOnly, wrap(async (req, res) => {
  const from = date.parse(req.query.from), to = date.parse(req.query.to);
  res.json(await computePayroll(from, to));
}));
hr.get('/payroll/runs', ownerOnly, wrap(async (_req, res) => res.json((await query(`SELECT r.*, u.name AS created_by_name, period_from::text AS pf, period_to::text AS pt FROM payroll_runs r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.period_to DESC, r.created_at DESC LIMIT 40`)).rows.map((r) => ({ ...r, period_from: r.pf, period_to: r.pt })))));
hr.get('/payroll/runs/:id', ownerOnly, wrap(async (req, res) => {
  const run = (await query(`SELECT *, period_from::text AS pf, period_to::text AS pt FROM payroll_runs WHERE id=$1`, [req.params.id])).rows[0];
  if (!run) throw notFound('Payroll run not found');
  const lines = (await query('SELECT * FROM payroll_lines WHERE run_id=$1 ORDER BY name', [run.id])).rows;
  res.json({ ...run, period_from: run.pf, period_to: run.pt, lines });
}));
export async function saveLines(db, runId, lines) {
  await db.query('DELETE FROM payroll_lines WHERE run_id=$1', [runId]);
  for (const l of lines) await db.query(
    `INSERT INTO payroll_lines(run_id, user_id, name, regular_minutes, overtime_minutes, hourly_rate, gross, adjustments, deductions, net, employer_cost, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [runId, l.user_id, l.name, l.regular_minutes, l.overtime_minutes, l.hourly_rate, l.gross, l.adjustments, l.deductions, l.net, l.employer_cost, JSON.stringify({ shifts: l.shifts, adjustment_items: l.adjustment_items })]);
  const totals = lines.reduce((a, l) => ({ people: a.people + 1, hours: a.hours + (l.regular_minutes + l.overtime_minutes) / 60, gross: a.gross + l.gross, net: a.net + l.net, employer_cost: a.employer_cost + l.employer_cost }), { people: 0, hours: 0, gross: 0, net: 0, employer_cost: 0 });
  await db.query('UPDATE payroll_runs SET totals=$2 WHERE id=$1', [runId, JSON.stringify({ ...totals, hours: Math.round(totals.hours * 10) / 10 })]);
}
hr.post('/payroll/runs', ownerOnly, wrap(async (req, res) => {
  const b = z.object({ from: date, to: date }).parse(req.body);
  if (b.to < b.from) throw bad('The end date is before the start date');
  const clash = (await query(`SELECT 1 FROM payroll_runs WHERE status IN ('approved','paid') AND daterange(period_from, period_to, '[]') && daterange($1::date, $2::date, '[]')`, [b.from, b.to])).rowCount;
  if (clash) throw conflict('An approved or paid payroll already covers part of these dates.');
  const lines = await computePayroll(b.from, b.to);
  const id = await tx(async (db) => {
    const r = (await db.query('INSERT INTO payroll_runs(period_from, period_to, created_by) VALUES ($1,$2,$3) RETURNING id', [b.from, b.to, req.user.id])).rows[0];
    await saveLines(db, r.id, lines);
    await audit(req.user.id, 'payroll.create', 'payroll', r.id, b, db);
    return r.id;
  });
  res.status(201).json({ id });
}));
hr.post('/payroll/runs/:id/recalculate', ownerOnly, wrap(async (req, res) => {
  const run = (await query(`SELECT *, period_from::text AS pf, period_to::text AS pt FROM payroll_runs WHERE id=$1`, [req.params.id])).rows[0];
  if (!run) throw notFound('Payroll run not found');
  if (run.status !== 'draft') throw conflict('Only a draft can be recalculated');
  await tx(async (db) => saveLines(db, run.id, await computePayroll(run.pf, run.pt)));
  res.json({ ok: true });
}));
hr.post('/payroll/runs/:id/approve', ownerOnly, wrap(async (req, res) => {
  const run = (await query(`SELECT *, period_from::text AS pf, period_to::text AS pt FROM payroll_runs WHERE id=$1`, [req.params.id])).rows[0];
  if (!run) throw notFound('Payroll run not found');
  if (run.status !== 'draft') throw conflict('This payroll is already approved');
  await tx(async (db) => {
    await saveLines(db, run.id, await computePayroll(run.pf, run.pt)); // final numbers at the moment of approval
    await db.query(`UPDATE payroll_adjustments SET run_id=$1 WHERE run_id IS NULL AND month BETWEEN date_trunc('month', $2::date) AND $3::date`, [run.id, run.pf, run.pt]);
    await db.query(`UPDATE payroll_runs SET status='approved', approved_at=now() WHERE id=$1`, [run.id]);
    await audit(req.user.id, 'payroll.approve', 'payroll', run.id, null, db);
  });
  const lines = (await query('SELECT user_id FROM payroll_lines WHERE run_id=$1', [run.id])).rows;
  for (const l of lines) await notify(l.user_id, { kind: 'system', title: 'Your payslip is ready', body: `${run.pf} to ${run.pt}`, data: { url: '/station#shift' } });
  res.json({ ok: true });
}));
hr.post('/payroll/runs/:id/pay', ownerOnly, wrap(async (req, res) => {
  const { reference } = z.object({ reference: z.string().trim().min(2).max(80) }).parse(req.body);
  const r = await query(`UPDATE payroll_runs SET status='paid', paid_at=now(), reference=$2 WHERE id=$1 AND status='approved' RETURNING id`, [req.params.id, reference]);
  if (!r.rowCount) throw conflict('Approve the payroll before marking it paid');
  await audit(req.user.id, 'payroll.paid', 'payroll', req.params.id, { reference });
  res.json({ ok: true });
}));
hr.delete('/payroll/runs/:id', ownerOnly, wrap(async (req, res) => {
  const r = await query(`DELETE FROM payroll_runs WHERE id=$1 AND status='draft' RETURNING id`, [req.params.id]);
  if (!r.rowCount) throw conflict('Only a draft can be deleted');
  res.json({ ok: true });
}));
hr.get('/payroll/runs/:id/csv', ownerOnly, wrap(async (req, res) => {
  const run = (await query(`SELECT *, period_from::text AS pf, period_to::text AS pt FROM payroll_runs WHERE id=$1`, [req.params.id])).rows[0];
  if (!run) throw notFound('Payroll run not found');
  const lines = (await query('SELECT * FROM payroll_lines WHERE run_id=$1 ORDER BY name', [run.id])).rows;
  const csv = ['name,regular_hours,overtime_hours,hourly_rate,gross,adjustments,deductions,net', ...lines.map((l) => [JSON.stringify(l.name), (l.regular_minutes / 60).toFixed(2), (l.overtime_minutes / 60).toFixed(2), l.hourly_rate, l.gross, l.adjustments, l.deductions, l.net].join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-${run.pf}-to-${run.pt}.csv"`);
  res.send(csv);
}));
hr.get('/payroll/adjustments', ownerOnly, wrap(async (req, res) => {
  const { rows } = await query(`SELECT a.id, a.user_id, u.name, a.month::text AS month, a.label, a.amount, a.run_id FROM payroll_adjustments a JOIN users u ON u.id=a.user_id WHERE a.month >= date_trunc('month', now()) - interval '3 months' ORDER BY a.month DESC, u.name`);
  res.json(rows);
}));
hr.post('/payroll/adjustments', ownerOnly, wrap(async (req, res) => {
  const b = z.object({ user_id: z.string().uuid(), month: date, label: z.string().trim().min(2).max(60), amount: z.number().min(-100000).max(100000).refine((n) => n !== 0, 'Enter an amount') }).parse(req.body);
  const { rows } = await query(`INSERT INTO payroll_adjustments(user_id, month, label, amount, created_by) VALUES ($1, date_trunc('month', $2::date), $3, $4, $5) RETURNING id`, [b.user_id, b.month, b.label, b.amount, req.user.id]);
  await audit(req.user.id, 'payroll.adjustment', 'user', b.user_id, { label: b.label, amount: b.amount });
  res.status(201).json({ id: rows[0].id });
}));
hr.delete('/payroll/adjustments/:id', ownerOnly, wrap(async (req, res) => {
  const r = await query('DELETE FROM payroll_adjustments WHERE id=$1 AND run_id IS NULL RETURNING id', [req.params.id]);
  if (!r.rowCount) throw conflict('That adjustment is already in an approved payroll');
  res.json({ ok: true });
}));
