import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';
import '../checkout/checkout_screen.dart';
import '../finance/finance_calculator.dart';

const _valuationFeeFils = 150000; // ⚠️ placeholder fee (same as web)

class PropertyDetailScreen extends ConsumerWidget {
  const PropertyDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(propertyProvider(id)),
        onRetry: () => ref.invalidate(propertyProvider(id)),
        data: (p) => ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              AssetArt(hue: p.accentHue, icon: Icons.home, height: 200),
              Padding(
                padding: const EdgeInsets.all(SahelSpace.md),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(context.loc(p.title), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                  Text(
                    [
                      context.loc(p.area),
                      if (p.bedrooms > 0) l.bedrooms('${p.bedrooms}'),
                      if (p.bathrooms > 0) l.bathrooms('${p.bathrooms}'),
                      l.sqm(context.number(p.sizeSqm)),
                    ].join(' · '),
                    style: const TextStyle(color: SahelColors.textMuted),
                  ),
                  Text(l.soldBy(context.loc(p.seller.name)), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
                  const SizedBox(height: SahelSpace.sm),
                  Text(p.forSale ? context.money(p.priceFils, decimals: 0) : l.perMonth(context.money(p.priceFils, decimals: 0)),
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  if (p.valued) ...[
                    const SizedBox(height: 6),
                    Pill('✓ ${l.valuedByTresco}', color: SahelColors.islamic, background: SahelColors.islamicSoft),
                  ],
                  if (p.forSale) ...[
                    const SizedBox(height: SahelSpace.md),
                    OutlinedButton(
                      onPressed: () => context.push(CheckoutScreen.link(
                        purpose: 'valuation_fee',
                        amountFils: _valuationFeeFils,
                        reference: p.id,
                        label: l.requestValuation,
                      )),
                      child: Text('${l.requestValuation} · ${context.money(_valuationFeeFils, decimals: 0)}'),
                    ),
                  ],
                ]),
              ),
            ]),
          ),
          if (p.forSale) ...[
            const SizedBox(height: SahelSpace.md),
            FinanceCalculator(productLine: 'home', assetPriceFils: p.priceFils),
          ],
        ]),
      ),
    );
  }
}
