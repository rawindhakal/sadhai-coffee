import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import 'account.dart';
import 'customer.dart';
import 'home.dart' show DealCard;

/// Everything that saves the customer money, in one place.
class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});
  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  Json? _home;
  List _coupons = [];
  String? _stationId;

  Future<void> _load() async {
    final id = context.read<CartState>().station?['id'];
    try {
      if (id != null) { final h = await Api.instance.get('/stations/$id/home'); if (mounted) setState(() => _home = Map<String, dynamic>.from(h)); }
      final c = await Api.instance.get('/coupons') as List;
      if (mounted) setState(() => _coupons = c.where((x) => x['status'] == 'active').toList());
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final id = cart.station?['id'];
    if (id != _stationId) { _stationId = id; WidgetsBinding.instance.addPostFrameCallback((_) => _load()); }
    final offers = (_home?['offers'] as List? ?? []).cast<Map>();
    final drops = (_home?['drops'] as List? ?? []).cast<Map>();
    final products = [for (final c in (_home?['categories'] as List? ?? [])) ...(c['products'] as List).cast<Map>()];
    return RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
      Text('Offers', style: display(30)),
      const SizedBox(height: 8),
      Text('Offer of the day${cart.station != null ? ' · ${cart.station!['name']}' : ''}', style: display(20)),
      const SizedBox(height: 8),
      if (cart.station == null) const Text('Choose a station on Home to see today’s offers.', style: TextStyle(color: Brand.inkMuted)),
      if (cart.station != null && offers.isEmpty) const Text('No special offer at this station today.', style: TextStyle(color: Brand.inkMuted)),
      for (final o in offers) Padding(padding: const EdgeInsets.only(bottom: 10), child: DealCard(o: o, products: products, onSee: () {}, onAdd: (p) { final l = CartLine.quick(p!); if (l != null) { cart.add(l); toast(context, '${p['name']} added'); } })),
      if (drops.isNotEmpty) ...[
        const SizedBox(height: 16),
        Text('This month’s drop', style: display(20)),
        for (final d in drops) Card(margin: const EdgeInsets.only(top: 8), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text(d['name'], style: display(18))), Chip2('${NumberFormat.decimalPattern().format(d['remaining'])} left', bg: Brand.marigold)]),
          Text('${d['partner'] ?? ''} · ${rs(d['price'])}', style: const TextStyle(color: Brand.inkMuted)),
          const SizedBox(height: 10),
          ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: ((d['sold'] as num) / (d['cap'] as num)).clamp(0, 1).toDouble(), minHeight: 10, backgroundColor: Brand.surfaceSunk, color: Brand.hill)),
          const SizedBox(height: 4),
          Text('${NumberFormat.decimalPattern().format(d['sold'])} of ${NumberFormat.decimalPattern().format(d['cap'])} cups sold. Then gone.', style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
        ]))),
      ],
      const SizedBox(height: 20),
      Text('My coupons', style: display(20)),
      const SizedBox(height: 8),
      if (_coupons.isEmpty) const Text('No active coupons.', style: TextStyle(color: Brand.inkMuted)),
      for (final c in _coupons) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(title: Text(c['title'], style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text('Valid until ${DateFormat('d MMM').format(DateTime.parse(c['expires_at']).toLocal())}'), trailing: Chip2(c['kind'] == 'pct' ? '${c['pct']}% off' : 'Free cup', bg: Brand.marigold))),
      const SizedBox(height: 16),
      const PassPanel(),
      const SizedBox(height: 12),
      Card(child: ListTile(leading: const Icon(Icons.card_giftcard, color: Brand.cherry), title: const Text('Give a cup. Get a cup.', style: TextStyle(fontWeight: FontWeight.w600)), trailing: const Icon(Icons.chevron_right), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReferralScreen())))),
    ]));
  }
}
