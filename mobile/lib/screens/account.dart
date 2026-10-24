import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../push.dart';
import '../version.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../state.dart';
import '../theme.dart';
import 'customer.dart';

String _d(String iso) => DateFormat('d MMM').format(DateTime.parse(iso).toLocal());
String _dt(String iso) => DateFormat('d MMM, HH:mm').format(DateTime.parse(iso).toLocal());

class _Loader<T> extends StatefulWidget {
  const _Loader({required this.path, required this.builder});
  final String path;
  final Widget Function(BuildContext, dynamic data, Future<void> Function() reload) builder;
  @override
  State<_Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<_Loader<T>> {
  dynamic _data;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try { final d = await Api.instance.get(widget.path); if (mounted) setState(() { _data = d; _error = null; }); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }
  @override
  Widget build(BuildContext context) {
    if (_data == null) return Center(child: _error != null ? Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Brand.cherry))) : const CircularProgressIndicator());
    return RefreshIndicator(onRefresh: _load, child: widget.builder(context, _data, _load));
  }
}

/// Pass wallet. Every pass has its own code, and passes are used one after another.
class PassPanel extends StatefulWidget {
  const PassPanel({super.key});
  @override
  State<PassPanel> createState() => _PassPanelState();
}

class _PassPanelState extends State<PassPanel> {
  List<Map> _passes = [];
  bool _loaded = false;
  Map<String, dynamic>? _pass;
  num? get _price => _pass?['price'] as num?;
  int _lastEpoch = 0;
  int _activePassIdx = 0;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final p = await Api.instance.get('/passes') as List;
      try {
        final c = await Api.instance.request('GET', '/config', auth: false);
        _pass = Map<String, dynamic>.from(c['pass'] as Map);
      } catch (_) {}
      if (mounted) setState(() { _passes = p.cast<Map>(); _loaded = true; });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final epoch = context.watch<CartState>().passEpoch;
    if (epoch != _lastEpoch) {
      _lastEpoch = epoch;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    if (!_loaded) return const SizedBox.shrink();
    final live = _passes.where((p) => p['status'] == 'active' && (p['remaining'] as int) > 0).toList()..sort((a, b) => (a['queue_position'] as int).compareTo(b['queue_position'] as int));
    final past = _passes.where((p) => !live.contains(p)).toList();
    final total = live.fold<int>(0, (a, p) => a + (p['remaining'] as int));

    if (_activePassIdx >= live.length) _activePassIdx = 0;
    final curPass = live.isNotEmpty ? live[_activePassIdx] : null;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('10-cup passes', style: display(20)),
        if (live.length > 1) ...[
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: Brand.cherryLight, borderRadius: BorderRadius.circular(12)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.account_balance_wallet, size: 16, color: Brand.cherry),
              const SizedBox(width: 4),
              Text('$total cups in wallet', style: const TextStyle(color: Brand.cherry, fontWeight: FontWeight.w700, fontSize: 13)),
            ]),
          ),
        ],
      ]),
      const SizedBox(height: 4),
      const Text('Buy as many as you like. They are used one after another, and each starts its 30 days with your first cup.', style: TextStyle(color: Brand.inkMuted, fontSize: 14)),
      if (live.isNotEmpty && live.length == 1) Padding(padding: const EdgeInsets.only(top: 8), child: Text('$total cups available in your pass', style: const TextStyle(fontWeight: FontWeight.w700))),
      if (live.length > 1) ...[
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (var i = 0; i < live.length; i++)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(i == 0 ? 'Using now (${live[i]['remaining']} left)' : 'Up next · #${live[i]['queue_position']} (${live[i]['remaining']} left)'),
                  selected: _activePassIdx == i,
                  selectedColor: Brand.cherry,
                  showCheckmark: false,
                  labelStyle: TextStyle(color: _activePassIdx == i ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600, fontSize: 13),
                  onSelected: (_) => setState(() => _activePassIdx = i),
                ),
              ),
          ]),
        ),
      ],
      const SizedBox(height: 10),
      if (curPass != null) Container(
        padding: const EdgeInsets.all(20), width: double.infinity,
        decoration: BoxDecoration(color: Brand.cherry, borderRadius: BorderRadius.circular(Brand.radiusLg), boxShadow: const [BoxShadow(color: Color(0x24000000), blurRadius: 24, offset: Offset(0, 8))]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Chip2(curPass['state'] == 'using' ? 'Using now' : 'Up next · #${curPass['queue_position']}', bg: Brand.surface, fg: Brand.ink),
            const Spacer(),
            InkWell(onTap: () { Clipboard.setData(ClipboardData(text: curPass['code'])); toast(context, 'Pass code copied'); }, child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(border: Border.all(color: Brand.onCherry, width: 2), borderRadius: BorderRadius.circular(10)), child: Text(curPass['code'], style: const TextStyle(color: Brand.onCherry, fontWeight: FontWeight.w700, letterSpacing: 1)))),
          ]),
          const SizedBox(height: 8),
          Text('${curPass['remaining']} of ${curPass['total_cups']} cups left', style: display(28, color: Brand.onCherry)),
          const SizedBox(height: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [for (var i = 0; i < (curPass['total_cups'] as int); i++) Container(width: 18, height: 18, decoration: BoxDecoration(shape: BoxShape.circle, color: i < curPass['used_cups'] ? Colors.transparent : Brand.onCherry, border: Border.all(color: Brand.onCherry, width: 2)))]),
          const SizedBox(height: 10),
          Text(curPass['starts_on_first_use'] == true ? 'Starts with your first cup. Use it by ${_d(curPass['expires_at'])}.' : 'Valid until ${_d(curPass['expires_at'])}.', style: const TextStyle(color: Brand.onCherry)),
          const Text('Show the code at any counter, or choose the pass at checkout.', style: TextStyle(color: Brand.onCherry, fontSize: 13)),
        ]),
      ),
      if (live.length > 1 && _activePassIdx == 0) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: Brand.surfaceSunk, borderRadius: BorderRadius.circular(Brand.radiusMd), border: Border.all(color: Brand.hairline)),
          child: Row(children: [
            const Icon(Icons.layers_outlined, size: 20, color: Brand.inkMuted),
            const SizedBox(width: 8),
            Expanded(child: Text('${live.length - 1} more pass${live.length > 2 ? 'es' : ''} queued in wallet (${total - (curPass!['remaining'] as int)} cups)', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
            TextButton(style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(50, 30)), onPressed: () => setState(() => _activePassIdx = 1), child: const Text('View next')),
          ]),
        ),
      ],
      if (live.isEmpty) Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${_pass?['cups'] ?? 10} cups. One pass. ${rs(_pass?['price'] ?? 900)}.', style: display(20)),
        const SizedBox(height: 4),
        const Text('Drinks only, at any Sadhai station.', style: TextStyle(color: Brand.inkMuted)),
      ]))),
      const SizedBox(height: 4),
      FilledButton(onPressed: _buy, child: Text(live.isEmpty ? 'Buy a pass' : 'Buy another pass')),
      for (final p in past) Padding(padding: const EdgeInsets.only(top: 8), child: Card(child: ListTile(title: Text('${p['code']} · ${rs(p['price_paid'])}'), subtitle: Text(_d(p['purchased_at'])), trailing: Chip2.status(p['status'] ?? '')))),
    ]);
  }

  Future<void> _buy() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Brand.surfaceRaised,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Buy a 10-cup pass (${rs(_price ?? 900)})', style: display(22)),
              const SizedBox(height: 8),
              const Text(
                'Passes are sold for cash at any Sadhai station counter. Tell the barista your phone number and the pass appears here at once. A new pass starts only when you use its first cup.',
                style: TextStyle(color: Brand.inkMuted),
              ),
              const SizedBox(height: 16),
              const SizedBox(height: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: () => Navigator.pop(c),
                child: const Text('Got it'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> _again(BuildContext context, String id) async {
  final cart = context.read<CartState>();
  try {
    final o = await Api.instance.get('/orders/$id') as Map;
    cart.setStation({'id': o['station_id'], 'name': o['station_name'], 'address': o['station_address']});
    for (final i in (o['items'] as List)) {
      final opts = (i['options'] as List);
      cart.add(CartLine(product: {'id': i['product_id'], 'name': i['name']}, qty: i['qty'], optionIds: [for (final x in opts) x['id'] as String], optionNames: [for (final x in opts) x['name'] as String], unit: i['unit_price']));
    }
    if (context.mounted) toast(context, 'Added to your cart. Open the Cart tab to check out.');
  } on ApiException catch (e) { if (context.mounted) toast(context, e.message, bad: true); }
}

class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return _Loader(path: '/orders', builder: (context, data, reload) {
      final list = (data as List).cast<Map>();
      return ListView(padding: const EdgeInsets.all(20), children: [
        Text('Orders', style: display(30)),
        const SizedBox(height: 12),
        if (list.isEmpty) const Text('No orders yet.', style: TextStyle(color: Brand.inkMuted)),
        for (final o in list) Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: InkWell(
          borderRadius: BorderRadius.circular(Brand.radiusLg),
          onTap: () async { await Navigator.push(context, MaterialPageRoute(builder: (_) => TrackingScreen(orderId: o['id']))); reload(); },
          child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Expanded(child: Text('${o['pickup_code']} · ${o['station_name']}', style: const TextStyle(fontWeight: FontWeight.w700))), Chip2.status(o['status'])]),
            Text(o['summary'] ?? '', style: const TextStyle(color: Brand.inkMuted)),
            const SizedBox(height: 4),
            Row(children: [Text(_dt(o['created_at']), style: const TextStyle(color: Brand.inkMuted, fontSize: 13)), const Spacer(), Text(rs(o['total']), style: const TextStyle(fontWeight: FontWeight.w700))]),
            if (o['status'] == 'picked_up') Padding(padding: const EdgeInsets.only(top: 8), child: OutlinedButton(onPressed: () => _again(context, o['id']), child: const Text('Order again'))),
          ])),
        ))),
      ]);
    });
  }
}

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key, required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  bool _otpSent = false, _otpBusy = false, _otpAllowed = true;
  final _otpCtl = TextEditingController();
  String? _devOtp;

  @override
  void initState() {
    super.initState();
    _checkSmsCfg();
  }

  Future<void> _checkSmsCfg() async {
    try {
      final cfg = await Api.instance.request('GET', '/config', auth: false) as Map;
      final sms = cfg['sms'] as Map?;
      if (sms != null && (sms['enabled'] == false || sms['otp_enabled'] == false)) {
        if (mounted) setState(() => _otpAllowed = false);
      }
    } catch (_) {}
  }

  @override
  void dispose() { _otpCtl.dispose(); super.dispose(); }

  Future<void> _sendOtp() async {
    setState(() => _otpBusy = true);
    try {
      final r = await Api.instance.post('/me/verify-phone/send');
      if (!mounted) return;
      setState(() { _otpSent = true; _devOtp = r['dev_code'] as String?; });
      toast(context, 'Verification code sent via SMS');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, bad: true);
    } finally {
      if (mounted) setState(() => _otpBusy = false);
    }
  }

  Future<void> _confirmOtp() async {
    setState(() => _otpBusy = true);
    try {
      final r = await Api.instance.post('/me/verify-phone/confirm', {'code': _otpCtl.text.trim()});
      Api.instance.user = {...Api.instance.user!, ...Map<String, dynamic>.from(r as Map)};
      if (!mounted) return;
      setState(() { _otpSent = false; _devOtp = null; _otpCtl.clear(); });
      toast(context, 'Phone number verified');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, bad: true);
    } finally {
      if (mounted) setState(() => _otpBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = Api.instance.user!;
    final verified = u['phone_verified'] == true;
    return ListView(padding: const EdgeInsets.all(20), children: [
      Text('Hello, ${(u['name'] as String).split(' ').first}', style: display(30)),
      Row(children: [
        Text(u['phone'], style: const TextStyle(color: Brand.inkMuted)),
        const SizedBox(width: 8),
        Chip2(verified ? 'Verified' : 'Unverified', bg: verified ? Brand.hill : Brand.surfaceSunk, fg: verified ? Brand.onCherry : Brand.ink),
      ]),
      if (!verified && _otpAllowed) Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Verify your phone number', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('Verify via SMS OTP to unlock welcome offers and referral rewards.', style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
          if (_devOtp != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Sandbox code: $_devOtp', style: const TextStyle(color: Brand.cherry, fontWeight: FontWeight.w700, fontSize: 13))),
          const SizedBox(height: 10),
          if (!_otpSent)
            OutlinedButton(onPressed: _otpBusy ? null : _sendOtp, child: Text(_otpBusy ? 'Sending…' : 'Send SMS code'))
          else
            Row(children: [
              Expanded(child: TextField(controller: _otpCtl, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(hintText: '6-digit code', counterText: '', isDense: true))),
              const SizedBox(width: 8),
              FilledButton(onPressed: _otpBusy ? null : _confirmOtp, child: const Text('Verify')),
            ]),
        ]))),
      ),
      const SizedBox(height: 16),
      for (final t in [
        ('Coupons', Icons.sell_outlined, const CouponsScreen()),
        ('Give a cup. Get a cup.', Icons.card_giftcard, const ReferralScreen()),
        ('Inbox', Icons.notifications_none, const InboxScreen()),
        ('Profile and password', Icons.manage_accounts_outlined, ProfileScreen(onSignOut: widget.onSignOut)),
      ]) Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: ListTile(leading: Icon(t.$2, color: Brand.cherry), title: Text(t.$1, style: const TextStyle(fontWeight: FontWeight.w600)), trailing: const Icon(Icons.chevron_right), onTap: () async { await Navigator.push(context, MaterialPageRoute(builder: (_) => t.$3)); if (mounted) setState(() {}); }))),
      const SizedBox(height: 8),
      OutlinedButton(onPressed: () async { await PushService.disable(remember: false); await Api.instance.logout(); widget.onSignOut(); }, child: const Text('Sign out')),
    ]);
  }
}

