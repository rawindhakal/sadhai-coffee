'use client';
import { api, fmtDateTime, rs } from '@/lib/api';
import { Empty, Status, useData, useToast } from './ui';
import { Skeleton } from './dash/kit';
import { useDash } from './dash/shell';

/** Money, Shop QR payments: every order paid by scanning the shop QR, with the ones nobody has checked yet first. */
export function QrVerifySection() {
  const { stationId, tick, openOrder } = useDash();
  const list = useData<any[]>(`/admin/qr-payments${stationId ? `?station_id=${stationId}` : ''}`, [stationId, tick]);
  const toast = useToast();
  if (!list.data) return <Skeleton h={60} n={4} />;
  const waiting = list.data.filter((r) => r.payment_status === 'unpaid' && r.status !== 'cancelled');
  async function verify(id: string) {
    try { await api(`/admin/orders/${id}/verify-payment`, { method: 'POST', body: {} }); toast('Payment confirmed'); list.reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel"><p className="small muted">Customers who pay by scanning your shop QR are not confirmed by any bank system. Match each one against your bank or wallet statement, then press <b>Payment received</b>. The barista can do the same at the station, and cannot hand the order over until it is done. If the money never arrived, decline the order from the order page.</p></div>
      <div className="panel">
        <div className="ph"><div><h3>Waiting to be checked</h3><p className="small muted">{waiting.length ? `${waiting.length} order${waiting.length > 1 ? 's' : ''}, ${rs(waiting.reduce((a, r) => a + r.total, 0))}` : 'Nothing waiting.'}</p></div></div>
        {!list.data.length ? <Empty>No shop-QR payments in the last 14 days.</Empty> : (
          <div className="tablewrap"><table><thead><tr><th>When</th><th>Order</th><th>Station</th><th>Customer</th><th className="num">Amount</th><th>Payment</th><th /></tr></thead>
            <tbody>{list.data.map((r) => (
              <tr key={r.id}><td>{fmtDateTime(r.created_at)}</td>
                <td><button className="btn ghost sm" onClick={() => openOrder(r.id)}><b>{r.pickup_code}</b></button></td>
                <td>{r.station_name}</td><td>{r.user_name || r.customer_name || 'Walk-in'}{r.user_phone ? <span className="small muted"> · {r.user_phone}</span> : null}</td>
                <td className="num">{rs(r.total)}</td>
                <td>{r.status === 'cancelled' ? <Status s="cancelled" /> : r.payment_status === 'paid' ? <span className="small">Checked{r.verified_by ? ` by ${r.verified_by}` : ''} ({r.verified_how === 'station' ? 'at the station' : 'centrally'})</span> : <span className="chip marigold">Not checked</span>}</td>
                <td>{r.payment_status === 'unpaid' && r.status !== 'cancelled' && <button className="btn primary sm" onClick={() => verify(r.id)}>Payment received</button>}</td></tr>))}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
