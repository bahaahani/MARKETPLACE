import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models/bundles.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../l10n/gen/app_localizations.dart';
import '../bundles/bundles_providers.dart';
import '../checkout/checkout_screen.dart';

/// Autopay switch and early-settlement quote for one contract ("My installments").
/// All figures come from the API (packages/domain/src/settlement.ts).
class ContractSettlementPanel extends ConsumerStatefulWidget {
  const ContractSettlementPanel(this.contract, {super.key});
  final Contract contract;

  @override
  ConsumerState<ContractSettlementPanel> createState() => _ContractSettlementPanelState();
}

class _ContractSettlementPanelState extends ConsumerState<ContractSettlementPanel> {
  bool _busy = false;
  bool _error = false;

  Future<void> _setAutopay(bool on) async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      await ref.read(repositoryProvider).setAutopay(widget.contract.id, on);
      ref.invalidate(meProvider);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = widget.contract;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SwitchListTile(
        key: Key('autopay-${c.id}'),
        contentPadding: EdgeInsets.zero,
        dense: true,
        value: c.autopay,
        onChanged: _busy ? null : _setAutopay,
        title: Text(l.settleAutopay, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(l.settleAutopayHint, style: const TextStyle(fontSize: 12)),
      ),
      if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
      Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: Key('settlement-${c.id}'),
          tilePadding: EdgeInsets.zero,
          childrenPadding: EdgeInsets.zero,
          title: Text(l.settleShow, style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.w600)),
          children: [_SettlementQuoteView(c)],
        ),
      ),
    ]);
  }
}

String _lineLabel(AppLocalizations l, String kind) => switch (kind) {
      'remaining_principal' => l.settleLineRemainingPrincipal,
      'settlement_fee' => l.settleLineFee,
      'remaining_sale_price' => l.settleLineRemainingSalePrice,
      'ibra_rebate' => l.settleLineIbra,
      'remaining_asset_cost' => l.settleLineRemainingAssetCost,
      _ => kind,
    };

class _SettlementQuoteView extends ConsumerWidget {
  const _SettlementQuoteView(this.contract);
  final Contract contract;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final value = ref.watch(settlementQuoteProvider(contract.id));
    return switch (value) {
      AsyncData(value: final q) => _quote(context, l, q),
      AsyncError() => Padding(
          padding: const EdgeInsets.all(SahelSpace.sm),
          child: Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
        ),
      _ => const Padding(padding: EdgeInsets.all(SahelSpace.sm), child: Center(child: CircularProgressIndicator())),
    };
  }

  Widget _quote(BuildContext context, AppLocalizations l, SettlementQuote q) {
    const muted = TextStyle(color: SahelColors.textMuted, fontSize: 12);
    Widget row(String label, String value, {Key? key, TextStyle? style}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(child: Text(label, style: style)),
            Text(value, key: key, style: style),
          ]),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      row('${l.settleToTerm} · ${l.settleRemaining(context.number(q.installmentsRemaining))}', context.money(q.remainingScheduledFils),
          key: Key('settle-to-term-${q.contractId}'), style: const TextStyle(color: SahelColors.textMuted)),
      for (final line in q.lines)
        row(
          _lineLabel(l, line.kind),
          line.amountFils < 0 ? '− ${context.money(-line.amountFils)}' : context.money(line.amountFils),
          style: line.amountFils < 0 ? const TextStyle(color: SahelColors.islamic) : null,
        ),
      const Divider(),
      row(l.settleAmount, context.money(q.settlementAmountFils),
          key: Key('settle-amount-${q.contractId}'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
      Text(l.settleSavings(context.money(q.savingsFils)),
          key: Key('settle-savings-${q.contractId}'), style: const TextStyle(color: SahelColors.success, fontWeight: FontWeight.w600)),
      Text(l.settleValidUntil(context.date(q.validUntil)), style: muted),
      Text(q.structure == FinanceStructure.murabaha ? l.settleIbraNote : l.settleFeeNote, style: muted),
      const SizedBox(height: SahelSpace.sm),
      FilledButton(
        key: Key('settle-now-${q.contractId}'),
        onPressed: () => context.push(CheckoutScreen.link(
          purpose: q.paymentPurpose,
          amountFils: q.settlementAmountFils,
          reference: q.paymentReference,
          label: l.settlePaymentLabel(context.loc(contract.title)),
        )),
        child: Text(l.settleNow),
      ),
      const SizedBox(height: SahelSpace.sm),
    ]);
  }
}
