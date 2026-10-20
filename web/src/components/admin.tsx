'use client';
import { useState } from 'react';
import { api, fmtDate, fmtDateTime, rs } from '@/lib/api';
import { BarChart, Empty, ErrorNote, Field, LineChart, Loading, Meter, Modal, Stat, Status, useData, useToast } from './ui';

const qs = (o: Record<string, any>) => { const p = Object.entries(o).filter(([, v]) => v); return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''; };

export function StationPicker({ stations, value, onChange, all = true }: { stations: any[]; value: string; onChange: (v: string) => void; all?: boolean }) {
  return (
    <select aria-label="Station" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 300 }}>
      {all && <option value="">All my stations</option>}
      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export function RangePicker({ days, setDays }: { days: number; setDays: (n: number) => void }) {
  return <div className="row">{[7, 30, 60].map((d) => <button key={d} className={`btn sm ${days === d ? 'primary' : 'ghost'}`} onClick={() => setDays(d)}>{d} days</button>)}</div>;
}
export const sinceDays = (n: number) => new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);

export function Overview({ stationId }: { stationId: string }) {
  const [days, setDays] = useState(30);
  const { data: o, error } = useData<any>(`/admin/overview${qs({ station_id: stationId, from: sinceDays(days) })}`, [stationId, days]);
  if (!o) return <><ErrorNote error={error} /><Loading what="Building the numbers" /></>;
  const t = o.totals;
  const hours = Array.from({ length: 13 }, (_, i) => ({ hour: `${i + 7}h`, orders: o.hourly.find((h: any) => h.hour === i + 7)?.orders || 0 }));
  return (
    <div className="col" style={{ gap: 20 }}>
      <RangePicker days={days} setDays={setDays} />
      <div className="grid g4">
        <Stat label="Sales" value={rs(t.revenue)} delta={`${rs(t.gross_margin)} after food cost`} />
        <Stat label="Cups a day" value={t.cups_per_day} delta={`${t.cups.toLocaleString()} cups`} />
        <Stat label="Orders" value={t.orders.toLocaleString()} delta={`${rs(t.avg_ticket)} average`} />
        <Stat label="Through the app or QR" value={`${t.app_share_pct}%`} delta="Target: most orders" />
      </div>
      <div className="grid g2">
        <div className="card"><h3 style={{ marginBottom: 12 }}>Sales by day</h3><LineChart data={o.daily} x="day" y="revenue" /></div>
        <div className="card"><h3 style={{ marginBottom: 12 }}>Busiest hours</h3><BarChart data={hours} x="hour" y="orders" /></div>
      </div>
      <div className="card tablewrap">
        <h3 style={{ marginBottom: 8 }}>Stations against break-even</h3>
        <table><thead><tr><th>Station</th><th className="num">Sales</th><th className="num">Cups / day</th><th>Break-even</th></tr></thead>
          <tbody>{o.stations.map((s: any) => <tr key={s.id}><td>{s.name}</td><td className="num">{rs(s.revenue)}</td><td className="num">{s.cups_per_day} / {s.breakeven_cups}</td><td style={{ minWidth: 160 }}><Meter pct={s.breakeven_pct} label={`${s.name} break-even`} /><span className="small muted">{s.breakeven_pct}%</span></td></tr>)}</tbody></table>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>Service speed</h3>
          <div className="row" style={{ marginTop: 12, gap: 24 }}>
            <div className="stat"><div className="v">{o.service.avg_make_seconds}s</div><div className="l">Average time to make</div></div>
            <div className="stat"><div className="v">{o.service.within_90s_pct ?? '–'}%</div><div className="l">Made within target</div></div>
            <div className="stat"><div className="v">{o.ratings.avg || '–'}</div><div className="l">Rating ({o.ratings.n})</div></div>
          </div>
        </div>
        <div className="card tablewrap">
          <h3 style={{ marginBottom: 8 }}>Best sellers</h3>
          <table><thead><tr><th>Item</th><th className="num">Cups</th><th className="num">Margin</th></tr></thead>
            <tbody>{o.top_products.slice(0, 6).map((p: any) => <tr key={p.name}><td>{p.name}</td><td className="num">{p.qty.toLocaleString()}</td><td className="num">{p.revenue ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0}%</td></tr>)}</tbody></table>
        </div>
      </div>
      {o.low_stock.length > 0 && (
        <div className="card"><h3>Running low</h3><div className="col" style={{ marginTop: 8 }}>{o.low_stock.map((l: any, i: number) => <div key={i} className="row between"><span>{l.ingredient} <span className="muted small">· {l.station}</span></span><span className="chip cherry">{Math.round(l.qty)} {l.unit} left</span></div>)}</div></div>
      )}
      <div className="grid g3">
        <Stat label="10-cup passes sold" value={o.pass.sold} delta={`${o.pass.redemption_pct ?? 0}% of cups redeemed`} />
        <Stat label="Pass cups still owed" value={o.pass.outstanding_cups} delta={`${rs(o.pass.liability_value)} of coffee to serve`} />
        <Stat label="New customers" value={o.growth.new_customers} delta={`${o.growth.total_customers} in total`} />
      </div>
    </div>
  );
}

