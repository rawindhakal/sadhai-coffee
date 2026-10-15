'use client';
import { useState } from 'react';
import { api, fmtDateTime } from '@/lib/api';
import { Empty, ErrorNote, Field, Modal, useData, useToast } from './ui';
import { Kpi, Skeleton } from './dash/kit';
import { useDash } from './dash/shell';

const AUD: Record<string, string> = { all: 'All customers', inactive_14d: 'Customers who have not ordered in 14 days', pass_expiring: 'Customers whose pass ends within 5 days', station_visitors: 'Customers of one station (last 60 days)', phone: 'One customer, by phone' };

export function PushSection({ isOwner }: { isOwner: boolean }) {
  const { stations } = useDash();
  const status = useData<any>('/admin/push/status');
  const list = useData<any[]>('/admin/push/campaigns');
  const toast = useToast();
  const [f, setF] = useState<any>({ title: '', body: '', type: isOwner ? 'all' : 'station_visitors', station_id: stations[0]?.id || '', phone: '', later: false, at: '' });
  const [preview, setPreview] = useState<any>(null);
  const [auto, setAuto] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const audience = () => ({ type: f.type, ...(f.type === 'station_visitors' ? { station_id: f.station_id || stations[0]?.id } : {}), ...(f.type === 'phone' ? { phone: f.phone } : {}) });
  async function doPreview() { try { setPreview(await api('/admin/push/preview', { method: 'POST', body: audience() })); } catch (e: any) { toast(e.message, true); setPreview(null); } }
  async function send() {
    setBusy(true);
    try { const out = await api('/admin/push/campaigns', { method: 'POST', body: { title: f.title, body: f.body || undefined, audience: audience(), send_at: f.later && f.at ? new Date(f.at).toISOString() : undefined } }); toast(out.status === 'sent' ? `Sent to ${out.result?.sent ?? 0} customers` : 'Scheduled'); setF({ ...f, title: '', body: '' }); setPreview(null); list.reload(); status.reload(); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  const st = status.data;
  const types = isOwner ? Object.keys(AUD) : ['station_visitors', 'phone'];
  return (
    <div className="col" style={{ gap: 16 }}>
      {st && (
        <div className="grid g4">
          <Kpi label="Delivery mode" value={st.provider.dry_run ? 'Test mode' : 'Live'} hint={st.provider.dry_run ? 'No Firebase or web keys set: messages are logged, not sent' : `${st.provider.fcm ? 'phones' : ''}${st.provider.fcm && st.provider.web ? ' and ' : ''}${st.provider.web ? 'browsers' : ''}`} />
          <Kpi label="Registered devices" value={st.devices.reduce((a: number, d: any) => a + d.n, 0)} hint={st.devices.map((d: any) => `${d.n} ${d.platform}`).join(' · ') || 'None yet'} />
          <Kpi label="Delivered, 7 days" value={st.deliveries_7d.filter((d: any) => ['sent', 'dry_run'].includes(d.status)).reduce((a: number, d: any) => a + d.n, 0)} />
          <Kpi label="Failed, 7 days" value={st.deliveries_7d.filter((d: any) => ['failed', 'invalid_token'].includes(d.status)).reduce((a: number, d: any) => a + d.n, 0)} />
        </div>
      )}
      <div className="cols c-21">
        <div className="panel">
          <div className="ph"><div><h3>Send a push notification</h3><p className="small muted">One marketing push a day at most per customer. People who turned off offers are skipped. Order and pass messages are separate and always go out.</p></div></div>
          <div className="col">
            <Field label="Who gets it"><select value={f.type} onChange={(e) => { setF({ ...f, type: e.target.value }); setPreview(null); }}>{types.map((t) => <option key={t} value={t}>{AUD[t]}</option>)}</select></Field>
            {f.type === 'station_visitors' && <Field label="Station"><select value={f.station_id} onChange={(e) => { setF({ ...f, station_id: e.target.value }); setPreview(null); }}>{stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            {f.type === 'phone' && <Field label="Customer mobile number"><input value={f.phone} onChange={(e) => { setF({ ...f, phone: e.target.value }); setPreview(null); }} inputMode="tel" /></Field>}
            <Field label="Title" hint={`${f.title.length}/60`}><input maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Your Americano, Rs 99 until Sunday" /></Field>
            <Field label="Message" hint={`${f.body.length}/140`}><input maxLength={140} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Order ahead and skip the wait." /></Field>
            <label className="row small"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={f.later} onChange={(e) => setF({ ...f, later: e.target.checked })} />Send later</label>
            {f.later && <Field label="Send at"><input type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>}
            <div className="row wrap"><button className="btn" onClick={doPreview}>Check who this reaches</button>{preview && <span className="small"><strong>{preview.customers}</strong> customers, <strong>{preview.devices}</strong> devices</span>}</div>
            <p className="small muted">No promotions between 21:00 and 07:00 for automatic messages. Keep copy plain: no guilt, no capitals, no exclamation marks.</p>
            <button className="btn primary" disabled={busy || f.title.length < 3 || (f.later && !f.at)} onClick={send}>{f.later ? 'Schedule' : 'Send now'}</button>
          </div>
        </div>
        <div className="panel">
          <div className="ph"><h3>Preview</h3></div>
          <div style={{ background: 'var(--surface-sunk)', borderRadius: 20, padding: 16 }}>
            <div style={{ background: 'var(--surface-raised)', borderRadius: 16, padding: 14, display: 'flex', gap: 12, boxShadow: 'var(--shadow-card)' }}>
              <img src="/app-icon.svg" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
              <div><div className="small muted">SADHAI COFFEE · now</div><strong>{f.title || 'Your title'}</strong><div className="small">{f.body || 'Your message'}</div></div>
            </div>
          </div>
          {isOwner && (
            <div style={{ marginTop: 20 }}>
              <h4>Automatic messages</h4>
              <ul className="small" style={{ paddingLeft: 18, margin: '8px 0' }}>
                <li>Order received, being made and ready</li><li>A pass with cups left is about to end, or is nearly used up</li><li>A win-back note for regulars who went quiet for two weeks</li><li>A new offer of the day or a new monthly drop, to people who ordered nearby</li>
              </ul>
              <p className="small muted">Switch each one on or off under Rules.</p>
              <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => { try { setAuto(await api('/admin/push/automations/run', { method: 'POST' })); } catch (e: any) { toast(e.message, true); } }}>Run the automations now</button>
            </div>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="ph"><h3>History</h3></div>
        {!list.data ? <Skeleton h={44} n={3} /> : !list.data.length ? <Empty>Nothing sent yet.</Empty> : (
          <div className="tablewrap"><table><thead><tr><th>When</th><th>Message</th><th>Audience</th><th className="num">Reached</th><th className="num">Delivered</th><th className="num">Failed</th><th>Status</th><th /></tr></thead>
            <tbody>{list.data.map((c) => <tr key={c.id}><td>{fmtDateTime(c.scheduled_for)}</td><td><strong>{c.title}</strong><div className="small muted">{c.body}</div></td><td className="small">{AUD[c.audience.type] || c.audience.type}</td><td className="num">{c.recipients}</td><td className="num">{c.delivered}{c.dry_run ? <span className="chip" style={{ marginLeft: 6 }}>test</span> : null}</td><td className="num">{c.failed}</td><td><span className={`chip ${c.status === 'sent' ? 'hill' : c.status === 'scheduled' ? 'marigold' : ''}`}>{c.status}</span></td>
              <td>{c.status === 'scheduled' && <button className="btn sm ghost" onClick={async () => { try { await api(`/admin/push/campaigns/${c.id}`, { method: 'DELETE' }); list.reload(); } catch (e: any) { toast(e.message, true); } }}>Cancel</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {auto && <Modal title="Automations ran" onClose={() => setAuto(null)}><div className="col small" style={{ gap: 6 }}>{Object.entries(auto).map(([k, v]) => <div key={k} className="row between"><span>{k.replace('_', ' ')}</span><strong>{String(v)}</strong></div>)}</div></Modal>}
    </div>
  );
}
