import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

const _bySku = {
  'ESP': 'espresso', 'AMR': 'cup-hot', 'CAP': 'cup-hot', 'LAT': 'latte', 'MOC': 'cup-hot', 'ICL': 'cup-iced', 'CLB': 'cup-iced', 'CHL': 'chiya', 'SCB': 'cup-iced-orange',
  'GPO': 'pourover', 'GUR': 'chiya', 'CRO': 'croissant', 'BUN': 'bun', 'MUG': 'mug', 'TOT': 'tote', 'BAG': 'bag', 'HAT': 'hat',
};

String artFor(Map p) => 'assets/img/${_bySku[p['sku']] ?? (p['kind'] == 'merch' ? 'bag' : p['kind'] == 'food' ? 'croissant' : 'cup-hot')}.svg';

/// Product illustration with a semantic label so screen readers skip the decoration.
class ProductArt extends StatelessWidget {
  const ProductArt(this.p, {super.key, this.size = 72});
  final Map p;
  final double size;
  @override
  Widget build(BuildContext context) => SvgPicture.asset(artFor(p), width: size, height: size, fit: BoxFit.contain, excludeFromSemantics: true);
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
