import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../core/theme/tokens.g.dart';
import 'common.dart';

/// Placeholder artwork until listing photos are integrated.
class AssetArt extends StatelessWidget {
  const AssetArt({super.key, required this.hue, required this.icon, this.height = 150});
  final int hue;
  final IconData icon;
  final double height;

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [
            HSLColor.fromAHSL(1, hue.toDouble(), 0.55, 0.92).toColor(),
            HSLColor.fromAHSL(1, hue.toDouble(), 0.45, 0.80).toColor(),
          ]),
        ),
        child: Center(child: Icon(icon, size: height * 0.45, color: HSLColor.fromAHSL(1, hue.toDouble(), 0.45, 0.32).toColor())),
      );
}

class VehicleTile extends StatelessWidget {
  const VehicleTile(this.v, {super.key, this.compact = false});

  /// Compact layout for horizontal carousels (fixed height).
  final bool compact;
  final Vehicle v;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      key: Key('vehicle-${v.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/cars/${v.id}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AssetArt(hue: v.accentHue, icon: Icons.directions_car, height: compact ? 110 : 150),
          Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              PillRow(compact: compact, [
                Pill(v.isNew ? l.conditionNew : l.conditionUsed),
                if (v.inspected) Pill('✓ ${l.inspected}', color: SahelColors.islamic, background: SahelColors.islamicSoft),
              ]),
              const SizedBox(height: 6),
              Text('${v.title} ${v.trim} · ${v.year}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(
                [if (!v.isNew) l.km(context.number(v.mileageKm)), context.money(v.priceFils, decimals: 0)].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: SahelColors.textMuted),
              ),
              const SizedBox(height: 4),
              Text(l.fromPerMonth(context.money(v.fromMonthlyFils, decimals: 0)),
                  style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.bold, fontSize: 18)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class PropertyTile extends StatelessWidget {
  const PropertyTile(this.p, {super.key, this.compact = false});

  /// Compact layout for horizontal carousels (fixed height).
  final bool compact;
  final Property p;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      key: Key('property-${p.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/property/${p.id}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AssetArt(hue: p.accentHue, icon: Icons.home, height: compact ? 110 : 150),
          Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              PillRow(compact: compact, [
                Pill(p.forSale ? l.propertyForSale : l.propertyForRent),
                if (p.valued) Pill('✓ ${l.valuedByTresco}', color: SahelColors.islamic, background: SahelColors.islamicSoft),
              ]),
              const SizedBox(height: 6),
              Text(context.loc(p.title), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(
                [
                  context.loc(p.area),
                  if (p.bedrooms > 0) l.bedrooms('${p.bedrooms}'),
                  l.sqm(context.number(p.sizeSqm)),
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: SahelColors.textMuted),
              ),
              const SizedBox(height: 4),
              Text(
                p.forSale
                    ? l.fromPerMonth(context.money(p.fromMonthlyFils, decimals: 0))
                    : l.perMonth(context.money(p.priceFils, decimals: 0)),
                style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.bold, fontSize: 18),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
