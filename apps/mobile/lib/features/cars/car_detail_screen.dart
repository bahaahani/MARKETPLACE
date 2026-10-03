import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';
import '../checkout/checkout_screen.dart';
import '../finance/apply_button.dart';
import '../finance/finance_calculator.dart';
import '../insurance/insurance_quotes.dart';

class CarDetailScreen extends ConsumerStatefulWidget {
  const CarDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<CarDetailScreen> createState() => _CarDetailScreenState();
}

class _CarDetailScreenState extends ConsumerState<CarDetailScreen> {
  /// Carried from the finance calculator, so "Apply for finance" applies for what is shown.
  FinanceSelection? _selection;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final id = widget.id;
    final car = ref.watch(vehicleProvider(id));
    final sel = _selection;
    // Reservation deposit from GET /config (same value as the web).
    final deposit = ref.watch(configProvider).value?.reservationDepositFils;
    return Scaffold(
      appBar: AppBar(actions: const [LanguageButton()]),
      body: AsyncView(
        value: car,
        onRetry: () => ref.invalidate(vehicleProvider(id)),
        data: (v) => ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              AssetArt(hue: v.accentHue, icon: Icons.directions_car, height: 200),
              Padding(
                padding: const EdgeInsets.all(SahelSpace.md),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${v.title} ${v.trim}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                  Text(
                    [
                      '${v.year}',
                      v.isNew ? l.conditionNew : l.conditionUsed,
                      if (!v.isNew) l.km(context.number(v.mileageKm)),
                      l.seats('${v.seats}'),
                      context.loc(v.color),
                    ].join(' · '),
                    style: const TextStyle(color: SahelColors.textMuted),
                  ),
                  Text(l.soldBy(context.loc(v.seller.name)), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
                  const SizedBox(height: SahelSpace.sm),
                  Text(context.money(v.priceFils, decimals: 0), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: SahelSpace.md),
                  FilledButton(
                    key: const Key('reserve'),
                    onPressed: deposit == null
                        ? null
                        : () => context.push(CheckoutScreen.link(
                              purpose: 'reservation_deposit',
                              amountFils: deposit,
                              reference: v.id,
                              label: '${v.title} ${v.year}',
                            )),
                    child: Text(l.reserveCar(deposit == null ? '…' : context.money(deposit, decimals: 0))),
                  ),
                  const SizedBox(height: SahelSpace.sm),
                  ApplyButton(
                    filled: false,
                    terms: sel == null
                        ? null
                        : (
                            productLine: 'vehicle',
                            structure: sel.structure,
                            tenureMonths: sel.tenureMonths,
                            vehicleId: v.id,
                            downPaymentFils: sel.downPaymentFils,
                            amountFils: null,
                          ),
                  ),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: SahelSpace.md),
          FinanceCalculator(
            productLine: 'vehicle',
            assetPriceFils: v.priceFils,
            onChanged: (s) => setState(() => _selection = s),
          ),
          const SizedBox(height: SahelSpace.md),
          InsuranceQuotes(vehicleValueFils: v.priceFils, reference: v.id),
        ]),
      ),
    );
  }
}
