import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';

class CardsScreen extends ConsumerWidget {
  const CardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final salary = ref.watch(meProvider).value?.monthlySalaryFils ?? 0;
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
              : _CardTile(card: cards[i - 1], eligible: salary >= cards[i - 1].minSalaryFils),
        ),
      ),
    );
  }
}

Color _hex(String h) => Color(int.parse('FF${h.substring(1)}', radix: 16));

class _CardTile extends StatelessWidget {
  const _CardTile({required this.card, required this.eligible});
  final CardProduct card;
  final bool eligible;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AspectRatio(
          aspectRatio: 1.586,
          child: Container(
            padding: const EdgeInsets.all(SahelSpace.lg),
            decoration: BoxDecoration(gradient: LinearGradient(colors: [_hex(card.gradient[0]), _hex(card.gradient[1])])),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('IMTIAZ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, letterSpacing: 1)),
              Row(children: [
                Text(card.tier.toUpperCase(), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                const Spacer(),
                const CircleAvatar(radius: 12, backgroundColor: Color(0xFFEB001B)),
                Transform.translate(offset: const Offset(-8, 0), child: const CircleAvatar(radius: 12, backgroundColor: Color(0xE6F79E1B))),
              ]),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(SahelSpace.md),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.loc(card.name), style: const TextStyle(fontWeight: FontWeight.w600)),
            for (final h in card.highlights) Text('• ${context.loc(h)}', style: const TextStyle(color: SahelColors.textMuted)),
            const SizedBox(height: 6),
            KeyValueRow(l.annualFee, card.annualFeeFils == 0 ? l.free : context.money(card.annualFeeFils, decimals: 0)),
            KeyValueRow(l.minSalary, card.minSalaryFils == 0 ? '—' : context.money(card.minSalaryFils, decimals: 0)),
            const SizedBox(height: SahelSpace.sm),
            FilledButton(onPressed: eligible ? () {} : null, child: Text(l.applyInstantly)),
          ]),
        ),
      ]),
    );
  }
}
