import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../art.dart';
import '../state.dart';
import '../theme.dart';
import 'account.dart' show ReferralScreen;
import 'customer.dart';

/// Home tab: no station yet -> location gate; otherwise the full store front.
class HomeTab extends StatelessWidget {
  const HomeTab({super.key, required this.goTab});
  final void Function(int) goTab;
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    if (!cart.ready) return const Center(child: CircularProgressIndicator());
    return cart.station == null ? const LocationGate() : StoreFront(key: ValueKey(cart.station!['id']), goTab: goTab);
  }
}

/* ------------------------------------------------------------ location */

class LocationGate extends StatefulWidget {
  const LocationGate({super.key});
  @override
  State<LocationGate> createState() => _LocationGateState();
}

class _LocationGateState extends State<LocationGate> {
  String _state = 'ask'; // ask | locating | denied | done
  Position? _pos;
  List _stations = [];
  String? _error;
  String _q = '';

  Future<void> _load() async {
    try {
      final qs = _pos == null ? '' : '?lat=${_pos!.latitude}&lng=${_pos!.longitude}';
      final s = await Api.instance.get('/stations$qs') as List;
      if (mounted) setState(() { _stations = s; _error = null; });
    } on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
  }

  /// Free, on-device GPS via the OS location service. No paid maps or geocoding API is called.
  Future<void> _locate() async {
    setState(() => _state = 'locating');
    try {
      if (!await Geolocator.isLocationServiceEnabled()) throw 'off';
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) throw 'denied';
      _pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 10)));
      setState(() => _state = 'done');
    } catch (_) {
      setState(() => _state = 'denied');
    }
    _load();
  }

  Future<void> _manual() async { setState(() => _state = 'denied'); _load(); }

  @override
  Widget build(BuildContext context) {
    final list = _stations.where((s) => _q.isEmpty || '${s['name']} ${s['address']} ${s['district']}'.toLowerCase().contains(_q.toLowerCase())).toList();
    return ListView(padding: const EdgeInsets.all(20), children: [
      const Text('STEP 1', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Brand.inkMuted)),
      Text('Choose a station', style: display(32)),
      const SizedBox(height: 16),
      if (_state == 'ask') Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 52, height: 52, decoration: const BoxDecoration(color: Brand.surfaceSunk, shape: BoxShape.circle), child: const Icon(Icons.location_on_outlined, color: Brand.cherry, size: 28)),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Find your nearest Sadhai counter', style: display(18)),
            const Text('We use your phone’s location only to sort stations by distance. It is not stored.', style: TextStyle(color: Brand.inkMuted, fontSize: 14)),
          ])),
        ]),
        const SizedBox(height: 16),
        FilledButton.icon(onPressed: _locate, icon: const Icon(Icons.near_me_outlined), label: const Text('Use my location')),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: _manual, child: const Text('Choose a station myself')),
      ]))),
      if (_state == 'locating') const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
      if (_state == 'denied') Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
        const Expanded(child: Text('Location is off, so here is every station.', style: TextStyle(color: Brand.inkMuted))),
        TextButton(onPressed: _locate, child: const Text('Try again')),
      ])),
      if (_state == 'done' || _state == 'denied') ...[
        if (_stations.isNotEmpty) _StationMap(stations: _stations, me: _pos),
        const SizedBox(height: 12),
        TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search by area or station name'), onChanged: (v) => setState(() => _q = v)),
        const SizedBox(height: 12),
        if (_error != null) Text(_error!, style: const TextStyle(color: Brand.cherry)),
        for (final (i, s) in list.indexed) Padding(padding: const EdgeInsets.only(bottom: 10), child: _StationTile(s: s, nearest: _pos != null && i == 0 && _q.isEmpty)),
        const Text('Prices in NPR. VAT and service included.', style: TextStyle(color: Brand.inkMuted, fontSize: 13)),
      ],
    ]);
  }
}

