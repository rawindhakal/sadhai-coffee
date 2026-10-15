'use client';
import { Empty, Loading } from '../ui';
import { AccountabilityTab, CashTab, InventoryTab, OffersTab, PromosTab, ReviewsTab, StaffTab, StationMenuTab } from '../admin';
import { AuditTab, DropsTab, FinanceTab, GrowthTab, MenuTab, SettingsTab, StationsTab, TeamTab } from '../owner';
import { StationWorkspace } from '../station';
import { CostingSection } from '../recipes';
import { PushSection } from '../push';
import { CountPanel, IngredientsTab, InventoryHub, TransfersPanel, VariancePanel } from '../inventory';
import { CustomersSection, LiveSection, OrdersSection, OverviewSection } from './sections';
import { DashShell, Section, useDash } from './shell';
import { useAuth, useRequireRole } from '@/lib/auth';

const P = ({ children }: { children: React.ReactNode }) => <div className="panel">{children}</div>;

function Body({ section, role }: { section: string; role: 'owner' | 'manager' }) {
  const { stations, stationId, days } = useDash();
  const { user } = useAuth();
  const canWarehouse = !!(user as any)?.warehouse;
  const sid = stationId;
  const first = stationId || stations[0]?.id;
  const isOwner = role === 'owner';
  switch (section) {
    case 'overview': return <OverviewSection />;
    case 'live': return <LiveSection />;
    case 'customers': return <CustomersSection />;
    case 'growth': return <GrowthTab />;
    case 'orders': return <OrdersSection />;
    case 'run': return first ? <StationWorkspace stationId={first} key={first} /> : <Empty>No station available.</Empty>;
    case 'stock': return <div className="col" style={{ gap: 16 }}><InventoryTab stationId={sid} /><TransfersPanel mode="station" stationId={sid} /><VariancePanel days={days} /><CountPanel role="manager" stationId={sid} /></div>;
    case 'inventory': return <InventoryHub days={days} />;
    case 'recipes': return <CostingSection canEdit={isOwner} />;
    case 'ingredients': return <IngredientsTab canEdit={isOwner || canWarehouse} />;
    case 'menu': return isOwner ? <div className="col" style={{ gap: 16 }}><P><MenuTab /></P><P><h3 style={{ marginBottom: 12 }}>Per-station prices and availability</h3>{first && <StationMenuTab stationId={first} isOwner />}</P></div> : <P>{first ? <StationMenuTab stationId={first} isOwner={false} /> : null}</P>;
    case 'reviews': return <P><ReviewsTab stationId={sid} /></P>;
    case 'offers': return <P><OffersTab stations={stations} isOwner={isOwner} /></P>;
    case 'push': return <PushSection isOwner={isOwner} />;
    case 'promos': return <P><PromosTab stations={stations} isOwner={isOwner} /></P>;
    case 'drops': return <P><DropsTab /></P>;
    case 'stations': return <P><StationsTab /></P>;
    case 'team': return <P><TeamTab /></P>;
    case 'staff': return <P><StaffTab stations={stations} stationId={sid} /></P>;
    case 'accountability': return <AccountabilityTab stationId={sid} isOwner={isOwner} />;
    case 'finance': return <FinanceTab />;
    case 'cash': return <P><CashTab stationId={sid} /></P>;
    case 'rules': return <SettingsTab />;
    case 'audit': return <P><AuditTab /></P>;
    default: return null;
  }
}

