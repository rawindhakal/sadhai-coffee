import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Sadhai Coffee design tokens (from the brand design system).
class Brand {
  static const surface = Color(0xFFFBF4E8);
  static const surfaceRaised = Color(0xFFFFFBF4);
  static const surfaceSunk = Color(0xFFF1E4CE);
  static const ink = Color(0xFF2A1810);
  static const inkMuted = Color(0xFF6B5A4D);
  static const hairline = Color(0xFFD9C8AE);
  static const cherry = Color(0xFFA81F2A);
  static const cherryLight = Color(0x1FA81F2A);
  static const onCherry = Color(0xFFFFF8EE);
  static const hill = Color(0xFF2F5D46);
  static const marigold = Color(0xFFF2A81D);
  static const roast = Color(0xFF5A3322);
  static const radiusMd = 12.0;
  static const radiusLg = 20.0;
}

TextStyle display(double size, {Color color = Brand.ink}) => GoogleFonts.bricolageGrotesque(
    fontSize: size, fontWeight: FontWeight.w800, letterSpacing: -0.03 * size, height: 1.08, color: color);

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: Brand.cherry, brightness: Brightness.light).copyWith(
      primary: Brand.cherry, onPrimary: Brand.onCherry, surface: Brand.surface, onSurface: Brand.ink, secondary: Brand.hill,
    ),
    scaffoldBackgroundColor: Brand.surface,
  );
  final text = GoogleFonts.hindTextTheme(base.textTheme).apply(bodyColor: Brand.ink, displayColor: Brand.ink);
  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: Brand.surface, foregroundColor: Brand.ink, elevation: 0, scrolledUnderElevation: 0,
      titleTextStyle: display(22),
    ),
    cardTheme: CardThemeData(
      color: Brand.surfaceRaised, elevation: 0, margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusLg), side: const BorderSide(color: Brand.hairline)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.cherry, foregroundColor: Brand.onCherry, minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusMd)),
        textStyle: GoogleFonts.hind(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Brand.ink, minimumSize: const Size(48, 48), side: const BorderSide(color: Brand.inkMuted, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusMd)),
        textStyle: GoogleFonts.hind(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Brand.surfaceRaised,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(Brand.radiusMd), borderSide: const BorderSide(color: Brand.inkMuted, width: 1.5)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Brand.radiusMd), borderSide: const BorderSide(color: Brand.inkMuted, width: 1.5)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Brand.radiusMd), borderSide: const BorderSide(color: Color(0xFF1B5EBE), width: 2)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Brand.surfaceRaised, indicatorColor: Brand.cherry.withValues(alpha: 0.14),
      labelTextStyle: WidgetStatePropertyAll(GoogleFonts.hind(fontWeight: FontWeight.w600, fontSize: 12)),
    ),
    dividerColor: Brand.hairline,
  );
}

String rs(num n) {
  final s = n.round().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    final left = s.length - i;
    b.write(s[i]);
    if (left > 1 && (left - 1 == 3 || (left - 1 > 3 && (left - 1 - 3) % 2 == 0))) b.write(',');
  }
  return 'Rs $b';
}

class Chip2 extends StatelessWidget {
  const Chip2(this.label, {super.key, this.bg = Brand.surfaceSunk, this.fg = Brand.ink});
  final String label;
  final Color bg, fg;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
      );
  static Widget status(String s) {
    const m = {
      'awaiting_payment': ['Awaiting payment', Brand.marigold, Brand.ink],
      'placed': ['Received', Brand.surfaceSunk, Brand.ink],
      'preparing': ['Making', Brand.roast, Brand.surface],
      'ready': ['Ready', Brand.hill, Brand.onCherry],
      'picked_up': ['Picked up', Brand.surfaceSunk, Brand.ink],
      'cancelled': ['Cancelled', Brand.cherry, Brand.onCherry],
      'paid': ['Paid', Brand.hill, Brand.onCherry],
      'unpaid': ['Pay at counter', Brand.marigold, Brand.ink],
      'refunded': ['Refunded', Brand.cherry, Brand.onCherry],
    };
    final v = m[s] ?? [s, Brand.surfaceSunk, Brand.ink];
    return Chip2(v[0] as String, bg: v[1] as Color, fg: v[2] as Color);
  }
}
