import 'package:flutter/material.dart';
import '../api.dart';
import '../art.dart';
import '../theme.dart';
import 'customer.dart' show toast;
import 'staff.dart';

/// Manager and owner mobile: numbers at a glance, then step into any station to run it live.
class ManagerHome extends StatefulWidget {
  const ManagerHome({super.key, required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  State<ManagerHome> createState() => _ManagerHomeState();
}

class _ManagerHomeState extends State<ManagerHome> {
  int _i = 0;
  @override
  Widget build(BuildContext context) {
    final u = Api.instance.user!;
    final partner = u['role'] == 'partner'; // a partner cafe owner sees their own numbers only
    return Scaffold(
      appBar: AppBar(title: SadhaiLogo(suffix: u['role'] == 'owner' ? 'owner' : u['role'] == 'partner' ? 'partner cafe' : 'manager'), actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () async { await Api.instance.logout(); widget.onSignOut(); })]),
      body: partner ? const Dashboard() : IndexedStack(index: _i, children: const [Dashboard(), StationsRunner(), PromosScreen()]),
      bottomNavigationBar: partner ? null : NavigationBar(selectedIndex: _i, onDestinationSelected: (i) => setState(() => _i = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights), label: 'Numbers'),
        NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Stations'),
        NavigationDestination(icon: Icon(Icons.sell_outlined), selectedIcon: Icon(Icons.sell), label: 'Promos'),
      ]),
    );
  }
}

class Dashboard extends StatefulWidget {
  const Dashboard({super.key});
  @override
  State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> {
  Json? _o;
  int _days = 7;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final from = DateTime.now().subtract(Duration(days: _days - 1)).toIso8601String().substring(0, 10);
    try { final o = await Api.instance.get('/admin/overview?from=$from'); if (mounted) setState(() { _o = Map<String, dynamic>.from(o); _error = null; }); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }

  @override
  Widget build(BuildContext context) {
    final o = _o;
    if (o == null) return Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator());
    final t = o['totals'] as Map;
    return RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
      SegmentedButton<int>(segments: const [ButtonSegment(value: 7, label: Text('7 days')), ButtonSegment(value: 30, label: Text('30 days'))], selected: {_days}, onSelectionChanged: (s) { setState(() { _days = s.first; _o = null; }); _load(); }),
      const SizedBox(height: 12),
      GridView.count(crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.6, children: [
        _Stat('Sales', rs(t['revenue']), t['gross_margin'] != null ? '${rs(t['gross_margin'])} after food cost' : '${t['orders']} orders'),
        _Stat('Cups a day', '${t['cups_per_day']}', '${t['cups']} cups'),
        _Stat('Orders', '${t['orders']}', '${rs(t['avg_ticket'])} average'),
        _Stat('App or QR', '${t['app_share_pct']}%', 'of all orders'),
      ]),
      const SizedBox(height: 16),
      Text('Against break-even', style: display(20)),
      const SizedBox(height: 8),
      for (final s in (o['stations'] as List)) Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Expanded(child: Text(s['name'], style: const TextStyle(fontWeight: FontWeight.w700))), Text(rs(s['revenue']))]),
        const SizedBox(height: 6),
        ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: ((s['breakeven_pct'] as num) / 100).clamp(0, 1).toDouble(), minHeight: 10, backgroundColor: Brand.surfaceSunk, color: (s['breakeven_pct'] as num) >= 100 ? Brand.hill : (s['breakeven_pct'] as num) >= 60 ? Brand.marigold : Brand.cherry)),
        const SizedBox(height: 4),
        Text('${s['cups_per_day']} of ${s['breakeven_cups']} cups a day · ${s['breakeven_pct']}%', style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
      ])))),
      const SizedBox(height: 8),
      Text('Service and quality', style: display(20)),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: _Stat('Made in target', '${o['service']['within_90s_pct'] ?? '–'}%', 'avg ${o['service']['avg_make_seconds']}s')),
        const SizedBox(width: 10),
        Expanded(child: _Stat('Rating', '${o['ratings']['avg'] == 0 ? '–' : o['ratings']['avg']}', '${o['ratings']['n']} ratings')),
      ]),
      if ((o['low_stock'] as List).isNotEmpty) ...[
        const SizedBox(height: 16),
        Text('Running low', style: display(20)),
        for (final l in (o['low_stock'] as List)) Card(margin: const EdgeInsets.only(top: 8), child: ListTile(title: Text(l['ingredient']), subtitle: Text(l['station']), trailing: Chip2('${(l['qty'] as num).round()} ${l['unit']}', bg: Brand.cherry, fg: Brand.onCherry))),
      ],
      const SizedBox(height: 16),
      Text('Pass and growth', style: display(20)),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: _Stat('Passes sold', '${o['pass']['sold']}', '${o['pass']['outstanding_cups']} cups owed')),
        const SizedBox(width: 10),
        Expanded(child: _Stat('New customers', '${o['growth']['new_customers']}', '${o['growth']['total_customers']} total')),
      ]),
    ]));
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.sub);
  final String label, value, sub;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
        FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: display(26))),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        Text(sub, style: const TextStyle(color: Brand.inkMuted, fontSize: 12)),
      ])));
}

class StationsRunner extends StatefulWidget {
  const StationsRunner({super.key});
  @override
  State<StationsRunner> createState() => _StationsRunnerState();
}

class _StationsRunnerState extends State<StationsRunner> {
  List _stations = [];
  String? _id;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final l = await Api.instance.get('/admin/stations') as List;
    if (mounted) setState(() { _stations = l; _id ??= l.isEmpty ? null : l.first['id']; });
  }
  @override
  Widget build(BuildContext context) {
    if (_stations.isEmpty) return const Center(child: Text('No stations assigned to you yet.'));
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: DropdownButtonFormField<String>(initialValue: _id, decoration: const InputDecoration(labelText: 'Station'), items: [for (final s in _stations) DropdownMenuItem(value: s['id'] as String, child: Text('${s['name']} · ${s['queue']} live'))], onChanged: (v) => setState(() => _id = v))),
      Expanded(child: StationWorkspace(key: ValueKey(_id), stationId: _id)),
    ]);
  }
}

class PromosScreen extends StatefulWidget {
  const PromosScreen({super.key});
  @override
  State<PromosScreen> createState() => _PromosScreenState();
}

class _PromosScreenState extends State<PromosScreen> {
  List _promos = [];
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final l = await Api.instance.get('/admin/promos') as List;
    if (mounted) setState(() => _promos = l);
  }
  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Promo codes', style: display(24)),
        const Text('Pause any code that is not paying back within 30 days.', style: TextStyle(color: Brand.inkMuted)),
        const SizedBox(height: 8),
        if (_promos.isEmpty) const Text('No promo codes yet. Create them on the web dashboard.'),
        for (final p in _promos) Card(margin: const EdgeInsets.only(top: 8), child: ListTile(
          title: Text('${p['code']} · ${p['pct']}% off', style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('${p['title']} · ${p['station_name'] ?? 'All stations'} · used ${p['used']}${p['max_uses'] != null ? ' / ${p['max_uses']}' : ''}'),
          trailing: Switch(value: p['active'] == true, activeTrackColor: Brand.hill, onChanged: (v) async {
            try { await Api.instance.patch('/admin/promos/${p['id']}', {'active': v}); _load(); } on ApiException catch (e) { if (context.mounted) toast(context, e.message, bad: true); }
          }),
        )),
      ]));
}
