import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import 'account.dart';
import 'cart.dart';
import 'home.dart';
import 'offers.dart';
import 'pay_sheet.dart';
import 'static_qr.dart';

const payLabel = {'cash': 'Pay at counter', 'pass': '10-cup pass', 'fonepay': 'Fonepay QR', 'qr_static': 'Shop QR', 'esewa': 'eSewa (old)', 'nepalpay': 'NepalPay (old)', 'khalti': 'Online (old)'};

void toast(BuildContext c, String m, {bool bad = false}) => ScaffoldMessenger.of(c)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(m), backgroundColor: bad ? Brand.cherry : Brand.ink, behavior: SnackBarBehavior.floating, duration: const Duration(milliseconds: 1600)));

/// Five tabs. The cart is the raised centre action and always shows what is in it.
class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key, required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int _i = 0;
  @override
  void initState() { super.initState(); context.read<CartState>().load(); }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final pages = [HomeTab(goTab: (i) => setState(() => _i = i)), const OffersScreen(), CartScreen(onPlaced: () => setState(() => _i = 3)), const OrdersScreen(), AccountScreen(onSignOut: widget.onSignOut)];
    return Scaffold(
      body: SafeArea(bottom: false, child: IndexedStack(index: _i, children: pages)),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: _i == 2 ? null : (cart.count > 0
          ? FloatingActionButton.extended(
              onPressed: () => setState(() => _i = 2), backgroundColor: Brand.ink, foregroundColor: Brand.surface, elevation: 6,
              icon: Badge(label: Text('${cart.count}'), backgroundColor: Brand.marigold, textColor: Brand.ink, child: const Icon(Icons.shopping_cart_outlined)),
              label: Text('View cart · ${rs(cart.total)}', style: const TextStyle(fontWeight: FontWeight.w700)),
            )
          : null),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i,
        onDestinationSelected: (i) => setState(() => _i = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer), label: 'Offers'),
          NavigationDestination(icon: Badge(isLabelVisible: cart.count > 0, label: Text('${cart.count}'), backgroundColor: Brand.marigold, textColor: Brand.ink, child: const Icon(Icons.shopping_cart_outlined)), selectedIcon: const Icon(Icons.shopping_cart), label: 'Cart'),
          const NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Orders'),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}

class TrackingScreen extends StatefulWidget {
  const TrackingScreen({super.key, required this.orderId});
  final String orderId;
  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  Json? _o;
  Map? _staticQr;
  String? _error;
  StreamSubscription? _sub;
  Timer? _poll;
  int _ticks = 0;

  @override
  void initState() {
    super.initState();
    _load();
    Api.instance.request('GET', '/config', auth: false).then((c) { if (mounted) setState(() => _staticQr = c['static_qr'] as Map?); }).catchError((_) {});
    _sub = Api.instance.events().listen((e) { if (e.$1 == 'order' && e.$2['id'] == widget.orderId) _load(); });
    // Quick checks while the order waits for its online payment, slower afterwards.
    _poll = Timer.periodic(const Duration(seconds: 4), (_) { _ticks++; if (_o?['status'] == 'awaiting_payment' || _ticks % 3 == 0) _load(); });
  }

  @override
  void dispose() { _sub?.cancel(); _poll?.cancel(); super.dispose(); }

