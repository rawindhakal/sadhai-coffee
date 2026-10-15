import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show SnackBar, Text;
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'push.dart' show messengerKey;

class CartLine {
  CartLine({required this.product, required this.qty, required this.optionIds, required this.optionNames, required this.unit});
  final Json product; // minimal: id, name, kind
  int qty;
  final List<String> optionIds;
  final List<String> optionNames;
  int unit;
  String get key => '${product['id']}|${([...optionIds]..sort()).join(',')}';

  Json toJson() => {'product': product, 'qty': qty, 'optionIds': optionIds, 'optionNames': optionNames, 'unit': unit};
  static CartLine fromJson(Json j) => CartLine(
        product: Map<String, dynamic>.from(j['product']), qty: j['qty'], optionIds: List<String>.from(j['optionIds']),
        optionNames: List<String>.from(j['optionNames']), unit: j['unit']);

  /// One-tap line using each option group's default. Null when a required group has no default.
  static CartLine? quick(Map p) {
    final ids = <String>[], names = <String>[];
    var delta = 0;
    for (final g in (p['option_groups'] as List)) {
      final defs = (g['options'] as List).where((o) => o['is_default'] == true).toList();
      if (g['required'] == true && defs.isEmpty) return null;
      for (final o in defs) { ids.add(o['id']); names.add(o['name']); delta += o['price_delta'] as int; }
    }
    return CartLine(product: {'id': p['id'], 'name': p['name'], 'kind': p['kind']}, qty: 1, optionIds: ids, optionNames: names, unit: (p['price'] as int) + delta);
  }
}

class CartState extends ChangeNotifier {
  Json? station;
  final List<CartLine> lines = [];
  bool ready = false;

  int get count => lines.fold(0, (a, l) => a + l.qty);
  int get total => lines.fold(0, (a, l) => a + l.unit * l.qty);
  int qtyOf(String productId) => lines.where((l) => l.product['id'] == productId).fold(0, (a, l) => a + l.qty);

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    try {
      final raw = p.getString('cart.v2');
      if (raw != null) {
        final j = jsonDecode(raw) as Json;
        station = j['station'] == null ? null : Map<String, dynamic>.from(j['station']);
        lines..clear()..addAll((j['lines'] as List).map((l) => CartLine.fromJson(Map<String, dynamic>.from(l))));
      }
    } catch (_) {}
    ready = true;
    notifyListeners();
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('cart.v2', jsonEncode({'station': station, 'lines': lines.map((l) => l.toJson()).toList()}));
  }

  void _changed() { notifyListeners(); _save(); }

  void setStation(Json? s) {
    if (s?['id'] != station?['id']) lines.clear();
    station = s;
    _changed();
  }

  /// Set from the station home screen: a closed or paused station cannot take orders.
  bool ordersBlocked = false;

  void add(CartLine l) {
    if (ordersBlocked) { messengerKey.currentState?..hideCurrentSnackBar()..showSnackBar(const SnackBar(content: Text('This station is not taking orders right now. Choose another station to order.'))); return; }
    final i = lines.indexWhere((x) => x.key == l.key);
    if (i >= 0) { lines[i].qty = (lines[i].qty + l.qty).clamp(1, 10); lines[i].unit = l.unit; } else { lines.add(l); }
    _changed();
  }

  void setQty(CartLine l, int qty) {
    if (qty <= 0) { lines.remove(l); } else { l.qty = qty.clamp(1, 10); }
    _changed();
  }

  void clear() { lines.clear(); _changed(); }
  List<Json> get payloadItems => [for (final l in lines) {'product_id': l.product['id'], 'qty': l.qty, 'option_ids': l.optionIds}];
}
