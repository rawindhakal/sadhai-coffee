import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Override at build time: flutter run --dart-define=API_URL=https://api.sadhai.example
const _envUrl = String.fromEnvironment('API_URL');
String get apiBase {
  if (_envUrl.isNotEmpty) return _envUrl;
  if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:4747'; // Android emulator -> host machine
  return 'http://localhost:4747';
}

class ApiException implements Exception {
  ApiException(this.message, this.status, [this.code]);
  final String message;
  final int status;
  final String? code;
  @override
  String toString() => message;
}

typedef Json = Map<String, dynamic>;

class Api {
  Api._();
  static final Api instance = Api._();
  String? _access, _refresh;
  Json? user;
  void Function()? onSignedOut;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _access = p.getString('access');
    _refresh = p.getString('refresh');
    final u = p.getString('user');
    user = u == null ? null : jsonDecode(u) as Json;
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    if (_access == null) {
      await p.remove('access'); await p.remove('refresh'); await p.remove('user');
    } else {
      await p.setString('access', _access!); await p.setString('refresh', _refresh!); await p.setString('user', jsonEncode(user));
    }
  }

  bool get signedIn => _access != null && user != null;
  String? get accessToken => _access;

  Future<Json> _session(Json j) async {
    _access = j['access_token']; _refresh = j['refresh_token']; user = Map<String, dynamic>.from(j['user']);
    await _save();
    return user!;
  }

  Future<Json> login(String phone, String password) async =>
      _session(await request('POST', '/auth/login', body: {'phone': phone, 'password': password}, auth: false));
  Future<Json> register(Json body) async => _session(await request('POST', '/auth/register', body: body, auth: false));

  Future<void> logout() async {
    final r = _refresh;
    if (r != null) { try { await request('POST', '/auth/logout', body: {'refresh_token': r}, auth: false); } catch (_) {} }
    _access = null; _refresh = null; user = null;
    await _save();
  }

  Future<bool> _refreshTokens() async {
    if (_refresh == null) return false;
    try {
      final r = await http.post(Uri.parse('$apiBase/auth/refresh'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refresh_token': _refresh}));
      if (r.statusCode != 200) return false;
      await _session(jsonDecode(r.body));
      return true;
    } catch (_) { return false; }
  }

  Future<dynamic> request(String method, String path, {Object? body, bool auth = true, bool retry = true}) async {
    final headers = {'Content-Type': 'application/json', if (auth && _access != null) 'Authorization': 'Bearer $_access'};
    http.Response r;
    try {
      final uri = Uri.parse('$apiBase$path');
      final enc = body == null ? null : jsonEncode(body);
      r = await switch (method) {
        'POST' => http.post(uri, headers: headers, body: enc),
        'PATCH' => http.patch(uri, headers: headers, body: enc),
        'PUT' => http.put(uri, headers: headers, body: enc),
        _ => http.get(uri, headers: headers),
      }.timeout(const Duration(seconds: 20));
    } catch (_) {
      throw ApiException('Cannot reach the server. Check your connection.', 0);
    }
    if (r.statusCode == 401 && auth && retry && await _refreshTokens()) return request(method, path, body: body, auth: auth, retry: false);
    dynamic j;
    try { j = jsonDecode(r.body); } catch (_) { j = null; }
    if (r.statusCode >= 400) {
      if (r.statusCode == 401 && auth) { _access = null; user = null; await _save(); onSignedOut?.call(); }
      throw ApiException((j is Map ? j['error'] : null) ?? 'Something went wrong', r.statusCode, j is Map ? j['code'] : null);
    }
    return j;
  }

  Future<dynamic> get(String p) => request('GET', p);
  Future<dynamic> post(String p, [Object? b]) => request('POST', p, body: b ?? {});
  Future<dynamic> patch(String p, Object b) => request('PATCH', p, body: b);

  /// Server-sent events: yields (event, data) pairs and reconnects until cancelled.
  Stream<(String, dynamic)> events() async* {
    while (true) {
      final client = http.Client();
      try {
        final req = http.Request('GET', Uri.parse('$apiBase/events?access_token=${Uri.encodeQueryComponent(_access ?? '')}'));
        req.headers['Accept'] = 'text/event-stream';
        final res = await client.send(req);
        String event = 'message';
        await for (final line in res.stream.transform(utf8.decoder).transform(const LineSplitter())) {
          if (line.startsWith('event:')) { event = line.substring(6).trim(); }
          else if (line.startsWith('data:')) {
            try { yield (event, jsonDecode(line.substring(5).trim())); } catch (_) {}
          }
        }
      } catch (_) {
        // fall through to retry
      } finally { client.close(); }
      await Future.delayed(const Duration(seconds: 3));
      if (_access == null) return;
    }
  }
}