export function OrdersTab({ stationId }: { stationId: string }) {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useData<any[]>(`/admin/orders${qs({ station_id: stationId, status, limit: 60 })}`, [stationId, status]);
  const [sel, setSel] = useState<any>(null);
  const toast = useToast();
  const [reason, setReason] = useState('');
  async function refund() {
    try { await api(`/admin/orders/${sel.id}/refund`, { method: 'POST', body: { reason } }); toast('Refund recorded'); setSel(null); setReason(''); reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>{['', 'placed,preparing,ready', 'picked_up', 'cancelled'].map((s) => <button key={s} className={`btn sm ${status === s ? 'primary' : 'ghost'}`} onClick={() => setStatus(s)}>{s === '' ? 'All' : s.startsWith('placed') ? 'Live' : s === 'picked_up' ? 'Done' : 'Cancelled'}</button>)}</div>
      <ErrorNote error={error} />
      {!data ? <Loading /> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table>
          <thead><tr><th>#</th><th>When</th><th>Station</th><th>Items</th><th>Customer</th><th>Pay</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((o) => <tr key={o.id}><td><strong>{o.pickup_code}</strong></td><td>{fmtDateTime(o.created_at)}</td><td>{o.station_name}</td><td>{o.summary}</td><td>{o.customer || 'Walk-in'}</td><td>{o.payment_method}</td><td className="num">{rs(o.total)}</td><td><Status s={o.status} /></td><td><button className="btn sm" onClick={() => setSel(o)}>Refund</button></td></tr>)}</tbody></table></div>
      )}
      {sel && (
        <Modal title={`Refund ${sel.pickup_code}`} onClose={() => setSel(null)}>
          <p className="muted">{sel.summary} · {rs(sel.total)} · {sel.payment_method}. Digital refunds are sent from the provider dashboard; this records the refund and frees any coupon or pass cup.</p>
          <div style={{ margin: '12px 0' }}><Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
          <button className="btn danger block" disabled={reason.length < 3} onClick={refund}>Refund this order</button>
        </Modal>
      )}
    </>
  );
}

