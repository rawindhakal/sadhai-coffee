'use client';
import { Empty, Loading, useData } from '../ui';
import { PartnerStatementCard, AccountabilityTab, CashTab, InventoryTab, OffersTab, PromosTab, ReviewsTab, StaffTab, StationMenuTab } from '../admin';
import { AuditTab, DropsTab, FinanceTab, GrowthTab, MenuTab, SettingsTab, StationsTab, TeamTab } from '../owner';
import { StationWorkspace } from '../station';
import { CostingSection } from '../recipes';
import { PushSection } from '../push';
import { CountPanel, IngredientsTab, InventoryHub, TransfersPanel, VariancePanel } from '../inventory';
import { CustomersSection, LiveSection, OrdersSection, OverviewSection } from './sections';
import { DashShell, Section, useDash } from './shell';
import { useAuth, useRequireRole } from '@/lib/auth';
import { EnquiriesSection, SettingsHub, SiteEditor } from '../studio';
import { MyShift, PeopleSection } from '../people';

const P = ({ children }: { children: React.ReactNode }) => <div className="panel">{children}</div>;

function Body({ section, role }: { section: string; role: 'owner' | 'manager' | 'partner' }) {
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
    case 'stock': return role === 'partner' ? <P><InventoryTab stationId={sid} /></P> : <div className="col" style={{ gap: 16 }}><InventoryTab stationId={sid} /><TransfersPanel mode="station" stationId={sid} /><VariancePanel days={days} /><CountPanel role="manager" stationId={sid} /></div>;
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
    case 'staff': return role === 'partner' ? <P><StaffTab stations={stations} stationId={sid} /></P> : <PeopleSection isOwner={isOwner} />;
    case 'site': return <SiteEditor />;
    case 'enquiries': return <EnquiriesSection />;
    case 'accountability': return <AccountabilityTab stationId={sid} isOwner={isOwner} />;
    case 'finance': return <FinanceTab />;
    case 'cash': return <P><CashTab stationId={sid} /></P>;
    case 'statement': return <PartnerStatement />;
    case 'rules': return <SettingsHub />;
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
  { key: 'stations', label: 'Stations', icon: 'store', group: 'Network', keywords: 'partner cafe' }, { key: 'team', label: 'Users & Managers', icon: 'user', group: 'Network', keywords: 'users managers staff team accounts roles' }, { key: 'staff', label: 'Staff and pay', icon: 'users', group: 'Network', keywords: 'roster shift duty auto assign payroll salary attendance hourly leave' }, { key: 'accountability', label: 'Accountability', icon: 'shield', group: 'Network', keywords: 'scorecard partner statement' },
  { key: 'finance', label: 'Finance', icon: 'wallet', group: 'Money', keywords: 'reconcile settlements passes' }, { key: 'cash', label: 'Cash counts', icon: 'coin', group: 'Money' },
  { key: 'rules', label: 'Settings and keys', icon: 'cog', group: 'Admin', keywords: 'settings pass price api key payment firebase push integration' }, { key: 'site', label: 'Home page and pictures', icon: 'image', group: 'Admin', keywords: 'hero images website partners investors content' }, { key: 'enquiries', label: 'Enquiries', icon: 'mail', group: 'Admin', keywords: 'partner investor leads' }, { key: 'audit', label: 'Audit log', icon: 'clock', group: 'Admin' },
];
const MANAGER: Section[] = [
  { key: 'overview', label: 'Overview', icon: 'grid', group: 'Insight' }, { key: 'live', label: 'Live', icon: 'pulse', group: 'Insight' }, { key: 'customers', label: 'Customers', icon: 'users', group: 'Insight' },
  { key: 'orders', label: 'Orders', icon: 'receipt', group: 'Operate' }, { key: 'run', label: 'Run station', icon: 'cup', group: 'Operate' }, { key: 'stock', label: 'Stock and deliveries', icon: 'box', group: 'Operate' },
  { key: 'recipes', label: 'Recipes and costing', icon: 'coin', group: 'Operate' }, { key: 'menu', label: 'Menu', icon: 'list', group: 'Operate' }, { key: 'reviews', label: 'Ratings', icon: 'star', group: 'Operate' },
  { key: 'offers', label: 'Offer of the day', icon: 'tag', group: 'Marketing' }, { key: 'promos', label: 'Promo codes', icon: 'ticket', group: 'Marketing' }, { key: 'push', label: 'Push notifications', icon: 'bell', group: 'Marketing' },
  { key: 'staff', label: 'Staff and roster', icon: 'users', group: 'Team', keywords: 'roster shift duty auto assign attendance leave' }, { key: 'accountability', label: 'Accountability', icon: 'shield', group: 'Team' }, { key: 'cash', label: 'Cash counts', icon: 'coin', group: 'Team' },
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

const PARTNER: Section[] = [
  { key: 'overview', label: 'Overview', icon: 'grid', group: 'My cafe', keywords: 'sales dashboard' }, { key: 'live', label: 'Live', icon: 'pulse', group: 'My cafe', keywords: 'queue now' },
  { key: 'orders', label: 'Orders', icon: 'receipt', group: 'My cafe', keywords: 'history' }, { key: 'stock', label: 'Stock', icon: 'box', group: 'My cafe', keywords: 'inventory ingredients' },
  { key: 'reviews', label: 'Ratings', icon: 'star', group: 'My cafe' },
  { key: 'statement', label: 'My statement', icon: 'wallet', group: 'Money', keywords: 'settlement share revenue payout' }, { key: 'cash', label: 'Cash counts', icon: 'coin', group: 'Money' },
  { key: 'staff', label: 'Counter logins', icon: 'users', group: 'Team', keywords: 'staff accounts' },
];
export function PartnerDashboard() {
  const user = useRequireRole('partner');
  if (!user) return <div style={{ padding: 40 }}><Loading /></div>;
  return <DashShell role="partner" sections={PARTNER}>{(s) => <Body section={s} role="partner" />}</DashShell>;
}

const STATION: Section[] = [
  { key: 'queue', label: 'Queue', icon: 'pulse' }, { key: 'pos', label: 'New order', icon: 'plus' }, { key: 'menu', label: 'Sold out', icon: 'list' }, { key: 'stock', label: 'Stock', icon: 'box' }, { key: 'close', label: 'Close day', icon: 'coin' }, { key: 'recipes', label: 'Recipes', icon: 'list' }, { key: 'shift', label: 'My shift', icon: 'clock' },
];
export function StationDashboard() {
  const user = useRequireRole('station');
  if (!user) return <div style={{ padding: 40 }}><Loading /></div>;
  // Only Sadhai-run stations have rosters and pay. A partner cafe's counter staff just run the queue.
  const sum = useData<any>('/station/summary');
  const sections = sum.data?.station.operator_type === 'partner' ? STATION.filter((x) => x.key !== 'shift') : STATION;
  return <DashShell role="station" sections={sections}>{(s) => <StationWorkspace forcedTab={s as any} key={s} />}</DashShell>;
}

/** What a partner cafe owner sees: how much they sold, what they keep, and what is owed either way. */
function PartnerStatement() {
  const { stationId, days } = useDash();
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const st = useData<any[]>(`/admin/partner-statement?from=${from}${stationId ? `&station_id=${stationId}` : ''}`, [stationId, days]);
  if (!st.data) return <Loading />;
  if (!st.data.length) return <Empty>No statement for this period.</Empty>;
  return <div className="col" style={{ gap: 16 }}>{st.data.map((s) => <PartnerStatementCard key={s.station.id} s={s} />)}
    <p className="small muted">Digital (Fonepay) payments are received by Sadhai. Cash stays with your counter. Each period we net your share against the cash you hold, and one of us pays the difference.</p></div>;
}
