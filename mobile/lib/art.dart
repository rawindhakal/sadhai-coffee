import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'api.dart' show apiBase;
import 'theme.dart';

const _bySku = {
  'ESP': 'espresso', 'AMR': 'cup-hot', 'CAP': 'cup-hot', 'LAT': 'latte', 'MOC': 'cup-hot', 'ICL': 'cup-iced', 'CLB': 'cup-iced', 'CHL': 'chiya', 'SCB': 'cup-iced-orange',
  'GPO': 'pourover', 'GUR': 'chiya', 'CRO': 'croissant', 'BUN': 'bun', 'MUG': 'mug', 'TOT': 'tote', 'BAG': 'bag', 'HAT': 'hat',
};

/// The one Sadhai logo: bean mark plus the lowercase wordmark. Used on sign-in and every app bar.
class SadhaiLogo extends StatelessWidget {
  const SadhaiLogo({super.key, this.size = 28, this.suffix});
  final double size;
  final String? suffix;
  @override
  Widget build(BuildContext context) => Semantics(label: 'Sadhai Coffee', child: ExcludeSemantics(child: Row(mainAxisSize: MainAxisSize.min, children: [
        SvgPicture.asset('assets/img/mark-cherry.svg', width: size, height: size),
        SizedBox(width: size * 0.3),
        Text('sadhai', style: display(size * 0.95, color: Brand.cherry)),
        if (suffix != null) Padding(padding: const EdgeInsets.only(left: 8), child: Text(suffix!, style: TextStyle(fontSize: size * 0.5, color: Brand.inkMuted))),
      ])));
}

String artFor(Map p) => 'assets/img/${_bySku[p['sku']] ?? (p['kind'] == 'merch' ? 'bag' : p['kind'] == 'food' ? 'croissant' : 'cup-hot')}.svg';

/// Product illustration with a semantic label so screen readers skip the decoration.
class ProductArt extends StatelessWidget {
  const ProductArt(this.p, {super.key, this.size = 72});
  final Map p;
  final double size;
  @override
  Widget build(BuildContext context) {
    final url = p['image_url'] as String?;
    final fallback = SvgPicture.asset(artFor(p), width: size, height: size, fit: BoxFit.contain, excludeFromSemantics: true);
    if (url == null || url.isEmpty) return fallback;
    final full = url.startsWith('http') ? url : (url.startsWith('/') ? '$apiBase$url' : '$apiBase/$url');
    final img = full.toLowerCase().endsWith('.svg')
        ? SvgPicture.network(full, width: size, height: size, fit: BoxFit.contain, excludeFromSemantics: true, placeholderBuilder: (_) => fallback)
        : ClipRRect(
            borderRadius: BorderRadius.circular(Brand.radiusMd),
            child: Image.network(full, width: size, height: size, fit: BoxFit.cover, excludeFromSemantics: true, errorBuilder: (_, _, _) => fallback),
          );
    return img;
  }
}

/// The brand hills as four layers that drift gently, used behind the sign-in and the home hero.
class HillsScene extends StatefulWidget {
  const HillsScene({super.key, this.height = 200, this.sun = true});
  final double height;
  final bool sun;
  @override
  State<HillsScene> createState() => _HillsSceneState();
}

class _HillsSceneState extends State<HillsScene> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 14))..repeat(reverse: true);
  @override
  void dispose() { _c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return ExcludeSemantics(child: SizedBox(height: widget.height, width: double.infinity, child: ClipRect(child: AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = reduce ? 0.5 : _c.value;
        Widget layer(String n, double depth) => Positioned(left: -40 + (t - 0.5) * depth * 36, right: -40 - (t - 0.5) * depth * 36, bottom: 0, child: SvgPicture.asset('assets/img/$n.svg', fit: BoxFit.fitWidth, alignment: Alignment.bottomCenter));
        return Stack(fit: StackFit.expand, children: [
          if (widget.sun) layer('hero-sun', 0.3), layer('hero-far', 0.6), layer('hero-mid', 1), layer('hero-near', 1.6),
        ]);
      },
    ))));
  }
}