export function StaffTab({ stations, stationId }: { stations: any[]; stationId: string }) {
  const { data, reload } = useData<any[]>(`/admin/staff${qs({ station_id: stationId })}`, [stationId]);
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', password: '', station_id: stationId || stations[0]?.id });
  async function create() { try { await api('/admin/staff', { method: 'POST', body: f }); setAdd(false); setF({ ...f, name: '', phone: '', password: '' }); reload(); toast('Staff member added'); } catch (e: any) { toast(e.message, true); } }
  async function patch(id: string, body: any) { try { await api(`/admin/staff/${id}`, { method: 'PATCH', body }); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Station staff</h3><button className="btn primary sm" onClick={() => setAdd(true)}>Add staff</button></div>
      {!data ? <Loading /> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Phone</th><th>Station</th><th>Last sign in</th><th /></tr></thead>
          <tbody>{data.map((u) => <tr key={u.id}><td>{u.name} {!u.active && <span className="chip">Off</span>}</td><td>{u.phone}</td><td>{u.station_name}</td><td>{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
            <td className="right"><button className="btn sm" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button> <button className="btn sm ghost" onClick={() => { const p = prompt('New password (6+ characters)'); if (p) patch(u.id, { password: p }); }}>Reset password</button></td></tr>)}</tbody></table></div>
      )}
      {add && (
        <Modal title="Add staff" onClose={() => setAdd(false)}>
          <div className="col">
            <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Mobile number"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <button className="btn primary" onClick={create}>Add staff</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function PromosTab({ stations, isOwner }: { stations: any[]; isOwner: boolean }) {
  const { data, reload } = useData<any[]>('/admin/promos');
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [f, setF] = useState<any>({ code: '', title: '', pct: 15, min_total: 200, max_discount: 100, drinks_only: true, max_uses: '', per_user_limit: 1, station_id: isOwner ? '' : stations[0]?.id, days: 14 });
  async function create() {
    try {
      await api('/admin/promos', {
        method: 'POST',
        body: {
          code: f.code,
          title: f.title,
          pct: Number(f.pct),
          min_total: Number(f.min_total) || 0,
          max_discount: f.max_discount ? Number(f.max_discount) : null,
          drinks_only: !!f.drinks_only,
          max_uses: f.max_uses ? Number(f.max_uses) : undefined,
          per_user_limit: Number(f.per_user_limit) || 1,
          station_id: f.station_id || undefined,
          valid_until: new Date(Date.now() + f.days * 86400000).toISOString(),
        },
      });
      setAdd(false); reload(); toast('Promo code created');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Promo codes</h3><button className="btn primary sm" onClick={() => setAdd(true)}>New code</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>Anti-loss guardrails: promo codes never stack on Offer of the Day or Limited Drops, and can be capped with a maximum Rs discount and restricted to drinks only.</p>
      {!data ? <Loading /> : !data.length ? <Empty>No promo codes yet.</Empty> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Code</th><th>Offer & guardrails</th><th>Where</th><th className="num">Used</th><th>Ends</th><th /></tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td><strong>{p.code}</strong></td><td>{p.title} · {p.pct}% off{p.max_discount ? ` (up to ${rs(p.max_discount)})` : ''}{p.min_total ? ` · min ${rs(p.min_total)}` : ''}{p.drinks_only !== false ? ' · drinks only' : ''}</td><td>{p.station_name || 'All stations'}</td><td className="num">{p.used}{p.max_uses ? ` / ${p.max_uses}` : ''}</td><td>{p.valid_until ? fmtDate(p.valid_until) : 'No end'}</td>
            <td className="right"><button className={`btn sm ${p.active ? 'ghost' : 'hill'}`} onClick={async () => { await api(`/admin/promos/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); reload(); }}>{p.active ? 'Pause' : 'Resume'}</button></td></tr>)}</tbody></table></div>
      )}
      {add && (
        <Modal title="New promo code" onClose={() => setAdd(false)}>
          <div className="col">
            <Field label="Code" hint="Letters and numbers only"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name for staff"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <div className="grid g2"><Field label="Percent off (max 60)"><input type="number" min={1} max={60} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field><Field label="Max discount cap (Rs)" hint="Prevents large-order loss"><input type="number" min={10} max={500} value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} /></Field></div>
            <div className="grid g2"><Field label="Minimum spend (Rs)"><input type="number" min={0} value={f.min_total} onChange={(e) => setF({ ...f, min_total: e.target.value })} /></Field><Field label="Uses per customer"><input type="number" min={1} max={10} value={f.per_user_limit} onChange={(e) => setF({ ...f, per_user_limit: e.target.value })} /></Field></div>
            <div className="grid g2"><Field label="Total max uses (optional)"><input type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></Field><Field label="Valid for (days)"><input type="number" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></Field></div>
            <label className="row card flat" style={{ justifyContent: 'space-between' }}><span>Apply to drinks only (exclude food & retail merch)</span><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={!!f.drinks_only} onChange={(e) => setF({ ...f, drinks_only: e.target.checked })} /></label>
            <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{isOwner && <option value="">All stations</option>}{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <button className="btn primary" onClick={create}>Create</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function WelcomeReferralsTab({ isOwner }: { isOwner: boolean }) {
  const { data, reload, error } = useData<any>('/admin/marketing/welcome-referrals');
  const toast = useToast();
  const [v, setV] = useState<Record<string, number>>({});
  const [subTab, setSubTab] = useState<'rules' | 'referrals' | 'coupons'>('rules');

  if (!data) return <><ErrorNote error={error} /><Loading what="Loading welcome & referral rules" /></>;
  const s = { ...data.settings, ...v };
  const kpi = data.kpi || {};
  const econ = data.economics || { min_drink_price: 120, avg_drink_price: 160, avg_drink_cost: 45 };
  const changed = Object.keys(v).length;

  const setNum = (key: string, val: number) => setV((prev) => ({ ...prev, [key]: val }));

  async function save() {
    try {
      await api('/admin/marketing/welcome-referrals', { method: 'PUT', body: v });
      setV({});
      reload();
      toast('Welcome & referral rules updated');
    } catch (e: any) {
      toast(e.message, true);
    }
  }

  async function revokeCoupon(id: string) {
    if (!confirm('Expire this coupon immediately?')) return;
    try {
      await api(`/admin/marketing/welcome-referrals/revoke-coupon/${id}`, { method: 'POST', body: {} });
      reload();
      toast('Coupon expired');
    } catch (e: any) {
      toast(e.message, true);
    }
  }

  // Unit economics preview for anti-loss verification
  const firstEffectiveDiscount = Math.min(s.first_cup_free_max, Math.floor((econ.avg_drink_price * s.first_cup_discount_pct) / 100));
  const firstNetCash = Math.max(s.first_cup_min_spend, econ.avg_drink_price) - firstEffectiveDiscount;
  const refEffectiveDiscount = Math.min(s.referral_cup_max, Math.floor((econ.avg_drink_price * s.referral_reward_pct) / 100));
  const refNetCash = s.referral_min_spend + Math.max(s.referral_min_spend, econ.avg_drink_price) - refEffectiveDiscount * 2;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row between wrap">
        <div>
          <h3>Welcome offers &amp; referrals</h3>
          <p className="small muted" style={{ maxWidth: 720 }}>
            Centralised customer acquisition engine with strict anti-breach &amp; anti-loss guardrails. Every welcome or referral coupon is locked to a single drink’s base price, requires a minimum order spend, never stacks on Daily Offers or Drops, and permanently tracks phone hashes so deleting &amp; recreating an account can never re-claim a reward.
          </p>
        </div>
        <div className="row">
          {(['rules', 'referrals', 'coupons'] as const).map((t) => (
            <button key={t} className={`btn sm ${subTab === t ? 'primary' : 'ghost'}`} onClick={() => setSubTab(t)}>
              {t === 'rules' ? 'Rules & Guardrails' : t === 'referrals' ? `Referrals (${data.referrals?.length || 0})` : `Coupon Ledger (${data.coupons?.length || 0})`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid g4">
        <Stat label="Welcome coupons" value={`${kpi.active_welcome_coupons || 0} active`} delta={`${kpi.used_welcome_coupons || 0} redeemed · ${rs(kpi.welcome_net_revenue || 0)} net sales`} />
        <Stat label="Welcome discount spend" value={rs(kpi.welcome_discount_spend || 0)} delta="Capped to 1 drink base price" />
        <Stat label="Referrals rewarded" value={kpi.rewarded_referrals || 0} delta={`${kpi.pending_referrals || 0} pending · ${kpi.blocked_referrals || 0} duplicate blocked`} />
        <Stat label="Anti-recreate registry" value={`${kpi.tracked_phones || 0} phones`} delta={`Referral net sales: ${rs(kpi.referral_net_revenue || 0)}`} />
      </div>

      {subTab === 'rules' && (
        <>
          <div className="card" style={{ background: 'var(--surface-sunk)', borderLeft: '4px solid var(--hill)' }}>
            <div className="row between wrap">
              <div>
                <strong>Anti-Breach &amp; Unit Economics Protection Summary</strong>
                <p className="small muted" style={{ marginTop: 4 }}>
                  Average drink price: <strong>{rs(econ.avg_drink_price)}</strong> · Average drink food cost: <strong>{rs(econ.avg_drink_cost)}</strong>
                </p>
              </div>
              <span className="chip hill">6 Active Guardrails</span>
            </div>
            <div className="grid g3" style={{ marginTop: 12, gap: 12 }}>
              <div className="card flat">
                <div className="small muted">1. Single-Cup Base Price Cap</div>
                <div className="small" style={{ marginTop: 4 }}>Coupons apply to <strong>1 drink’s base price only</strong> (never cart-wide, never paid syrups/shots, never food or retail merch).</div>
              </div>
              <div className="card flat">
                <div className="small muted">2. Minimum Spend Floor</div>
                <div className="small" style={{ marginTop: 4 }}>
                  Welcome 1st cup collects at least <strong>{rs(firstNetCash)}</strong> cash (vs {rs(econ.avg_drink_cost)} cost). Referral cycle collects <strong>{rs(Math.max(0, refNetCash))}</strong> net cash across qualifying + reward orders.
                </div>
              </div>
              <div className="card flat">
                <div className="small muted">3. Permanent Phone Hash Registry</div>
                <div className="small" style={{ marginTop: 4 }}>Deleting an account and signing up again with the same phone number is permanently blocked from re-claiming welcome or referral rewards.</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row between wrap" style={{ marginBottom: 14 }}>
              <div>
                <h3>1. Welcome offer (1st cup)</h3>
                <p className="small muted">Reward new customers without giving away free inventory on zero-revenue accounts.</p>
              </div>
              <span className={`chip ${s.welcome_enabled ? 'hill' : ''}`}>{s.welcome_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="grid g3" style={{ gap: 14 }}>
              <label className="row card flat" style={{ justifyContent: 'space-between' }}>
                <span>Enable welcome offer for new customers</span>
                <input type="checkbox" disabled={!isOwner} style={{ width: 22, minHeight: 22 }} checked={!!s.welcome_enabled} onChange={(e) => setNum('welcome_enabled', e.target.checked ? 1 : 0)} />
              </label>
              <Field label="When to unlock welcome coupon" hint="Unlocking after 1st paid order prevents fake signups">
                <select disabled={!isOwner} value={s.welcome_trigger ?? 1} onChange={(e) => setNum('welcome_trigger', Number(e.target.value))}>
                  <option value={1}>After 1st full-price paid order (Recommended)</option>
                  <option value={0}>Immediately on registration</option>
                </select>
              </Field>
              <label className="row card flat" style={{ justifyContent: 'space-between' }}>
                <span>Require NestSMS verified phone to redeem</span>
                <input type="checkbox" disabled={!isOwner} style={{ width: 22, minHeight: 22 }} checked={!!s.offer_require_verified_phone} onChange={(e) => setNum('offer_require_verified_phone', e.target.checked ? 1 : 0)} />
              </label>
              <Field label="1st cup discount (%)" hint="50% covers margin; 100% = free up to cap">
                <input type="number" disabled={!isOwner} min={0} max={100} value={s.first_cup_discount_pct} onChange={(e) => setNum('first_cup_discount_pct', Number(e.target.value))} />
              </Field>
              <Field label="Max discount cap (Rs)" hint="Max Rs taken off 1 drink base price">
                <input type="number" disabled={!isOwner} min={30} max={300} value={s.first_cup_free_max} onChange={(e) => setNum('first_cup_free_max', Number(e.target.value))} />
              </Field>
              <Field label="Minimum order spend (Rs)" hint="Must be >= Max discount cap">
                <input type="number" disabled={!isOwner} min={100} max={2000} value={s.first_cup_min_spend} onChange={(e) => setNum('first_cup_min_spend', Number(e.target.value))} />
              </Field>
              <Field label="Coupon valid for (days)" hint="1 to 60 days">
                <input type="number" disabled={!isOwner} min={1} max={60} value={s.first_cup_valid_days} onChange={(e) => setNum('first_cup_valid_days', Number(e.target.value))} />
              </Field>
            </div>
          </div>

          <div className="card">
            <div className="row between wrap" style={{ marginBottom: 14 }}>
              <div>
                <h3>2. Follow-up cup ladder (cups 2, 3…)</h3>
                <p className="small muted">Optional single-cup percentage coupons to build a daily habit after the welcome cup.</p>
              </div>
              <span className={`chip ${s.ladder_enabled ? 'hill' : ''}`}>{s.ladder_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="grid g3" style={{ gap: 14 }}>
              <label className="row card flat" style={{ justifyContent: 'space-between' }}>
                <span>Enable follow-up cup ladder</span>
                <input type="checkbox" disabled={!isOwner} style={{ width: 22, minHeight: 22 }} checked={!!s.ladder_enabled} onChange={(e) => setNum('ladder_enabled', e.target.checked ? 1 : 0)} />
              </label>
              <Field label="Number of follow-up coupons" hint="0 to 3 coupons (1 cup per order)">
                <input type="number" disabled={!isOwner} min={0} max={3} value={s.ladder_cups} onChange={(e) => setNum('ladder_cups', Number(e.target.value))} />
              </Field>
              <Field label="Discount percent (%)" hint="Max 40% off 1 drink base price">
                <input type="number" disabled={!isOwner} min={5} max={40} value={s.ladder_pct} onChange={(e) => setNum('ladder_pct', Number(e.target.value))} />
              </Field>
              <Field label="Max discount cap per coupon (Rs)" hint="30 to 200 Rs">
                <input type="number" disabled={!isOwner} min={30} max={200} value={s.ladder_max_discount} onChange={(e) => setNum('ladder_max_discount', Number(e.target.value))} />
              </Field>
              <Field label="Minimum order spend (Rs)" hint="Must be at least cap + Rs 60">
                <input type="number" disabled={!isOwner} min={120} max={2000} value={s.ladder_min_spend} onChange={(e) => setNum('ladder_min_spend', Number(e.target.value))} />
              </Field>
              <Field label="Valid for (days)" hint="1 to 60 days">
                <input type="number" disabled={!isOwner} min={1} max={60} value={s.ladder_days} onChange={(e) => setNum('ladder_days', Number(e.target.value))} />
              </Field>
            </div>
          </div>

          <div className="card">
            <div className="row between wrap" style={{ marginBottom: 14 }}>
              <div>
                <h3>3. Referral program (“Give a cup, get a cup”)</h3>
                <p className="small muted">Both friend and referrer are rewarded ONLY after the friend completes a full-price paid cash/Fonepay/eSewa/Khalti order meeting the minimum spend.</p>
              </div>
              <span className={`chip ${s.referral_enabled ? 'hill' : ''}`}>{s.referral_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="grid g3" style={{ gap: 14 }}>
              <label className="row card flat" style={{ justifyContent: 'space-between' }}>
                <span>Enable referral program</span>
                <input type="checkbox" disabled={!isOwner} style={{ width: 22, minHeight: 22 }} checked={!!s.referral_enabled} onChange={(e) => setNum('referral_enabled', e.target.checked ? 1 : 0)} />
              </label>
              <label className="row card flat" style={{ justifyContent: 'space-between' }}>
                <span>Referrer must have ≥1 paid order</span>
                <input type="checkbox" disabled={!isOwner} style={{ width: 22, minHeight: 22 }} checked={!!s.referrer_require_paid_order} onChange={(e) => setNum('referrer_require_paid_order', e.target.checked ? 1 : 0)} />
              </label>
              <Field label="Friend’s qualifying order min spend (Rs)" hint="Full-price paid order required to unlock">
                <input type="number" disabled={!isOwner} min={120} max={2000} value={s.referral_min_spend} onChange={(e) => setNum('referral_min_spend', Number(e.target.value))} />
              </Field>
              <Field label="Referral reward discount (%)" hint="50% = half-price cup; 100% = free cup up to cap">
                <input type="number" disabled={!isOwner} min={10} max={100} value={s.referral_reward_pct} onChange={(e) => setNum('referral_reward_pct', Number(e.target.value))} />
              </Field>
              <Field label="Referral reward max cap (Rs)" hint="Max Rs discount on 1 drink base price">
                <input type="number" disabled={!isOwner} min={50} max={350} value={s.referral_cup_max} onChange={(e) => setNum('referral_cup_max', Number(e.target.value))} />
              </Field>
              <Field label="Monthly cap per referrer" hint="1 to 20 rewards / month">
                <input type="number" disabled={!isOwner} min={1} max={20} value={s.referral_cap_month} onChange={(e) => setNum('referral_cap_month', Number(e.target.value))} />
              </Field>
              <Field label="Lifetime cap per referrer" hint="1 to 100 rewards all-time">
                <input type="number" disabled={!isOwner} min={1} max={100} value={s.referral_lifetime_cap} onChange={(e) => setNum('referral_lifetime_cap', Number(e.target.value))} />
              </Field>
            </div>
          </div>

          {isOwner && (
            <div className="row" style={{ position: 'sticky', bottom: 12 }}>
              <button className="btn primary lg" disabled={!changed} onClick={save}>
                {changed ? `Save ${changed} change${changed > 1 ? 's' : ''}` : 'All rules saved'}
              </button>
              {changed > 0 && <button className="btn ghost" onClick={() => setV({})}>Reset unsaved</button>}
            </div>
          )}
        </>
      )}

      {subTab === 'referrals' && (
        !data.referrals?.length ? <Empty>No referrals recorded yet.</Empty> : (
          <div className="card tablewrap" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>When</th><th>Referrer</th><th>Friend (Referee)</th><th>Phone Verified</th><th>Qualifying Order</th><th>Status</th></tr></thead>
              <tbody>
                {data.referrals.map((r: any) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.created_at)}</td>
                    <td><strong>{r.referrer_name}</strong><div className="small muted">{r.referrer_phone}</div></td>
                    <td><strong>{r.referee_name}</strong><div className="small muted">{r.referee_phone}</div></td>
                    <td>{r.referee_verified ? <span className="chip hill">Verified</span> : <span className="chip">Unverified</span>}</td>
                    <td>{r.qualifying_amount ? rs(r.qualifying_amount) : 'Waiting for 1st paid order'}</td>
                    <td>
                      <span className={`chip ${r.status === 'rewarded' ? 'hill' : r.status === 'blocked_duplicate' ? 'cherry' : ''}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {subTab === 'coupons' && (
        !data.coupons?.length ? <Empty>No welcome or referral coupons issued yet.</Empty> : (
          <div className="card tablewrap" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Issued</th><th>Customer</th><th>Coupon</th><th>Guardrails</th><th>Expires</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.coupons.map((c: any) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.created_at)}</td>
                    <td><strong>{c.customer_name}</strong><div className="small muted">{c.customer_phone}</div></td>
                    <td><strong>{c.title}</strong><div className="small muted">{c.kind}</div></td>
                    <td className="small">
                      {c.pct ? `${c.pct}% off` : 'Free'} · cap {rs(c.max_discount || c.free_max || 180)} · min spend {rs(c.min_spend || 0)} · 1 drink base
                    </td>
                    <td>{fmtDate(c.expires_at)}</td>
                    <td><span className={`chip ${c.status === 'active' ? 'hill' : ''}`}>{c.status}</span></td>
                    <td className="right">
                      {isOwner && c.status === 'active' && (
                        <button className="btn sm ghost" onClick={() => revokeCoupon(c.id)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export function InventoryTab({ stationId }: { stationId: string }) {
  const { data, reload } = useData<any[]>(`/admin/inventory${qs({ station_id: stationId })}`, [stationId]);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState<'restock' | 'adjust' | 'reorder'>('restock');
  if (!data) return <Loading />;
  async function save() {
    try {
      if (mode === 'reorder') await api(`/admin/inventory/${edit.sid}/${edit.id}`, { method: 'PATCH', body: { reorder_level: Number(amt) } });
      else await api(`/admin/inventory/${edit.sid}/${edit.id}`, { method: 'POST', body: mode === 'restock' ? { delta: Number(amt), reason: 'restock' } : { qty: Number(amt), reason: 'adjust' } });
      setEdit(null); setAmt(''); reload(); toast('Saved');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      {data.map((st) => (
        <div key={st.station_id} className="card tablewrap" style={{ padding: 0, marginBottom: 16 }}>
          <h3 style={{ padding: '16px 16px 4px' }}>{st.name}</h3>
          <table><thead><tr><th>Ingredient</th><th className="num">On hand</th><th className="num">Reorder at</th><th /></tr></thead>
            <tbody>{st.items.map((i: any) => <tr key={i.id}><td>{i.name} {i.low && <span className="chip cherry">Low</span>}</td><td className="num">{Math.round(i.qty).toLocaleString()} {i.unit}</td><td className="num">{Math.round(i.reorder_level).toLocaleString()}</td><td className="right"><button className="btn sm" onClick={() => setEdit({ ...i, sid: st.station_id, sname: st.name })}>Update</button></td></tr>)}</tbody></table>
        </div>
      ))}
      {edit && (
        <Modal title={`${edit.name} · ${edit.sname}`} onClose={() => setEdit(null)}>
          <div className="row wrap" style={{ marginBottom: 12 }}>{([['restock', 'Add delivery'], ['adjust', 'Set count'], ['reorder', 'Reorder level']] as const).map(([m, l]) => <button key={m} className={`btn sm ${mode === m ? 'primary' : 'ghost'}`} onClick={() => setMode(m)}>{l}</button>)}</div>
          <Field label={`Amount (${edit.unit})`}><input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus /></Field>
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={amt === ''} onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}

export function StationMenuTab({ stationId, isOwner }: { stationId: string; isOwner: boolean }) {
  const { data, reload } = useData<any[]>(stationId ? `/admin/stations/${stationId}/products` : null, [stationId]);
  const toast = useToast();
  if (!stationId) return <Empty>Choose one station above to manage its menu.</Empty>;
  if (!data) return <Loading />;
  async function put(p: any, body: any) { try { await api(`/admin/stations/${stationId}/products/${p.id}`, { method: 'PUT', body }); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Item</th><th className="num">Price</th><th className="num">Station price</th><th /></tr></thead>
      <tbody>{data.map((p) => <tr key={p.id}><td>{p.name} <span className="small muted">{p.category}</span></td><td className="num">{rs(p.price)}</td>
        <td className="num">{isOwner ? <input style={{ width: 90, minHeight: 36, textAlign: 'right' }} type="number" defaultValue={p.price_override ?? ''} placeholder={String(p.price)} onBlur={(e) => put(p, { price_override: e.target.value === '' ? null : Number(e.target.value) })} /> : p.price_override ? rs(p.price_override) : '–'}</td>
        <td className="right"><button className={`btn sm ${p.available ? 'ghost' : 'hill'}`} onClick={() => put(p, { available: !p.available })}>{p.available ? 'Selling · pause' : 'Paused · resume'}</button></td></tr>)}</tbody></table></div>
  );
}

export function CashTab({ stationId }: { stationId: string }) {
  const { data } = useData<any[]>(`/admin/cash-closes${qs({ station_id: stationId })}`, [stationId]);
  if (!data) return <Loading />;
  return !data.length ? <Empty>No cash counts yet.</Empty> : (
    <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Date</th><th>Station</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Difference</th><th>Closed by</th></tr></thead>
      <tbody>{data.map((c) => <tr key={c.id}><td>{fmtDate(c.business_date)}</td><td>{c.station_name}</td><td className="num">{rs(c.expected_cash)}</td><td className="num">{rs(c.counted_cash)}</td><td className="num" style={{ color: c.diff ? 'var(--cherry)' : undefined, fontWeight: c.diff ? 700 : 400 }}>{c.diff ? rs(c.diff) : 'Matches'}</td><td>{c.closed_by_name}</td></tr>)}</tbody></table></div>
  );
}

export function ReviewsTab({ stationId }: { stationId: string }) {
  const { data } = useData<any[]>(`/admin/reviews${qs({ station_id: stationId })}`, [stationId]);
  if (!data) return <Loading />;
  return !data.length ? <Empty>No ratings yet.</Empty> : (
    <div className="col">{data.map((r) => <div key={r.id} className="card flat row between"><div><strong>{r.rating} out of 5</strong> <span className="muted small">· {r.pickup_code} · {r.station_name} · {r.customer}</span>{r.rating_note && <div className="small">{r.rating_note}</div>}</div><span className="small muted">{fmtDate(r.created_at)}</span></div>)}</div>
  );
}

/* ---------------- offers of the day (manager + owner) ---------------- */
export function OffersTab({ stations, isOwner }: { stations: any[]; isOwner: boolean }) {
  const { data, reload } = useData<any[]>('/admin/offers');
  const menu = useData<any>('/owner/menu', []); // owner only; managers fall back below
  const prods = useData<any[]>(stations[0] ? `/admin/stations/${stations[0].id}/products` : null);
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  const items: any[] = (isOwner ? menu.data?.products : prods.data) || [];
  const cats: any[] = isOwner ? menu.data?.categories || [] : [];
  const blank = () => ({ title: '', blurb: '', scope: 'product', product_id: items[0]?.id, category_id: cats[0]?.id, mode: 'pct', pct: 15, offer_price: '', station_id: isOwner ? '' : stations[0]?.id, hours: 12, max_uses: '' });
  async function create() {
    try {
      await api('/admin/offers', { method: 'POST', body: {
        title: f.title, blurb: f.blurb || undefined, scope: f.scope, product_id: f.scope === 'product' ? f.product_id : undefined, category_id: f.scope === 'category' ? f.category_id : undefined,
        pct: f.mode === 'pct' ? Number(f.pct) : undefined, offer_price: f.mode === 'price' ? Number(f.offer_price) : undefined,
        station_id: f.station_id || undefined, hours: Number(f.hours), max_uses: f.max_uses ? Number(f.max_uses) : undefined,
      } });
      setF(null); reload(); toast('Offer is live');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}><h3>Offer of the day</h3><button className="btn primary sm" onClick={() => setF(blank())}>New offer</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>Offers go live in the customer app the moment you save them, at the station you choose. Managers can go up to 40% off and never below food cost. Every offer is recorded in the audit log.</p>
      {!data ? <Loading /> : !data.length ? <Empty>No offers yet.</Empty> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Offer</th><th>What</th><th>Where</th><th>Ends</th><th className="num">Used</th><th /></tr></thead>
          <tbody>{data.map((o) => <tr key={o.id} style={{ opacity: o.live ? 1 : 0.55 }}><td><strong>{o.title}</strong> {o.live && <span className="chip hill">Live</span>}</td>
            <td>{o.scope === 'product' ? o.product_name : o.scope === 'category' ? o.category_name : 'All drinks'} · {o.offer_price != null ? rs(o.offer_price) : `${o.pct}% off`}</td><td>{o.station_name || 'All stations'}</td><td>{fmtDateTime(o.ends_at)}</td><td className="num">{o.used}{o.max_uses ? ` / ${o.max_uses}` : ''}</td>
            <td className="right">{o.live ? <button className="btn sm ghost" onClick={async () => { await api(`/admin/offers/${o.id}`, { method: 'PATCH', body: { active: false } }); reload(); }}>Stop</button> : null}</td></tr>)}</tbody></table></div>
      )}
      {f && (
        <Modal title="New offer of the day" onClose={() => setF(null)}>
          <div className="col">
            <Field label="Headline"><input value={f.title} placeholder="Americano, Rs 99 today" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="One line for customers"><input value={f.blurb} maxLength={140} onChange={(e) => setF({ ...f, blurb: e.target.value })} /></Field>
            <Field label="Applies to"><select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="product">One item</option>{isOwner && <option value="category">A category</option>}<option value="all_drinks">All drinks</option></select></Field>
            {f.scope === 'product' && <Field label="Item"><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}>{items.map((p) => <option key={p.id} value={p.id}>{p.name} · {rs(p.price)}</option>)}</select></Field>}
            {f.scope === 'category' && <Field label="Category"><select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            <div className="row wrap">
              <button className={`btn sm ${f.mode === 'pct' ? 'primary' : 'ghost'}`} onClick={() => setF({ ...f, mode: 'pct' })}>Percent off</button>
              {f.scope === 'product' && <button className={`btn sm ${f.mode === 'price' ? 'primary' : 'ghost'}`} onClick={() => setF({ ...f, mode: 'price' })}>Fixed price</button>}
            </div>
            {f.mode === 'pct' ? <Field label="Percent off"><input type="number" min={1} max={60} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field> : <Field label="Price (Rs, all-in)"><input type="number" value={f.offer_price} onChange={(e) => setF({ ...f, offer_price: e.target.value })} /></Field>}
            <div className="grid g2"><Field label="Runs for (hours)"><input type="number" min={1} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field><Field label="Cup limit (optional)"><input type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></Field></div>
            <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{isOwner && <option value="">All stations</option>}{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <button className="btn primary" disabled={f.title.length < 3} onClick={create}>Publish offer</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- accountability: scorecard + partner statement ---------------- */
export function PartnerStatementCard({ s, settle }: { s: any; settle?: (s: any) => void }) {
  const due = s.net_due;
  return (
    <div className="card">
      <div className="row between wrap"><div><h3>{s.station.name}</h3><p className="small muted">{s.station.partner_name} · cafe keeps {s.station.revenue_share_pct}% of net sales</p></div>
        {s.settled ? <span className="chip hill">Settled · {s.settled.reference}</span> : settle && s.station.operator_type === 'partner' ? <button className="btn sm primary" onClick={() => settle(s)}>Mark settled</button> : null}</div>
      <div className="grid g4" style={{ marginTop: 12 }}>
        <Stat label="Net sales" value={rs(s.net_sales)} delta={`${s.orders} orders · ${s.pass_cups} pass cups`} />
        <Stat label="Cafe share" value={rs(s.partner_share)} />
        <Stat label="Cash the cafe holds" value={rs(s.cash_held)} delta="Belongs to Sadhai" />
        <Stat label={due >= 0 ? 'Sadhai pays the cafe' : 'Cafe remits to Sadhai'} value={rs(Math.abs(due))} tone={due >= 0 ? 'good' : 'bad'} delta={`${rs(s.digital_held_by_sadhai)} paid digitally to Sadhai`} />
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Pass cups count at the pass’s per-cup value so the cafe is paid for them. Refunds in the period: {rs(s.refunds)}.</p>
    </div>
  );
}

export function AccountabilityTab({ stationId, isOwner }: { stationId: string; isOwner: boolean }) {
  const [days, setDays] = useState(30);
  const from = sinceDays(days);
  const sc = useData<any>(`/admin/scorecard${qs({ station_id: stationId, from })}`, [stationId, days]);
  const st = useData<any[]>(`/admin/partner-statement${qs({ station_id: stationId, from })}`, [stationId, days]);
  const toast = useToast();
  async function settle(s: any) {
    const reference = prompt(`Reference for this settlement (bank transfer or cash remittance) for ${s.station.name}`);
    if (!reference) return;
    try { await api(`/owner/partners/${s.station.id}/settle`, { method: 'POST', body: { from, to: new Date().toISOString().slice(0, 10), reference } }); toast('Settlement recorded'); st.reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="col" style={{ gap: 20 }}>
      <RangePicker days={days} setDays={setDays} />
      {st.data && st.data.length > 0 && <><h3>Partner cafe statements</h3>{st.data.map((s) => <PartnerStatementCard key={s.station.id} s={s} settle={isOwner ? settle : undefined} />)}</>}
      <h3>Station scorecard</h3>
      {!sc.data ? <Loading /> : (
        <>
          <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Station</th><th className="num">On time</th><th className="num">Cancelled</th><th className="num">Rating</th><th className="num">Discount</th><th className="num">Cash gaps</th><th>Watch</th></tr></thead>
            <tbody>{sc.data.stations.map((r: any) => <tr key={r.id}><td><strong>{r.name}</strong><div className="small muted">{r.operator_type === 'partner' ? r.partner_name : 'Sadhai-run'}</div></td>
              <td className="num">{r.on_time_pct ?? '–'}%</td><td className="num">{r.cancel_pct}%</td><td className="num">{r.rated ? r.rating : '–'}</td><td className="num">{r.discount_pct}%</td><td className="num">{r.cash_diff_days} days · {rs(r.cash_diff)}</td>
              <td>{r.flags.length ? r.flags.map((x: string) => <div key={x} className="chip cherry" style={{ margin: 2 }}>{x}</div>) : <span className="chip hill">Clear</span>}</td></tr>)}</tbody></table></div>
          <h3>Staff</h3>
          <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Station</th><th className="num">Drinks made</th><th className="num">Average time</th><th className="num">Rushed (&lt;12s)</th><th className="num">Cancels</th><th className="num">Cash marked</th></tr></thead>
            <tbody>{sc.data.staff.map((u: any) => <tr key={u.id}><td>{u.name}</td><td>{u.station}</td><td className="num">{u.orders_made}</td><td className="num">{u.avg_make_seconds}s</td><td className="num" style={{ color: u.rushed > 3 ? 'var(--cherry)' : undefined, fontWeight: u.rushed > 3 ? 700 : 400 }}>{u.rushed}</td><td className="num">{u.cancels}</td><td className="num">{u.cash_marked}</td></tr>)}</tbody></table></div>
          <p className="small muted">Every order records who started it and who marked it ready. Orders marked ready in under 12 seconds, unmatched cash counts and unusual cancellations are flagged so each counter stays accountable, whoever runs it.</p>
        </>
      )}
    </div>
  );
}
