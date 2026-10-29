import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../theme.dart';

/// The shop's own QR. The customer scans it and pays; the barista, or the owner centrally, checks the money arrived before the coffee is handed over.
class StaticQrView extends StatelessWidget {
  const StaticQrView({super.key, required this.info, required this.amount, this.code});
  final Map info;
  final num amount;
  final String? code;
  @override
  Widget build(BuildContext context) {
    final text = info['text'] as String?;
    final image = info['image_url'] as String?;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: const [BoxShadow(color: Color(0x1F2A1810), blurRadius: 24, offset: Offset(0, 6))]),
        child: SizedBox(width: 220, height: 220, child: text != null && text.isNotEmpty
            ? QrImageView(data: text, size: 220, backgroundColor: Colors.white, errorCorrectionLevel: QrErrorCorrectLevel.M)
            : (image != null ? Image.network(image, fit: BoxFit.contain) : const SizedBox())),
      ),
      const SizedBox(height: 10),
      Text(info['title'] as String? ?? 'Sadhai Coffee', style: display(20)),
      const SizedBox(height: 4),
      Text('Scan, pay ${rs(amount)}${code != null ? ' and write $code in the remark if your app asks' : ''}.', textAlign: TextAlign.center),
      const SizedBox(height: 4),
      const Text('Show the payment confirmation to the barista. They check it arrived, then your coffee is handed over.', textAlign: TextAlign.center, style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
    ]);
  }
}

Future<void> showStaticQrSheet(BuildContext context, Map info, num amount, String? code) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          StaticQrView(info: info, amount: amount, code: code),
          const SizedBox(height: 14),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: () => Navigator.pop(c), child: const Text('I have paid, show my order')),
        ])),
      ),
    );
