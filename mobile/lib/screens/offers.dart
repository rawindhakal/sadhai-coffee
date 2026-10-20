import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import 'account.dart';
import 'customer.dart';

/// Everything that saves the customer money, in one place.
class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});
  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  Json? _home;
  List _centralDrops = [];
  List _coupons = [];
  String? _stationId;
  int _lastEpoch = 0;

  Future<void> _load() async {
    final id = context.read<CartState>().station?['id'];
    try {
      if (id != null) {
        final h = await Api.instance.get('/stations/$id/home');
        if (mounted) { setState(() => _home = Map<String, dynamic>.from(h)); }
      } else {
        final off = await Api.instance.get('/offers') as Map;
        if (mounted) {
          setState(() {
            _centralDrops = (off['drops'] as List? ?? []).cast<Map>();
          });
        }
      }
      final c = await Api.instance.get('/coupons') as List;
      if (mounted) { setState(() => _coupons = c.where((x) => x['status'] == 'active').toList()); }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final id = cart.station?['id'];
    final epoch = cart.passEpoch;
    if (id != _stationId || epoch != _lastEpoch) {
      _stationId = id;
      _lastEpoch = epoch;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
    final drops = (_home?['drops'] as List? ?? _centralDrops).cast<Map>();
    return RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
      Text('Offers', style: display(30)),
      const SizedBox(height: 16),
      Text('Promo code', style: display(20)),
      const SizedBox(height: 8),
      const _PromoBox(),
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
      Row(children: [
        Text('My coupons', style: display(20)),
        if (_coupons.isNotEmpty) ...[
          const SizedBox(width: 8),
          Chip2('${_coupons.length} active', bg: Brand.marigold),
        ],
      ]),
      const SizedBox(height: 8),
      if (_coupons.isEmpty) const Text('No active coupons. Your first Americano is free when you sign up, and earn more with Give a cup.', style: TextStyle(color: Brand.inkMuted)),
      for (final c in _coupons) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
        title: Text(c['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text('Valid until ${DateFormat('d MMM yyyy').format(DateTime.parse(c['expires_at']).toLocal())} · Applied at checkout'),
        trailing: Chip2(c['kind'] == 'pct' ? '${c['pct']}% off' : 'Free cup', bg: Brand.marigold),
      )),
      const SizedBox(height: 16),
      const PassPanel(),
      const SizedBox(height: 12),
      Card(child: ListTile(leading: const Icon(Icons.card_giftcard, color: Brand.cherry), title: const Text('Give a cup. Get a cup.', style: TextStyle(fontWeight: FontWeight.w600)), trailing: const Icon(Icons.chevron_right), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReferralScreen())))),
    ]));
  }
}

/// Enter a promo code once; it is then offered at checkout.
class _PromoBox extends StatefulWidget {
  const _PromoBox();
  @override
  State<_PromoBox> createState() => _PromoBoxState();
}

class _PromoBoxState extends State<_PromoBox> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() { _code.dispose(); super.dispose(); }

  Future<void> _apply() async {
    final cart = context.read<CartState>();
    final code = _code.text.trim();
    if (code.isEmpty) return;
    setState(() { _busy = true; _error = null; });
    try {
      final r = await Api.instance.post('/promos/check', {'code': code, if (cart.station != null) 'station_id': cart.station!['id']});
      cart.setPromo(Map<String, dynamic>.from(r as Map));
      _code.clear();
      if (mounted) toast(context, 'Promo ${r['code']} applied. Choose it at checkout.');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final promo = context.watch<CartState>().promo;
    return Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (promo != null) Row(children: [
        const Icon(Icons.sell, color: Brand.cherry),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${promo['code']} · ${promo['pct']}% off', style: const TextStyle(fontWeight: FontWeight.w700)),
          Text('${promo['title']}${(promo['min_total'] ?? 0) > 0 ? ' · min Rs ${promo['min_total']}' : ''}. Applied at checkout.', style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
        ])),
        TextButton(onPressed: () => context.read<CartState>().setPromo(null), child: const Text('Remove')),
      ]) else Row(children: [
        Expanded(child: TextField(controller: _code, textCapitalization: TextCapitalization.characters, textInputAction: TextInputAction.done, onSubmitted: (_) => _apply(), decoration: const InputDecoration(hintText: 'Enter promo code', isDense: true))),
        const SizedBox(width: 10),
        FilledButton(onPressed: _busy ? null : _apply, child: Text(_busy ? '…' : 'Apply')),
      ]),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Brand.cherry, fontSize: 13))),
    ])));
  }
}
