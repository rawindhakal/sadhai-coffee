import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../theme.dart';
import 'customer.dart' show toast;

String _hm(String iso) => DateFormat('h:mm a').format(DateTime.parse(iso).toLocal());
String _day(String iso) => DateFormat('EEE d MMM').format(DateTime.parse(iso).toLocal());
String _hrs(num? m) => m == null ? '-' : '${m ~/ 60}h ${(m % 60).toInt().toString().padLeft(2, '0')}';

/// One screen for a staff member: the current or next shift, a big start/end button, the duty checklist, hours and pay so far.
class MyShift extends StatefulWidget {
  const MyShift({super.key});
  @override
  State<MyShift> createState() => _MyShiftState();
}

class _MyShiftState extends State<MyShift> {
  Json? _d;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try { final d = await Api.instance.get('/hr/me'); if (mounted) setState(() { _d = Map<String, dynamic>.from(d); _error = null; }); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }

  Future<void> _act(String path, String ok) async {
    try {
      final r = await Api.instance.post(path);
      if (mounted) toast(context, r is Map && r['minutes'] != null ? '$ok ${_hrs(r['minutes'])} counted.' : ok);
      _load();
    } on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  Future<void> _tick(String id) async {
    try { await Api.instance.post('/hr/me/tasks/$id/toggle'); _load(); } on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    if (d == null) return Center(child: _error != null ? Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)) : const CircularProgressIndicator());
    final cur = d['current'] as Map?, next = d['next'] as Map?;
    final shift = cur ?? next;
    final month = d['month'] as Map;
    final upcoming = (d['shifts'] as List).where((s) => s['id'] != shift?['id'] && s['status'] == 'scheduled' && DateTime.parse(s['end_at']).isAfter(DateTime.now())).take(8).toList();
    return RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
      if (shift != null) Card(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusLg), side: BorderSide(color: cur != null ? Brand.hill : Brand.hairline, width: 2)), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Chip(label: Text(cur != null ? 'On shift' : 'Next shift'), backgroundColor: cur != null ? Brand.hill : Brand.marigold, labelStyle: TextStyle(color: cur != null ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('${_day(shift['start_at'])}  ${_hm(shift['start_at'])} to ${_hm(shift['end_at'])}', style: display(22)),
        Text('${shift['station_name']}${(shift['duty'] ?? '') == '' ? '' : '  ·  ${shift['duty']}'}', style: const TextStyle(color: Brand.inkMuted)),
        const SizedBox(height: 14),
        SizedBox(width: double.infinity, height: 56, child: cur != null
            ? FilledButton(onPressed: () => _act('/hr/me/check-out', 'Shift ended.'), child: const Text('End my shift', style: TextStyle(fontSize: 18)))
            : FilledButton(onPressed: d['can_check_in'] == true ? () => _act('/hr/me/check-in', 'You are on shift.') : null, child: const Text('Start my shift', style: TextStyle(fontSize: 18)))),
        if (cur == null && d['can_check_in'] != true) const Padding(padding: EdgeInsets.only(top: 8), child: Text('You can start up to 30 minutes before your shift begins.', style: TextStyle(color: Brand.inkMuted, fontSize: 13))),
        if ((shift['tasks'] as List?)?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          Text('Your checklist', style: display(16)),
          for (final t in shift['tasks'] as List) CheckboxListTile(contentPadding: EdgeInsets.zero, value: t['done'] == true, onChanged: cur == null ? null : (_) => _tick(t['id']), title: Text(t['title'], style: TextStyle(decoration: t['done'] == true ? TextDecoration.lineThrough : null)), controlAffinity: ListTileControlAffinity.leading),
          if (cur == null) const Text('Start your shift to tick things off.', style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
        ],
      ])))
      else const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No shift is planned for you right now. Check the list below, or ask your manager.'))),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _Stat('This month', _hrs(month['minutes']), '${month['shifts']} shifts')), const SizedBox(width: 8),
        Expanded(child: _Stat('Earned so far', 'Rs ${NumberFormat('#,##0').format(month['estimated_pay'])}', 'Rs ${month['rate']} an hour')),
      ]),
      const SizedBox(height: 16),
      Text('Coming up', style: display(18)),
      if (upcoming.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No more shifts published yet.', style: TextStyle(color: Brand.inkMuted))),
      for (final s in upcoming) ListTile(contentPadding: EdgeInsets.zero, title: Text('${_day(s['start_at'])}  ${_hm(s['start_at'])} to ${_hm(s['end_at'])}'), subtitle: Text('${s['station_name']}${(s['duty'] ?? '') == '' ? '' : '  ·  ${s['duty']}'}')),
      const SizedBox(height: 8),
      OutlinedButton(onPressed: _askTimeOff, child: const Text('Ask for time off')),
      for (final p in d['payslips'] as List) ListTile(contentPadding: EdgeInsets.zero, title: Text('Payslip ${DateFormat('d MMM').format(DateTime.parse(p['period_from']))} to ${DateFormat('d MMM').format(DateTime.parse(p['period_to']))}'), subtitle: Text('${_hrs((p['regular_minutes'] ?? 0) + (p['overtime_minutes'] ?? 0))} worked'), trailing: Text('Rs ${p['net']}', style: const TextStyle(fontWeight: FontWeight.w700))),
    ]));
  }

  Future<void> _askTimeOff() async {
    final r = await showDateRangePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 120)));
    if (r == null) return;
    String f(DateTime x) => DateFormat('yyyy-MM-dd').format(x);
    try { await Api.instance.post('/hr/me/time-off', {'from_date': f(r.start), 'to_date': f(r.end), 'kind': 'leave'}); if (mounted) toast(context, 'Sent to your manager'); _load(); }
    on ApiException catch (e) { if (mounted) toast(context, e.message, bad: true); }
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.hint);
  final String label, value, hint;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: const TextStyle(fontSize: 12, color: Brand.inkMuted)), Text(value, style: display(22)), Text(hint, style: const TextStyle(fontSize: 12, color: Brand.inkMuted))])));
}

