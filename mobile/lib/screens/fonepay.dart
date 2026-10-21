import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../theme.dart';

const _providerMeta = {
  'fonepay': (
    'Fonepay',
    'Open Fonepay Web Checkout',
    Color(0xFFD71920),
    'Scan this Fonepay Dynamic QR with any mobile banking app, eSewa, or Khalti — or tap Open Fonepay Web Checkout below.',
  ),
  'esewa': (
    'eSewa',
    'Pay with eSewa Wallet',
    Color(0xFF41A124),
    'Tap Pay with eSewa Wallet to complete ePay v2 checkout directly, or scan the QR code below with the eSewa app.',
  ),
  'khalti': (
    'Khalti',
    'Pay with Khalti Wallet',
    Color(0xFF5C2D91),
    'Tap Pay with Khalti Wallet to complete KPG-2 checkout directly, or scan the QR code below with the Khalti app.',
  ),
};

/// Payment sheet for Fonepay, eSewa (ePay v2), and Khalti (KPG-2).
/// Supports both direct Wallet/Web Checkout launch and Dynamic QR scanning.
Future<String> showFonepay(BuildContext context, Map pay, num amount) async {
  final r = await showModalBottomSheet<String>(
    context: context, isScrollControlled: true, isDismissible: false, backgroundColor: Brand.surfaceRaised,
    builder: (c) => _FonepaySheet(pay: pay, amount: amount),
  );
  return r ?? 'later';
}

class _FonepaySheet extends StatefulWidget {
  const _FonepaySheet({required this.pay, required this.amount});
  final Map pay;
  final num amount;
  @override
  State<_FonepaySheet> createState() => _FonepaySheetState();
}

class _FonepaySheetState extends State<_FonepaySheet> {
  Timer? _t;
  bool _busy = false;
  String get _id => widget.pay['payment_id'] as String;
  String get _provider => ((widget.pay['provider'] as String?) ?? 'fonepay').toLowerCase();
  (String, String, Color, String) get _meta => _providerMeta[_provider] ?? _providerMeta['fonepay']!;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }
  @override
  void dispose() { _t?.cancel(); super.dispose(); }

  Future<void> _poll() async {
    try {
      final p = await Api.instance.get('/payments/$_id');
      if (p['status'] != 'pending' && mounted) { _t?.cancel(); Navigator.pop(context, p['status'] == 'paid' ? 'paid' : 'failed'); }
    } catch (_) {}
  }

  Future<void> _test(String outcome) async {
    setState(() => _busy = true);
    try { await Api.instance.post('/payments/$_id/confirm', {'outcome': outcome}); if (mounted) Navigator.pop(context, outcome == 'paid' ? 'paid' : 'failed'); }
    on ApiException catch (_) { _poll(); } finally { if (mounted) setState(() => _busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final qrData = (widget.pay['qr_message'] as String?) ?? (widget.pay['pay_url'] as String?) ?? (widget.pay['payment_url'] as String?) ?? _id;
    final payUrl = (widget.pay['pay_url'] as String?) ?? (widget.pay['payment_url'] as String?);
    return SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
        decoration: BoxDecoration(color: _meta.$3, borderRadius: BorderRadius.circular(999)),
        child: Text(_meta.$1, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
      ),
      const SizedBox(height: 8),
      Text('Pay with ${_meta.$1}', style: display(24)),
      const SizedBox(height: 12),
      if (payUrl != null && payUrl.startsWith('http')) ...[
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: _meta.$3,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(50),
            ),
            onPressed: () => launchUrl(Uri.parse(payUrl), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new, size: 18),
            label: Text('${_meta.$2} (${rs(widget.amount)})', style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
        const SizedBox(height: 12),
      ],
      Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _meta.$3.withValues(alpha: 0.25), width: 2),
        ),
        padding: const EdgeInsets.all(10),
        child: QrImageView(data: qrData, size: 210, semanticsLabel: '${_meta.$1} QR code to pay'),
      ),
      const SizedBox(height: 8),
      Text(rs(widget.amount), style: display(26)),
      const SizedBox(height: 4),
      Text(_meta.$4, textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
      if (widget.pay['mode'] == 'sandbox') ...[
        const SizedBox(height: 12),
        const Text('Sandbox test mode. No real money moves.', style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(child: FilledButton(onPressed: _busy ? null : () => _test('paid'), child: const Text('Pretend I paid'))), const SizedBox(width: 8),
          Expanded(child: OutlinedButton(onPressed: _busy ? null : () => _test('fail'), child: const Text('Pretend it failed'))),
        ]),
      ],
      TextButton(onPressed: () => Navigator.pop(context, 'later'), child: const Text('I will pay from my orders')),
    ]))));
  }
}
