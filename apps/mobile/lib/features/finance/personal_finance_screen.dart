import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'apply_button.dart';
import 'finance_calculator.dart';

// Slider settings (same as apps/web/components/PersonalFinance.tsx). The minimum amount mirrors
// MIN_PERSONAL_FINANCE_FILS in @sahel/domain, which the API enforces.
const _minAmountFils = 500000;
const _amountStep = 100000;
const _defaultAmountFils = 5000000;
const _tenureStep = 6;
const _defaultTenure = 48;

/// Personal finance: amount + tenure + structure, then apply. Mirrors /{locale}/finance/personal.
/// Quotes come from POST /api/v1/quotes/finance; the slider stops at the pre-approved limit from /me.
class PersonalFinanceScreen extends ConsumerWidget {
  const PersonalFinanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.personalFinanceTitle), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(meProvider),
        onRetry: () => ref.invalidate(meProvider),
        data: (me) {
          final limit = me.preApproval.limits.where((x) => x.productLine == 'personal').firstOrNull?.maxFinanceFils ?? 0;
          return _PersonalFinanceBody(maxAmountFils: limit);
        },
      ),
    );
  }
}

class _PersonalFinanceBody extends ConsumerStatefulWidget {
  const _PersonalFinanceBody({required this.maxAmountFils});
  final int maxAmountFils;

  @override
  ConsumerState<_PersonalFinanceBody> createState() => _PersonalFinanceBodyState();
}

class _PersonalFinanceBodyState extends ConsumerState<_PersonalFinanceBody> {
  late final int _maxAmount = max(_minAmountFils, widget.maxAmountFils ~/ _amountStep * _amountStep);
  late int _amount = min(_defaultAmountFils, _maxAmount);
  int _tenure = _defaultTenure;
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
      Text(l.upTo(context.money(widget.maxAmountFils, decimals: 0)), style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.w600)),
      const SizedBox(height: SahelSpace.md),
      Card(
        key: const Key('personal-finance'),
        child: Padding(
          padding: const EdgeInsets.all(SahelSpace.md),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _labeled(l.financeAmount, context.money(_amount, decimals: 0), const Key('amount')),
            Slider(
              key: const Key('amount-slider'),
              min: _minAmountFils.toDouble(),
              max: _maxAmount.toDouble(),
              divisions: ((_maxAmount - _minAmountFils) ~/ _amountStep).clamp(1, 1000),
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
                divisions: ((data.limits.maxTenureMonths - data.limits.minTenureMonths) ~/ _tenureStep).clamp(1, 100),
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