/// Standard recipe cards, the same at every station and partner cafe.
class RecipeCards extends StatefulWidget {
  const RecipeCards({super.key, required this.q});
  final String q;
  @override
  State<RecipeCards> createState() => _RecipeCardsState();
}

class _RecipeCardsState extends State<RecipeCards> {
  List? _list;
  String? _error;
  String _find = '';
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try { final d = await Api.instance.get('/station/recipes${widget.q}'); if (mounted) setState(() => _list = d as List); }
    on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }
  @override
  Widget build(BuildContext context) {
    final l = _list;
    if (l == null) return Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator());
    final shown = l.where((p) => (p['name'] as String).toLowerCase().contains(_find.toLowerCase())).toList();
    return ListView(padding: const EdgeInsets.all(16), children: [
      TextField(decoration: const InputDecoration(hintText: 'Find a drink', prefixIcon: Icon(Icons.search)), onChanged: (v) => setState(() => _find = v)),
      const SizedBox(height: 8),
      for (final p in shown) Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Expanded(child: Text(p['name'], style: display(18))), Text('v${p['recipe_version']}', style: const TextStyle(color: Brand.inkMuted))]),
        Text('${p['category'] ?? ''}', style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
        const SizedBox(height: 6),
        for (final i in p['lines'] as List) Text('${i['qty']} ${i['unit']} ${(i['name'] as String).toLowerCase()}'),
        for (final e in (p['options'] as Map).entries) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${e.key}: ${(e.value as List).map((i) => '${i['qty']} ${i['unit']} ${(i['name'] as String).toLowerCase()}').join(', ')}', style: const TextStyle(fontSize: 13))),
        if ((p['recipe_method'] ?? '') != '') Padding(padding: const EdgeInsets.only(top: 8), child: Text(p['recipe_method'], style: const TextStyle(color: Brand.inkMuted, fontSize: 13))),
      ]))),
    ]);
  }
}
