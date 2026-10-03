import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models/config.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'apply_button.dart';
import 'finance_calculator.dart';

/// Personal finance: amount + tenure + structure, then apply. Mirrors /{locale}/finance/personal.
/// Quotes come from POST /api/v1/quotes/finance. The slider range (minimum, the customer's pre-approved
/// limit, steps and defaults) comes from GET /api/v1/config, so no product rule lives in the app.
class PersonalFinanceScreen extends ConsumerWidget {
  const PersonalFinanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.personalFinanceTitle), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(configProvider),
        onRetry: () => ref.invalidate(configProvider),
        data: (config) => _PersonalFinanceBody(range: config.personalFinance),
      ),
    );
  }
}

class _PersonalFinanceBody extends ConsumerStatefulWidget {
  const _PersonalFinanceBody({required this.range});
  final PersonalFinanceRange range;

  @override
  ConsumerState<_PersonalFinanceBody> createState() => _PersonalFinanceBodyState();
}

class _PersonalFinanceBodyState extends ConsumerState<_PersonalFinanceBody> {
  late final PersonalFinanceRange _range = widget.range;
  late int _amount = _range.defaultAmountFils;
  late int _tenure = _range.defaultTenureMonths;
  late FinanceQuery _query = _currentQuery();
  FinanceStructure _selected = FinanceStructure.murabaha;
  FinanceComparison? _last;

  FinanceQuery _currentQuery() => (productLine: 'personal', assetPriceFils: _amount, downPaymentFils: 0, tenureMonths: _tenure);

  void _commit() => setState(() => _query = _currentQuery());

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final result = ref.watch(financeQuotesProvider(_query));
    if (result.hasValue) _last = result.value;
    final data = _last;
    final committed = _query.assetPriceFils == _amount && _query.tenureMonths == _tenure;

    return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
      Text(l.personalFinanceSubtitle, style: const TextStyle(color: SahelColors.textMuted)),
      Text(l.upTo(context.money(_range.preApprovedFils, decimals: 0)), style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.w600)),
      const SizedBox(height: SahelSpace.md),
      Card(
        key: const Key('personal-finance'),
        child: Padding(
          padding: const EdgeInsets.all(SahelSpace.md),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _labeled(l.financeAmount, context.money(_amount, decimals: 0), const Key('amount')),
            Slider(
              key: const Key('amount-slider'),
              min: _range.minAmountFils.toDouble(),
              max: _range.maxAmountFils.toDouble(),
              divisions: ((_range.maxAmountFils - _range.minAmountFils) ~/ _range.amountStepFils).clamp(1, 1000),
              value: _amount.toDouble(),
              onChanged: (v) => setState(() => _amount = v.round()),
              onChangeEnd: (_) => _commit(),
            ),
            if (data == null)
              AsyncView(value: result, onRetry: () => ref.invalidate(financeQuotesProvider(_query)), data: (_) => const SizedBox())
            else ...[
              _labeled(l.tenure, l.months('$_tenure'), null),
              Slider(
                key: const Key('tenure'),
                min: data.limits.minTenureMonths.toDouble(),
                max: data.limits.maxTenureMonths.toDouble(),
                divisions: ((data.limits.maxTenureMonths - data.limits.minTenureMonths) ~/ _range.tenureStepMonths).clamp(1, 100),
                value: _tenure.clamp(data.limits.minTenureMonths, data.limits.maxTenureMonths).toDouble(),
                onChanged: (v) => setState(() => _tenure = v.round()),
                onChangeEnd: (_) => _commit(),
              ),
              Text(l.compareSideBySide, style: const TextStyle(color: SahelColors.textMuted, fontWeight: FontWeight.w600)),
              const SizedBox(height: SahelSpace.sm),
              Opacity(
                opacity: result.isLoading ? 0.6 : 1,
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  for (final q in data.quotes)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsetsDirectional.only(end: 6),
                        child: QuoteColumn(q: q, active: q.structure == _selected, onTap: () => setState(() => _selected = q.structure)),
                      ),
                    ),
                ]),
              ),
              const SizedBox(height: SahelSpace.sm),
              Text(l.illustrativeDisclaimer, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
              const SizedBox(height: SahelSpace.md),
              ApplyButton(
                terms: committed
                    ? (
                        productLine: 'personal',
                        structure: _selected,
                        tenureMonths: _tenure,
                        vehicleId: null,
                        propertyId: null,
                        downPaymentFils: null,
                        amountFils: _amount,
                      )
                    : null,
              ),
            ],
          ]),
        ),
      ),
    ]);
  }

  Widget _labeled(String label, String value, Key? valueKey) => Padding(
        padding: const EdgeInsets.only(top: SahelSpace.sm),
        child: Row(children: [Expanded(child: Text(label)), Text(value, key: valueKey, style: const TextStyle(fontWeight: FontWeight.bold))]),
      );
}
