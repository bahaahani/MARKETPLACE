import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../checkout/checkout_screen.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.navAccount), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(meProvider),
        onRetry: () => ref.invalidate(meProvider),
        data: (me) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(meProvider),
          child: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            SectionHeader(l.myInstallments, action: '★ ${l.rewardsPoints(context.number(me.rewardsPoints))}'),
            for (final c in me.contracts) ...[_ContractCard(c), const SizedBox(height: SahelSpace.sm)],
            SectionHeader(l.myGarage),
            for (final g in me.garage)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(SahelSpace.md),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(g.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text('#${g.plate} · ${l.km(context.number(g.odometerKm))}', style: const TextStyle(color: SahelColors.textMuted)),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.badge_outlined),
                      title: Text(l.registrationExpiry(context.date(g.registrationExpiry))),
                    ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.shield_outlined),
                      title: Text(l.insuranceExpiry(context.date(g.insuranceExpiry))),
                      trailing: TextButton(onPressed: () => context.push('/insurance'), child: Text(l.renew)),
                    ),
                  ]),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

class _ContractCard extends StatelessWidget {
  const _ContractCard(this.c);
  final Contract c;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final islamic = c.structure != FinanceStructure.conventional;
    final next = c.nextInstallment;
    return Card(
      key: Key('contract-${c.id}'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(context.loc(c.title), style: const TextStyle(fontWeight: FontWeight.w600))),
            Pill(c.autopay ? l.autopayOn : l.autopayOff,
                color: c.autopay ? SahelColors.islamic : SahelColors.textMuted,
                background: c.autopay ? SahelColors.islamicSoft : SahelColors.background),
          ]),
          Text(
            switch (c.structure) {
              FinanceStructure.conventional => l.structureConventional,
              FinanceStructure.murabaha => l.structureMurabaha,
              FinanceStructure.ijara => l.structureIjara,
            },
            style: TextStyle(color: islamic ? SahelColors.islamic : SahelColors.brand, fontSize: 12, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: SahelSpace.sm),
          Row(children: [
            Expanded(child: _Stat(l.outstanding, context.money(c.outstandingFils))),
            if (next != null) Expanded(child: _Stat(l.nextDue(context.date(next.dueDate)), context.money(next.amountFils))),
          ]),
          if (next != null) ...[
            const SizedBox(height: SahelSpace.sm),
            FilledButton(
              key: Key('pay-${c.id}'),
              onPressed: () => context.push(CheckoutScreen.link(
                purpose: 'installment',
                amountFils: next.amountFils,
                reference: '${c.id}-${next.number}',
                label: context.loc(c.title),
              )),
              child: Text(l.payNow),
            ),
          ],
        ]),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ]);
}
