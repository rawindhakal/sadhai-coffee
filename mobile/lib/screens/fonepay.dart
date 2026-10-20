import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../theme.dart';

const _providerMeta = {
  'fonepay': ('Fonepay', 'Open your mobile banking or wallet app, choose Scan, and scan this Fonepay QR. This closes by itself when you have paid.'),
  'esewa': ('eSewa', 'Scan with the eSewa app or tap Open eSewa to complete payment. This closes by itself when you have paid.'),
  'khalti': ('Khalti', 'Scan with the Khalti app or tap Open Khalti to complete payment. This closes by itself when you have paid.'),
};

/// Dynamic QR payment sheet for Fonepay, eSewa, and Khalti.
/// Returns 'paid', 'failed' or 'later' (the customer closed it and will pay from their orders).
/// In test mode two buttons stand in for the banking/wallet app so the whole flow can be tried without real money.
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
  String get _provider => (widget.pay['provider'] as String?) ?? 'fonepay';
  (String, String) get _meta => _providerMeta[_provider] ?? _providerMeta['fonepay']!;

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
    final qrData = (widget.pay['qr_message'] as String?) ?? (widget.pay['payment_url'] as String?) ?? _id;
    final payUrl = widget.pay['payment_url'] as String?;
    return SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text('Pay with ${_meta.$1}', style: display(24)),
      const SizedBox(height: 12),
      Container(color: Colors.white, padding: const EdgeInsets.all(10), child: QrImageView(data: qrData, size: 220, semanticsLabel: '${_meta.$1} QR code to pay')),
      const SizedBox(height: 8),
      Text(rs(widget.amount), style: display(26)),
      const SizedBox(height: 4),
      Text(_meta.$2, textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkMuted)),
      if (payUrl != null && payUrl.startsWith('http')) ...[
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => launchUrl(Uri.parse(payUrl), mode: LaunchMode.externalApplication),
          icon: const Icon(Icons.open_in_new, size: 18),
          label: Text('Open ${_meta.$1}'),
        ),
      ],
      if (widget.pay['mode'] == 'sandbox') ...[
        const SizedBox(height: 12),
        const Text('Test mode. No real money moves.', style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
        Row(children: [
          Expanded(child: FilledButton(onPressed: _busy ? null : () => _test('paid'), child: const Text('Pretend I paid'))), const SizedBox(width: 8),
          Expanded(child: OutlinedButton(onPressed: _busy ? null : () => _test('fail'), child: const Text('Pretend it failed'))),
        ]),
      ],
      TextButton(onPressed: () => Navigator.pop(context, 'later'), child: const Text('I will pay from my orders')),
    ]))));
  }
}
