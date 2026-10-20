import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../push.dart';
import 'customer.dart';
import 'fonepay.dart';
import 'home.dart' show Stepper2;

/// Cart and checkout on one screen: change quantities, pick an offer and payment, place the order.
class CartScreen extends StatefulWidget {
  const CartScreen({super.key, required this.onPlaced});
  final VoidCallback onPlaced;
  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  List _coupons = [];
  Json? _pass, _quote;
  String _offerType = 'none'; // none | coupon | pass
  String? _offerId;
  String _method = 'cash';
  final _note = TextEditingController();
  String? _error;
  bool _busy = false;
  String _sig = '';
  Json? _times; // pickup window and whether the station is taking orders
  bool _later = false;
  String? _at;
  String? _loadedStationId;
  int _lastEpoch = 0;

  @override
  void initState() { super.initState(); _loadOffers(); _loadTimes(); }

  Future<void> _loadTimes() async {
    final st = context.read<CartState>().station;
    if (st == null) return;
    try {
      final t = await Api.instance.get('/stations/${st['id']}/pickup-times');
      if (mounted) setState(() { _times = Map<String, dynamic>.from(t); if (t['preorder'] == null) _later = false; });
    } catch (_) {}
  }

  List<String> get _slots {
    final w = _times?['preorder'] as Map?;
    if (w == null) return [];
    final out = <String>[];
    for (var t = DateTime.parse(w['earliest']); !t.isAfter(DateTime.parse(w['latest'])) && out.length < 200; t = t.add(const Duration(minutes: 5))) { out.add(t.toUtc().toIso8601String()); }
    return out;
  }

  String _fmt(String iso) => DateFormat('h:mm a').format(DateTime.parse(iso).toLocal());

  Future<void> _loadOffers() async {
    try {
      final c = await Api.instance.get('/coupons') as List;
      final p = await Api.instance.get('/passes') as List;
      if (!mounted) return;
      setState(() {
        _coupons = c.where((x) => x['status'] == 'active').toList();
        final live = p.cast<Json>().where((x) => x['status'] == 'active' && (x['remaining'] as int) > 0).toList();
        _pass = live.isEmpty ? null : {'remaining': live.first['total_remaining'], 'count': live.length};
      });
    } catch (_) {}
  }

  Map<String, dynamic> _payload(CartState cart) => {
        'station_id': cart.station!['id'], 'items': cart.payloadItems, 'payment_method': _offerType == 'pass' ? 'pass' : _method, 'channel': 'app',
        if (_offerType == 'coupon') 'coupon_id': _offerId,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        if (_later && _at != null) 'scheduled_for': _at,
      };

  Future<void> _requote(CartState cart) async {
    if (cart.lines.isEmpty || cart.station == null) { setState(() => _quote = null); return; }
    try {
      final q = await Api.instance.post('/orders/quote', _payload(cart));
      if (mounted) setState(() { _quote = q; _error = null; });
    } on ApiException catch (e) { if (mounted) setState(() { _quote = null; _error = e.message; }); }
  }

