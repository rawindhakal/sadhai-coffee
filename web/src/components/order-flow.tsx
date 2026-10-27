'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Field, useData, useToast } from './ui';
import { Skeleton } from './dash/kit';

const WAYS: Record<string, string> = { cash: 'Cash at the counter', pass: '10-cup pass', esewa: 'eSewa', fonepay: 'Fonepay', nepalpay: 'NepalPay QR' };
const HELP: Record<string, string> = {
  app: 'Customers ordering in the Sadhai mobile app.', web: 'Customers ordering on sadhaicoffee.com.', qr: 'Customers who scan the QR on the kiosk and order on their own phone.',
  kiosk: 'Guests ordering on the kiosk tablet.', counter: 'Baristas taking an order at the counter.',
};

/** Settings, Order flow: one set of ordering rules for every screen. Saved rules take effect on the next order. */
export function OrderFlowPanel() {
  const q = useData<any>('/owner/order-flow');
  const toast = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setDraft(structuredClone(q.data.flow)); }, [q.data]);
  if (!q.data || !draft) return <Skeleton h={80} n={3} />;
  const channels: { id: string; label: string }[] = q.data.channels;
  const set = (c: string, patch: any) => setDraft({ ...draft, [c]: { ...draft[c], ...patch } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data.flow);
  async function save() {
    setBusy(true);
    try { await api('/owner/order-flow', { method: 'PUT', body: { flow: draft } }); toast('Saved. Every screen follows it on the next order.'); q.reload(); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function reset() {
    if (!confirm('Go back to the built-in ordering rules for every screen?')) return;
    try { await api('/owner/order-flow', { method: 'DELETE' }); toast('Back to the built-in rules'); q.reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel"><p className="small muted">These rules decide how an order is taken on each way in. They apply on the website, in the app, on the kiosk and at the counter, so ordering is the same everywhere. A way of paying only shows when it is also switched on and set up under Payments.</p></div>
      {channels.map((ch) => {
        const r = draft[ch.id];
        return (
          <div key={ch.id} className="panel col" style={{ gap: 14, borderLeft: `5px solid ${r.enabled ? 'var(--hill)' : 'var(--hairline)'}` }}>
            <div className="row between wrap">
              <div><h3>{ch.label}</h3><p className="small muted">{HELP[ch.id]}</p></div>
              <label className="row card flat" style={{ padding: '6px 12px', cursor: 'pointer', gap: 8 }}>
                <input type="checkbox" role="switch" style={{ width: 22, minHeight: 22 }} checked={r.enabled} onChange={(e) => set(ch.id, { enabled: e.target.checked })} />
                <strong>{r.enabled ? 'Taking orders' : 'Switched off'}</strong>
              </label>
            </div>
            <fieldset disabled={!r.enabled} style={{ border: 0, padding: 0, margin: 0, opacity: r.enabled ? 1 : 0.5 }}>
              <div className="label" style={{ marginBottom: 6 }}>Ways to pay</div>
              <div className="row wrap" style={{ gap: 8 }}>
                {Object.keys(WAYS).map((m) => (
                  <label key={m} className="row card flat" style={{ padding: '6px 12px', cursor: 'pointer', gap: 8 }}>
                    <input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={!!r.payments[m]} onChange={(e) => set(ch.id, { payments: { ...r.payments, [m]: e.target.checked } })} />{WAYS[m]}
                  </label>
                ))}
              </div>
              <div className="grid g3" style={{ marginTop: 14 }}>
                <Field label="Most items in one order"><input type="number" min={1} max={50} value={r.max_cups} onChange={(e) => set(ch.id, { max_cups: Number(e.target.value) })} /></Field>
                <label className="row" style={{ gap: 8, alignSelf: 'end', minHeight: 44 }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.notes} onChange={(e) => set(ch.id, { notes: e.target.checked })} />Let people add a note</label>
                {['app', 'web', 'qr'].includes(ch.id) && <label className="row" style={{ gap: 8, alignSelf: 'end', minHeight: 44 }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.pickup_later} onChange={(e) => set(ch.id, { pickup_later: e.target.checked })} />Allow pickup later</label>}
                {ch.id === 'kiosk' && <>
                  <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.ask_name} onChange={(e) => set(ch.id, { ask_name: e.target.checked })} />Ask for the guest’s name</label>
                  <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.ask_phone} onChange={(e) => set(ch.id, { ask_phone: e.target.checked })} />Ask for a phone number</label>
                </>}
              </div>
            </fieldset>
          </div>
        );
      })}
      <div className="row wrap"><button className="btn primary" disabled={!dirty || busy} onClick={save}>{dirty ? 'Save order flow' : 'No changes'}</button><button className="btn ghost" onClick={reset}>Reset to built-in</button></div>
    </div>
  );
}
