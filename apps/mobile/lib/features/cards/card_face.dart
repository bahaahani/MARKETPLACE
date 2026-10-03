import 'package:flutter/material.dart';

import '../../core/theme/tokens.g.dart';

Color hexColor(String h) => Color(int.parse('FF${h.substring(1)}', radix: 16));

/// IMTIAZ card visual. With [panMasked]/[expiry] it shows an issued virtual card;
/// the number is always the masked form from the API (last 4 digits only).
class CardFace extends StatelessWidget {
  const CardFace({super.key, required this.gradient, required this.tier, this.panMasked, this.expiry, this.validThruLabel});
  final List<String> gradient;
  final String tier;
  final String? panMasked;
  final String? expiry;
  final String? validThruLabel;

  @override
  Widget build(BuildContext context) => AspectRatio(
        aspectRatio: 1.586,
        child: Container(
          padding: const EdgeInsets.all(SahelSpace.lg),
          decoration: BoxDecoration(gradient: LinearGradient(colors: [hexColor(gradient[0]), hexColor(gradient[1])])),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('IMTIAZ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, letterSpacing: 1)),
            if (panMasked != null)
              // Card numbers read left to right in every language.
              FittedBox(
                child: Text(
                  panMasked!,
                  key: const Key('masked-pan'),
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(color: Colors.white, fontSize: 20, letterSpacing: 2, fontFamily: 'monospace'),
                ),
              ),
            Row(children: [
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(tier.toUpperCase(), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    if (expiry != null) ...[
                      const SizedBox(width: SahelSpace.sm),
                      Text('${validThruLabel ?? ''} ', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                      Text(expiry!, textDirection: TextDirection.ltr, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    ],
                  ]),
                ),
              ),
              const CircleAvatar(radius: 12, backgroundColor: Color(0xFFEB001B)),
              Transform.translate(offset: const Offset(-8, 0), child: const CircleAvatar(radius: 12, backgroundColor: Color(0xE6F79E1B))),
            ]),
          ]),
        ),
      );
}
