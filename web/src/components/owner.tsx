'use client';
import { useState } from 'react';
import { api, fmtDate, fmtDateTime, rs, BASE, store } from '@/lib/api';
import { Empty, Field, Loading, Modal, Stat, useData, useToast } from './ui';
import { RangePicker, sinceDays } from './admin';
import { Icon } from './icons';
import { useAuth } from '@/lib/auth';

export function StationsTab() {
  const { data, reload } = useData<any[]>('/admin/stations');
  const users = useData<any[]>('/owner/users?role=manager');
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const blank = { code: '', name: '', name_ne: '', address: '', district: '', lat: '', lng: '', opens: '07:00', closes: '20:00', order_letter: 'E', breakeven_cups: 220, manager_ids: [] as string[], operator_type: 'company', partner_name: '', partner_phone: '', revenue_share_pct: 0 };
  async function save() {
    const body: any = { ...edit, lat: edit.lat ? Number(edit.lat) : undefined, lng: edit.lng ? Number(edit.lng) : undefined, breakeven_cups: Number(edit.breakeven_cups) };
    delete body.id; delete body.managers; delete body.partner_phone_; if (!body.partner_name) delete body.partner_name; if (!body.partner_phone) delete body.partner_phone; body.revenue_share_pct = Number(body.revenue_share_pct || 0); delete body.queue; delete body.staff; delete body.created_at; delete body.within_hours;
    try {
      if (edit.id) await api(`/owner/stations/${edit.id}`, { method: 'PATCH', body: { ...body, opens: String(body.opens).slice(0, 5), closes: String(body.closes).slice(0, 5) } });
      else await api('/owner/stations', { method: 'POST', body });
      setEdit(null); reload(); toast('Station saved');
    } catch (e: any) { toast(e.message, true); }
  }
  if (!data) return <Loading />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Stations</h3><button className="btn primary sm" onClick={() => setEdit(blank)}>Open a new station</button></div>
      <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Code</th><th>Name</th><th>Hours</th><th>Managers</th><th className="num">Staff</th><th className="num">Queue</th><th /></tr></thead>
        <tbody>{data.map((s) => <tr key={s.id}><td><strong>{s.code}</strong></td><td>{s.name} {!s.active && <span className="chip">Closed down</span>}</td><td>{String(s.opens).slice(0, 5)}–{String(s.closes).slice(0, 5)}</td><td>{s.operator_type === 'partner' ? <span className="chip">{s.partner_name} · {s.revenue_share_pct}%</span> : <span className="chip hill">Sadhai-run</span>} {s.managers.map((m: any) => m.name).join(', ')}</td><td className="num">{s.staff}</td><td className="num">{s.queue}</td>
          <td className="right"><button className="btn sm" onClick={() => setEdit({ ...s, manager_ids: s.managers.map((m: any) => m.id), lat: s.lat ?? '', lng: s.lng ?? '' })}>Edit</button></td></tr>)}</tbody></table></div>
      {edit && (
        <Modal title={edit.id ? 'Edit station' : 'New station'} onClose={() => setEdit(null)}>
          <div className="col">
            <div className="grid g2"><Field label="Code"><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} disabled={!!edit.id} /></Field><Field label="Order letter"><input maxLength={1} value={edit.order_letter} onChange={(e) => setEdit({ ...edit, order_letter: e.target.value.toUpperCase() })} /></Field></div>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Name in Nepali"><input value={edit.name_ne || ''} onChange={(e) => setEdit({ ...edit, name_ne: e.target.value })} /></Field>
            <Field label="Address"><input value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <div className="grid g2"><Field label="Latitude"><input value={edit.lat} onChange={(e) => setEdit({ ...edit, lat: e.target.value })} /></Field><Field label="Longitude"><input value={edit.lng} onChange={(e) => setEdit({ ...edit, lng: e.target.value })} /></Field></div>
            <div className="grid g3"><Field label="Opens"><input type="time" value={String(edit.opens).slice(0, 5)} onChange={(e) => setEdit({ ...edit, opens: e.target.value })} /></Field><Field label="Closes"><input type="time" value={String(edit.closes).slice(0, 5)} onChange={(e) => setEdit({ ...edit, closes: e.target.value })} /></Field><Field label="Break-even cups / day"><input type="number" value={edit.breakeven_cups} onChange={(e) => setEdit({ ...edit, breakeven_cups: e.target.value })} /></Field></div>
            <Field label="Run by"><select value={edit.operator_type} onChange={(e) => setEdit({ ...edit, operator_type: e.target.value })}><option value="company">Sadhai</option><option value="partner">Partner cafe</option></select></Field>
            {edit.operator_type === 'partner' && <div className="grid g3"><Field label="Cafe name"><input value={edit.partner_name || ''} onChange={(e) => setEdit({ ...edit, partner_name: e.target.value })} /></Field><Field label="Cafe phone"><input value={edit.partner_phone || ''} onChange={(e) => setEdit({ ...edit, partner_phone: e.target.value })} /></Field><Field label="Cafe share of net sales (%)"><input type="number" min={0} max={100} value={edit.revenue_share_pct} onChange={(e) => setEdit({ ...edit, revenue_share_pct: e.target.value })} /></Field></div>}
            <Field label="Managers">
              <div className="col" style={{ gap: 4 }}>{users.data?.map((u) => <label key={u.id} className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={edit.manager_ids.includes(u.id)} onChange={(e) => setEdit({ ...edit, manager_ids: e.target.checked ? [...edit.manager_ids, u.id] : edit.manager_ids.filter((x: string) => x !== u.id) })} />{u.name}</label>)}</div>
            </Field>
            {edit.id && <label className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Station is active</label>}
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function MenuTab() {
  const { data, reload } = useData<any>('/owner/menu');
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  if (!data) return <Loading />;
  const blank = { sku: '', name: '', name_ne: '', description: '', price: 150, cost: 45, category_id: data.categories[0]?.id, prep_seconds: 90, is_signature: false, is_seasonal: false, pass_eligible: true, active: true };
  async function save() {
    const { id, category, option_groups, recipe, created_at, ...b } = edit;
    try {
      b.price = Number(b.price); b.cost = Number(b.cost); b.prep_seconds = Number(b.prep_seconds);
      for (const k of Object.keys(b)) if (b[k] === null || b[k] === '') delete b[k];
      if (id) await api(`/owner/products/${id}`, { method: 'PATCH', body: b }); else await api('/owner/products', { method: 'POST', body: b });
      setEdit(null); reload(); toast('Item saved');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Menu and prices</h3><button className="btn primary sm" onClick={() => setEdit(blank)}>Add item</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>Prices are all-in: VAT and service included. Nothing is added at the till.</p>
      <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Item</th><th>Category</th><th className="num">Price</th><th className="num">Food cost</th><th className="num">Margin</th><th /></tr></thead>
        <tbody>{data.products.map((p: any) => <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}><td><strong>{p.name}</strong> {p.is_signature && <span className="chip hill">Signature</span>} {p.is_seasonal && <span className="chip marigold">Seasonal</span>}<div className="small muted">{p.name_ne}</div></td><td>{p.category}</td><td className="num">{rs(p.price)}</td><td className="num">{rs(p.cost)}</td><td className="num">{p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0}%</td><td className="right"><button className="btn sm" onClick={() => setEdit(p)}>Edit</button></td></tr>)}</tbody></table></div>
      {edit && (
        <Modal title={edit.id ? edit.name : 'New item'} onClose={() => setEdit(null)}>
          <div className="col">
            <div className="grid g2"><Field label="SKU"><input value={edit.sku} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, sku: e.target.value.toUpperCase() })} /></Field><Field label="Category"><select value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>{data.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Name in Nepali"><input value={edit.name_ne || ''} onChange={(e) => setEdit({ ...edit, name_ne: e.target.value })} /></Field>
            <Field label="Description"><input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid g3"><Field label="Price (Rs, all-in)"><input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field><Field label="Food cost (Rs)"><input type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></Field><Field label="Seconds to make"><input type="number" value={edit.prep_seconds} onChange={(e) => setEdit({ ...edit, prep_seconds: e.target.value })} /></Field></div>
            {([['is_signature', 'Signature item'], ['is_seasonal', 'Seasonal'], ['pass_eligible', 'Covered by the 10-cup pass'], ['active', 'On the menu']] as const).map(([k, l]) => <label key={k} className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={!!edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} />{l}</label>)}
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function DropsTab() {
  const drops = useData<any[]>('/admin/drops');
  const menu = useData<any>('/owner/menu');
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  async function create() {
    try {
      await api('/owner/drops', { method: 'POST', body: { name: f.name, partner: f.partner || undefined, product_id: f.product_id, price: Number(f.price), cap: Number(f.cap), starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + Number(f.days) * 86400000).toISOString() } });
      setF(null); drops.reload(); toast('Drop is live');
    } catch (e: any) { toast(e.message, true); }
  }
  if (!drops.data) return <Loading />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Limited drops</h3><button className="btn primary sm" onClick={() => setF({ name: '', partner: '', product_id: menu.data?.products[0]?.id, price: 169, cap: 3000, days: 30 })}>New drop</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>One capped drink a month with a local partner. Start at 3,000 cups and pass the food-cost check first.</p>
      {!drops.data.length ? <Empty>No drops yet.</Empty> : <div className="col">{drops.data.map((d) => (
        <div key={d.id} className="card"><div className="row between"><div><h3>{d.name}</h3><p className="small muted">{d.partner} · {d.product_name} · {rs(d.price)} · until {fmtDate(d.ends_at)}</p></div>
          <button className={`btn sm ${d.active ? 'ghost' : 'hill'}`} onClick={async () => { await api(`/owner/drops/${d.id}`, { method: 'PATCH', body: { active: !d.active } }); drops.reload(); }}>{d.active ? 'Stop' : 'Resume'}</button></div>
          <div className="bar" style={{ margin: '12px 0 4px' }}><i style={{ width: `${Math.min(100, (d.sold / d.cap) * 100)}%` }} /></div><p className="small">{d.sold.toLocaleString()} of {d.cap.toLocaleString()} cups sold</p></div>
      ))}</div>}
      {f && (
        <Modal title="New drop" onClose={() => setF(null)}>
          <div className="col">
            <Field label="Name"><input value={f.name} placeholder="Drop 02: Suntala cold brew" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Partner"><input value={f.partner} onChange={(e) => setF({ ...f, partner: e.target.value })} /></Field>
            <Field label="Item"><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}>{menu.data?.products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <div className="grid g3"><Field label="Drop price"><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field><Field label="Cup cap"><input type="number" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} /></Field><Field label="Days"><input type="number" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field></div>
            <button className="btn primary" onClick={create}>Start the drop</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function TeamTab() {
  const { user: currentOwner } = useAuth();
  const [roleFilter, setRoleFilter] = useState<'all' | 'manager' | 'station' | 'partner' | 'owner' | 'customer'>('all');
  const [stationFilter, setStationFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  
  // Fetch users with full support for filtering and customer accounts
  const { data, reload, loading } = useData<any[]>(
    `/owner/users?include_customers=true${roleFilter !== 'all' ? `&role=${roleFilter}` : ''}${stationFilter ? `&station_id=${stationFilter}` : ''}`,
    [roleFilter, stationFilter],
  );
  const stations = useData<any[]>('/admin/stations');
  const toast = useToast();

  // Modals state
  const [createModal, setCreateModal] = useState<boolean>(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [pwModal, setPwModal] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [delUser, setDelUser] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New user form state
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'manager',
    station_id: '',
    managed: [] as string[],
    active: true,
  });

  function openCreate() {
    setForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      role: 'manager',
      station_id: stations.data?.[0]?.id || '',
      managed: stations.data?.[0]?.id ? [stations.data[0].id] : [],
      active: true,
    });
    setCreateModal(true);
  }

  function openEdit(u: any) {
    setEditUser({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email || '',
      password: '',
      role: u.role,
      station_id: u.station_id || stations.data?.[0]?.id || '',
      managed: Array.isArray(u.managed_stations) ? u.managed_stations : [],
      active: u.active ?? true,
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.password) {
      toast('Please enter name, phone number, and password', true);
      return;
    }
    if (form.password.length < 6) {
      toast('Password must be at least 6 characters', true);
      return;
    }
    if (form.role === 'station' && !form.station_id) {
      toast('Please select an assigned station for staff', true);
      return;
    }
    if (form.role === 'partner' && !form.managed.length) {
      toast('Please select at least one cafe for partner', true);
      return;
    }

    setSubmitting(true);
    try {
      await api('/owner/users', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          password: form.password,
          role: form.role,
          station_id: form.role === 'station' ? form.station_id : undefined,
          managed_station_ids: (form.role === 'manager' || form.role === 'partner') ? form.managed : [],
          active: form.active,
        },
      });
      setCreateModal(false);
      reload();
      toast('User created successfully');
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (!editUser.name.trim() || !editUser.phone.trim()) {
      toast('Name and phone number are required', true);
      return;
    }
    if (editUser.password && editUser.password.length < 6) {
      toast('New password must be at least 6 characters', true);
      return;
    }

    setSubmitting(true);
    try {
      await api(`/owner/users/${editUser.id}`, {
        method: 'PATCH',
        body: {
          name: editUser.name.trim(),
          phone: editUser.phone.trim(),
          email: editUser.email.trim() || null,
          role: editUser.role,
          password: editUser.password ? editUser.password : undefined,
          station_id: editUser.role === 'station' ? editUser.station_id : null,
          managed_station_ids: (editUser.role === 'manager' || editUser.role === 'partner') ? editUser.managed : [],
          active: editUser.active,
        },
      });
      setEditUser(null);
      reload();
      toast('User updated successfully');
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: any) {
    if (u.id === currentOwner?.id && u.active) {
      toast('You cannot deactivate your own account', true);
      return;
    }
    try {
      await api(`/owner/users/${u.id}`, {
        method: 'PATCH',
        body: { active: !u.active },
      });
      reload();
      toast(u.active ? 'User deactivated' : 'User activated');
    } catch (e: any) {
      toast(e.message, true);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwModal || !newPassword) return;
    if (newPassword.length < 6) {
      toast('Password must be at least 6 characters', true);
      return;
    }
    setSubmitting(true);
    try {
      await api(`/owner/users/${pwModal.id}`, {
        method: 'PATCH',
        body: { password: newPassword },
      });
      setPwModal(null);
      setNewPassword('');
      toast(`Password updated for ${pwModal.name}`);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!delUser) return;
    if (delUser.id === currentOwner?.id) {
      toast('You cannot delete your own account', true);
      return;
    }
    setSubmitting(true);
    try {
      await api(`/owner/users/${delUser.id}`, { method: 'DELETE' });
      setDelUser(null);
      reload();
      toast(`User ${delUser.name} deleted successfully`);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  // Filter local users by search and status
  const usersList = (data || []).filter((u) => {
    if (statusFilter === 'active' && !u.active) return false;
    if (statusFilter === 'inactive' && u.active) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(term) ||
      u.phone?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term) ||
      u.role?.toLowerCase().includes(term) ||
      u.station_name?.toLowerCase().includes(term)
    );
  });

  // Role stats
  const totalCount = data?.length || 0;
  const mgrCount = data?.filter((u) => u.role === 'manager').length || 0;
  const staffCount = data?.filter((u) => u.role === 'station').length || 0;
  const activeCount = data?.filter((u) => u.active).length || 0;

  const roleBadge = (role: string) => {
    switch (role) {
      case 'owner': return <span className="chip hill" style={{ fontWeight: 700 }}>Owner</span>;
      case 'manager': return <span className="chip marigold" style={{ fontWeight: 700 }}>Manager</span>;
      case 'station': return <span className="chip roast">Station Barista</span>;
      case 'partner': return <span className="chip" style={{ background: 'var(--foam)', borderColor: 'var(--marigold)' }}>Partner Cafe</span>;
      case 'customer': return <span className="chip">Customer</span>;
      default: return <span className="chip">{role}</span>;
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* Header and Quick Stats */}
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Users & Managers</h3>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Full access control for managers, station baristas, partner owners, and user profiles.
          </p>
        </div>
        <button className="btn primary" onClick={openCreate}>
          <Icon name="plus" size={18} />
          Add User / Manager
        </button>
      </div>

      <div className="grid g4">
        <Stat label="Total registered accounts" value={totalCount} />
        <Stat label="Managers" value={mgrCount} tone="good" />
        <Stat label="Station Baristas" value={staffCount} />
        <Stat label="Active accounts" value={activeCount} delta={`${Math.round((activeCount / Math.max(1, totalCount)) * 100)}% active`} />
      </div>

      {/* Role Tabs and Filter Bar */}
      <div className="card col" style={{ gap: 12, padding: 16 }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          {/* Role Filter Tabs */}
          <div className="tabs" role="tablist" style={{ margin: 0 }}>
            {[
              { id: 'all', label: 'All Accounts' },
              { id: 'manager', label: 'Managers' },
              { id: 'station', label: 'Station Staff' },
              { id: 'partner', label: 'Partners' },
              { id: 'owner', label: 'Owners' },
              { id: 'customer', label: 'Customers' },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={roleFilter === t.id}
                className={`tab ${roleFilter === t.id ? 'active' : ''}`}
                onClick={() => setRoleFilter(t.id as any)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Quick Filters: Station & Status */}
          <div className="row wrap" style={{ gap: 8 }}>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              style={{ minWidth: 160, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="">All Stations</option>
              {stations.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ minWidth: 120, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Search input */}
        <div className="row" style={{ gap: 8 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              placeholder="Search by name, phone (+977), email, or assigned station…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 12 }}
            />
            {search && (
              <button
                className="btn ghost sm"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 6, top: 6, padding: '2px 8px' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Users Table */}
      {loading && !data ? (
        <Loading what="Loading users and managers" />
      ) : !usersList.length ? (
        <Empty>No users match your filters.</Empty>
      ) : (
        <div className="card tablewrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>User / Name</th>
                <th>Role</th>
                <th>Mobile Number</th>
                <th>Station Assignment</th>
                <th>Status</th>
                <th>Last Login</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => {
                const isSelf = u.id === currentOwner?.id;
                const managedCount = Array.isArray(u.managed_stations) ? u.managed_stations.length : 0;
                return (
                  <tr key={u.id}>
                    <td>
                      <div>
                        <strong>{u.name}</strong>
                        {isSelf && (
                          <span className="chip sm" style={{ marginLeft: 6, background: 'var(--foam)', color: 'var(--cherry)' }}>
                            You
                          </span>
                        )}
                        {u.email && (
                          <span className="small muted" style={{ display: 'block', fontSize: 12 }}>
                            {u.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{roleBadge(u.role)}</td>
                    <td>
                      <code style={{ fontSize: 13, background: 'var(--foam)', padding: '2px 6px', borderRadius: 4 }}>
                        {u.phone}
                      </code>
                    </td>
                    <td>
                      {u.role === 'owner' ? (
                        <span className="small muted">Full access</span>
                      ) : u.role === 'station' ? (
                        <span className="chip sm roast">{u.station_name || 'Unassigned'}</span>
                      ) : u.role === 'manager' || u.role === 'partner' ? (
                        managedCount ? (
                          <span className="chip sm marigold">
                            {managedCount} station{managedCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="small muted">–</span>
                        )
                      ) : (
                        <span className="small muted">–</span>
                      )}
                    </td>
                    <td>
                      <span className={`chip sm ${u.active ? 'hill' : ''}`}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="small muted">
                      {u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}
                    </td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={() => openEdit(u)}
                          title="Edit profile & permissions"
                        >
                          Edit
                        </button>

                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setPwModal(u);
                            setNewPassword('');
                          }}
                          title="Set new password"
                        >
                          Password
                        </button>

                        <button
                          className={`btn sm ${u.active ? 'ghost' : 'hill'}`}
                          disabled={isSelf && u.active}
                          onClick={() => toggleActive(u)}
                          title={isSelf ? 'Cannot deactivate self' : u.active ? 'Deactivate account' : 'Activate account'}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          className="btn sm danger ghost"
                          disabled={isSelf}
                          onClick={() => setDelUser(u)}
                          title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE MODAL */}
      {createModal && (
        <Modal title="Add User / Manager" onClose={() => setCreateModal(false)}>
          <form onSubmit={handleCreate} className="col" style={{ gap: 14 }}>
            <Field label="System Role">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="manager">Manager (Station oversight, shifts, inventory)</option>
                <option value="station">Station Staff / Barista (POS counter operations)</option>
                <option value="partner">Partner Cafe Owner (Partner dashboard & share)</option>
                <option value="owner">Owner (Full administrative rights)</option>
                <option value="customer">Customer (Mobile app profile)</option>
              </select>
            </Field>

            <div className="grid g2">
              <Field label="Full Name">
                <input
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <Field label="Mobile Number">
                <input
                  required
                  placeholder="e.g. 98XXXXXXXX"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid g2">
              <Field label="Email Address (optional)">
                <input
                  type="email"
                  placeholder="aarav@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>

              <Field label="Initial Password (min 6 chars)">
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            </div>

            {form.role === 'station' && (
              <Field label="Assigned Station">
                <select
                  value={form.station_id}
                  onChange={(e) => setForm({ ...form, station_id: e.target.value })}
                >
                  {stations.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {(form.role === 'manager' || form.role === 'partner') && (
              <Field label={form.role === 'partner' ? 'Partner Station' : 'Managed Stations'}>
                <div className="col" style={{ gap: 8, background: 'var(--surface-sunk)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                  {stations.data?.map((s) => (
                    <label key={s.id} className="row" style={{ cursor: 'pointer', gap: 8 }}>
                      <input
                        type="checkbox"
                        style={{ width: 18, minHeight: 18 }}
                        checked={form.managed.includes(s.id)}
                        onChange={(e) => {
                          setForm({
                            ...form,
                            managed: e.target.checked
                              ? [...form.managed, s.id]
                              : form.managed.filter((x) => x !== s.id),
                          });
                        }}
                      />
                      <span><strong>{s.name}</strong> <span className="small muted">({s.code})</span></span>
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <label className="row" style={{ cursor: 'pointer', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                style={{ width: 18, minHeight: 18 }}
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span>Account is active (can sign in immediately)</span>
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={() => setCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={submitting}>
                {submitting ? 'Creating User…' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* EDIT MODAL */}
      {editUser && (
        <Modal title={`Edit ${editUser.name}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="col" style={{ gap: 14 }}>
            <Field label="System Role">
              <select
                value={editUser.role}
                disabled={editUser.id === currentOwner?.id}
                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
              >
                <option value="manager">Manager (Station oversight, shifts, inventory)</option>
                <option value="station">Station Staff / Barista (POS counter operations)</option>
                <option value="partner">Partner Cafe Owner (Partner dashboard & share)</option>
                <option value="owner">Owner (Full administrative rights)</option>
                <option value="customer">Customer (Mobile app profile)</option>
              </select>
              {editUser.id === currentOwner?.id && (
                <span className="small muted">You cannot demote your own owner account.</span>
              )}
            </Field>

            <div className="grid g2">
              <Field label="Full Name">
                <input
                  required
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                />
              </Field>

              <Field label="Mobile Number">
                <input
                  required
                  value={editUser.phone}
                  onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid g2">
              <Field label="Email Address">
                <input
                  type="email"
                  placeholder="Optional"
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                />
              </Field>

              <Field label="New Password (leave blank to keep current)">
                <input
                  type="password"
                  placeholder="Leave empty to keep"
                  value={editUser.password}
                  onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                />
              </Field>
            </div>

            {editUser.role === 'station' && (
              <Field label="Assigned Station">
                <select
                  value={editUser.station_id}
                  onChange={(e) => setEditUser({ ...editUser, station_id: e.target.value })}
                >
                  {stations.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {(editUser.role === 'manager' || editUser.role === 'partner') && (
              <Field label={editUser.role === 'partner' ? 'Partner Station' : 'Managed Stations'}>
                <div className="col" style={{ gap: 8, background: 'var(--surface-sunk)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                  {stations.data?.map((s) => (
                    <label key={s.id} className="row" style={{ cursor: 'pointer', gap: 8 }}>
                      <input
                        type="checkbox"
                        style={{ width: 18, minHeight: 18 }}
                        checked={editUser.managed.includes(s.id)}
                        onChange={(e) => {
                          setEditUser({
                            ...editUser,
                            managed: e.target.checked
                              ? [...editUser.managed, s.id]
                              : editUser.managed.filter((x: string) => x !== s.id),
                          });
                        }}
                      />
                      <span><strong>{s.name}</strong> <span className="small muted">({s.code})</span></span>
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <label className="row" style={{ cursor: 'pointer', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                style={{ width: 18, minHeight: 18 }}
                checked={editUser.active}
                disabled={editUser.id === currentOwner?.id}
                onChange={(e) => setEditUser({ ...editUser, active: e.target.checked })}
              />
              <span>Account is active</span>
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={() => setEditUser(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={submitting}>
                {submitting ? 'Saving Changes…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PASSWORD RESET MODAL */}
      {pwModal && (
        <Modal title={`Reset Password for ${pwModal.name}`} onClose={() => setPwModal(null)}>
          <form onSubmit={handleResetPassword} className="col" style={{ gap: 14 }}>
            <p className="small muted">
              Set a new secure password for <strong>{pwModal.name}</strong> ({pwModal.phone}).
              Any active sessions for this user will be revoked and require re-login.
            </p>
            <Field label="New Password (min 6 characters)">
              <input
                required
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setPwModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!newPassword || submitting}>
                {submitting ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {delUser && (
        <Modal title="Confirm Delete User" onClose={() => setDelUser(null)}>
          <div className="col" style={{ gap: 16 }}>
            <p>
              Are you sure you want to permanently delete <strong>{delUser.name}</strong> ({delUser.phone})?
            </p>

            {delUser.orders_count > 0 ? (
              <div className="card" style={{ borderColor: 'var(--cherry)', background: 'var(--foam)' }}>
                <strong style={{ color: 'var(--cherry)' }}>Cannot Delete Account</strong>
                <p className="small" style={{ margin: '6px 0 0' }}>
                  This user has <strong>{delUser.orders_count}</strong> historical orders. Under accounting and audit rules, historical financial transaction links cannot be broken.
                  Please <strong>Deactivate</strong> this account instead.
                </p>
              </div>
            ) : (
              <p className="small muted">
                This will revoke their access tokens, delete station manager linkages, and remove their account profile.
              </p>
            )}

            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn ghost" onClick={() => setDelUser(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={delUser.orders_count > 0 || submitting}
                onClick={handleDelete}
              >
                {submitting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function FinanceTab() {
  const [days, setDays] = useState(14);
  const rec = useData<any[]>(`/owner/reconciliation?from=${sinceDays(days)}`, [days]);
  const passes = useData<any[]>('/owner/passes');
  const ov = useData<any>(`/admin/overview?from=${sinceDays(30)}`);
  const toast = useToast();
  const [s, setS] = useState<any>(null);
  async function enter() { try { await api('/owner/settlements', { method: 'POST', body: { provider: s.provider, day: s.day, amount: Number(s.amount) } }); setS(null); rec.reload(); toast('Settlement saved'); } catch (e: any) { toast(e.message, true); } }
  async function csv() {
    const r = await fetch(`${BASE}/owner/export/orders.csv?from=${sinceDays(30)}`, { headers: { Authorization: `Bearer ${store.get()?.access}` } });
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = 'sadhai-orders.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="col" style={{ gap: 20 }}>
      {ov.data && <div className="grid g4">
        <Stat label="Sales, 30 days" value={rs(ov.data.totals.revenue)} />
        <Stat label="Margin after food cost" value={rs(ov.data.totals.gross_margin)} delta={`${Math.round((ov.data.totals.gross_margin / Math.max(1, ov.data.totals.revenue)) * 100)}%`} />
        <Stat label="Passes sold vs cups redeemed" value={`${ov.data.pass.sold} / ${ov.data.pass.redeemed_cups}`} delta={`${ov.data.pass.outstanding_cups} cups still owed`} />
        <Stat label="Related-party passes" value={ov.data.pass.related_party} delta="Keep this at zero" tone={ov.data.pass.related_party ? 'bad' : 'good'} />
      </div>}
      <div className="card tablewrap">
        <div className="row between wrap" style={{ marginBottom: 8 }}><h3>Fonepay sales against Fonepay settlements</h3><div className="row"><RangePicker days={days} setDays={setDays} /><button className="btn sm" onClick={() => setS({ provider: 'fonepay', day: sinceDays(2), amount: '' })}>Enter settlement</button></div></div>
        <p className="small muted" style={{ marginBottom: 8 }}>Reconcile every month. A difference is usually a provider fee or a refund; anything else needs an explanation.</p>
        {!rec.data ? <Loading /> : !rec.data.length ? <Empty>Nothing to reconcile in this period.</Empty> : <table><thead><tr><th>Day</th><th>Provider</th><th className="num">App says</th><th className="num">Provider paid</th><th className="num">Difference</th></tr></thead>
          <tbody>{rec.data.map((r, i) => <tr key={i}><td>{fmtDate(r.day)}</td><td>{r.provider}</td><td className="num">{rs(r.app_amount)}</td><td className="num">{r.settled == null ? <span className="chip marigold">Not entered</span> : rs(r.settled)}</td><td className="num" style={{ color: r.diff ? 'var(--cherry)' : undefined, fontWeight: r.diff ? 700 : 400 }}>{r.settled == null ? '–' : r.diff ? rs(r.diff) : 'Matches'}</td></tr>)}</tbody></table>}
      </div>
      <div className="card tablewrap">
        <div className="row between"><h3 style={{ marginBottom: 8 }}>Pass register</h3><button className="btn sm" onClick={csv}>Export orders (CSV)</button></div>
        {!passes.data ? <Loading /> : <table><thead><tr><th>Customer</th><th>Bought</th><th className="num">Used</th><th>Status</th><th>Related party</th></tr></thead>
          <tbody>{passes.data.slice(0, 20).map((p) => <tr key={p.id}><td>{p.name}<div className="small muted">{p.phone}</div></td><td>{fmtDate(p.purchased_at)} · {rs(p.price_paid)}</td><td className="num">{p.used_cups} / {p.total_cups}</td><td>{p.status}</td><td><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={p.related_party} aria-label="Related party" onChange={async (e) => { await api(`/owner/passes/${p.id}`, { method: 'PATCH', body: { related_party: e.target.checked } }); passes.reload(); }} /></td></tr>)}</tbody></table>}
      </div>
      {s && (
        <Modal title="Provider settlement" onClose={() => setS(null)}>
          <div className="col">
            <Field label="Provider"><select value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value })}><option value="fonepay">Fonepay</option></select></Field>
            <Field label="Sales day"><input type="date" value={s.day} onChange={(e) => setS({ ...s, day: e.target.value })} /></Field>
            <Field label="Amount credited to the bank (Rs)"><input type="number" value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} /></Field>
            <button className="btn primary" disabled={s.amount === ''} onClick={enter}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function GrowthTab() {
  const [days, setDays] = useState(30);
  const { data: o } = useData<any>(`/admin/overview?from=${sinceDays(days)}`, [days]);
  const set = useData<any>('/owner/settings');
  const toast = useToast();
  const [msg, setMsg] = useState({ title: '', body: '', segment: 'all' });
  if (!o) return <Loading />;
  const g = o.growth;
  async function send() { try { const r = await api('/owner/broadcast', { method: 'POST', body: msg }); toast(`Sent to ${r.sent} customers`); setMsg({ title: '', body: '', segment: 'all' }); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="col" style={{ gap: 20 }}>
      <RangePicker days={days} setDays={setDays} />
      <div className="grid g4">
        <Stat label="Repeat rate within 90 days" value={g.repeat_rate_90d_pct == null ? 'Too early' : `${g.repeat_rate_90d_pct}%`} delta="Target 35 to 45%" />
        <Stat label="Orders through the app or QR" value={`${o.totals.app_share_pct}%`} />
        <Stat label="Cost per acquired customer" value={g.cost_per_acquired_customer == null ? '–' : rs(g.cost_per_acquired_customer)} delta="Offer spend ÷ new customers" />
        <Stat label="New customers" value={g.new_customers} delta={`${g.total_customers} in total`} />
      </div>
      <div className="card tablewrap"><h3 style={{ marginBottom: 8 }}>Offer spend</h3>
        {!g.offers.length ? <Empty>No offers used in this period.</Empty> : <table><thead><tr><th>Offer</th><th className="num">Uses</th><th className="num">Spend</th></tr></thead><tbody>{g.offers.map((x: any) => <tr key={x.kind}><td>{({ first_cup: 'Free first cup', pct: '30% off ladder', referral_cup: 'Referral cup', promo: 'Promo codes', pass: '10-cup pass' } as any)[x.kind] || x.kind}</td><td className="num">{x.uses}</td><td className="num">{rs(x.spend)}</td></tr>)}</tbody></table>}
        <p className="small muted" style={{ marginTop: 8 }}>Stop any rung whose payback is longer than {set.data?.offer_payback_max_days ?? 30} days.</p>
      </div>
      <div className="card tablewrap"><h3 style={{ marginBottom: 8 }}>Payment mix</h3><table><thead><tr><th>Method</th><th className="num">Orders</th><th className="num">Sales</th></tr></thead><tbody>{o.payment_mix.map((m: any) => <tr key={m.provider}><td>{m.provider}</td><td className="num">{m.orders}</td><td className="num">{rs(m.revenue)}</td></tr>)}</tbody></table></div>
      <div className="card col">
        <h3>Send a message</h3>
        <p className="small muted">One push a day at most per customer. Plain copy, no guilt: “Your Americano, Rs 99 until Sunday.”</p>
        <Field label="Title"><input maxLength={80} value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} /></Field>
        <Field label="Message"><input maxLength={200} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} /></Field>
        <Field label="Who"><select value={msg.segment} onChange={(e) => setMsg({ ...msg, segment: e.target.value })}><option value="all">All customers</option><option value="inactive_14d">Not ordered in 14 days</option></select></Field>
        <button className="btn primary" disabled={msg.title.length < 3} onClick={send}>Send</button>
      </div>
    </div>
  );
}

export function SettingsTab() {
  const { data, reload } = useData<Record<string, number>>('/owner/settings');
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  if (!data) return <Loading />;
  const labels: Record<string, string> = { pass_price: 'Pass price (Rs)', pass_cups: 'Cups in a pass', pass_valid_days: 'Pass validity (days)', first_cup_days: 'Free first cup valid (days)', first_cup_max: 'Free cup covers up to (Rs)', ladder_count: 'Coupons after the first cup', ladder_pct: 'Coupon percent off', ladder_days: 'Coupons valid (days)', referral_cap_month: 'Referral cups per month', referral_cup_max: 'Referral cup covers up to (Rs)', promo_push_daily_cap: 'Promo messages per day', offer_payback_max_days: 'Longest allowed payback (days)', pass_use_by_days: 'A new pass can wait this long before its first cup (days)', target_food_cost_pct: 'Target food cost (%)', variance_alert_value: 'Alert when a stock count is off by (Rs)', auto_pass_expiry: 'Automatic: pass ending soon (1 on, 0 off)', auto_pass_low: 'Automatic: pass nearly used up (1 on, 0 off)', auto_winback: 'Automatic: win-back note (1 on, 0 off)', auto_offers: 'Automatic: new offer of the day (1 on, 0 off)', auto_drops: 'Automatic: new monthly drop (1 on, 0 off)' };
  async function save() { try { await api('/owner/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) }); setV({}); reload(); toast('Settings saved'); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="card col">
      <h3>Offers and loyalty rules</h3>
      <div className="grid g3">{Object.keys(labels).map((k) => <Field key={k} label={labels[k]}><input type="number" value={v[k] ?? data[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}</div>
      <button className="btn primary" disabled={!Object.keys(v).length} onClick={save}>Save changes</button>
    </div>
  );
}

export function AuditTab() {
  const { data } = useData<any[]>('/owner/audit?limit=150');
  if (!data) return <Loading />;
  return <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>{data.map((a) => <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.actor || 'System'}</td><td>{a.action}</td><td className="small muted">{a.meta ? JSON.stringify(a.meta).slice(0, 90) : ''}</td></tr>)}</tbody></table></div>;
}
