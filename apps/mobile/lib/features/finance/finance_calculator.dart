import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';

/// Islamic / conventional side-by-side calculator. Figures come from POST /api/v1/quotes/finance,
/// the same pricing engine the web calculator runs, so both channels always agree.
class FinanceCalculator extends ConsumerStatefulWidget {
  const FinanceCalculator({super.key, required this.productLine, required this.assetPriceFils});
  final String productLine;
  final int assetPriceFils;

  @override
  ConsumerState<FinanceCalculator> createState() => _FinanceCalculatorState();
}

class _FinanceCalculatorState extends ConsumerState<FinanceCalculator> {
  // Listing defaults (same as LISTING_DEFAULTS in @sahel/domain).
  late final int _step = widget.productLine == 'home' ? 1000000 : 100000;
  late int _down = _roundToStep(widget.assetPriceFils * 20 ~/ 100);
  late int _tenure = widget.productLine == 'home' ? 240 : 60;
  late FinanceQuery _query = _currentQuery();
  FinanceStructure? _selected;
  FinanceComparison? _last;

  int _roundToStep(int v) => (v / _step).round() * _step;

  FinanceQuery _currentQuery() =>
      (productLine: widget.productLine, assetPriceFils: widget.assetPriceFils, downPaymentFils: _down, tenureMonths: _tenure);

  void _commit() => setState(() => _query = _currentQuery());

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final result = ref.watch(financeQuotesProvider(_query));
    final data = result.value ?? _last;
    if (result.hasValue) _last = result.value;

    return Card(
      key: const Key('finance-calculator'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.financeCalculator, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          if (data == null)
            AsyncView(value: result, onRetry: () => ref.invalidate(financeQuotesProvider(_query)), data: (_) => const SizedBox())
          else ...[
            _sliders(context, data.limits),
            Text(l.compareSideBySide, style: const TextStyle(color: SahelColors.textMuted, fontWeight: FontWeight.w600)),
            const SizedBox(height: SahelSpace.sm),
            Opacity(
              opacity: result.isLoading ? 0.6 : 1,
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final q in data.quotes)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(end: 6),
                      child: _QuoteColumn(
                        q: q,
                        active: q.structure == (_selected ?? data.quotes.last.structure),
                        onTap: () => setState(() => _selected = q.structure),
                      ),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: SahelSpace.sm),
            Text(l.illustrativeDisclaimer, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
          ],
        ]),
      ),
    );
  }

  Widget _sliders(BuildContext context, FinanceLimits limits) {
    final l = context.l10n;
    final minDown = (limits.minDownPaymentFils / _step).ceil() * _step;
    final maxDown = limits.maxDownPaymentFils ~/ _step * _step;
    final down = _down.clamp(minDown, maxDown);
    return Column(children: [
      _labeled(l.downPayment, context.money(down, decimals: 0)),
      Slider(
        key: const Key('down-payment'),
        min: minDown.toDouble(),
        max: maxDown.toDouble(),
        divisions: ((maxDown - minDown) ~/ _step).clamp(1, 1000),
        value: down.toDouble(),
        onChanged: (v) => setState(() => _down = v.round()),
        onChangeEnd: (_) => _commit(),
      ),
      _labeled(l.tenure, l.months('$_tenure')),
      Slider(
        key: const Key('tenure'),
        min: limits.minTenureMonths.toDouble(),
        max: limits.maxTenureMonths.toDouble(),
        divisions: ((limits.maxTenureMonths - limits.minTenureMonths) ~/ 12).clamp(1, 100),
        value: _tenure.clamp(limits.minTenureMonths, limits.maxTenureMonths).toDouble(),
        onChanged: (v) => setState(() => _tenure = v.round()),
        onChangeEnd: (_) => _commit(),
      ),
    ]);
  }

  Widget _labeled(String label, String value) => Padding(
        padding: const EdgeInsets.only(top: SahelSpace.sm),
        child: Row(children: [Expanded(child: Text(label)), Text(value, style: const TextStyle(fontWeight: FontWeight.bold))]),
      );
}

class _QuoteColumn extends StatelessWidget {
  const _QuoteColumn({required this.q, required this.active, required this.onTap});
  final FinanceQuote q;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final color = q.isIslamic ? SahelColors.islamic : SahelColors.brand;
    final name = switch (q.structure) {
      FinanceStructure.conventional => l.structureConventional,
      FinanceStructure.murabaha => l.structureMurabaha,
      FinanceStructure.ijara => l.structureIjara,
    };
    final rateLabel = switch (q.rateBasis) { 'apr' => l.rateApr, 'flat' => l.rateFlat, _ => l.rateProfit };
    return Semantics(
      selected: active,
      button: true,
      child: InkWell(
        key: Key('quote-${q.structure.name}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(SahelRadius.md),
        child: Container(
          padding: const EdgeInsets.all(SahelSpace.sm + 2),
          decoration: BoxDecoration(
            color: active ? (q.isIslamic ? SahelColors.islamicSoft : SahelColors.brandSoft) : SahelColors.surface,
            border: Border.all(color: active ? color : SahelColors.border, width: 2),
            borderRadius: BorderRadius.circular(SahelRadius.md),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)),
            Text(q.structure == FinanceStructure.ijara ? l.monthlyRental : l.monthlyInstallment,
                style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
            FittedBox(
              child: Text(context.money(q.monthlyFils),
                  key: Key('monthly-${q.structure.name}'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 6),
            KeyValueRow(l.financedAmount, context.money(q.financedFils, decimals: 0)),
            if (q.salePriceFils != null) KeyValueRow(l.salePrice, context.money(q.salePriceFils!, decimals: 0)),
            KeyValueRow(q.isIslamic ? l.profitCost : l.interestCost, context.money(q.costOfFinanceFils, decimals: 0)),
            KeyValueRow(l.totalPayable, context.money(q.totalPayableFils, decimals: 0)),
            KeyValueRow(rateLabel, '${q.ratePct}%'),
            if (q.rateBasis != 'apr') KeyValueRow(l.aprEquivalent, '${q.aprPct}%'),
          ]),
        ),
      ),
    );
  }
}