  Future<void> _place(CartState cart) async {
    setState(() { _busy = true; _error = null; });
    try {
      final out = await Api.instance.post('/orders', _payload(cart));
      final order = out['order'] as Map;
      final pay = out['payment'] as Map?;
      if (!mounted) return;
      cart.clear();
      cart.invalidatePasses();
      if (pay != null) await showFonepay(context, pay, order['total'] as num);
      if (!mounted) return;
      _askPush();
      await Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: order['id'])));
      widget.onPlaced();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally { if (mounted) setState(() => _busy = false); }
  }

  // The first time someone orders, offer a ping when it is ready. The system permission prompt only appears if they say yes.
  Future<void> _askPush() async {
    if (!PushService.configured || await PushService.alreadyAsked || !mounted) return;
    final yes = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('Get a ping when it is ready?'),
      content: const Text('We will send one notification when your coffee is ready, and nothing you did not ask for. You can change this any time in Account.'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not now')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Yes, tell me'))],
    ));
    if (yes == true) {
      await PushService.enable();
    } else {
      (await SharedPreferences.getInstance()).setBool('push.asked', true);
    }
  }

  Widget _opt(bool on, String label, VoidCallback tap, {String? hint}) => InkWell(
        onTap: tap,
        child: Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Row(children: [
          Icon(on ? Icons.radio_button_checked : Icons.radio_button_off, color: on ? Brand.cherry : Brand.inkMuted),
          const SizedBox(width: 10),
          Expanded(child: Text(label)),
          if (hint != null) Text(hint, style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
        ])),
      );

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();

    // Reload times and offers when station or pass state changes
    final stId = cart.station?['id'] as String?;
    final epoch = cart.passEpoch;
    if (stId != _loadedStationId || _times == null || epoch != _lastEpoch) {
      _loadedStationId = stId;
      _lastEpoch = epoch;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _loadOffers();
          _loadTimes();
        }
      });
    }

    // re-quote whenever the cart contents change
    final sig = '${cart.station?['id']}|${cart.lines.map((l) => '${l.key}x${l.qty}').join(',')}';
    if (sig != _sig) { _sig = sig; WidgetsBinding.instance.addPostFrameCallback((_) => _requote(cart)); }

    if (cart.lines.isEmpty) {
      return Center(child: Padding(padding: const EdgeInsets.all(32), child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.shopping_cart_outlined, size: 56, color: Brand.cherry),
        const SizedBox(height: 12),
        Text('Your cart is empty', style: display(24)),
        const SizedBox(height: 6),
        const Text('Add a coffee in one tap from the home screen.', textAlign: TextAlign.center, style: TextStyle(color: Brand.inkMuted)),
      ])));
    }
    final q = _quote;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
      Row(children: [Text('Your order', style: display(30)), const Spacer(), TextButton(onPressed: cart.clear, child: const Text('Clear'))]),
      Text('Pickup at ${cart.station?['name']}', style: const TextStyle(color: Brand.inkMuted)),
      const SizedBox(height: 12),
      Card(child: Column(children: [
        for (final l in cart.lines) Padding(padding: const EdgeInsets.all(14), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.product['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            if (l.optionNames.isNotEmpty) Text(l.optionNames.join(', '), style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
            Text(rs(l.unit * l.qty), style: const TextStyle(fontWeight: FontWeight.w700)),
          ])),
          Stepper2(qty: l.qty, onChanged: (n) => cart.setQty(l, n)),
        ])),
      ])),
      const SizedBox(height: 16),
      Text('Offer', style: display(18)),
      Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6), child: Column(children: [
        _opt(_offerType == 'none', 'No offer', () { setState(() { _offerType = 'none'; _offerId = null; }); _requote(cart); }),
        for (final c in _coupons) _opt(_offerType == 'coupon' && _offerId == c['id'], c['title'], () { setState(() { _offerType = 'coupon'; _offerId = c['id']; }); _requote(cart); }),
        if (_pass != null) _opt(_offerType == 'pass', '10-cup pass', () { setState(() { _offerType = 'pass'; _offerId = null; }); _requote(cart); }, hint: '${_pass!['remaining']} cups left${(_pass!['count'] as int) > 1 ? ' · ${_pass!['count']} passes' : ''}'),
      ]))),
      if (_times != null && _times!['can_order'] == false) Container(margin: const EdgeInsets.only(top: 16), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Brand.surfaceSunk, borderRadius: BorderRadius.circular(Brand.radiusMd), border: Border.all(color: Brand.cherry)), child: Text(_times!['open_now'] == true ? 'This station is not taking orders for a moment.' : 'This station is closed. It opens at ${(_times!['opens'] as String).substring(0, 5)}.', style: const TextStyle(fontWeight: FontWeight.w700))),
      const SizedBox(height: 16),
      Text('Pickup time', style: display(18)),
      const SizedBox(height: 8),
      if (_times != null && _times!['preorder'] != null) ...[
        Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          ChoiceChip(label: const Text('As soon as possible'), selected: !_later, selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: !_later ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) { setState(() => _later = false); _requote(cart); }),
          ChoiceChip(label: const Text('Later today'), selected: _later, selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: _later ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) { final s = _slots; setState(() { _later = true; _at ??= s.firstWhere((x) => DateTime.parse(x).isAfter(DateTime.now().add(const Duration(minutes: 29))), orElse: () => s.first); }); _requote(cart); }),
          if (_later && _at != null) DropdownButton<String>(value: _slots.contains(_at) ? _at : null, items: [for (final s in _slots) DropdownMenuItem(value: s, child: Text(_fmt(s)))], onChanged: (v) { setState(() => _at = v); _requote(cart); }),
        ]),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text(_later && _at != null ? 'We start making it a few minutes before ${_fmt(_at!)}. Once you place it, it cannot be cancelled.' : 'Ready in about 90 seconds once the barista starts.', style: const TextStyle(color: Brand.inkMuted, fontSize: 13))),
      ] else ...[
        ChoiceChip(label: const Text('As soon as possible'), selected: true, selectedColor: Brand.cherry, showCheckmark: false, labelStyle: const TextStyle(color: Brand.onCherry, fontWeight: FontWeight.w600), onSelected: (_) {}),
        const Padding(padding: EdgeInsets.only(top: 4), child: Text('Ready in about 90 seconds once the barista starts.', style: TextStyle(color: Brand.inkMuted, fontSize: 13))),
      ],
      if (_offerType != 'pass') ...[
        const SizedBox(height: 16),
        Text('Pay with', style: display(18)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 4, children: [for (final m in ['cash', 'fonepay']) ChoiceChip(label: Text(payLabel[m]!), selected: _method == m, selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: _method == m ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) { setState(() => _method = m); _requote(cart); })]),
      ],
      const SizedBox(height: 16),
      TextField(controller: _note, maxLength: 200, decoration: const InputDecoration(labelText: 'Note for the barista (optional)'), onSubmitted: (_) => _requote(cart)),
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        Row(children: [const Text('Subtotal'), const Spacer(), Text(rs(q?['subtotal'] ?? cart.total))]),
        if ((q?['discount'] ?? 0) > 0) Row(children: [Text(q!['discount_label'] ?? 'Offer', style: const TextStyle(color: Brand.hill)), const Spacer(), Text('− ${rs(q['discount'])}', style: const TextStyle(color: Brand.hill))]),
        const SizedBox(height: 6),
        Row(children: [const Text('Total', style: TextStyle(fontWeight: FontWeight.w700)), const Spacer(), Text(rs(q?['total'] ?? cart.total), style: display(26))]),
        const Align(alignment: Alignment.centerLeft, child: Text('Prices in NPR. VAT and service included.', style: TextStyle(color: Brand.inkMuted, fontSize: 13))),
      ]))),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Brand.cherry, fontWeight: FontWeight.w600))),
      const SizedBox(height: 16),
      FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)), onPressed: _busy || q == null || (_times != null && _times!['can_order'] == false) ? null : () => _place(cart), child: Text(_busy ? 'Placing…' : 'Place order · ${rs(q?['total'] ?? 0)}')),
    ]);
  }
}
