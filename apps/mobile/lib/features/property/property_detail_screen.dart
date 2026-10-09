import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';
import '../checkout/checkout_screen.dart';
import '../checkout/payment_price.dart';
import '../finance/apply_button.dart';
import '../finance/finance_calculator.dart';

class PropertyDetailScreen extends ConsumerStatefulWidget {
  const PropertyDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<PropertyDetailScreen> createState() => _PropertyDetailScreenState();
}

class _PropertyDetailScreenState extends ConsumerState<PropertyDetailScreen> {
  /// Carried from the finance calculator, so "Apply for home finance" applies for what is shown.
  FinanceSelection? _selection;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final id = widget.id;
    final sel = _selection;
    return Scaffold(
      appBar: AppBar(actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(propertyProvider(id)),
        onRetry: () => ref.invalidate(propertyProvider(id)),
        data: (p) {
          // ⚠️ Placeholder TRESCO valuation fee, priced by the server (GET /payments/price), never by the app.
          final fee = p.forSale ? ref.watch(paymentPriceProvider((purpose: 'valuation_fee', reference: p.id))).value : null;
          return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
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
                      ApplyButton(
                        label: l.homeApplyFinance,
                        terms: sel == null
                            ? null
                            : (
                                productLine: 'home',
                                structure: sel.structure,
                                tenureMonths: sel.tenureMonths,
                                vehicleId: null,
                                propertyId: p.id,
                                downPaymentFils: sel.downPaymentFils,
                                amountFils: null,
                                requestId: null,
                                bidId: null,
                                useTradeIn: false,
                              ),
                      ),
                    ],
                    if (p.type != 'land') ...[
                      const SizedBox(height: SahelSpace.md),
                      OutlinedButton.icon(
                        key: const Key('insure-home'),
                        onPressed: () => context.push(Uri(path: '/insurance/home', queryParameters: {'propertyId': p.id}).toString()),
                        icon: const Icon(Icons.shield_outlined),
                        label: Text(l.insInsureThisHome),
                      ),
                    ],
                    if (p.forSale) ...[
                      const SizedBox(height: SahelSpace.md),
                      OutlinedButton(
                        key: const Key('request-valuation'),
                        onPressed: fee == null
                            ? null
                            : () => context.push(CheckoutScreen.link(
                                  purpose: 'valuation_fee',
                                  amountFils: fee.amountFils,
                                  reference: p.id,
                                  label: l.requestValuation,
                                )),
                        child: Text('${l.requestValuation} · ${fee == null ? '…' : context.money(fee.amountFils, decimals: 0)}'),
                      ),
                    ],
                  ]),
                ),
              ]),
            ),
            if (p.forSale) ...[
              const SizedBox(height: SahelSpace.md),
              FinanceCalculator(
                productLine: 'home',
                assetPriceFils: p.priceFils,
                onChanged: (s) => setState(() => _selection = s),
              ),
            ],
          ]);
        },
      ),
    );
  }
}
