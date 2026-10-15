'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireRole } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { Loading, useToast } from '@/components/ui';
import { CustomerShell } from '@/components/customer';
import { OrdersTab } from '@/components/account';

export default function Orders() {
  const user = useRequireRole('customer');
  const cart = useCart();
  const router = useRouter();
  const toast = useToast();
  async function again(id: string) {
    try {
      const o = await api(`/orders/${id}`);
      cart.setStation({ id: o.station_id, name: o.station_name, address: o.station_address });
      for (const i of o.items) cart.add({ key: `${i.product_id}|${(i.options || []).map((x: any) => x.id).sort().join(',')}`, product: { id: i.product_id, name: i.name }, qty: i.qty, option_ids: (i.options || []).map((x: any) => x.id), optionNames: (i.options || []).map((x: any) => x.name), unit: i.unit_price });
      toast('Added to your cart'); router.push('/cart');
    } catch (e: any) { toast(e.message, true); }
  }
  return <CustomerShell>{!user ? <Loading /> : <><h2 style={{ marginBottom: 12 }}>Orders</h2><OrdersTab onAgain={again} /></>}</CustomerShell>;
}