class _StationMap extends StatelessWidget {
  const _StationMap({required this.stations, this.me});
  final List stations;
  final Position? me;
  @override
  Widget build(BuildContext context) {
    final pts = [for (final s in stations) if (s['lat'] != null) LatLng((s['lat'] as num).toDouble(), (s['lng'] as num).toDouble())];
    final center = me != null ? LatLng(me!.latitude, me!.longitude) : pts.isNotEmpty ? pts.first : const LatLng(27.7, 85.32);
    return ClipRRect(
      borderRadius: BorderRadius.circular(Brand.radiusLg),
      child: SizedBox(height: 190, child: FlutterMap(
        options: MapOptions(initialCenter: center, initialZoom: me != null ? 13 : 11.5, interactionOptions: const InteractionOptions(flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag)),
        children: [
          // OpenStreetMap tiles: free, no API key. Keep the attribution visible.
          TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.sadhai.sadhai_coffee'),
          MarkerLayer(markers: [
            for (final p in pts) Marker(point: p, width: 36, height: 36, child: const Icon(Icons.location_on, color: Brand.cherry, size: 36)),
            if (me != null) Marker(point: LatLng(me!.latitude, me!.longitude), width: 20, height: 20, child: Container(decoration: BoxDecoration(color: const Color(0xFF1B5EBE), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)))),
          ]),
          const RichAttributionWidget(attributions: [TextSourceAttribution('© OpenStreetMap contributors')]),
        ],
      )),
    );
  }
}

class _StationTile extends StatelessWidget {
  const _StationTile({required this.s, required this.nearest});
  final Map s;
  final bool nearest;
  @override
  Widget build(BuildContext context) {
    final open = s['open_now'] == true;
    final can = s['can_order'] != false;
    final km = s['distance_km'];
    return Opacity(opacity: can ? 1 : 0.55, child: Card(child: InkWell(
      borderRadius: BorderRadius.circular(Brand.radiusLg),
      onTap: !can ? null : () => context.read<CartState>().setStation({'id': s['id'], 'name': s['name'], 'name_ne': s['name_ne'], 'address': s['address'], 'open_now': open}),
      child: Padding(padding: const EdgeInsets.all(14), child: Row(children: [
        Container(width: 44, height: 44, decoration: const BoxDecoration(color: Brand.surfaceSunk, shape: BoxShape.circle), child: const Icon(Icons.location_on_outlined, color: Brand.cherry)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text(s['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            if (nearest) const Chip2('Nearest', bg: Brand.hill, fg: Brand.onCherry),
            if (s['operator_type'] == 'partner') const Chip2('Partner cafe'),
          ]),
          Text('${s['address']} · ${(s['opens'] as String).substring(0, 5)}–${(s['closes'] as String).substring(0, 5)}', style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
          Text('${km != null ? '$km km · about ${((km as num) * 12).round().clamp(1, 999)} min walk · ' : ''}${!can ? (open ? 'Not taking orders for a moment' : 'Closed · opens ${(s['opens'] as String).substring(0, 5)}') : 'Wait ~${s['wait_minutes']} min'}', style: const TextStyle(fontSize: 13)),
        ])),
        Chip2(!can ? (open ? 'Paused' : 'Closed') : 'Open now', bg: can ? Brand.hill : Brand.surfaceSunk, fg: can ? Brand.onCherry : Brand.ink),
      ])),
    )));
  }
}

/* ----------------------------------------------------------- store front */

class StoreFront extends StatefulWidget {
  const StoreFront({super.key, required this.goTab});
  final void Function(int) goTab;
  @override
  State<StoreFront> createState() => _StoreFrontState();
}

