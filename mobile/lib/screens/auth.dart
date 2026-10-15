import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../art.dart';
import '../version.dart';
import '../theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.onDone});
  final VoidCallback onDone;
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _register = false, _busy = false, _ne = false, _agree = false;
  String? _error;
  final _name = TextEditingController(), _phone = TextEditingController(), _pw = TextEditingController(), _ref = TextEditingController();

  Future<void> _submit() async {
    if (_register && !_agree) { setState(() => _error = 'Please agree to the Terms and Privacy policy to create an account.'); return; }
    setState(() { _busy = true; _error = null; });
    try {
      if (_register) {
        await Api.instance.register({'name': _name.text.trim(), 'phone': _phone.text.trim(), 'password': _pw.text, if (_ref.text.trim().isNotEmpty) 'referral_code': _ref.text.trim().toUpperCase(), 'lang': _ne ? 'ne' : 'en'});
      } else {
        await Api.instance.login(_phone.text.trim(), _pw.text);
      }
      widget.onDone();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          ClipRRect(borderRadius: BorderRadius.circular(Brand.radiusLg), child: Container(color: Brand.surfaceSunk, child: const HillsScene(height: 150))),
          const SizedBox(height: 20),
          Row(children: [
            const SadhaiLogo(size: 44),
            const Spacer(),
            TextButton(onPressed: () => setState(() => _ne = !_ne), child: Text(_ne ? 'English' : 'नेपाली')),
          ]),
          const SizedBox(height: 36),
          Text(_ne ? 'सधैं राम्रो कफी।' : 'Good coffee, every day.', style: display(40)),
          const SizedBox(height: 8),
          Text(_ne ? 'पहाडमा फलेको, ९० सेकेन्डमा तयार।' : 'Grown in the hills. Ready in 90 seconds.', style: const TextStyle(fontSize: 18, color: Brand.inkMuted)),
          const SizedBox(height: 28),
          if (_register) ...[
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name'), textCapitalization: TextCapitalization.words),
            const SizedBox(height: 12),
          ],
          TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Mobile number', hintText: '98XXXXXXXX'), keyboardType: TextInputType.phone),
          const SizedBox(height: 12),
          TextField(controller: _pw, decoration: const InputDecoration(labelText: 'Password'), obscureText: true, onSubmitted: (_) => _submit()),
          if (_register) ...[
            const SizedBox(height: 12),
            TextField(controller: _ref, decoration: const InputDecoration(labelText: 'Referral code (optional)'), textCapitalization: TextCapitalization.characters),
          ],
          if (_register) Padding(padding: const EdgeInsets.only(top: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Checkbox(value: _agree, activeColor: Brand.cherry, onChanged: (v) => setState(() => _agree = v ?? false)),
            Expanded(child: Padding(padding: const EdgeInsets.only(top: 12), child: Wrap(children: [
              const Text('I agree to the '),
              InkWell(onTap: () => launchUrl(Uri.parse('$webUrl/terms'), mode: LaunchMode.externalApplication), child: const Text('Terms of use', style: TextStyle(color: Brand.cherry, fontWeight: FontWeight.w600, decoration: TextDecoration.underline))),
              const Text(' and have read the '),
              InkWell(onTap: () => launchUrl(Uri.parse('$webUrl/privacy'), mode: LaunchMode.externalApplication), child: const Text('Privacy policy', style: TextStyle(color: Brand.cherry, fontWeight: FontWeight.w600, decoration: TextDecoration.underline))),
              const Text('.'),
            ]))),
          ])),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Brand.cherry, fontWeight: FontWeight.w600))),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'One moment…' : _register ? 'Create account' : 'Sign in')),
          const SizedBox(height: 8),
          TextButton(onPressed: () => setState(() { _register = !_register; _error = null; }), child: Text(_register ? 'I already have an account' : 'New here? Your first Americano is free')),
        ]),
      ),
    );
  }
}
