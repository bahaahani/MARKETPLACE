import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'card_face.dart';

class CardsScreen extends ConsumerWidget {
  const CardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.cardsTitle), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(cardsProvider),
        onRetry: () => ref.invalidate(cardsProvider),
        data: (cards) => ListView.separated(
          padding: const EdgeInsets.all(SahelSpace.md),
          itemCount: cards.length + 1,
          separatorBuilder: (_, _) => const SizedBox(height: SahelSpace.md),
          itemBuilder: (_, i) => i == 0
              ? Text(l.applyInstantly, style: const TextStyle(color: SahelColors.textMuted))
              // Eligibility is decided by the API for the current customer (same rules as card apply).
              : _CardTile(card: cards[i - 1]),
        ),
      ),
    );
  }
}

class _CardTile extends StatelessWidget {
  const _CardTile({required this.card});
  final CardProduct card;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        CardFace(gradient: card.gradient, tier: card.tier),
        Padding(
          padding: const EdgeInsets.all(SahelSpace.md),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.loc(card.name), style: const TextStyle(fontWeight: FontWeight.w600)),
            for (final h in card.highlights) Text('• ${context.loc(h)}', style: const TextStyle(color: SahelColors.textMuted)),
            const SizedBox(height: 6),
            KeyValueRow(l.annualFee, card.annualFeeFils == 0 ? l.free : context.money(card.annualFeeFils, decimals: 0)),
            KeyValueRow(l.minSalary, card.minSalaryFils == 0 ? '—' : context.money(card.minSalaryFils, decimals: 0)),
            const SizedBox(height: SahelSpace.sm),
            FilledButton(
              key: Key('apply-${card.id}'),
              onPressed: card.eligible ? () => context.go('/cards/${card.id}/apply') : null,
              child: Text(l.applyInstantly),
            ),
            if (!card.eligible && card.ineligibleReason != null)
              Padding(
                padding: const EdgeInsets.only(top: SahelSpace.xs),
                child: Text(
                  card.ineligibleReason == 'BELOW_MIN_SALARY' ? l.declineBelowMinSalary : l.declineNoDbrHeadroom,
                  key: Key('ineligible-${card.id}'),
                  style: const TextStyle(color: SahelColors.textMuted, fontSize: 12),
                ),
              ),
          ]),
        ),
      ]),
    );
  }
}