class _StoreFrontState extends State<StoreFront> {
  Json? _home;
  List _coupons = [], _passes = [];
  int _unread = 0;
  String? _error;
  String _q = '';
  String _cat = 'all';
  final _search = TextEditingController();
  final _dealsKey = GlobalKey(), _merchKey = GlobalKey(), _allKey = GlobalKey(), _heroKey = GlobalKey();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final id = context.read<CartState>().station!['id'];
    try {
      final h = await Api.instance.get('/stations/$id/home');
      if (mounted) { context.read<CartState>().ordersBlocked = h['station']['can_order'] == false; setState(() { _home = Map<String, dynamic>.from(h); _error = null; }); }
    } on ApiException catch (e) { if (mounted) setState(() => _error = e.message); }
    try {
      final c = await Api.instance.get('/coupons') as List;
      final p = await Api.instance.get('/passes') as List;
      final n = await Api.instance.get('/notifications');
      if (mounted) setState(() { _coupons = c.where((x) => x['status'] == 'active').toList(); _passes = p; _unread = n['unread'] ?? 0; });
    } catch (_) {}
  }

  void _jump(GlobalKey k) { final c = k.currentContext; if (c != null) Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 350), curve: Curves.easeOut); }

  List<Map> get _products => [for (final c in (_home!['categories'] as List)) ...(c['products'] as List).cast<Map>()];

  void _addNow(Map? p) {
    if (p == null) return;
    final l = CartLine.quick(p);
    if (l == null) { _openItem(p); return; }
    context.read<CartState>().add(l);
    toast(context, '${p['name']} added');
  }

  void _openItem(Map p) => showModalBottomSheet(context: context, isScrollControlled: true, backgroundColor: Brand.surfaceRaised, builder: (_) => ItemSheet(p: Map<String, dynamic>.from(p)));

  @override
  Widget build(BuildContext context) {
    if (_home == null) return Center(child: _error != null ? Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Text(_error!), const SizedBox(height: 12), OutlinedButton(onPressed: () => context.read<CartState>().setStation(null), child: const Text('Choose another station'))])) : const CircularProgressIndicator());
    final h = _home!;
    final st = h['station'] as Map;
    final cats = (h['categories'] as List).cast<Map>();
    final merch = cats.where((c) => c['name'] == 'Merch').firstOrNull;
    final shop = cats.where((c) => c['name'] != 'Merch').toList();
    final offers = (h['offers'] as List).cast<Map>();
    final drops = (h['drops'] as List).cast<Map>();
    final drop = drops.firstOrNull;
    final best = (h['best_sellers'] as List).cast<Map>();
    final firstCup = _coupons.cast<Map?>().firstWhere((c) => c!['kind'] == 'first_cup', orElse: () => null);
    final livePass = _passes.cast<Map?>().firstWhere((p) => p!['status'] == 'active', orElse: () => null);
    final results = _q.trim().isEmpty ? null : _products.where((p) => '${p['name']} ${p['name_ne'] ?? ''} ${p['description'] ?? ''} ${p['origin'] ?? ''}'.toLowerCase().contains(_q.trim().toLowerCase())).toList();
    final listed = _cat == 'all' ? [for (final c in shop) ...(c['products'] as List)] : (cats.firstWhere((c) => c['id'] == _cat, orElse: () => {'products': []})['products'] as List);

    // Hero: live drop > first offer of the day > brand line.
    final dropProduct = drop == null ? null : _products.cast<Map?>().firstWhere((p) => p!['id'] == drop['product_id'], orElse: () => null);
    final offerProduct = offers.isEmpty ? null : _products.cast<Map?>().firstWhere((p) => p!['id'] == offers.first['product_id'], orElse: () => null);
    final hero = drop != null
        ? (kicker: 'Drop · ${drop['partner'] ?? 'Limited'}', title: drop['name'] as String, sub: '${rs(drop['price'])} · ${NumberFormat.decimalPattern().format(drop['remaining'])} cups left', badge: '${drop['remaining']}', cta: 'Add to cart', act: () => _addNow(dropProduct))
        : offers.isNotEmpty
            ? (kicker: 'Offer of the day', title: offers.first['title'] as String, sub: (offers.first['blurb'] ?? '') as String, badge: offers.first['offer_price'] != null ? rs(offers.first['offer_price']) : '${offers.first['pct']}%', cta: offerProduct != null ? 'Add to cart' : 'See the menu', act: () => offerProduct != null ? _addNow(offerProduct) : _jump(_allKey))
            : (kicker: 'Sadhai Coffee', title: 'Good coffee, every day.', sub: 'Grown in the hills. Ready in 90 seconds.', badge: '90s', cta: 'Order ahead', act: () => _jump(_allKey));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 130), children: [
        // location + bell
        Row(children: [
          Expanded(child: InkWell(
            onTap: () => context.read<CartState>().setStation(null),
            child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [
              const Icon(Icons.location_on, color: Brand.cherry),
              const SizedBox(width: 8),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${st['open_now'] == true ? 'OPEN NOW' : 'CLOSED'} · CHANGE', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1, color: Brand.inkMuted)),
                Text(st['name'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              ])),
              const Icon(Icons.expand_more),
            ])),
          )),
          IconButton(tooltip: 'Inbox', onPressed: () => widget.goTab(4), icon: Badge(isLabelVisible: _unread > 0, label: Text('$_unread'), child: const Icon(Icons.notifications_none))),
        ]),
        if (st['can_order'] == false) Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Brand.surfaceSunk, borderRadius: BorderRadius.circular(Brand.radiusMd), border: Border.all(color: Brand.cherry)), child: Row(children: [
          Expanded(child: Text(st['open_now'] == true ? 'This station is not taking orders for a moment. You can look at the menu, but not order here.' : 'This station is closed right now. It opens at ${(st['opens'] as String).substring(0, 5)}. You can look at the menu, but not order here.', style: const TextStyle(fontWeight: FontWeight.w600))),
          TextButton(onPressed: () => context.read<CartState>().setStation(null), child: const Text('Change')),
        ])),
        const SizedBox(height: 8),
        TextField(decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Search coffee, bites, merch', suffixIcon: _q.isEmpty ? null : IconButton(tooltip: 'Clear', icon: const Icon(Icons.close), onPressed: () { _search.clear(); setState(() => _q = ''); }), contentPadding: const EdgeInsets.symmetric(vertical: 12), border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: Brand.inkMuted, width: 1.5)), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: Brand.inkMuted, width: 1.5))),
            controller: _search, onChanged: (v) => setState(() => _q = v)),
        const SizedBox(height: 12),

        if (results != null) ...[
          Text('${results.length} result${results.length == 1 ? '' : 's'}', style: display(20)),
          const SizedBox(height: 8),
          if (results.isEmpty) Text('Nothing matches “$_q”.', style: const TextStyle(color: Brand.inkMuted)),
          Card(child: Column(children: [for (final p in results) ProductRow(p: p)])),
        ] else ...[
          // offers on rounded icons
          SizedBox(height: 108, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.only(top: 10, right: 8), children: [
            _Circle(icon: Icons.local_offer_outlined, label: 'Today', style: _CircleStyle.gold, pip: offers.isEmpty ? null : '${offers.length}', onTap: () => _jump(_dealsKey)),
            if (firstCup != null) _Circle(icon: Icons.coffee_outlined, label: 'Free first cup', style: _CircleStyle.hot, onTap: () => widget.goTab(1)),
            if (drop != null) _Circle(icon: Icons.local_fire_department_outlined, label: 'Drop', style: _CircleStyle.hot, onTap: () => _jump(_heroKey)),
            _Circle(icon: Icons.confirmation_number_outlined, label: livePass != null ? 'My pass' : '10-cup pass', pip: livePass != null ? '${livePass['remaining']}' : null, onTap: () => widget.goTab(1)),
            _Circle(icon: Icons.sell_outlined, label: 'Promo code', onTap: () => widget.goTab(1)),
            _Circle(icon: Icons.card_giftcard, label: 'Give a cup', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReferralScreen()))),
            if (merch != null) _Circle(icon: Icons.shopping_bag_outlined, label: 'Merch', onTap: () => _jump(_merchKey)),
          ])),

          // hero
          Container(
            key: _heroKey, margin: const EdgeInsets.only(top: 4), padding: const EdgeInsets.all(22), clipBehavior: Clip.antiAlias, constraints: const BoxConstraints(minHeight: 170),
            decoration: BoxDecoration(color: Brand.cherry, borderRadius: BorderRadius.circular(Brand.radiusLg), boxShadow: const [BoxShadow(color: Color(0x24000000), blurRadius: 24, offset: Offset(0, 8))]),
            child: Stack(children: [
              Positioned(left: 0, right: 0, bottom: -26, child: Opacity(opacity: 0.22, child: ColorFiltered(colorFilter: const ColorFilter.mode(Brand.surface, BlendMode.srcATop), child: const HillsScene(height: 120, sun: false)))),
              Positioned(right: -44, top: -44, child: Container(width: 130, height: 130, decoration: const BoxDecoration(color: Brand.marigold, shape: BoxShape.circle), alignment: const Alignment(-0.2, 0.35), child: Text(hero.badge, style: display(22, color: Brand.ink)))),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const SizedBox(height: 56),
                Text(hero.kicker.toUpperCase(), style: const TextStyle(color: Brand.onCherry, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
                const SizedBox(height: 4),
                Text(hero.title, style: display(28, color: Brand.onCherry)),
                if (hero.sub.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(hero.sub, style: const TextStyle(color: Brand.onCherry))),
                const SizedBox(height: 12),
                FilledButton(style: FilledButton.styleFrom(backgroundColor: Brand.surface, foregroundColor: Brand.ink), onPressed: hero.act, child: Text(hero.cta)),
              ]),
            ]),
          ),

          // best sellers
          if (best.isNotEmpty) ...[
            _Head('Best sellers', 'This month here'),
            SizedBox(height: 236, child: ListView(scrollDirection: Axis.horizontal, children: [for (final p in best) ProductCard(p: p)])),
          ],

          // square categories
          _Head('Categories'),
          GridView.count(crossAxisCount: 3, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisSpacing: 10, mainAxisSpacing: 10, children: [
            for (final c in cats) _CatBox(
              c: c, on: _cat == c['id'],
              onTap: () { if (c['name'] == 'Merch') { _jump(_merchKey); } else { setState(() => _cat = _cat == c['id'] ? 'all' : c['id']); WidgetsBinding.instance.addPostFrameCallback((_) => _jump(_allKey)); } },
            ),
          ]),

          // offer of the day
          _Head('Offer of the day', offers.isEmpty ? null : 'Set by your station', _dealsKey),
          if (offers.isEmpty) const Text('No special offer today.', style: TextStyle(color: Brand.inkMuted)),
          for (final o in offers) Padding(padding: const EdgeInsets.only(bottom: 10), child: DealCard(o: o, products: _products, onAdd: _addNow, onSee: () { if (o['category_id'] != null) setState(() => _cat = o['category_id']); _jump(_allKey); })),

          // merch
          if (merch != null) ...[
            _Head('Merch', 'Take Sadhai home', _merchKey),
            SizedBox(height: 236, child: ListView(scrollDirection: Axis.horizontal, children: [for (final p in (merch['products'] as List)) ProductCard(p: p)])),
          ],

          // all products
          _Head('Food and beverage', 'VAT and service included', _allKey),
          SizedBox(height: 44, child: ListView(scrollDirection: Axis.horizontal, children: [
            Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: const Text('All'), selected: _cat == 'all', selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: _cat == 'all' ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) => setState(() => _cat = 'all'))),
            for (final c in shop) Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(c['name']), selected: _cat == c['id'], selectedColor: Brand.cherry, showCheckmark: false, labelStyle: TextStyle(color: _cat == c['id'] ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600), onSelected: (_) => setState(() => _cat = c['id']))),
          ])),
          const SizedBox(height: 8),
          Card(child: Column(children: [for (final p in listed) ProductRow(p: p)])),
          if (st['operator_type'] == 'partner') Padding(padding: const EdgeInsets.only(top: 16), child: Center(child: Text('Served at ${st['partner_name']}, a Sadhai partner cafe.', style: const TextStyle(color: Brand.inkMuted, fontSize: 13)))),
        ],
      ]),
    );
  }
}

