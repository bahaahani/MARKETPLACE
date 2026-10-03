import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../checkout/checkout_screen.dart';

/// Motor insurance comparison (Tasheelat Insurance as broker), from the shared API.
class InsuranceQuotes extends ConsumerStatefulWidget {
  const InsuranceQuotes({super.key, required this.vehicleValueFils, required this.reference, this.defaultTakaful = false});
  final int vehicleValueFils;
  final String reference;
  final bool defaultTakaful;

  @override
  ConsumerState<InsuranceQuotes> createState() => _InsuranceQuotesState();
}

class _InsuranceQuotesState extends ConsumerState<InsuranceQuotes> {
  bool _comprehensive = true;
  late bool _takafulOnly = widget.defaultTakaful;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = (vehicleValueFils: widget.vehicleValueFils, comprehensive: _comprehensive, takafulOnly: _takafulOnly);
    final quotes = ref.watch(motorQuotesProvider(q));
    return Card(
      key: const Key('insurance-quotes'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.motorInsurance, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: SahelSpace.sm),
          Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            ChoiceChip(label: Text(l.comprehensive), selected: _comprehensive, onSelected: (_) => setState(() => _comprehensive = true)),
            ChoiceChip(label: Text(l.thirdParty), selected: !_comprehensive, onSelected: (_) => setState(() => _comprehensive = false)),
            FilterChip(
              key: const Key('takaful-only'),
              label: Text(l.takafulOnly),
              selected: _takafulOnly,
              onSelected: (v) => setState(() => _takafulOnly = v),
            ),
          ]),
          AsyncView(
            value: quotes,
            onRetry: () => ref.invalidate(motorQuotesProvider(q)),
            data: (list) => Column(children: [
              for (final mq in list)
                ListTile(
                  key: Key('motor-quote-${mq.insurerId}'),
                  contentPadding: EdgeInsets.zero,
                  title: Row(children: [
                    Flexible(child: Text(context.loc(mq.insurerName), style: const TextStyle(fontWeight: FontWeight.w600))),
                    if (mq.takaful) ...[const SizedBox(width: 6), Pill(l.takaful, color: SahelColors.islamic, background: SahelColors.islamicSoft)],
                  ]),
                  subtitle: Text([if (mq.roadsideAssistance) l.roadside, if (mq.agencyRepair) l.agencyRepair].join(' · ')),
                  trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(l.perYear(context.money(mq.annualPremiumFils)), style: const TextStyle(fontWeight: FontWeight.bold)),
                    InkWell(
                      onTap: () => context.push(CheckoutScreen.link(
                        purpose: 'insurance_premium',
                        amountFils: mq.annualPremiumFils,
                        reference: '${widget.reference}:${mq.insurerId}',
                        label: context.loc(mq.insurerName),
                      )),
                      child: Text(l.buyPolicy, style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.w600)),
                    ),
                  ]),
                ),
            ]),
          ),
        ]),
      ),
    );
  }
}