  Future<void> _cancel() async {
    final yes = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('Cancel this order?'), content: const Text('You have not been charged.'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep it')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cancel order'))]));
    if (yes != true) return;
    try { await Api.instance.post('/orders/${widget.orderId}/cancel'); _load(); } on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  Future<void> _load() async {
    try { final o = await Api.instance.get('/orders/${widget.orderId}'); if (mounted) setState(() { _o = o; _error = null; }); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }


  Future<void> _rate(int n) async {
    try { await Api.instance.post('/orders/${widget.orderId}/rate', {'rating': n}); _load(); if (mounted) toast(context, 'Thank you'); } on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  @override
  Widget build(BuildContext context) {
    final o = _o;
    const steps = ['placed', 'preparing', 'ready', 'picked_up'];
    return Scaffold(
      appBar: AppBar(title: const Text('Your order')),
      body: o == null
          ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
          : RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(20), children: [
              Card(child: Padding(padding: const EdgeInsets.all(28), child: Column(children: [
                const Text('PICKUP NUMBER', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Brand.inkMuted)),
                Text(o['pickup_code'], style: display(96, color: Brand.cherry)),
                Chip2.status(o['status']),
                if (o['scheduled_for'] != null && o['status'] != 'picked_up' && o['status'] != 'cancelled') Padding(padding: const EdgeInsets.only(top: 8), child: Text('Pickup at ${DateFormat('h:mm a').format(DateTime.parse(o['scheduled_for']).toLocal())}', style: const TextStyle(fontWeight: FontWeight.w700))),
                const SizedBox(height: 12),
                if (o['handover_code'] != null && ['placed', 'preparing', 'ready'].contains(o['status'])) Container(
                  margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                  decoration: BoxDecoration(color: Brand.surfaceSunk, borderRadius: BorderRadius.circular(Brand.radiusMd)),
                  child: Semantics(label: 'Pickup code ${(o['handover_code'] as String).split('').join(' ')}', child: Column(children: [
                    const Text('YOUR PICKUP CODE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Brand.inkMuted)),
                    Text(o['handover_code'], style: display(44)),
                    const Text('Say this code at the counter to collect your coffee.', style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
                  ])),
                ),
                if (o['status'] == 'ready') Text('${o['pickup_code']} is ready. See you at the counter.', textAlign: TextAlign.center, style: display(20, color: Brand.hill)),
                if (o['status'] == 'placed' || o['status'] == 'preparing') Text((o['ahead'] ?? 0) > 0 ? '${o['ahead']} ahead of you · about ${((o['eta_seconds'] ?? 90) / 60).ceil()} min' : 'Your coffee in 90 seconds.', style: const TextStyle(color: Brand.inkMuted)),
                if (o['status'] == 'cancelled') Text('${o['cancel_reason'] ?? 'Cancelled'}${o['payment_status'] == 'refunded' ? ' · Refund on its way' : ''}', style: const TextStyle(color: Brand.cherry, fontWeight: FontWeight.w600)),
                if (o['status'] != 'cancelled') ...[
                  const SizedBox(height: 16),
                  Row(children: [for (final s in steps) Expanded(child: Container(height: 8, margin: const EdgeInsets.symmetric(horizontal: 3), decoration: BoxDecoration(color: steps.indexOf(s) <= steps.indexOf(o['status']) ? Brand.hill : Brand.hairline, borderRadius: BorderRadius.circular(99))))]),
                ],
              ]))),
              const SizedBox(height: 16),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(o['station_name'], style: display(20)),
                Text(o['station_address'] ?? '', style: const TextStyle(color: Brand.inkMuted)),
                const SizedBox(height: 8),
                for (final i in o['items']) Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [Expanded(child: Text('${i['qty']} × ${i['name']}')), Text(rs(i['line_total']))])),
                const Divider(),
                if ((o['discount'] ?? 0) > 0) Row(children: [Text(o['discount_label'] ?? 'Offer', style: const TextStyle(color: Brand.inkMuted)), const Spacer(), Text('− ${rs(o['discount'])}')]),
                Row(children: [const Text('Total', style: TextStyle(fontWeight: FontWeight.w700)), const Spacer(), Text(rs(o['total']), style: const TextStyle(fontWeight: FontWeight.w700))]),
                const SizedBox(height: 6),
                Row(children: [Text(payLabel[o['payment_method']] ?? ''), const SizedBox(width: 8), Chip2.status(o['payment_status'])]),
                if (o['payment_method'] == 'cash' && o['payment_status'] == 'unpaid') const Text('Pay when you pick up.', style: TextStyle(color: Brand.inkMuted)),
                if (o['payment_method'] == 'qr_static' && o['payment_status'] == 'unpaid' && !['cancelled', 'picked_up'].contains(o['status']) && _staticQr != null) ...[
                  const SizedBox(height: 12),
                  StaticQrView(info: _staticQr!, amount: o['total'] as num, code: o['pickup_code'] as String?),
                  const Padding(padding: EdgeInsets.only(top: 8), child: Text('Waiting for the barista to confirm your payment.', style: TextStyle(fontWeight: FontWeight.w700))),
                ],
              ]))),
              if (o['status'] == 'awaiting_payment' && o['payment_id'] != null) ...[
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                  onPressed: () async { await showPaySheet(context, o['payment_id'] as String, o['total'] as num); _load(); },
                  child: Text('Pay ${rs(o['total'])} with ${payLabel[o['payment_method']] ?? 'your wallet'}'),
                ),
                const Padding(padding: EdgeInsets.only(top: 6), child: Text('This screen updates by itself once you have paid.', textAlign: TextAlign.center, style: TextStyle(color: Brand.inkMuted, fontSize: 13))),
                TextButton(onPressed: _cancel, child: const Text('Cancel this order')),
              ],
              if (['placed', 'preparing', 'ready'].contains(o['status'])) const Padding(padding: EdgeInsets.only(top: 12), child: Text('Your order has gone to the barista, so it cannot be cancelled. Something wrong? Ask at the counter.', textAlign: TextAlign.center, style: TextStyle(color: Brand.inkMuted, fontSize: 13))),
              if (o['status'] == 'picked_up') Padding(padding: const EdgeInsets.only(top: 16), child: Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
                Text(o['rating'] != null ? 'Thank you for rating' : 'How was your coffee?', style: display(20)),
                const SizedBox(height: 8),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (var n = 1; n <= 5; n++) IconButton(tooltip: '$n out of 5', onPressed: o['rating'] != null ? null : () => _rate(n), icon: Icon((o['rating'] ?? 0) >= n ? Icons.star : Icons.star_border, color: Brand.marigold, size: 32))]),
              ])))),
            ])),
    );
  }
}