class _Head extends StatelessWidget {
  const _Head(this.title, [this.sub, Key? key]) : super(key: key);
  final String title;
  final String? sub;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 22, bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(title, style: display(22)),
        const SizedBox(width: 8),
        if (sub != null)
          Expanded(
            child: Text(
              sub!,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Brand.inkMuted, fontSize: 13),
            ),
          ),
      ],
    ),
  );
}

enum _CircleStyle { plain, hot, gold }

class _Circle extends StatelessWidget {
  const _Circle({required this.icon, required this.label, required this.onTap, this.style = _CircleStyle.plain, this.pip});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final _CircleStyle style;
  final String? pip;
  @override
  Widget build(BuildContext context) {
    final bg = switch (style) { _CircleStyle.hot => Brand.cherry, _CircleStyle.gold => Brand.marigold, _ => Brand.surfaceRaised };
    final fg = switch (style) { _CircleStyle.hot => Brand.onCherry, _CircleStyle.gold => Brand.ink, _ => Brand.cherry };
    return Padding(padding: const EdgeInsets.only(right: 14), child: InkWell(
      onTap: onTap, borderRadius: BorderRadius.circular(40),
      child: SizedBox(width: 72, child: Column(children: [
        Stack(clipBehavior: Clip.none, children: [
          Container(width: 62, height: 62, decoration: BoxDecoration(color: bg, shape: BoxShape.circle, border: Border.all(color: style == _CircleStyle.plain ? Brand.hairline : bg, width: 2)), child: Icon(icon, color: fg, size: 28)),
          if (pip != null) Positioned(right: -4, top: -4, child: Container(constraints: const BoxConstraints(minWidth: 20), height: 20, padding: const EdgeInsets.symmetric(horizontal: 5), alignment: Alignment.center, decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(10)), child: Text(pip!, style: const TextStyle(color: Brand.surface, fontSize: 11, fontWeight: FontWeight.w700)))),
        ]),
        const SizedBox(height: 6),
        Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 1.15)),
      ])),
    ));
  }
}

