import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../theme.dart';
import 'customer.dart' show toast;

class StaffHome extends StatelessWidget {
  const StaffHome({super.key, required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('sadhai · station'), actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () async { await Api.instance.logout(); onSignOut(); })]),
        body: const StationWorkspace(),
      );
}

/// Live station tools. Staff are pinned to their station; managers/owners pass [stationId].
class StationWorkspace extends StatefulWidget {
  const StationWorkspace({super.key, this.stationId});
  final String? stationId;
  @override
  State<StationWorkspace> createState() => _StationWorkspaceState();
}

class _StationWorkspaceState extends State<StationWorkspace> {
  int _tab = 0;
  Json? _summary;
  String? _error;
  StreamSubscription? _sub;
  final _reloadTick = ValueNotifier<int>(0);

  String get q => widget.stationId == null ? '' : '?station_id=${widget.stationId}';
  String path(String p) => '$p$q';

  @override
  void initState() {
    super.initState();
    _load();
    _sub = Api.instance.events().listen((e) {
      if (['order_new', 'order', 'stock', 'station'].contains(e.$1)) { _load(); _reloadTick.value++; }
      if (e.$1 == 'order_new') HapticFeedback.heavyImpact();
    });
  }

  @override
  void dispose() { _sub?.cancel(); super.dispose(); }

  Future<void> _load() async {
    try { final s = await Api.instance.get(path('/station/summary')); if (mounted) setState(() { _summary = Map<String, dynamic>.from(s); _error = null; }); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }

  Future<void> _toggle(String k) async {
    try { await Api.instance.patch(path('/station'), {k: !(_summary!['station'][k] as bool)}); _load(); } on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    if (s == null) return Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator());
    final st = s['station'] as Map, queue = s['queue'] as Map, today = s['today'] as Map;
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(st['name'], style: display(22)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: _Kpi('Waiting', '${queue['waiting']}')), const SizedBox(width: 8),
          Expanded(child: _Kpi('Making', '${queue['making']}')), const SizedBox(width: 8),
          Expanded(child: _Kpi('Ready', '${queue['ready']}')), const SizedBox(width: 8),
          Expanded(child: _Kpi('Cups', '${today['cups']}')),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          FilterChip(label: Text(st['is_open'] ? 'Open' : 'Closed'), selected: st['is_open'], selectedColor: Brand.hill, labelStyle: TextStyle(color: st['is_open'] ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), showCheckmark: false, onSelected: (_) => _toggle('is_open')),
          FilterChip(label: Text(st['accepting_orders'] ? 'Taking orders' : 'Orders paused'), selected: !st['accepting_orders'], selectedColor: Brand.marigold, showCheckmark: false, onSelected: (_) => _toggle('accepting_orders')),
        ]),
      ])),
      Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: SingleChildScrollView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), child: Row(children: [
        for (final (i, l) in ['Queue', 'Sold out', 'Stock', 'Close day'].indexed) Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(l), selected: _tab == i, selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: _tab == i ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) => setState(() => _tab = i))),
      ]))),
      Expanded(child: switch (_tab) {
        0 => _Queue(q: q, target: st['prep_target_seconds'] as int, tick: _reloadTick, onChange: _load),
        1 => _SoldOut(q: q),
        2 => _Stock(q: q),
        _ => _CloseDay(q: q, summary: s, onDone: _load),
      }),
    ]);
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Column(children: [Text(value, style: display(24)), Text(label, style: const TextStyle(fontSize: 12, color: Brand.inkMuted))])));
}

class _Queue extends StatefulWidget {
  const _Queue({required this.q, required this.target, required this.tick, required this.onChange});
  final String q;
  final int target;
  final ValueNotifier<int> tick;
  final VoidCallback onChange;
  @override
  State<_Queue> createState() => _QueueState();
}

class _QueueState extends State<_Queue> {
  List<Map> _orders = [];
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    widget.tick.addListener(_load);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  @override
  void dispose() { widget.tick.removeListener(_load); _timer?.cancel(); super.dispose(); }

