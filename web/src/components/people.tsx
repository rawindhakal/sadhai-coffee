'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, BASE, fmtDate, fmtDateTime, fmtTime, rs, store } from '@/lib/api';
import { Empty, ErrorNote, Field, Modal, Status, useData, useToast } from './ui';
import { DataTable, Kpi, Seg, Skeleton } from './dash/kit';
import { useDash } from './dash/shell';
import { Icon } from './icons';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5));
const nptToday = () => iso(new Date(Date.now() + 345 * 60000));
const monday = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
const dayLabel = (s: string) => `${DOW[dow(s)]} ${Number(s.slice(8))}`;
const hrs = (m: number | null | undefined) => (m == null ? '–' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`);
const POSITIONS = [['supervisor', 'Supervisor'], ['barista', 'Barista'], ['all_rounder', 'All-rounder'], ['cashier', 'Cashier']];

/* =================================================================== directory */
export function StaffDirectory({ isOwner }: { isOwner: boolean }) {
  const { stationId, stations } = useDash();
  const q = stationId ? `?station_id=${stationId}` : '';
  const { data, reload, error } = useData<any[]>(`/hr/staff${q}`, [stationId]);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [add, setAdd] = useState<any>(null);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Skeleton h={50} n={6} />;
  async function save() {
    const b: any = { position: edit.position, skills: edit.skills, max_shifts_week: Number(edit.max_shifts_week), days_off: edit.days_off, preferred_shift: edit.preferred_shift, can_float: edit.can_float, emergency_phone: edit.emergency_phone || undefined, notes: edit.notes || undefined, active: edit.profile_active };
    if (isOwner) { b.hourly_rate = Number(edit.hourly_rate); if (edit.new_station && edit.new_station !== edit.station_id) b.station_id = edit.new_station; }
    try { await api(`/hr/staff/${edit.id}`, { method: 'PATCH', body: b }); if (!edit.profile_active || edit.active === false) await api(`/admin/staff/${edit.id}`, { method: 'PATCH', body: { active: edit.active } }); setEdit(null); reload(); toast('Saved'); } catch (e: any) { toast(e.message, true); }
  }
  async function create() {
    try { await api('/hr/staff', { method: 'POST', body: { name: add.name, phone: add.phone, password: add.password, station_id: add.station_id, position: add.position, hourly_rate: Number(add.hourly_rate || 0), skills: add.position === 'cashier' ? ['counter'] : ['bar', 'counter'] } }); setAdd(null); reload(); toast('Staff member added. Give them the phone number and password so they can sign in.'); } catch (e: any) { toast(e.message, true); }
  }
  const toggleDay = (d: number) => setEdit({ ...edit, days_off: edit.days_off.includes(d) ? edit.days_off.filter((x: number) => x !== d) : [...edit.days_off, d] });
  const toggleSkill = (s: string) => setEdit({ ...edit, skills: edit.skills.includes(s) ? edit.skills.filter((x: string) => x !== s) : [...edit.skills, s] });
  return (
    <div className="panel">
      <div className="ph"><div><h3>Staff</h3><p className="small muted">Everyone who works at a counter. The roster, duties and pay all start from this list.</p></div>{isOwner && <button className="btn primary sm" onClick={() => setAdd({ name: '', phone: '', password: '', station_id: stationId || stations[0]?.id, position: 'barista', hourly_rate: 120 })}>Add staff</button>}</div>
      <DataTable csvName="staff" rows={data} search={(r: any) => `${r.name} ${r.phone} ${r.station_name} ${r.position}`} onRow={(r: any) => setEdit({ ...r, new_station: r.station_id, skills: r.skills || ['bar', 'counter'], days_off: r.days_off || [], profile_active: r.profile_active })}
        cols={[
          { key: 'name', label: 'Name', sort: (r: any) => r.name, render: (r: any) => <><strong>{r.name}</strong> {!r.active && <span className="chip">Off</span>}<div className="small muted">{r.employee_code} · {r.phone}</div></> },
          { key: 'station', label: 'Station', sort: (r: any) => r.station_name || '', render: (r: any) => <>{r.station_name}{r.can_float && <span className="chip" style={{ marginLeft: 6 }}>floats</span>}</> },
          { key: 'pos', label: 'Role', sort: (r: any) => r.position || '', render: (r: any) => (POSITIONS.find((p) => p[0] === r.position)?.[1] || r.position || '–') },
          { key: 'week', label: 'Hours this week', num: true, sort: (r: any) => Number(r.week_hours), render: (r: any) => `${Number(r.week_hours)} h` },
          { key: 'next', label: 'Next shift', render: (r: any) => (r.next_shift ? <span className="small">{fmtDate(r.next_shift.start)} {fmtTime(r.next_shift.start)}<br /><span className="muted">{r.next_shift.station}</span></span> : '–'), csv: (r: any) => r.next_shift?.start || '' },
          ...(isOwner ? [{ key: 'rate', label: 'Hourly rate', num: true, sort: (r: any) => Number(r.hourly_rate), render: (r: any) => (Number(r.hourly_rate) ? rs(r.hourly_rate) : <span className="chip marigold">Set a rate</span>) }] : []),
        ]} />
      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)}>
          <div className="col">
            <div className="grid g2"><Field label="Role"><select value={edit.position || 'barista'} onChange={(e) => setEdit({ ...edit, position: e.target.value })}>{POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              {isOwner && <Field label="Hourly rate (Rs)"><input type="number" min={0} value={edit.hourly_rate} onChange={(e) => setEdit({ ...edit, hourly_rate: e.target.value })} /></Field>}
              {isOwner && <Field label="Home station"><select value={edit.new_station} onChange={(e) => setEdit({ ...edit, new_station: e.target.value })}>{stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
              <Field label="Most shifts a week"><input type="number" min={1} max={7} value={edit.max_shifts_week} onChange={(e) => setEdit({ ...edit, max_shifts_week: e.target.value })} /></Field>
              <Field label="Likes working"><select value={edit.preferred_shift} onChange={(e) => setEdit({ ...edit, preferred_shift: e.target.value })}><option value="any">Any shift</option><option value="morning">Mornings</option><option value="evening">Evenings</option></select></Field>
              <Field label="Emergency phone"><input value={edit.emergency_phone || ''} onChange={(e) => setEdit({ ...edit, emergency_phone: e.target.value })} /></Field></div>
            <div><span className="label">Can work</span><div className="row wrap" style={{ marginTop: 6 }}>{[['bar', 'The bar (drinks)'], ['counter', 'The counter (orders and cash)']].map(([v, l]) => <label key={v} className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={edit.skills.includes(v)} onChange={() => toggleSkill(v)} />{l}</label>)}</div></div>
            <div><span className="label">Regular days off</span><div className="row wrap" style={{ marginTop: 6 }}>{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} type="button" aria-pressed={edit.days_off.includes(d)} className={`btn sm ${edit.days_off.includes(d) ? 'primary' : 'ghost'}`} onClick={() => toggleDay(d)}>{DOW[d]}</button>)}</div></div>
            <label className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={edit.can_float} onChange={(e) => setEdit({ ...edit, can_float: e.target.checked })} />Can cover other stations when one is short</label>
            <Field label="Notes"><textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} maxLength={300} /></Field>
            <div className="row wrap"><button className="btn primary grow" onClick={save}>Save</button>
              <button className="btn ghost" onClick={() => { const p = prompt('New password for this person (6+ characters)'); if (p) api(`/admin/staff/${edit.id}`, { method: 'PATCH', body: { password: p } }).then(() => toast('Password changed')).catch((e) => toast(e.message, true)); }}>Reset password</button>
              <button className="btn danger" onClick={() => { setEdit({ ...edit, active: !edit.active, profile_active: !edit.active }); }}>{edit.active ? 'Turn off access' : 'Turn access back on'}</button></div>
            {edit.active === false && <p className="small muted">Press Save to apply.</p>}
          </div>
        </Modal>
      )}
      {add && (
        <Modal title="Add a staff member" onClose={() => setAdd(null)}>
          <div className="col">
            <Field label="Name"><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Mobile number (their sign-in)"><input inputMode="tel" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></Field>
            <Field label="Starting password" hint="They can change it in the app."><input type="password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></Field>
            <div className="grid g3"><Field label="Station"><select value={add.station_id} onChange={(e) => setAdd({ ...add, station_id: e.target.value })}>{stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Role"><select value={add.position} onChange={(e) => setAdd({ ...add, position: e.target.value })}>{POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Hourly rate (Rs)"><input type="number" min={0} value={add.hourly_rate} onChange={(e) => setAdd({ ...add, hourly_rate: e.target.value })} /></Field></div>
            <button className="btn primary" disabled={add.name.length < 2 || add.password.length < 6 || !add.phone} onClick={create}>Add</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ====================================================================== roster */
const CHIP: Record<string, string> = { open: 'marigold', completed: 'hill', absent: 'cherry', checked_in: 'roast' };
export function RosterBoard() {
  const { stationId, stations, tick } = useDash();
  const toast = useToast();
  const [st, setSt] = useState(stationId || stations[0]?.id || '');
  useEffect(() => { if (stationId) setSt(stationId); else if (!st && stations[0]) setSt(stations[0].id); }, [stationId, stations.length]);
  const [from, setFrom] = useState(monday(nptToday()));
  const to = addDays(from, 6);
  const { data, reload, error } = useData<any>(st ? `/hr/roster?station_id=${st}&from=${from}&to=${to}` : null, [st, from, tick]);
  const staff = useData<any[]>(st ? `/hr/staff?station_id=${st}` : null, [st]);
  const [auto, setAuto] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [pick, setPick] = useState<any>(null);
  const [times, setTimes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const tpls: any[] = (data?.templates || []).filter((t: any) => t.station_id === st);
  const unpublished = (data?.shifts || []).filter((s: any) => s.user_id && !s.published && s.status === 'scheduled').length;
  const open = (data?.shifts || []).filter((s: any) => !s.user_id).length;

  async function run() {
    setBusy(true);
    try { const r = await api('/hr/roster/auto-assign', { method: 'POST', body: { station_id: st, from: auto.from, to: auto.to, replace: auto.replace } }); setAuto(null); setResult(r); reload(); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function publish() { try { const r = await api('/hr/roster/publish', { method: 'POST', body: { station_id: st, from, to } }); toast(r.published ? `Published. ${r.people} people were told.` : 'Nothing new to publish'); reload(); } catch (e: any) { toast(e.message, true); } }
  async function patchShift(id: string, body: any) { try { await api(`/hr/roster/shifts/${id}`, { method: 'PATCH', body }); setPick(null); reload(); } catch (e: any) { toast(e.message, true); } }
  async function addShift(date: string, tplId: string, user_id: string | null) { try { await api('/hr/roster/shifts', { method: 'POST', body: { station_id: st, date, template_id: tplId, user_id } }); setPick(null); reload(); } catch (e: any) { toast(e.message, true); } }
  async function saveTimes() { try { await api(`/hr/templates/${st}`, { method: 'PUT', body: times.map((t: any) => ({ name: t.name, kind: t.kind, start_time: String(t.start_time).slice(0, 5), hours: Number(t.hours), min_staff: Number(t.min_staff), max_staff: Number(t.max_staff) })) }); setTimes(null); reload(); toast('Shift times saved'); } catch (e: any) { toast(e.message, true); } }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel">
        <div className="ph">
          <div className="row wrap"><select aria-label="Station" value={st} onChange={(e) => setSt(e.target.value)} style={{ width: 'auto', minHeight: 40 }}>{stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <div className="row"><button className="iconbtn" aria-label="Previous week" onClick={() => setFrom(addDays(from, -7))}><Icon name="chevl" size={18} /></button><strong style={{ minWidth: 170, textAlign: 'center' }}>{fmtDate(from)} to {fmtDate(to)}</strong><button className="iconbtn" aria-label="Next week" onClick={() => setFrom(addDays(from, 7))}><Icon name="chevr" size={18} /></button></div>
            <button className="btn sm ghost" onClick={() => setFrom(monday(nptToday()))}>This week</button></div>
          <div className="row wrap"><button className="btn sm" onClick={() => setTimes(tpls.map((t) => ({ ...t })))}>Shift times</button><button className="btn sm" onClick={() => setAuto({ from, to, replace: true })}><Icon name="zap" size={16} />Auto-assign</button><button className="btn sm primary" disabled={!unpublished} onClick={publish}>{unpublished ? `Publish ${unpublished} shifts` : 'All published'}</button></div>
        </div>
        <p className="small muted" style={{ marginBottom: 10 }}>Shifts are 6 hours. <strong>Auto-assign</strong> fills the week fairly: one shift a day, rest between shifts, days off and approved leave respected, a bar-skilled person on every shift, and duties given out. Then publish, so staff are told. {open > 0 && <strong style={{ color: 'var(--cherry)' }}>{open} slot{open > 1 ? 's are' : ' is'} still open.</strong>}</p>
        <ErrorNote error={error} />
        {!data ? <Skeleton h={60} n={4} /> : !tpls.length ? <Empty>No shift times for this station yet. Press Shift times to set them.</Empty> : (
          <div className="tablewrap"><table style={{ tableLayout: 'fixed', minWidth: 900 }}>
            <thead><tr><th style={{ width: 130 }}>Shift</th>{days.map((d) => <th key={d} style={{ background: d === nptToday() ? 'color-mix(in srgb, var(--marigold) 25%, transparent)' : undefined }}>{dayLabel(d)}</th>)}</tr></thead>
            <tbody>{tpls.map((t) => (
              <tr key={t.id}><td><strong>{t.name}</strong><div className="small muted">{String(t.start_time).slice(0, 5)} · {t.hours} h</div></td>
                {days.map((d) => {
                  const cell = data.shifts.filter((s: any) => s.template_id === t.id && s.date === d);
                  const filled = cell.filter((s: any) => s.user_id).length;
                  return (
                    <td key={d} style={{ verticalAlign: 'top', padding: 6 }}>
                      <div className="col" style={{ gap: 4 }}>
                        {cell.map((s: any) => (
                          <button key={s.id} className={`chip ${CHIP[s.status] || ''}`} onClick={() => setPick({ shift: s })} title={s.duty || ''} style={{ justifyContent: 'flex-start', cursor: 'pointer', borderStyle: s.user_id && !s.published && s.status === 'scheduled' ? 'dashed' : 'solid', width: '100%', borderRadius: 10, padding: '4px 8px', fontSize: 12, flexDirection: 'column', alignItems: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }}>
                            <b>{s.user_name || 'Open slot'}</b><span style={{ opacity: 0.8 }}>{s.duty || (s.user_id ? '' : 'tap to assign')}</span>
                          </button>))}
                        {filled < t.min_staff && !cell.some((c: any) => !c.user_id) && <span className="small err">Needs {t.min_staff - filled}</span>}
                        <button className="btn ghost sm" style={{ minHeight: 28, padding: '2px 8px' }} onClick={() => setPick({ add: { date: d, tpl: t } })} aria-label={`Add a shift on ${dayLabel(d)}, ${t.name}`}><Icon name="plus" size={14} /></button>
                      </div>
                    </td>);
                })}</tr>))}</tbody></table></div>
        )}
        {data?.leave?.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>On leave this week: {data.leave.map((l: any) => `${l.name} (${l.f === l.t ? fmtDate(l.f) : `${fmtDate(l.f)} to ${fmtDate(l.t)}`})`).join(', ')}</p>}
        <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: 'var(--surface-sunk)', border: '1px dashed var(--ink-muted)' }} />Not published</span><span><i style={{ background: 'var(--marigold)' }} />Open slot</span><span><i style={{ background: 'var(--roast)' }} />On shift</span><span><i style={{ background: 'var(--hill)' }} />Worked</span><span><i style={{ background: 'var(--cherry)' }} />Absent</span></div>
      </div>

      {auto && (
        <Modal title="Auto-assign the roster" onClose={() => setAuto(null)}>
          <div className="col">
            <div className="row wrap"><button className="btn sm" onClick={() => setAuto({ ...auto, from: monday(nptToday()), to: addDays(monday(nptToday()), 6) })}>This week</button><button className="btn sm" onClick={() => setAuto({ ...auto, from: addDays(monday(nptToday()), 7), to: addDays(monday(nptToday()), 13) })}>Next week</button><button className="btn sm" onClick={() => setAuto({ ...auto, from, to })}>The week shown</button></div>
            <div className="grid g2"><Field label="From"><input type="date" value={auto.from} onChange={(e) => setAuto({ ...auto, from: e.target.value })} /></Field><Field label="To"><input type="date" value={auto.to} onChange={(e) => setAuto({ ...auto, to: e.target.value })} /></Field></div>
            <label className="row small"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={auto.replace} onChange={(e) => setAuto({ ...auto, replace: e.target.checked })} />Redo shifts the system planned before. Shifts you set by hand and shifts already started are always kept.</label>
            <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Planning…' : 'Plan the roster'}</button>
          </div>
        </Modal>
      )}
      {result && (
        <Modal title="Roster planned" onClose={() => setResult(null)}>
          <div className="col"><p><strong>{result.created}</strong> shifts filled{result.kept ? `, ${result.kept} kept` : ''}.</p>
            {result.unfilled.length > 0 && <div><strong className="err">{result.unfilled.length} open</strong><div className="small muted">{result.unfilled.slice(0, 8).map((u: any) => `${fmtDate(u.date)} ${u.shift}`).join(' · ')}{result.unfilled.length > 8 ? '…' : ''}</div></div>}
            {result.warnings.map((w: string) => <p key={w} className="small">{w}</p>)}
            <div className="tablewrap"><table><thead><tr><th>Person</th><th className="num">Hours</th></tr></thead><tbody>{Object.entries(result.hours).sort((a: any, b: any) => b[1] - a[1]).map(([n, h]: any) => <tr key={n}><td>{n}</td><td className="num">{h} h</td></tr>)}</tbody></table></div>
            <p className="small muted">Check the board, change anything you like, then press Publish.</p></div>
        </Modal>
      )}
      {pick?.shift && (
        <Modal title={`${pick.shift.template_name || 'Shift'} · ${dayLabel(pick.shift.date)}`} onClose={() => setPick(null)}>
          <div className="col">
            <p className="muted small">{fmtTime(pick.shift.start_at)} to {fmtTime(pick.shift.end_at)} · {pick.shift.status.replace('_', ' ')}{pick.shift.auto_assigned ? ' · planned automatically' : ''}</p>
            {['scheduled', 'open'].includes(pick.shift.status) ? (
              <>
                <Field label="Who works it"><select value={pick.shift.user_id || ''} onChange={(e) => patchShift(pick.shift.id, { user_id: e.target.value || null })}><option value="">Nobody (open slot)</option>{staff.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.station_name}{p.station_id !== st ? ' (other station)' : ''}</option>)}</select></Field>
                <Field label="Duty"><select value={pick.shift.duty || ''} onChange={(e) => patchShift(pick.shift.id, { duty: e.target.value })}>{['', 'Opening + Bar', 'Opening + Counter', 'Closing + Bar', 'Closing + Counter', 'Bar', 'Counter', 'Bar + Counter', 'Float'].map((d) => <option key={d} value={d}>{d || 'No duty'}</option>)}</select></Field>
                <button className="btn danger" onClick={() => patchShift(pick.shift.id, { cancel: true })}>Remove this shift</button>
              </>
            ) : <p>{pick.shift.user_name} · {pick.shift.checked_in_at ? `in ${fmtTime(pick.shift.checked_in_at)}` : 'not checked in'}{pick.shift.checked_out_at ? `, out ${fmtTime(pick.shift.checked_out_at)}` : ''}. Fix hours under Attendance.</p>}
            {pick.shift.tasks > 0 && <p className="small muted">Checklist: {pick.shift.tasks_done} of {pick.shift.tasks} done</p>}
          </div>
        </Modal>
      )}
      {pick?.add && (
        <Modal title={`Add a shift · ${dayLabel(pick.add.date)} · ${pick.add.tpl.name}`} onClose={() => setPick(null)}>
          <div className="col"><Field label="Who works it"><select defaultValue="" onChange={(e) => addShift(pick.add.date, pick.add.tpl.id, e.target.value || null)}><option value="">Choose…</option>{staff.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.station_id !== st ? ' (other station)' : ''}</option>)}</select></Field>
            <button className="btn ghost" onClick={() => addShift(pick.add.date, pick.add.tpl.id, null)}>Add an open slot instead</button></div>
        </Modal>
      )}
      {times && (
        <Modal title="Shift times" onClose={() => setTimes(null)}>
          <div className="col"><p className="muted small">Each shift is normally 6 hours. Overlapping shifts keep the counter covered at busy times.</p>
            {times.map((t: any, i: number) => (
              <div key={i} className="card flat grid g2" style={{ gap: 8 }}>
                <Field label="Name"><input value={t.name} onChange={(e) => setTimes(times.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
                <Field label="Kind"><select value={t.kind} onChange={(e) => setTimes(times.map((x: any, j: number) => (j === i ? { ...x, kind: e.target.value } : x)))}><option value="morning">Morning</option><option value="midday">Midday</option><option value="evening">Evening</option><option value="any">Any</option></select></Field>
                <Field label="Starts"><input type="time" value={String(t.start_time).slice(0, 5)} onChange={(e) => setTimes(times.map((x: any, j: number) => (j === i ? { ...x, start_time: e.target.value } : x)))} /></Field>
                <Field label="Hours"><input type="number" min={1} max={12} step={0.5} value={t.hours} onChange={(e) => setTimes(times.map((x: any, j: number) => (j === i ? { ...x, hours: e.target.value } : x)))} /></Field>
                <Field label="At least"><input type="number" min={0} value={t.min_staff} onChange={(e) => setTimes(times.map((x: any, j: number) => (j === i ? { ...x, min_staff: e.target.value } : x)))} /></Field>
                <Field label="At most"><input type="number" min={1} value={t.max_staff} onChange={(e) => setTimes(times.map((x: any, j: number) => (j === i ? { ...x, max_staff: e.target.value } : x)))} /></Field>
                <button className="btn ghost sm" onClick={() => setTimes(times.filter((_: any, j: number) => j !== i))}>Remove</button>
              </div>))}
            <button className="btn sm ghost" onClick={() => setTimes([...times, { name: 'New shift', kind: 'any', start_time: '09:00', hours: 6, min_staff: 1, max_staff: 2 }])}>Add a shift time</button>
            <button className="btn primary" disabled={!times.length} onClick={saveTimes}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================ attendance */
export function AttendanceTab() {
  const { stationId, tick } = useDash();
  const [days, setDays] = useState(7);
  const from = addDays(nptToday(), -(days - 1)), to = nptToday();
  const { data, reload, error } = useData<any[]>(`/hr/attendance?from=${from}&to=${to}${stationId ? `&station_id=${stationId}` : ''}`, [stationId, days, tick]);
  const toast = useToast();
  const [adj, setAdj] = useState<any>(null);
  async function save() { try { await api(`/hr/shifts/${adj.id}/adjust`, { method: 'POST', body: { minutes: Math.round(Number(adj.hours) * 60), reason: adj.reason } }); setAdj(null); reload(); toast('Hours updated'); } catch (e: any) { toast(e.message, true); } }
  const flagged = (data || []).filter((r) => r.flags.length).length;
  return (
    <div className="panel">
      <div className="ph"><div><h3>Attendance</h3><p className="small muted">Who came, when they left, and how many hours are paid. Late, early and unclosed shifts are flagged for you to check.</p></div><Seg value={days} onChange={setDays} options={[{ id: 7, label: '7 days' }, { id: 14, label: '14 days' }, { id: 30, label: '30 days' }]} /></div>
      <ErrorNote error={error} />
      {!data ? <Skeleton h={44} n={5} /> : <>
        <div className="grid g3" style={{ marginBottom: 12 }}><Kpi label="Shifts" value={data.length} /><Kpi label="Need a look" value={flagged} /><Kpi label="Paid hours" value={`${Math.round(data.reduce((a, r) => a + (r.minutes || 0), 0) / 6) / 10} h`} /></div>
        <DataTable csvName="attendance" rows={data} search={(r: any) => `${r.name} ${r.station_name}`} onRow={(r: any) => setAdj({ ...r, hours: ((r.minutes ?? 0) / 60).toFixed(2), reason: '' })}
          cols={[{ key: 'date', label: 'Date', sort: (r: any) => r.start_at, render: (r: any) => fmtDate(r.date) }, { key: 'name', label: 'Who', sort: (r: any) => r.name, render: (r: any) => <><strong>{r.name}</strong><div className="small muted">{r.station_name} · {r.duty}</div></> },
            { key: 'shift', label: 'Shift', render: (r: any) => `${fmtTime(r.start_at)}–${fmtTime(r.end_at)}` }, { key: 'in', label: 'In / out', render: (r: any) => (r.checked_in_at ? `${fmtTime(r.checked_in_at)} / ${r.checked_out_at ? fmtTime(r.checked_out_at) : '…'}` : '–') },
            { key: 'hrs', label: 'Paid', num: true, sort: (r: any) => r.minutes ?? 0, render: (r: any) => hrs(r.minutes), csv: (r: any) => (r.minutes ?? 0) / 60 }, { key: 'tasks', label: 'Checklist', num: true, render: (r: any) => (r.tasks ? `${r.tasks_done}/${r.tasks}` : '–') },
            { key: 'flags', label: 'Check', render: (r: any) => (r.flags.length ? r.flags.map((f: string) => <span key={f} className="chip cherry" style={{ margin: 2 }}>{f}</span>) : <span className="chip hill">OK</span>), csv: (r: any) => r.flags.join('; ') }]} />
      </>}
      {adj && (
        <Modal title={`${adj.name} · ${fmtDate(adj.date)}`} onClose={() => setAdj(null)}>
          <div className="col"><p className="muted small">Scheduled {fmtTime(adj.start_at)} to {fmtTime(adj.end_at)}. {adj.adjust_reason ? `Note: ${adj.adjust_reason}` : ''}</p>
            <Field label="Paid hours"><input type="number" step="0.25" min={0} max={16} value={adj.hours} onChange={(e) => setAdj({ ...adj, hours: e.target.value })} /></Field>
            <Field label="Why" hint="Kept on record with your name."><input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="Covered a busy morning" /></Field>
            <button className="btn primary" disabled={adj.reason.length < 3} onClick={save}>Save the hours</button></div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================= time off */
export function TimeOffTab() {
  const { data, reload } = useData<any[]>('/hr/time-off');
  const toast = useToast();
  async function decide(id: string, approve: boolean) { try { await api(`/hr/time-off/${id}/decide`, { method: 'POST', body: { approve } }); reload(); toast(approve ? 'Approved. Their shifts in those days were removed.' : 'Not approved'); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="panel"><div className="ph"><div><h3>Time off</h3><p className="small muted">Approved leave is never rostered, and any shifts already planned on those days are removed.</p></div></div>
      {!data ? <Skeleton h={50} n={3} /> : !data.length ? <Empty>No requests.</Empty> : <div className="col" style={{ gap: 8 }}>{data.map((t) => (
        <div key={t.id} className="card flat row between wrap"><div><strong>{t.name}</strong> <span className="muted small">{t.station_name}</span><div className="small">{fmtDate(t.from_date)}{t.to_date !== t.from_date ? ` to ${fmtDate(t.to_date)}` : ''} · {t.kind}{t.reason ? ` · ${t.reason}` : ''}</div></div>
          {t.status === 'requested' ? <div className="row"><button className="btn sm primary" onClick={() => decide(t.id, true)}>Approve</button><button className="btn sm ghost" onClick={() => decide(t.id, false)}>Decline</button></div> : <span className={`chip ${t.status === 'approved' ? 'hill' : ''}`}>{t.status}</span>}</div>))}</div>}
    </div>
  );
}

/* ================================================================== payroll */
export function PayrollTab() {
  const runs = useData<any[]>('/hr/payroll/runs');
  const adjs = useData<any[]>('/hr/payroll/adjustments');
  const staff = useData<any[]>('/hr/staff');
  const toast = useToast();
  const today = nptToday();
  const [range, setRange] = useState({ from: addDays(today, -13), to: today });
  const [preview, setPreview] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [slip, setSlip] = useState<any>(null);
  const [adj, setAdj] = useState<any>(null);
  async function doPreview() { try { setPreview(await api(`/hr/payroll/preview?from=${range.from}&to=${range.to}`)); } catch (e: any) { toast(e.message, true); } }
  async function create() { try { const r = await api('/hr/payroll/runs', { method: 'POST', body: range }); setPreview(null); runs.reload(); setOpen(await api(`/hr/payroll/runs/${r.id}`)); toast('Draft payroll created'); } catch (e: any) { toast(e.message, true); } }
  async function act(path: string, body: any = {}, msg = 'Done', method = 'POST') { try { await api(path, { method, body }); runs.reload(); adjs.reload(); if (open && !path.endsWith(open.id) || method === 'POST') setOpen(open ? await api(`/hr/payroll/runs/${open.id}`).catch(() => null) : null); toast(msg); } catch (e: any) { toast(e.message, true); } }
  async function csv(id: string, name: string) { const r = await fetch(`${BASE}/hr/payroll/runs/${id}/csv`, { headers: { Authorization: `Bearer ${store.get()?.access}` } }); const u = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
  const tot = (rows: any[]) => ({ hours: rows.reduce((a, l) => a + (l.regular_minutes + l.overtime_minutes) / 60, 0), gross: rows.reduce((a, l) => a + Number(l.gross), 0), net: rows.reduce((a, l) => a + Number(l.net), 0) });
  const Lines = ({ rows, onSlip }: { rows: any[]; onSlip?: (l: any) => void }) => (
    <div className="tablewrap"><table><thead><tr><th>Name</th><th className="num">Regular</th><th className="num">Overtime</th><th className="num">Rate</th><th className="num">Gross</th><th className="num">Extras</th><th className="num">Deductions</th><th className="num">Net pay</th><th /></tr></thead>
      <tbody>{rows.map((l) => <tr key={l.user_id}><td><strong>{l.name}</strong></td><td className="num">{hrs(l.regular_minutes)}</td><td className="num">{l.overtime_minutes ? hrs(l.overtime_minutes) : '–'}</td><td className="num">{rs(l.hourly_rate)}</td><td className="num">{rs(l.gross)}</td><td className="num">{Number(l.adjustments) ? rs(l.adjustments) : '–'}</td><td className="num">{Number(l.deductions) ? rs(l.deductions) : '–'}</td><td className="num"><strong>{rs(l.net)}</strong></td><td>{onSlip && <button className="btn sm ghost" onClick={() => onSlip(l)}>Payslip</button>}</td></tr>)}
        <tr><td colSpan={4}><strong>Total</strong></td><td className="num"><strong>{rs(tot(rows).gross)}</strong></td><td colSpan={2} /><td className="num"><strong>{rs(tot(rows).net)}</strong></td><td /></tr></tbody></table></div>
  );
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel">
        <div className="ph"><div><h3>Run payroll</h3><p className="small muted">Pay is the hours worked on completed shifts times the hourly rate. Hours beyond 8 a day or 48 a week are overtime at 1.5 times. Social security and extras come from your settings and the adjustments below.</p></div></div>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field><Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <button className="btn" onClick={doPreview}>Preview</button>
          <div className="row"><button className="btn sm ghost" onClick={() => setRange({ from: addDays(today, -13), to: today })}>Last 14 days</button><button className="btn sm ghost" onClick={() => { const d = new Date(`${today}T00:00:00Z`); const f = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))); const t = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))); setRange({ from: f, to: t }); }}>Last month</button></div>
        </div>
        {preview && <div style={{ marginTop: 14 }}>{!preview.length ? <Empty>No completed shifts in these dates.</Empty> : <><Lines rows={preview} /><div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={create}>Create a draft payroll</button><span className="small muted">{Math.round(tot(preview).hours * 10) / 10} hours, {preview.length} people</span></div></>}</div>}
      </div>

      <div className="panel">
        <div className="ph"><h3>Payroll runs</h3></div>
        {!runs.data ? <Skeleton h={44} n={3} /> : !runs.data.length ? <Empty>No payroll runs yet.</Empty> : <div className="col" style={{ gap: 8 }}>{runs.data.map((r) => (
          <button key={r.id} className="card flat row between wrap" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={async () => setOpen(await api(`/hr/payroll/runs/${r.id}`))}>
            <span><strong>{fmtDate(r.period_from)} to {fmtDate(r.period_to)}</strong><span className="small muted" style={{ display: 'block' }}>{r.totals.people ?? 0} people · {r.totals.hours ?? 0} h{r.reference ? ` · ${r.reference}` : ''}</span></span>
            <span className="row"><strong>{rs(r.totals.net || 0)}</strong><span className={`chip ${r.status === 'paid' ? 'hill' : r.status === 'approved' ? 'marigold' : ''}`}>{r.status}</span></span></button>))}</div>}
      </div>

      <div className="panel">
        <div className="ph"><div><h3>Bonuses, allowances and advances</h3><p className="small muted">Added to a person’s pay for the month. Use a minus for an advance or a deduction.</p></div><button className="btn sm primary" onClick={() => setAdj({ user_id: staff.data?.[0]?.id, month: today, label: '', amount: '' })}>Add</button></div>
        {!adjs.data ? <Skeleton h={40} n={2} /> : !adjs.data.length ? <Empty>None.</Empty> : <div className="tablewrap"><table><thead><tr><th>Month</th><th>Person</th><th>For</th><th className="num">Amount</th><th /></tr></thead><tbody>{adjs.data.map((a) => <tr key={a.id}><td>{fmtDate(a.month)}</td><td>{a.name}</td><td>{a.label}</td><td className="num" style={{ color: Number(a.amount) < 0 ? 'var(--cherry)' : undefined }}>{rs(a.amount)}</td><td>{a.run_id ? <span className="chip">In a payroll</span> : <button className="btn sm ghost" onClick={() => act(`/hr/payroll/adjustments/${a.id}`, undefined, 'Removed', 'DELETE')}>Remove</button>}</td></tr>)}</tbody></table></div>}
      </div>

      {open && (
        <Modal title={`Payroll ${fmtDate(open.period_from)} to ${fmtDate(open.period_to)}`} onClose={() => setOpen(null)}>
          <div className="col"><div className="row wrap"><span className={`chip ${open.status === 'paid' ? 'hill' : open.status === 'approved' ? 'marigold' : ''}`}>{open.status}</span>{open.reference && <span className="small muted">Reference {open.reference}</span>}</div>
            <Lines rows={open.lines} onSlip={(l) => setSlip({ ...l, period: open })} />
            <div className="row wrap">
              {open.status === 'draft' && <><button className="btn sm" onClick={() => act(`/hr/payroll/runs/${open.id}/recalculate`, {}, 'Recalculated')}>Recalculate</button><button className="btn sm primary" onClick={() => confirm('Approve this payroll? Hours in these dates are locked afterwards, and staff get their payslips.') && act(`/hr/payroll/runs/${open.id}/approve`, {}, 'Approved. Staff were told their payslip is ready.')}>Approve</button><button className="btn sm danger" onClick={async () => { await act(`/hr/payroll/runs/${open.id}`, undefined, 'Draft deleted', 'DELETE'); setOpen(null); }}>Delete draft</button></>}
              {open.status === 'approved' && <button className="btn sm primary" onClick={() => { const r = prompt('Payment reference, such as the bank transfer number'); if (r) act(`/hr/payroll/runs/${open.id}/pay`, { reference: r }, 'Marked paid'); }}>Mark as paid</button>}
              <button className="btn sm ghost" onClick={() => csv(open.id, `payroll-${open.period_from}-${open.period_to}.csv`)}><Icon name="down" size={16} />CSV</button></div></div>
        </Modal>
      )}
      {slip && (
        <Modal title="Payslip" onClose={() => setSlip(null)}>
          <div id="payslip" className="col" style={{ gap: 8 }}>
            <div className="row between"><strong style={{ fontSize: 20 }}>{slip.name}</strong><span className="muted small">{fmtDate(slip.period.period_from)} to {fmtDate(slip.period.period_to)}</span></div>
            <div className="row between"><span>Regular hours</span><span>{hrs(slip.regular_minutes)} × {rs(slip.hourly_rate)}</span></div>
            {slip.overtime_minutes > 0 && <div className="row between"><span>Overtime</span><span>{hrs(slip.overtime_minutes)} × 1.5</span></div>}
            <div className="row between"><strong>Gross pay</strong><strong>{rs(slip.gross)}</strong></div>
            {(slip.details?.adjustment_items || []).map((a: any, i: number) => <div key={i} className="row between"><span>{a.label}</span><span>{rs(a.amount)}</span></div>)}
            {Number(slip.deductions) > 0 && <div className="row between"><span>Social security</span><span>− {rs(slip.deductions)}</span></div>}
            <hr style={{ border: 0, borderTop: '1px solid var(--hairline)' }} /><div className="row between"><strong style={{ fontSize: 20 }}>Net pay</strong><strong style={{ fontSize: 20 }}>{rs(slip.net)}</strong></div>
          </div>
          <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => window.print()}>Print</button>
        </Modal>
      )}
      {adj && (
        <Modal title="Bonus, allowance or advance" onClose={() => setAdj(null)}>
          <div className="col"><Field label="Person"><select value={adj.user_id} onChange={(e) => setAdj({ ...adj, user_id: e.target.value })}>{staff.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Month"><input type="date" value={adj.month} onChange={(e) => setAdj({ ...adj, month: e.target.value })} /></Field>
            <Field label="What it is for"><input value={adj.label} onChange={(e) => setAdj({ ...adj, label: e.target.value })} placeholder="Festival bonus" /></Field>
            <Field label="Amount (Rs)" hint="Minus for an advance or deduction"><input type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
            <button className="btn primary" disabled={adj.label.length < 2 || !Number(adj.amount)} onClick={async () => { try { await api('/hr/payroll/adjustments', { method: 'POST', body: { user_id: adj.user_id, month: adj.month, label: adj.label, amount: Number(adj.amount) } }); setAdj(null); adjs.reload(); toast('Added'); } catch (e: any) { toast(e.message, true); } }}>Add</button></div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================ the People section */
export function PeopleSection({ isOwner }: { isOwner: boolean }) {
  const [tab, setTab] = useState<'staff' | 'roster' | 'attendance' | 'off' | 'payroll'>('roster');
  useEffect(() => { const t = new URLSearchParams(location.search).get('tab'); if (t) setTab(t as any); }, []);
  return (
    <div className="col" style={{ gap: 16 }}>
      <Seg value={tab} onChange={setTab} options={[{ id: 'roster', label: 'Roster' }, { id: 'staff', label: 'Staff' }, { id: 'attendance', label: 'Attendance' }, { id: 'off', label: 'Time off' }, ...(isOwner ? [{ id: 'payroll', label: 'Payroll' }] : [])]} />
      {tab === 'roster' && <RosterBoard />}
      {tab === 'staff' && <StaffDirectory isOwner={isOwner} />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'off' && <TimeOffTab />}
      {tab === 'payroll' && isOwner && <PayrollTab />}
    </div>
  );
}

/* ======================================================== staff: my shift */
export function MyShift() {
  const { data, reload, error } = useData<any>('/hr/me');
  const toast = useToast();
  const [off, setOff] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Skeleton h={90} n={3} />;
  const cur = data.current, next = data.next;
  const shift = cur || next;
  async function act(path: string, ok: string) { try { const r = await api(path, { method: 'POST', body: {} }); toast(r.minutes != null ? `${ok} ${hrs(r.minutes)} counted.` : ok); reload(); } catch (e: any) { toast(e.message, true); } }
  async function tick(id: string) { try { await api(`/hr/me/tasks/${id}/toggle`, { method: 'POST', body: {} }); reload(); } catch (e: any) { toast(e.message, true); } }
  const upcoming = data.shifts.filter((s: any) => s.id !== shift?.id && new Date(s.end_at).getTime() > now && s.status === 'scheduled');
  return (
    <div className="col" style={{ gap: 16 }}>
      {shift ? (
        <div className="panel" style={{ borderColor: cur ? 'var(--hill)' : 'var(--hairline)', borderWidth: 2 }}>
          <div className="ph"><div><span className={`chip ${cur ? 'hill' : 'marigold'}`}>{cur ? 'On shift' : 'Next shift'}</span><h3 style={{ marginTop: 6 }}>{fmtDate(shift.start_at)} · {fmtTime(shift.start_at)} to {fmtTime(shift.end_at)}</h3><p className="muted">{shift.station_name}{shift.duty ? ` · ${shift.duty}` : ''}</p></div>
            {cur ? <button className="btn primary lg" onClick={() => act('/hr/me/check-out', 'Shift ended.')}>End my shift</button> : <button className="btn primary lg" disabled={!data.can_check_in} onClick={() => act('/hr/me/check-in', 'You are on shift.')} title={data.can_check_in ? '' : 'You can start 30 minutes before the shift'}>Start my shift</button>}</div>
          {!cur && !data.can_check_in && <p className="small muted">You can start up to 30 minutes before your shift begins.</p>}
          {shift.tasks?.length > 0 && <div className="col" style={{ gap: 8 }}><span className="label">Your checklist</span>{shift.tasks.map((t: any) => (
            <label key={t.id} className="row card flat" style={{ cursor: cur ? 'pointer' : 'default', opacity: t.done ? 0.6 : 1 }}><input type="checkbox" style={{ width: 24, minHeight: 24 }} disabled={!cur} checked={t.done} onChange={() => tick(t.id)} /><span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span></label>))}
            {!cur && <p className="small muted">Start your shift to tick things off.</p>}</div>}
        </div>
      ) : <Empty>No shift is planned for you right now. Check the list below, or ask your manager.</Empty>}

      <div className="grid g3">
        <Kpi label="This month" value={hrs(data.month.minutes)} hint={`${data.month.shifts} shifts worked`} />
        <Kpi label="Earned so far" value={rs(data.month.estimated_pay)} hint={`${rs(data.month.rate)} an hour, before any deductions`} />
        <Kpi label="Next up" value={upcoming[0] ? `${DOW[dow(upcoming[0].date)]} ${fmtTime(upcoming[0].start_at)}` : '–'} hint={upcoming[0]?.station_name || 'Nothing planned yet'} />
      </div>

      <div className="panel"><div className="ph"><h3>Coming up</h3></div>
        {!upcoming.length ? <Empty>No more shifts published yet.</Empty> : <div className="col" style={{ gap: 8 }}>{upcoming.slice(0, 10).map((s: any) => <div key={s.id} className="card flat row between wrap"><span><strong>{DOW[dow(s.date)]} {fmtDate(s.date)}</strong><span className="muted"> · {fmtTime(s.start_at)} to {fmtTime(s.end_at)}</span></span><span className="small">{s.station_name}{s.duty ? ` · ${s.duty}` : ''}</span></div>)}</div>}
      </div>

      <div className="panel"><div className="ph"><h3>Time off</h3><button className="btn sm primary" onClick={() => setOff({ from_date: addDays(nptToday(), 1), to_date: addDays(nptToday(), 1), kind: 'leave', reason: '' })}>Ask for time off</button></div>
        {!data.time_off.length ? <p className="muted small">No requests.</p> : <div className="col" style={{ gap: 8 }}>{data.time_off.map((t: any) => <div key={t.id} className="card flat row between wrap"><span>{fmtDate(t.from_date)}{t.to_date !== t.from_date ? ` to ${fmtDate(t.to_date)}` : ''} · {t.kind}</span><span className="row"><span className={`chip ${t.status === 'approved' ? 'hill' : t.status === 'rejected' ? 'cherry' : 'marigold'}`}>{t.status}</span>{t.status === 'requested' && <button className="btn sm ghost" onClick={async () => { try { await api(`/hr/me/time-off/${t.id}`, { method: 'DELETE' }); reload(); } catch (e: any) { toast(e.message, true); } }}>Withdraw</button>}</span></div>)}</div>}
      </div>

      {data.payslips.length > 0 && <div className="panel"><div className="ph"><h3>Payslips</h3></div><div className="col" style={{ gap: 8 }}>{data.payslips.map((p: any) => <div key={p.id} className="card flat row between wrap"><span><strong>{fmtDate(p.period_from)} to {fmtDate(p.period_to)}</strong><span className="small muted" style={{ display: 'block' }}>{hrs(p.regular_minutes + p.overtime_minutes)} worked · gross {rs(p.gross)}</span></span><span className="row"><strong>{rs(p.net)}</strong><span className={`chip ${p.run_status === 'paid' ? 'hill' : 'marigold'}`}>{p.run_status === 'paid' ? 'Paid' : 'Approved'}</span></span></div>)}</div></div>}

      {off && (
        <Modal title="Ask for time off" onClose={() => setOff(null)}>
          <div className="col"><div className="grid g2"><Field label="From"><input type="date" value={off.from_date} onChange={(e) => setOff({ ...off, from_date: e.target.value, to_date: off.to_date < e.target.value ? e.target.value : off.to_date })} /></Field><Field label="To"><input type="date" min={off.from_date} value={off.to_date} onChange={(e) => setOff({ ...off, to_date: e.target.value })} /></Field></div>
            <Field label="Kind"><select value={off.kind} onChange={(e) => setOff({ ...off, kind: e.target.value })}><option value="leave">Leave</option><option value="sick">Sick</option><option value="other">Other</option></select></Field>
            <Field label="Reason (optional)"><input value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} /></Field>
            <button className="btn primary" onClick={async () => { try { await api('/hr/me/time-off', { method: 'POST', body: { ...off, reason: off.reason || undefined } }); setOff(null); reload(); toast('Sent to your manager'); } catch (e: any) { toast(e.message, true); } }}>Send</button></div>
        </Modal>
      )}
    </div>
  );
}