class _CatBox extends StatelessWidget {
  const _CatBox({required this.c, required this.on, required this.onTap});
  final Map c;
  final bool on;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final icon = switch (c['name']) { 'Merch' => Icons.shopping_bag_outlined, 'Bites' => Icons.bakery_dining_outlined, 'Signature' => Icons.star_outline, 'Cold coffee' => Icons.water_drop_outlined, _ => Icons.local_cafe_outlined };
    final fg = on ? Brand.onCherry : Brand.ink;
    return Material(
      color: on ? Brand.cherry : Brand.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusLg), side: BorderSide(color: on ? Brand.cherry : Brand.hairline, width: 2)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Brand.radiusLg), onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Icon(icon, color: on ? Brand.onCherry : Brand.cherry, size: 28),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(c['name'], style: display(16, color: fg)),
            Text('${(c['products'] as List).length} items', style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 12)),
          ]),
        ])),
      ),
    );
  }
}

/* -------------------------------------------------------------- products */


class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.p});
  final Map p;
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final ok = p['available'] == true;
    final n = cart.qtyOf(p['id']);
    final merch = p['kind'] == 'merch';
    void open() => showModalBottomSheet(context: context, isScrollControlled: true, backgroundColor: Brand.surfaceRaised, builder: (_) => ItemSheet(p: Map<String, dynamic>.from(p)));
    return Opacity(opacity: ok ? 1 : 0.55, child: Container(
      width: 158, margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(color: Brand.surfaceRaised, borderRadius: BorderRadius.circular(Brand.radiusLg), border: Border.all(color: Brand.hairline)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(onTap: ok ? open : null, child: Container(height: 104, color: merch ? Brand.surfaceSunk : p['is_signature'] == true ? const Color(0xFFD9E5DC) : Brand.surfaceSunk, alignment: Alignment.center, child: Stack(children: [
          Center(child: Padding(padding: const EdgeInsets.all(8), child: ProductArt(p, size: 88))),
          if (p['offer'] != null) const Positioned(left: 8, top: 8, child: Chip2('Today', bg: Brand.marigold)),
          if (p['drop'] != null) Positioned(left: 8, top: 8, child: Chip2('${p['drop']['remaining']} left', bg: Brand.marigold)),
        ]))),
        Padding(padding: const EdgeInsets.fromLTRB(10, 8, 10, 10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p['name'], maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, height: 1.15)),
          Row(children: [Text(rs(p['price']), style: const TextStyle(fontWeight: FontWeight.w700)), if ((p['price'] as int) < (p['list_price'] as int)) Padding(padding: const EdgeInsets.only(left: 6), child: Text(rs(p['list_price']), style: const TextStyle(decoration: TextDecoration.lineThrough, color: Brand.inkMuted, fontSize: 12)))]),
          const SizedBox(height: 6),
          if (ok) SizedBox(width: double.infinity, height: 36, child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 36), backgroundColor: n > 0 ? Brand.hill : Brand.cherry, padding: EdgeInsets.zero),
            onPressed: () { final l = CartLine.quick(p); if (l == null) { open(); } else { context.read<CartState>().add(l); toast(context, '${p['name']} added'); } },
            icon: Icon(n > 0 ? Icons.check : Icons.add, size: 18), label: Text(n > 0 ? '$n in cart' : 'Add'),
          )) else const Chip2('Finished for today'),
        ])),
      ]),
    ));
  }
}