  Future<void> _load() async {
    try { final l = await Api.instance.get('/station/orders${widget.q}') as List; if (mounted) setState(() { _orders = l.cast<Map>(); _error = null; }); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }

  Future<void> _move(Map o, String status) async {
    try { await Api.instance.post('/station/orders/${o['id']}/status${widget.q}', {'status': status}); await _load(); widget.onChange(); }
    on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  Future<void> _cash(Map o) async {
    try { await Api.instance.post('/station/orders/${o['id']}/pay${widget.q}'); await _load(); if (mounted) toast(context, 'Cash recorded'); }
    on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return Center(child: Text(_error!));
    if (_orders.isEmpty) return const Center(child: Text('No open orders. A quiet moment.', style: TextStyle(color: Brand.inkMuted)));
    return RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
      for (final o in _orders) Padding(padding: const EdgeInsets.only(bottom: 12), child: _TicketCard(o: o, target: widget.target, onMove: _move, onCash: _cash)),
    ]));
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.o, required this.target, required this.onMove, required this.onCash});
  final Map o;
  final int target;
  final Future<void> Function(Map, String) onMove;
  final Future<void> Function(Map) onCash;
  @override
  Widget build(BuildContext context) {
    final from = DateTime.parse(o['status'] == 'ready' ? o['ready_at'] : o['created_at']);
    final secs = DateTime.now().difference(from).inSeconds;
    final late = (o['status'] == 'placed' || o['status'] == 'preparing') && secs > target;
    const next = {'placed': ('preparing', 'Start'), 'preparing': ('ready', 'Ready'), 'ready': ('picked_up', 'Handed over')};
    final n = next[o['status']];
    final unpaid = o['payment_status'] == 'unpaid' && (o['total'] as int) > 0;
    return Card(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusLg), side: BorderSide(color: late ? Brand.cherry : Brand.hairline, width: late ? 2 : 1)), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(o['pickup_code'], style: display(38, color: Brand.cherry)),
        const SizedBox(width: 10), Chip2.status(o['status']),
        const Spacer(),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}${late ? ' late' : ''}', style: TextStyle(fontWeight: FontWeight.w700, color: late ? Brand.cherry : Brand.ink)),
          Text('${o['channel']} · ${DateFormat('HH:mm').format(DateTime.parse(o['created_at']).toLocal())}', style: const TextStyle(fontSize: 12, color: Brand.inkMuted)),
        ]),
      ]),
      const SizedBox(height: 8),
      for (final i in (o['items'] as List)) Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${i['qty']} × ${i['name']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        if ((i['options'] as List).isNotEmpty) Text((i['options'] as List).map((x) => x['name']).join(', '), style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
      ])),
      if (o['note'] != null) Container(margin: const EdgeInsets.only(top: 6), padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Brand.surfaceSunk, borderRadius: BorderRadius.circular(8)), child: Text('Note: ${o['note']}')),
      const SizedBox(height: 8),
      Row(children: [Text(o['customer_name'] ?? o['user_name'] ?? 'Walk-in', style: const TextStyle(color: Brand.inkMuted)), const Spacer(), Chip2.status(o['payment_status']), const SizedBox(width: 6), Text(rs(o['total']), style: const TextStyle(fontWeight: FontWeight.w700))]),
      if (o['status'] == 'ready' && unpaid) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Collect ${rs(o['total'])} cash at hand-over.', style: const TextStyle(color: Brand.cherry, fontWeight: FontWeight.w700))),
      const SizedBox(height: 10),
      Row(children: [
        if (n != null) Expanded(child: FilledButton(onPressed: () => onMove(o, n.$1), child: Text(n.$2))),
        if (unpaid) ...[const SizedBox(width: 8), OutlinedButton(onPressed: () => onCash(o), child: const Text('Got cash'))],
        if (o['status'] == 'placed' || o['status'] == 'preparing') ...[const SizedBox(width: 8), IconButton.outlined(tooltip: 'Cancel order', onPressed: () async {
          final yes = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: Text('Cancel ${o['pickup_code']}?'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cancel order'))]));
          if (yes == true) onMove(o, 'cancelled');
        }, icon: const Icon(Icons.close))],
      ]),
    ])));
  }
}

class _SoldOut extends StatefulWidget {
  const _SoldOut({required this.q});
  final String q;
  @override
  State<_SoldOut> createState() => _SoldOutState();
}

class _SoldOutState extends State<_SoldOut> {
  List _items = [];
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final j = await Api.instance.get('/station/menu${widget.q}') as Map;
    if (mounted) setState(() => _items = [for (final c in j['categories']) ...c['products']]);
  }
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(16), children: [
        for (final p in _items) Card(child: ListTile(
          title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(p['sold_out_reason'] == 'stock' ? 'Out of an ingredient' : p['sold_out_reason'] == 'station' ? 'Marked finished' : rs(p['price'])),
          trailing: p['sold_out_reason'] == 'stock' ? const Chip2('Restock to sell') : OutlinedButton(onPressed: () async { await Api.instance.post('/station/products/${p['id']}/availability${widget.q}', {'available': !(p['available'] as bool)}); _load(); }, child: Text(p['available'] ? 'Mark finished' : 'Back on')),
        )),
      ]);
}