const OWNER: Section[] = [
  { key: 'overview', label: 'Overview', icon: 'grid', group: 'Insight', keywords: 'sales dashboard kpi' }, { key: 'live', label: 'Live', icon: 'pulse', group: 'Insight', keywords: 'queue now stations' },
  { key: 'growth', label: 'Growth', icon: 'chart', group: 'Insight', keywords: 'repeat offers broadcast message' }, { key: 'customers', label: 'Customers', icon: 'users', group: 'Insight', keywords: 'segments at risk' },
  { key: 'orders', label: 'Orders', icon: 'receipt', group: 'Operate', keywords: 'refund history' }, { key: 'run', label: 'Run a station', icon: 'cup', group: 'Operate', keywords: 'queue pos counter' },
  { key: 'menu', label: 'Menu and prices', icon: 'list', group: 'Operate', keywords: 'products items' }, { key: 'reviews', label: 'Ratings', icon: 'star', group: 'Operate' },
  { key: 'inventory', label: 'Inventory', icon: 'box', group: 'Costing and stock', keywords: 'stock central purchase transfer warehouse count loss' }, { key: 'recipes', label: 'Recipes and costing', icon: 'coin', group: 'Costing and stock', keywords: 'recipe cost margin food cost wastage' }, { key: 'stock', label: 'Station stock', icon: 'store', group: 'Costing and stock', keywords: 'restock station inventory' },
  { key: 'offers', label: 'Offer of the day', icon: 'tag', group: 'Marketing' }, { key: 'promos', label: 'Promo codes', icon: 'ticket', group: 'Marketing' }, { key: 'push', label: 'Push notifications', icon: 'bell', group: 'Marketing', keywords: 'message notification send campaign' }, { key: 'drops', label: 'Limited drops', icon: 'flame', group: 'Marketing' },
  { key: 'stations', label: 'Stations', icon: 'store', group: 'Network', keywords: 'partner cafe' }, { key: 'team', label: 'Team', icon: 'user', group: 'Network', keywords: 'managers staff' }, { key: 'accountability', label: 'Accountability', icon: 'shield', group: 'Network', keywords: 'scorecard partner statement' },
  { key: 'finance', label: 'Finance', icon: 'wallet', group: 'Money', keywords: 'reconcile settlements passes' }, { key: 'cash', label: 'Cash counts', icon: 'coin', group: 'Money' },
  { key: 'rules', label: 'Rules', icon: 'cog', group: 'Admin', keywords: 'settings pass price' }, { key: 'audit', label: 'Audit log', icon: 'clock', group: 'Admin' },
];
const MANAGER: Section[] = [
  { key: 'overview', label: 'Overview', icon: 'grid', group: 'Insight' }, { key: 'live', label: 'Live', icon: 'pulse', group: 'Insight' }, { key: 'customers', label: 'Customers', icon: 'users', group: 'Insight' },
  { key: 'orders', label: 'Orders', icon: 'receipt', group: 'Operate' }, { key: 'run', label: 'Run station', icon: 'cup', group: 'Operate' }, { key: 'stock', label: 'Stock and deliveries', icon: 'box', group: 'Operate' },
  { key: 'recipes', label: 'Recipes and costing', icon: 'coin', group: 'Operate' }, { key: 'menu', label: 'Menu', icon: 'list', group: 'Operate' }, { key: 'reviews', label: 'Ratings', icon: 'star', group: 'Operate' },
  { key: 'offers', label: 'Offer of the day', icon: 'tag', group: 'Marketing' }, { key: 'promos', label: 'Promo codes', icon: 'ticket', group: 'Marketing' }, { key: 'push', label: 'Push notifications', icon: 'bell', group: 'Marketing' },
  { key: 'staff', label: 'Staff', icon: 'users', group: 'Team' }, { key: 'accountability', label: 'Accountability', icon: 'shield', group: 'Team' }, { key: 'cash', label: 'Cash counts', icon: 'coin', group: 'Team' },
];

export function OwnerDashboard() {
  const user = useRequireRole('owner');
  if (!user) return <div style={{ padding: 40 }}><Loading /></div>;
  return <DashShell role="owner" sections={OWNER}>{(s) => <Body section={s} role="owner" />}</DashShell>;
}
export function ManagerDashboard() {
  const user = useRequireRole('manager');
  if (!user) return <div style={{ padding: 40 }}><Loading /></div>;
  // A manager who also runs the warehouse sees the central inventory hub.
  const sections = (user as any).warehouse ? [...MANAGER.slice(0, 5), { key: 'inventory', label: 'Central inventory', icon: 'store', group: 'Operate' }, { key: 'ingredients', label: 'Ingredients and prices', icon: 'list', group: 'Operate' }, ...MANAGER.slice(5)] : MANAGER;
  return <DashShell role="manager" sections={sections}>{(s) => <Body section={s} role="manager" />}</DashShell>;
}

const STATION: Section[] = [
  { key: 'queue', label: 'Queue', icon: 'pulse' }, { key: 'pos', label: 'New order', icon: 'plus' }, { key: 'menu', label: 'Sold out', icon: 'list' }, { key: 'stock', label: 'Stock', icon: 'box' }, { key: 'close', label: 'Close day', icon: 'coin' },
];
export function StationDashboard() {
  const user = useRequireRole('station');
  if (!user) return <div style={{ padding: 40 }}><Loading /></div>;
  return <DashShell role="station" sections={STATION}>{(s) => <StationWorkspace forcedTab={s as any} key={s} />}</DashShell>;
}