class ProductRow extends StatelessWidget {
  const ProductRow({super.key, required this.p});
  final Map p;
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final ok = p['available'] == true;
    final quick = ok ? CartLine.quick(p) : null;
    final here = cart.lines.where((l) => l.product['id'] == p['id']).toList();
    final stepLine = quick != null ? here.cast<CartLine?>().firstWhere((l) => l!.key == quick.key, orElse: () => null) : null;
    void open() => showModalBottomSheet(context: context, isScrollControlled: true, backgroundColor: Brand.surfaceRaised, builder: (_) => ItemSheet(p: Map<String, dynamic>.from(p)));
    return Opacity(opacity: ok ? 1 : 0.55, child: InkWell(onTap: ok ? open : null, child: Padding(padding: const EdgeInsets.all(14), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(width: 64, height: 64, margin: const EdgeInsets.only(right: 12), decoration: BoxDecoration(color: Brand.surfaceSunk, borderRadius: BorderRadius.circular(Brand.radiusMd)), padding: const EdgeInsets.all(4), child: ProductArt(p, size: 56)),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          if (p['offer'] != null) const Chip2('Today', bg: Brand.marigold),
          if (p['drop'] != null) Chip2('${p['drop']['remaining']} left', bg: Brand.marigold),
          if (p['is_signature'] == true && p['drop'] == null) const Chip2('Signature', bg: Brand.hill, fg: Brand.onCherry),
          if (p['origin'] != null) Chip2(p['origin']),
          if (!ok) const Chip2('Finished for today'),
        ]),
        if (p['description'] != null) Text(p['description'], style: const TextStyle(color: Brand.inkMuted, fontSize: 14)),
        Row(children: [Text(rs(p['price']), style: const TextStyle(fontWeight: FontWeight.w700)), if ((p['price'] as int) < (p['list_price'] as int)) Padding(padding: const EdgeInsets.only(left: 6), child: Text(rs(p['list_price']), style: const TextStyle(decoration: TextDecoration.lineThrough, color: Brand.inkMuted, fontSize: 13)))]),
      ])),
      const SizedBox(width: 8),
      if (ok) (stepLine != null
          ? Stepper2(qty: stepLine.qty, onChanged: (q) => context.read<CartState>().setQty(stepLine, q))
          : IconButton.filled(style: IconButton.styleFrom(backgroundColor: Brand.cherry, foregroundColor: Brand.onCherry), tooltip: 'Add ${p['name']}', icon: Icon(here.isEmpty ? Icons.add : Icons.check), onPressed: () { if (quick == null) { open(); } else { context.read<CartState>().add(quick); toast(context, '${p['name']} added'); } })),
    ]))));
  }
}

