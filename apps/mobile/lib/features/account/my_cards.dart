import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../cards/card_face.dart';

/// "My cards" on the account screen: virtual cards issued to this customer (GET /api/v1/me/cards),
/// same section as the web account page. ⚠️ Sandbox: masked numbers only, no processor behind them.
class MyCardsSection extends ConsumerWidget {
  const MyCardsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final tiers = {for (final c in ref.watch(cardsProvider).value ?? const <CardProduct>[]) c.id: c.tier};
    return Column(key: const Key('my-cards'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionHeader(l.myCards),
      AsyncView(
        value: ref.watch(myCardsProvider),
        onRetry: () => ref.invalidate(myCardsProvider),
        data: (cards) => cards.isEmpty
            ? Card(
                child: ListTile(
                  title: Text(l.noCardsYet, style: const TextStyle(color: SahelColors.textMuted)),
                  trailing: TextButton(onPressed: () => context.go('/cards'), child: Text(l.navCards)),
                ),
              )
            : Column(children: [
                for (final vc in cards) _MyCard(vc: vc, tier: tiers[vc.cardId] ?? ''),
              ]),
      ),
      Padding(
        padding: const EdgeInsets.only(top: SahelSpace.xs),
        child: Text('⚠️ ${l.cardSandboxNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
      ),
    ]);
  }
}

class _MyCard extends StatelessWidget {
  const _MyCard({required this.vc, required this.tier});
  final VirtualCard vc;
  final String tier;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final status = switch (vc.status) {
      'ACTIVE' => l.cardStatusActive,
      'FROZEN' => l.cardStatusFrozen,
      'CLOSED' => l.cardStatusClosed,
      _ => vc.status,
    };
    return Card(
      key: Key('my-card-${vc.id}'),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        CardFace(gradient: vc.gradient, tier: tier, panMasked: vc.panMasked, expiry: vc.expiry, validThruLabel: l.cardValidThru),
        Padding(
          padding: const EdgeInsets.all(SahelSpace.md),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.loc(vc.name), style: const TextStyle(fontWeight: FontWeight.w600)),
            KeyValueRow(l.cardLimit, tier == 'prepaid' ? l.prepaidNoLimit : context.money(vc.limitFils, decimals: 0), key: const Key('my-card-limit')),
            KeyValueRow(l.cardStatus, status, key: const Key('my-card-status')),
          ]),
        ),
      ]),
    );
  }
}
