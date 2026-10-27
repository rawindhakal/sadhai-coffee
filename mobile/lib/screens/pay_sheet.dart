import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../theme.dart';
import 'customer.dart' show payLabel;

/// The pay-by-QR window. It opens over the screen the customer is on, shows the QR and what is happening, and closes itself after the
/// payment arrives. Returns 'paid', 'failed' or 'closed' (the payment stays open for 15 minutes if the customer leaves).
Future<String> showPaySheet(BuildContext context, String paymentId, num amount) async {
  final r = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _PaySheet(paymentId: paymentId, amount: amount),
  );
  return r ?? 'closed';
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({required this.paymentId, required this.amount});
  final String paymentId;
  final num amount;
  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  Map? _p;
  String? _err;
  int _left = 900;
  Timer? _poll, _clock;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _look();
    _poll = Timer.periodic(const Duration(milliseconds: 2500), (_) => _look());
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      final e = _p?['expires_at'] as String?;
      if (e != null && mounted) setState(() => _left = DateTime.parse(e).difference(DateTime.now()).inSeconds.clamp(0, 900));
    });
  }

  @override
  void dispose() { _poll?.cancel(); _clock?.cancel(); super.dispose(); }

  Future<void> _look() async {
    if (_done) return;
    try {
      final p = await Api.instance.get('/payments/${widget.paymentId}') as Map;
      if (!mounted) return;
      setState(() { _p = p; _err = null; });
      if (p['status'] == 'paid') {
        _done = true;
        await Future.delayed(const Duration(milliseconds: 1600));
        if (mounted) Navigator.pop(context, 'paid');
      }
    } on ApiException catch (e) { if (mounted) setState(() => _err = e.message); }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final status = p == null ? 'loading' : p['status'] == 'paid' ? 'paid' : p['status'] == 'pending' ? 'waiting' : 'failed';
    final qr = p?['qr'] as Map?;
    final label = payLabel[p?['provider']] ?? 'your wallet';
    final bank = qr?['kind'] == 'bank';
    final mmss = '${_left ~/ 60}:${(_left % 60).toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (status == 'paid') ...[
          const SizedBox(height: 24),
          const Icon(Icons.check_circle, color: Brand.hill, size: 88),
          const SizedBox(height: 8),
          Text('Paid ${rs(widget.amount)}', style: display(26)),
          const Text('Your order is going to the barista.', style: TextStyle(color: Brand.inkMuted)),
          const SizedBox(height: 24),
        ] else if (status == 'failed') ...[
          const SizedBox(height: 16),
          Text('Payment not completed', style: display(24)),
          const Padding(padding: EdgeInsets.all(8), child: Text('Nothing was charged. You can try again or pay with cash.', textAlign: TextAlign.center, style: TextStyle(color: Brand.inkMuted))),
          FilledButton(onPressed: () => Navigator.pop(context, 'failed'), child: const Text('Close')),
        ] else ...[
          Text(bank ? 'Scan with any bank or wallet app' : 'Pay with $label', style: display(22)),
          Text(rs(widget.amount), style: display(30)),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: const [BoxShadow(color: Color(0x1F2A1810), blurRadius: 24, offset: Offset(0, 6))]),
            child: SizedBox(width: 220, height: 220, child: qr == null
                ? Center(child: Text(_err ?? 'Making your QR…', textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkMuted)))
                : QrImageView(data: qr['value'] as String, size: 220, backgroundColor: Colors.white, errorCorrectionLevel: QrErrorCorrectLevel.M)),
          ),
          const SizedBox(height: 12),
          Text('Waiting for your payment… $mmss', style: const TextStyle(color: Brand.inkMuted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(bank ? 'Open your banking or wallet app, scan, and confirm.' : 'Tap Open $label to pay on this phone.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
          const SizedBox(height: 12),
          if (qr?['kind'] == 'link') FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: () => launchUrl(Uri.parse(qr!['value'] as String), mode: LaunchMode.externalApplication),
            child: Text('Open $label'),
          ),
          TextButton(onPressed: () => Navigator.pop(context, 'closed'), child: const Text('Close')),
        ],
      ])),
    );
  }
}