class CouponsScreen extends StatelessWidget {
  const CouponsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Coupons')),
        body: _Loader(path: '/coupons', builder: (context, data, _) {
          final list = (data as List).cast<Map>();
          if (list.isEmpty) return ListView(padding: const EdgeInsets.all(20), children: const [Text('No coupons yet.')]);
          return ListView(padding: const EdgeInsets.all(20), children: [
            for (final c in list) Opacity(opacity: c['status'] == 'active' ? 1 : 0.55, child: Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: ListTile(
              title: Text(c['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text([
                c['status'] == 'active' ? 'Valid until ${_d(c['expires_at'])}' : c['status'] == 'used' ? 'Used' : 'Expired',
                if ((c['min_spend'] ?? 0) > 0) 'Min spend Rs ${c['min_spend']}',
                if ((c['max_discount'] ?? 0) > 0) 'Up to Rs ${c['max_discount']}',
                if (c['single_cup'] != false) '1 drink base price',
              ].join(' · ')),
              trailing: Chip2(c['kind'] == 'pct' ? '${c['pct']}% off' : 'Free cup', bg: c['status'] == 'active' ? Brand.marigold : Brand.surfaceSunk),
            )))),
          ]);
        }),
      );
}

class ReferralScreen extends StatelessWidget {
  const ReferralScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Give a cup')),
        body: _Loader(path: '/referrals', builder: (context, d, _) {
          final data = d as Map;
          final minSpend = data['min_spend'] ?? 150;
          final freeMax = data['free_max'] ?? 220;
          return ListView(padding: const EdgeInsets.all(20), children: [
            Card(child: Padding(padding: const EdgeInsets.all(24), child: Column(children: [
              Text('Give a cup. Get a cup.', style: display(24)),
              const SizedBox(height: 6),
              Text('Share your code. When your friend completes their first paid order of Rs $minSpend or more, you both get a free drink coupon (up to Rs $freeMax).', textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkMuted)),
              const SizedBox(height: 12),
              QrImageView(data: 'sadhai://invite/${data['code']}', size: 140, eyeStyle: const QrEyeStyle(color: Brand.ink, eyeShape: QrEyeShape.square), dataModuleStyle: const QrDataModuleStyle(color: Brand.ink, dataModuleShape: QrDataModuleShape.square)),
              Text(data['code'], style: display(38, color: Brand.cherry)),
              const SizedBox(height: 8),
              FilledButton(onPressed: () { Clipboard.setData(ClipboardData(text: 'Join me at Sadhai Coffee. Use my code ${data['code']}.')); toast(context, 'Invite copied'); }, child: const Text('Copy invite')),
              const SizedBox(height: 8),
              Text('One free cup per friend, up to ${data['cap']} a month. ${data['rewarded_this_month']} used this month.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
            ]))),
            for (final f in (data['friends'] as List)) Padding(padding: const EdgeInsets.only(top: 10), child: Card(child: ListTile(title: Text(f['name']), trailing: Chip2(f['status'] == 'rewarded' ? 'Rewarded' : 'Awaiting paid order', bg: f['status'] == 'rewarded' ? Brand.hill : Brand.surfaceSunk, fg: f['status'] == 'rewarded' ? Brand.onCherry : Brand.ink)))),
          ]);
        }),
      );
}