class Stepper2 extends StatelessWidget {
  const Stepper2({super.key, required this.qty, required this.onChanged});
  final int qty;
  final void Function(int) onChanged;
  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(border: Border.all(color: Brand.inkMuted, width: 1.5), borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(visualDensity: VisualDensity.compact, tooltip: qty == 1 ? 'Remove' : 'Fewer', icon: Icon(qty == 1 ? Icons.close : Icons.remove, size: 20), onPressed: () => onChanged(qty - 1)),
          Text('$qty', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          IconButton(visualDensity: VisualDensity.compact, tooltip: 'More', icon: const Icon(Icons.add, size: 20), onPressed: qty < 10 ? () => onChanged(qty + 1) : null),
        ]),
      );
}

class DealCard extends StatelessWidget {
  const DealCard({super.key, required this.o, required this.products, required this.onAdd, required this.onSee});
  final Map o;
  final List<Map> products;
  final void Function(Map?) onAdd;
  final VoidCallback onSee;
  @override
  Widget build(BuildContext context) {
    final p = products.cast<Map?>().firstWhere((x) => x!['id'] == o['product_id'], orElse: () => null);
    final ends = DateFormat('HH:mm').format(DateTime.parse(o['ends_at']).toLocal());
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Brand.surfaceRaised, borderRadius: BorderRadius.circular(Brand.radiusLg), border: Border.all(color: Brand.marigold, width: 2)),
      child: Row(children: [
        Container(width: 64, height: 64, decoration: BoxDecoration(color: Brand.marigold, borderRadius: BorderRadius.circular(Brand.radiusMd)), alignment: Alignment.center,
            child: o['offer_price'] != null ? Text(rs(o['offer_price']), style: display(15, color: Brand.ink)) : Column(mainAxisSize: MainAxisSize.min, children: [Text('${o['pct']}%', style: display(22, color: Brand.ink)), Text('OFF', style: display(11, color: Brand.ink))])),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(o['title'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          if (o['blurb'] != null) Text(o['blurb'], style: const TextStyle(color: Brand.inkMuted, fontSize: 13)),
          Text('Until $ends${o['remaining'] != null ? ' · ${o['remaining']} left' : ''}', style: const TextStyle(fontSize: 13)),
        ])),
        if (p != null && p['available'] == true) FilledButton(onPressed: () => onAdd(p), child: const Text('Add')) else if (o['scope'] != 'product') OutlinedButton(onPressed: onSee, child: const Text('See items')),
      ]),
    );
  }
}

