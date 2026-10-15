// Keep in sync with /VERSION and pubspec.yaml. scripts/release.mjs updates all three.
const appVersion = '1.4.0';
const appBuild = 5;

/// Where legal pages live. Override: --dart-define=WEB_URL=https://sadhai.example
const webUrl = String.fromEnvironment('WEB_URL', defaultValue: 'http://localhost:3000');

/// True when [a] is older than [b], comparing dotted numeric versions.
bool versionLess(String a, String b) {
  final x = a.split('.').map((e) => int.tryParse(e) ?? 0).toList();
  final y = b.split('.').map((e) => int.tryParse(e) ?? 0).toList();
  for (var i = 0; i < 3; i++) {
    final p = i < x.length ? x[i] : 0, q = i < y.length ? y[i] : 0;
    if (p != q) return p < q;
  }
  return false;
}
