import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import 'customer.dart';
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
  String _offerType = 'none'; // none | coupon | promo | pass
  String? _offerId, _promo;
  String _method = 'cash';
  final _promoCtl = TextEditingController(), _note = TextEditingController();
  String? _error;
  bool _busy = false;
  String _sig = '';

  @override
  void initState() { super.initState(); _loadOffers(); }

  Future<void> _loadOffers() async {
    try {
      final c = await Api.instance.get('/coupons') as List;
      final p = await Api.instance.get('/passes') as List;
      if (!mounted) return;
      setState(() {
        _coupons = c.where((x) => x['status'] == 'active').toList();
        _pass = p.cast<Json?>().firstWhere((x) => x!['status'] == 'active' && (x['remaining'] as int) > 0, orElse: () => null);
      });
    } catch (_) {}
  }

  Map<String, dynamic> _payload(CartState cart) => {
        'station_id': cart.station!['id'], 'items': cart.payloadItems, 'payment_method': _offerType == 'pass' ? 'pass' : _method, 'channel': 'app',
        if (_offerType == 'coupon') 'coupon_id': _offerId, if (_offerType == 'promo') 'promo_code': _promo,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
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
      if (pay != null && pay['mode'] == 'sandbox') {
        final ok = await showDialog<bool?>(context: context, barrierDismissible: false, builder: (c) => AlertDialog(
          title: Text('Pay with ${payLabel[pay['provider']]}'),
          content: Text('Test payments are on, so no real money moves. Confirm to place order ${order['pickup_code']} for ${rs(order['total'])}.'),
          actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Fail it')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Confirm payment'))],
        ));
        await Api.instance.post('/payments/${pay['payment_id']}/confirm', {'outcome': ok == true ? 'paid' : 'fail'});
      } else if (pay != null && pay['mode'] == 'redirect') {
        await launchUrl(Uri.parse((pay['start_url'] ?? pay['url']) as String), mode: LaunchMode.externalApplication);
      }
      if (!mounted) return;
      await Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: order['id'])));
      widget.onPlaced();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally { if (mounted) setState(() => _busy = false); }
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
        if (_pass != null) _opt(_offerType == 'pass', '10-cup pass', () { setState(() { _offerType = 'pass'; _offerId = null; }); _requote(cart); }, hint: '${_pass!['remaining']} cups left'),
        Row(children: [
          Expanded(child: TextField(controller: _promoCtl, decoration: const InputDecoration(hintText: 'Promo code', isDense: true), textCapitalization: TextCapitalization.characters)),
          const SizedBox(width: 8),
          OutlinedButton(onPressed: () { if (_promoCtl.text.trim().isEmpty) return; setState(() { _offerType = 'promo'; _promo = _promoCtl.text.trim(); }); _requote(cart); }, child: const Text('Apply')),
        ]),
        const SizedBox(height: 8),
      ]))),
      if (_offerType != 'pass') ...[
        const SizedBox(height: 16),
        Text('Pay with', style: display(18)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 4, children: [for (final m in ['cash', 'esewa', 'khalti', 'fonepay']) ChoiceChip(label: Text(payLabel[m]!), selected: _method == m, selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: _method == m ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) { setState(() => _method = m); _requote(cart); })]),
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
      FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)), onPressed: _busy || q == null ? null : () => _place(cart), child: Text(_busy ? 'Placing…' : 'Place order · ${rs(q?['total'] ?? 0)}')),
    ]);
  }
}
