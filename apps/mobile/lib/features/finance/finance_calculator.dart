import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';

/// What the calculator currently shows, so "Apply for finance" applies for exactly that.
typedef FinanceSelection = ({FinanceStructure structure, int downPaymentFils, int tenureMonths});

/// Islamic / conventional side-by-side calculator. Figures come from POST /api/v1/quotes/finance,
/// the same pricing engine the web calculator runs, so both channels always agree.
class FinanceCalculator extends ConsumerStatefulWidget {
  const FinanceCalculator({super.key, required this.productLine, required this.assetPriceFils, this.onChanged});
  final String productLine;
  final int assetPriceFils;

  /// Called with the current selection once quotes load, and whenever the customer changes it.
  final ValueChanged<FinanceSelection>? onChanged;

  @override
  ConsumerState<FinanceCalculator> createState() => _FinanceCalculatorState();
}

class _FinanceCalculatorState extends ConsumerState<FinanceCalculator> {
  // The first request leaves down payment and tenure out, so the API quotes its listing defaults
  // (same as the web calculator); the sliders then start from the values it returns.
  late FinanceQuery _query =
      (productLine: widget.productLine, assetPriceFils: widget.assetPriceFils, downPaymentFils: null, tenureMonths: null);
  int? _down;
  int? _tenure;
  FinanceStructure? _selected;
  FinanceComparison? _last;
  bool _published = false;

  void _commit() {
    setState(() => _query =
        (productLine: widget.productLine, assetPriceFils: widget.assetPriceFils, downPaymentFils: _down, tenureMonths: _tenure));
    _publish();
  }

  void _publish() {
    final structure = _selected ?? _last?.quotes.last.structure;
    final down = _down;
    final tenure = _tenure;
    if (structure == null || down == null || tenure == null) return;
    widget.onChanged?.call((structure: structure, downPaymentFils: down, tenureMonths: tenure));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final result = ref.watch(financeQuotesProvider(_query));
    final data = result.value ?? _last;
    if (result.hasValue) _last = result.value;
    if (data != null) {
      _down ??= data.limits.defaultDownPaymentFils;
      _tenure ??= data.limits.defaultTenureMonths;
    }
    if (data != null && !_published) {
      _published = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _publish();
      });
    }

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
                      child: QuoteColumn(
                        q: q,
                        active: q.structure == (_selected ?? data.quotes.last.structure),
                        onTap: () {
                          setState(() => _selected = q.structure);
                          _publish();
                        },
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
    // Steps come from the API with the limits.
    final step = limits.downPaymentStepFils;
    final tenureStep = limits.tenureStepMonths;
    final minDown = (limits.minDownPaymentFils / step).ceil() * step;
    final maxDown = limits.maxDownPaymentFils ~/ step * step;
    final down = _down!.clamp(minDown, maxDown);
    final tenure = _tenure!;
    return Column(children: [
      // The label shows what is quoted; the slider thumb can only sit on a step.
      _labeled(l.downPayment, context.money(_down!, decimals: 0)),
      Slider(
        key: const Key('down-payment'),
        min: minDown.toDouble(),
        max: maxDown.toDouble(),
        divisions: ((maxDown - minDown) ~/ step).clamp(1, 1000),
        value: down.toDouble(),
        onChanged: (v) => setState(() => _down = v.round()),
        onChangeEnd: (_) => _commit(),
      ),
      _labeled(l.tenure, l.months('$tenure')),
      Slider(
        key: const Key('tenure'),
        min: limits.minTenureMonths.toDouble(),
        max: limits.maxTenureMonths.toDouble(),
        divisions: ((limits.maxTenureMonths - limits.minTenureMonths) ~/ tenureStep).clamp(1, 100),
        value: tenure.clamp(limits.minTenureMonths, limits.maxTenureMonths).toDouble(),
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

/// One structure's quote, selectable. Shared with the personal finance screen.
class QuoteColumn extends StatelessWidget {
  const QuoteColumn({super.key, required this.q, required this.active, required this.onTap});
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
