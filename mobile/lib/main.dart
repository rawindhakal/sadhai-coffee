import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api.dart';
import 'screens/auth.dart';
import 'screens/customer.dart';
import 'screens/manager.dart';
import 'screens/staff.dart';
import 'state.dart';
import 'theme.dart';
import 'version.dart';
import 'messenger.dart';
import 'package:url_launcher/url_launcher.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.instance.load();
  runApp(const SadhaiApp());
}

class SadhaiApp extends StatefulWidget {
  const SadhaiApp({super.key});
  @override
  State<SadhaiApp> createState() => _SadhaiAppState();
}

class _SadhaiAppState extends State<SadhaiApp> {
  final _nav = GlobalKey<NavigatorState>();
  late bool _signedIn = Api.instance.signedIn;

  @override
  void initState() {
    super.initState();
    Api.instance.onSignedOut = () => setState(() => _signedIn = false);
  }

  void _changed() {
    setState(() => _signedIn = Api.instance.signedIn);
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => CartState(),
      child: MaterialApp(
        title: 'Sadhai Coffee',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        navigatorKey: _nav,
        scaffoldMessengerKey: messengerKey,
        home: VersionGate(child: !_signedIn
            ? AuthScreen(onDone: _changed)
            : switch (Api.instance.user!['role']) {
                'station' => StaffHome(onSignOut: _changed),
                'manager' || 'owner' || 'partner' => ManagerHome(onSignOut: _changed),
                _ => CustomerHome(onSignOut: _changed),
              }),
      ),
    );
  }
}


/// Blocks the app with a clear message when the server says this version is too old to be safe or compatible.
class VersionGate extends StatefulWidget {
  const VersionGate({super.key, required this.child});
  final Widget child;
  @override
  State<VersionGate> createState() => _VersionGateState();
}

class _VersionGateState extends State<VersionGate> {
  bool _old = false;
  String? _storeUrl;
  @override
  void initState() { super.initState(); _check(); }
  Future<void> _check() async {
    try {
      final v = await Api.instance.request('GET', '/version', auth: false);
      final min = v['min_app_version'] as String? ?? '0.0.0';
      final urls = v['store_urls'] as Map? ?? {};
      if (mounted) setState(() { _old = versionLess(appVersion, min); _storeUrl = (Theme.of(context).platform == TargetPlatform.iOS ? urls['ios'] : urls['android']) as String?; });
    } catch (_) {/* offline: let the app open, calls will explain */}
  }
  @override
  Widget build(BuildContext context) {
    if (!_old) return widget.child;
    return Scaffold(body: SafeArea(child: Padding(padding: const EdgeInsets.all(32), child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.system_update, size: 56, color: Brand.cherry),
      const SizedBox(height: 16),
      Text('Please update Sadhai', style: display(28), textAlign: TextAlign.center),
      const SizedBox(height: 8),
      const Text('This version is too old to keep working properly. Update to keep ordering.', textAlign: TextAlign.center, style: TextStyle(color: Brand.inkMuted)),
      const SizedBox(height: 24),
      if (_storeUrl != null && _storeUrl!.isNotEmpty) FilledButton(onPressed: () => launchUrl(Uri.parse(_storeUrl!), mode: LaunchMode.externalApplication), child: const Text('Update now')),
    ]))));
  }
}
