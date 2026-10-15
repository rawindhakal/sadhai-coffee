import 'dart:async';
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'version.dart';

/// Push notifications through Firebase Cloud Messaging (Android and iOS; APNs sits behind FCM).
///
/// Firebase is configured with --dart-define values, so there are no config files to commit:
///   FIREBASE_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_SENDER_ID, FIREBASE_APP_ID_ANDROID, FIREBASE_APP_ID_IOS
/// When they are missing the app runs normally without push (order updates still arrive live while it is open).
/// Permission is asked only when the customer agrees, never at launch.
const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
const _senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
const _appIdAndroid = String.fromEnvironment('FIREBASE_APP_ID_ANDROID');
const _appIdIos = String.fromEnvironment('FIREBASE_APP_ID_IOS');

final messengerKey = GlobalKey<ScaffoldMessengerState>();

class PushService {
  PushService._();
  static bool _ready = false;
  static String? _token;
  static StreamSubscription? _refresh, _foreground;

  static bool get configured => !kIsWeb && _apiKey.isNotEmpty && _projectId.isNotEmpty && _senderId.isNotEmpty && (Platform.isIOS ? _appIdIos.isNotEmpty : _appIdAndroid.isNotEmpty);

  static Future<bool> _init() async {
    if (_ready) return true;
    if (!configured) return false;
    try {
      await Firebase.initializeApp(options: FirebaseOptions(
        apiKey: _apiKey, projectId: _projectId, messagingSenderId: _senderId,
        appId: Platform.isIOS ? _appIdIos : _appIdAndroid, iosBundleId: 'com.sadhai.coffee',
      ));
      _ready = true;
    } catch (e) { debugPrint('Push disabled: $e'); }
    return _ready;
  }

  static Future<bool> get wantsPush async => (await SharedPreferences.getInstance()).getBool('push.on') ?? false;
  static Future<bool> get alreadyAsked async => (await SharedPreferences.getInstance()).getBool('push.asked') ?? false;

  /// Ask the system for permission (the OS shows its own prompt) and register this phone with the API.
  static Future<bool> enable() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('push.asked', true);
    if (!await _init()) return false;
    final settings = await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
    if (settings.authorizationStatus == AuthorizationStatus.denied) { await p.setBool('push.on', false); return false; }
    await _register();
    _refresh ??= FirebaseMessaging.instance.onTokenRefresh.listen((t) => _send(t));
    _foreground ??= FirebaseMessaging.onMessage.listen((m) {
      final n = m.notification;
      if (n == null) return;
      messengerKey.currentState?..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text('${n.title ?? ''}${n.body != null ? ' · ${n.body}' : ''}'), behavior: SnackBarBehavior.floating));
    });
    await p.setBool('push.on', true);
    return true;
  }

  /// Called after sign-in: re-register quietly if the customer had already agreed on this phone.
  static Future<void> resume() async {
    if (await wantsPush) { try { await enable(); } catch (_) {} }
  }

  static Future<void> _register() async {
    final t = await FirebaseMessaging.instance.getToken();
    if (t != null) await _send(t);
  }

  static Future<void> _send(String token) async {
    _token = token;
    try { await Api.instance.post('/me/push-token', {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android', 'app_version': appVersion}); } catch (_) {}
  }

  /// Stop pushes to this phone (switch off, or signing out so the next person on a shared phone gets none of ours).
  static Future<void> disable({bool remember = true}) async {
    final p = await SharedPreferences.getInstance();
    if (remember) await p.setBool('push.on', false);
    try {
      final t = _token ?? (_ready ? await FirebaseMessaging.instance.getToken() : null);
      if (t != null) await Api.instance.request('DELETE', '/me/push-token', body: {'token': t});
      if (_ready) await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
    _token = null;
  }
}