class ItemSheet extends StatefulWidget {
  const ItemSheet({super.key, required this.p});
  final Json p;
  @override
  State<ItemSheet> createState() => _ItemSheetState();
}

class _ItemSheetState extends State<ItemSheet> {
  late final Map<String, Set<String>> _sel = {
    for (final g in widget.p['option_groups']) g['id']: {for (final o in g['options']) if (o['is_default'] == true) o['id'] as String},
  };
  int _qty = 1;
  List<Map> get _chosen => [for (final g in widget.p['option_groups']) for (final o in g['options']) if (_sel[g['id']]!.contains(o['id'])) o as Map];
  int get _unit => (widget.p['price'] as int) + _chosen.fold(0, (a, o) => a + (o['price_delta'] as int));
  bool get _missing => (widget.p['option_groups'] as List).any((g) => g['required'] == true && _sel[g['id']]!.isEmpty);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(widget.p['name'], style: display(26)),
        if (widget.p['description'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(widget.p['description'], style: const TextStyle(color: Brand.inkMuted))),
        if (widget.p['offer'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Chip2(widget.p['offer']['title'], bg: Brand.marigold)),
        for (final g in widget.p['option_groups']) ...[
          const SizedBox(height: 16),
          Text('${g['name']}${g['required'] == true ? ' · required' : ''}'.toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: Brand.inkMuted)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final o in g['options'])
              ChoiceChip(
                label: Text('${o['name']}${(o['price_delta'] as int) > 0 ? ' +${o['price_delta']}' : ''}'),
                selected: _sel[g['id']]!.contains(o['id']), selectedColor: Brand.cherry, showCheckmark: false,
                labelStyle: TextStyle(color: _sel[g['id']]!.contains(o['id']) ? Brand.onCherry : Brand.ink, fontWeight: FontWeight.w600),
                onSelected: (_) => setState(() {
                  final s = _sel[g['id']]!;
                  if (g['multi'] == true) { s.contains(o['id']) ? s.remove(o['id']) : s.add(o['id']); }
                  else if (g['required'] == true) { s..clear()..add(o['id']); }
                  else { final had = s.contains(o['id']); s.clear(); if (!had) s.add(o['id']); }
                }),
              ),
          ]),
        ],
        const SizedBox(height: 20),
        Row(children: [
          Stepper2(qty: _qty, onChanged: (q) => setState(() => _qty = q.clamp(1, 10))),
          const SizedBox(width: 12),
          Expanded(child: FilledButton(
            onPressed: _missing ? null : () {
              context.read<CartState>().add(CartLine(product: {'id': widget.p['id'], 'name': widget.p['name'], 'kind': widget.p['kind']}, qty: _qty, optionIds: [for (final o in _chosen) o['id'] as String], optionNames: [for (final o in _chosen) o['name'] as String], unit: _unit));
              Navigator.pop(context);
              toast(context, '${widget.p['name']} added');
            },
            child: Text('Add to cart · ${rs(_unit * _qty)}'),
          )),
        ]),
      ])),
    );
  }
}