class InboxScreen extends StatelessWidget {
  const InboxScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Inbox')),
        body: _Loader(path: '/notifications', builder: (context, d, reload) {
          final items = ((d as Map)['items'] as List).cast<Map>();
          Api.instance.post('/notifications/read');
          return ListView(padding: const EdgeInsets.all(20), children: [
            if (items.isEmpty) const Text('Nothing yet.'),
            for (final n in items) Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: ListTile(title: Text(n['title'], style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text('${n['body'] ?? ''}\n${_dt(n['created_at'])}'), isThreeLine: true))),
          ]);
        }),
      );
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final _name = TextEditingController(text: Api.instance.user!['name']);
  final _cur = TextEditingController(), _new = TextEditingController();
  late String _lang = Api.instance.user!['lang'] ?? 'en';
  String? _error;

  Future<void> _delete() async {
    final pw = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('Delete your account?'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Your name, phone, email and messages are erased. Unused coupons and any pass with cups left expire and cannot be restored. Order and payment records stay with your identity removed, as tax law requires. This cannot be undone.'),
        const SizedBox(height: 12),
        TextField(controller: pw, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm with your password')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep my account')), FilledButton(style: FilledButton.styleFrom(backgroundColor: Brand.cherry), onPressed: () => Navigator.pop(c, true), child: const Text('Delete'))],
    ));
    if (ok != true || !mounted) return;
    try {
      await PushService.disable(remember: false);
      await Api.instance.request('DELETE', '/me', body: {'password': pw.text});
      await Api.instance.logout();
      widget.onSignOut();
    } on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  Future<void> _save() async {
    try {
      final u = await Api.instance.patch('/me', {'name': _name.text.trim(), 'lang': _lang, if (_new.text.isNotEmpty) ...{'current_password': _cur.text, 'new_password': _new.text}});
      Api.instance.user = {...Api.instance.user!, ...Map<String, dynamic>.from(u)};
      if (mounted) { setState(() => _error = null); toast(context, 'Saved'); }
    } on ApiException catch (e) { setState(() => _error = e.message); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(initialValue: _lang, decoration: const InputDecoration(labelText: 'Language'), items: const [DropdownMenuItem(value: 'en', child: Text('English')), DropdownMenuItem(value: 'ne', child: Text('नेपाली'))], onChanged: (v) => setState(() => _lang = v!)),
          const SizedBox(height: 20),
          Text('Change password', style: display(18)),
          const SizedBox(height: 8),
          TextField(controller: _cur, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
          const SizedBox(height: 12),
          TextField(controller: _new, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Brand.cherry))),
          const SizedBox(height: 16),
          FilledButton(onPressed: _save, child: const Text('Save')),
          const SizedBox(height: 24),
          const Divider(),
          const NotificationSettings(),
          const SizedBox(height: 8),
          const Divider(),
          Text('Your data', style: display(18)),
          const SizedBox(height: 8),
          OutlinedButton.icon(icon: const Icon(Icons.download_outlined), label: const Text('Copy my data'), onPressed: () async {
            try { final d = await Api.instance.get('/me/export'); await Clipboard.setData(ClipboardData(text: const JsonEncoder.withIndent('  ').convert(d))); if (context.mounted) toast(context, 'Your data is on the clipboard as JSON'); }
            on ApiException catch (e) { if (context.mounted) toast(context, e.message, bad: true); }
          }),
          const SizedBox(height: 8),
          OutlinedButton.icon(icon: const Icon(Icons.privacy_tip_outlined), label: const Text('Privacy policy'), onPressed: () => launchUrl(Uri.parse('$webUrl/privacy'), mode: LaunchMode.externalApplication)),
          const SizedBox(height: 8),
          OutlinedButton.icon(icon: const Icon(Icons.description_outlined), label: const Text('Terms of use'), onPressed: () => launchUrl(Uri.parse('$webUrl/terms'), mode: LaunchMode.externalApplication)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Brand.cherry, side: const BorderSide(color: Brand.cherry, width: 1.5)),
            icon: const Icon(Icons.delete_outline), label: const Text('Delete my account'), onPressed: _delete,
          ),
          const SizedBox(height: 16),
          Center(child: Text('Sadhai Coffee $appVersion ($appBuild)', style: const TextStyle(color: Brand.inkMuted, fontSize: 13))),
        ]),
      );
}