class _Stock extends StatefulWidget {
  const _Stock({required this.q});
  final String q;
  @override
  State<_Stock> createState() => _StockState();
}

class _StockState extends State<_Stock> {
  List _items = [];
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final l = await Api.instance.get('/station/inventory${widget.q}') as List;
    if (mounted) setState(() => _items = l);
  }
  Future<void> _update(Map i) async {
    final ctl = TextEditingController();
    String reason = 'restock';
    final ok = await showDialog<bool>(context: context, builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
      title: Text(i['name']),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        SegmentedButton<String>(segments: const [ButtonSegment(value: 'restock', label: Text('Received')), ButtonSegment(value: 'waste', label: Text('Wasted'))], selected: {reason}, onSelectionChanged: (s) => set(() => reason = s.first)),
        const SizedBox(height: 12),
        TextField(controller: ctl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: 'Amount (${i['unit']})'), autofocus: true),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save'))],
    )));
    final amt = double.tryParse(ctl.text);
    if (ok != true || amt == null || amt <= 0) return;
    try { await Api.instance.post('/station/inventory/${i['id']}${widget.q}', {'delta': reason == 'waste' ? -amt : amt, 'reason': reason}); _load(); if (mounted) toast(context, 'Stock updated'); }
    on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(16), children: [
        for (final i in _items) Card(child: ListTile(
          title: Row(children: [Flexible(child: Text(i['name'], style: const TextStyle(fontWeight: FontWeight.w600))), if (i['low'] == true) const Padding(padding: EdgeInsets.only(left: 8), child: Chip2('Low', bg: Brand.cherry, fg: Brand.onCherry))]),
          subtitle: Text('${NumberFormat.decimalPattern().format((i['qty'] as num).round())} ${i['unit']} · reorder at ${(i['reorder_level'] as num).round()}'),
          trailing: OutlinedButton(onPressed: () => _update(Map.from(i)), child: const Text('Update')),
        )),
      ]);
}

class _CloseDay extends StatefulWidget {
  const _CloseDay({required this.q, required this.summary, required this.onDone});
  final String q;
  final Json summary;
  final VoidCallback onDone;
  @override
  State<_CloseDay> createState() => _CloseDayState();
}

class _CloseDayState extends State<_CloseDay> {
  final _ctl = TextEditingController();
  @override
  Widget build(BuildContext context) {
    final s = widget.summary, t = s['today'] as Map, expected = s['expected_cash'] as int;
    final counted = int.tryParse(_ctl.text);
    final c = s['cash_close'] as Map?;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        for (final r in [('Orders', '${t['orders']}'), ('Cups', '${t['cups']}'), ('Sales', rs(t['revenue'])), ('Average time to make', '${t['avg_make_seconds']}s')]) Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Row(children: [Text(r.$1), const Spacer(), Text(r.$2, style: const TextStyle(fontWeight: FontWeight.w700))])),
      ]))),
      const SizedBox(height: 12),
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Count the cash drawer', style: display(20)),
        const SizedBox(height: 8),
        Row(children: [const Text('Expected cash'), const Spacer(), Text(rs(expected), style: const TextStyle(fontWeight: FontWeight.w700))]),
        const SizedBox(height: 8),
        TextField(controller: _ctl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Counted cash (Rs)'), onChanged: (_) => setState(() {})),
        if (counted != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(counted == expected ? 'Matches.' : 'Difference ${rs(counted - expected)}', style: TextStyle(color: counted == expected ? Brand.hill : Brand.cherry, fontWeight: FontWeight.w700))),
        const SizedBox(height: 12),
        FilledButton(onPressed: counted == null ? null : () async {
          try { await Api.instance.post('/station/cash-close${widget.q}', {'counted_cash': counted}); widget.onDone(); if (context.mounted) toast(context, 'Day closed'); }
          on ApiException catch (e) { if (context.mounted) toast(context, e.message, bad: true); }
        }, child: const Text('Close the day')),
        if (c != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Closed today: counted ${rs(c['counted_cash'])}, difference ${rs(c['diff'])}.', style: const TextStyle(color: Brand.inkMuted))),
      ]))),
    ]);
  }
}