/// Order updates on this phone (system permission) and the choice to hear about offers.
class NotificationSettings extends StatefulWidget {
  const NotificationSettings({super.key});
  @override
  State<NotificationSettings> createState() => _NotificationSettingsState();
}

class _NotificationSettingsState extends State<NotificationSettings> {
  bool _on = false, _offers = true, _busy = false;
  @override
  void initState() {
    super.initState();
    PushService.wantsPush.then((v) { if (mounted) setState(() => _on = v); });
    _offers = Api.instance.user?['notif_offers'] != false;
  }
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SizedBox(height: 12),
        Text('Notifications', style: display(18)),
        SwitchListTile(
          contentPadding: EdgeInsets.zero, activeTrackColor: Brand.hill, title: const Text('Tell me when my coffee is ready'),
          subtitle: Text(PushService.configured ? 'Order and pass messages on this phone' : 'Not set up in this build. Order updates still arrive while the app is open.', style: const TextStyle(fontSize: 13)),
          value: _on, onChanged: _busy || !PushService.configured ? null : (v) async {
            setState(() => _busy = true);
            var ok = false;
            if (v) { ok = await PushService.enable(); } else { await PushService.disable(); }
            if (!mounted) return;
            setState(() { _on = v && ok; _busy = false; });
            if (v && !ok) {
              if (context.mounted) toast(context, 'Notifications are blocked. Allow them in your phone settings to turn this on.', bad: true);
            }
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero, activeTrackColor: Brand.hill, title: const Text('Offers and news'), subtitle: const Text('One a day at most. Order messages are always sent.', style: TextStyle(fontSize: 13)),
          value: _offers, onChanged: (v) async {
            setState(() => _offers = v);
            try {
              final u = await Api.instance.patch('/me', {'notif_offers': v});
              Api.instance.user = {...Api.instance.user!, ...Map<String, dynamic>.from(u)};
            } on ApiException catch (e) {
              if (!mounted) return;
              setState(() => _offers = !v);
              if (context.mounted) toast(context, e.message, bad: true);
            }
          },
        ),
      ]);
}
