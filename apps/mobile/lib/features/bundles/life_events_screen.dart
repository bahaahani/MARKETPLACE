import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models/bundles.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../finance/application_screen.dart' show structureLabel;
import 'bundles_providers.dart';

/// Life-Event Engine hub: pick what is happening, see a bundle priced for you.
class LifeEventsScreen extends ConsumerWidget {
  const LifeEventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.lifeEventsTitle), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(lifeEventsProvider),
        onRetry: () => ref.invalidate(lifeEventsProvider),
        data: (events) => ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
          Text(l.lifeEventsIntro, style: const TextStyle(color: SahelColors.textMuted)),
          const SizedBox(height: SahelSpace.md),
          for (final e in events)
            Card(
              child: ListTile(
                key: Key('life-event-${e.id}'),
                leading: CircleAvatar(backgroundColor: SahelColors.brandSoft, child: Text(e.icon, style: const TextStyle(fontSize: 22))),
                title: Text(context.loc(e.title), style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text(context.loc(e.subtitle)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/life-events/${e.id}'),
              ),
            ),
          const SizedBox(height: SahelSpace.sm),
          Text(l.lifeRulesNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
        ]),
      ),
    );
  }
}

/// One life event's bundle, with the Islamic / conventional toggle for the whole bundle.
class LifeEventBundleScreen extends ConsumerStatefulWidget {
  const LifeEventBundleScreen({super.key, required this.id, this.initialStructure = BundleStructure.islamic});
  final String id;
  final BundleStructure initialStructure;

  @override
  ConsumerState<LifeEventBundleScreen> createState() => _LifeEventBundleScreenState();
}

class _LifeEventBundleScreenState extends ConsumerState<LifeEventBundleScreen> {
  late BundleStructure _structure = widget.initialStructure;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final query = (id: widget.id, structure: _structure);
    final bundle = ref.watch(lifeEventBundleProvider(query));
    return Scaffold(
      appBar: AppBar(
        title: Text(switch (bundle) {
          AsyncData(:final value) => context.loc(value.event.title),
          _ => l.lifeEventsTitle,
        }),
        actions: const [LanguageButton()],
      ),
      body: ListView(key: const Key('life-event-bundle'), padding: const EdgeInsets.all(SahelSpace.md), children: [
        SegmentedButton<BundleStructure>(
          segments: [
            ButtonSegment(value: BundleStructure.islamic, label: Text(l.lifeStructureIslamic, key: const Key('structure-islamic'))),
            ButtonSegment(value: BundleStructure.conventional, label: Text(l.lifeStructureConventional, key: const Key('structure-conventional'))),
          ],
          selected: {_structure},
          onSelectionChanged: (s) => setState(() => _structure = s.first),
        ),
        const SizedBox(height: SahelSpace.md),
        AsyncView(
          value: bundle,
          onRetry: () => ref.invalidate(lifeEventBundleProvider(query)),
          data: (b) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _Summary(b),
            const SizedBox(height: SahelSpace.md),
            for (final item in b.items) ...[_ItemCard(item), const SizedBox(height: SahelSpace.sm)],
            Text(l.lifeIllustrative, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
            const SizedBox(height: SahelSpace.xs),
            Text(l.lifeRulesNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
          ]),
        ),
      ]),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary(this.b);
  final LifeEventBundle b;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final color = b.fits ? SahelColors.success : SahelColors.danger;
    return Card(
      key: const Key('bundle-summary'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SahelRadius.md), side: BorderSide(color: color, width: 2)),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            '${b.fits ? '✓' : '!'} ${b.fits ? l.lifeVerdictFits : l.lifeVerdictOver}',
            key: const Key('bundle-verdict'),
            style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: SahelSpace.sm),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _Figure(l.lifeTotalMonthly, context.money(b.totalMonthlyFils), valueKey: const Key('bundle-total'))),
            const SizedBox(width: SahelSpace.sm),
            Expanded(child: _Figure(l.lifeHeadroom, context.money(b.maxMonthlyFils), valueKey: const Key('bundle-headroom'))),
          ]),
          const SizedBox(height: SahelSpace.sm),
          Text(
            b.fits ? l.lifeLeftAfter(context.money(b.headroomAfterFils)) : l.lifeShortfall(context.money(b.shortfallFils)),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          if (b.otherMonthlyFils > 0)
            Text(l.lifeOtherMonthly(context.money(b.otherMonthlyFils)), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
        ]),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure(this.label, this.value, {this.valueKey});
  final String label;
  final String value;
  final Key? valueKey;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
        Text(value, key: valueKey, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
      ]);
}

class _ItemCard extends StatelessWidget {
  const _ItemCard(this.item);
  final BundleItem item;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final structure = item.structure;
    final href = item.href;
    return Card(
      key: Key('bundle-item-${item.id}'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.loc(item.title), style: const TextStyle(fontWeight: FontWeight.w600)),
                if (item.placeholder || (!item.countsTowardDbr && item.monthlyFils > 0))
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: PillRow([
                      if (item.placeholder) Pill('⚠️ ${l.lifeComingSoon}', color: const Color(0xFF8A5C00), background: const Color(0x26E8A317)),
                      if (!item.countsTowardDbr && item.monthlyFils > 0)
                        Pill(l.lifeNotInDbr, color: SahelColors.textMuted, background: SahelColors.background),
                    ]),
                  ),
              ]),
            ),
            const SizedBox(width: SahelSpace.sm),
            _ItemFigure(item),
          ]),
          const SizedBox(height: 4),
          Text(context.loc(item.description), style: const TextStyle(color: SahelColors.textMuted, fontSize: 13)),
          if (item.kind == 'card' && item.cardLimitFils != null && item.annualFeeFils != null)
            Text(l.lifeCardOffer(context.money(item.cardLimitFils!, decimals: 0), context.money(item.annualFeeFils!, decimals: 0)),
                style: const TextStyle(color: SahelColors.textMuted, fontSize: 13)),
          if (structure != null && item.financedFils != null && item.tenureMonths != null) ...[
            Text(structureLabel(l, structure),
                style: TextStyle(color: item.isIslamic ? SahelColors.islamic : SahelColors.brand, fontSize: 12, fontWeight: FontWeight.w600)),
            Text(l.lifeFinanced(context.money(item.financedFils!, decimals: 0), context.number(item.tenureMonths!)),
                style: const TextStyle(color: SahelColors.textMuted, fontSize: 13)),
            if (item.costOfFinanceFils != null)
              // Islamic structures carry profit, never "interest".
              Text(
                item.isIslamic ? l.lifeProfit(context.money(item.costOfFinanceFils!)) : l.lifeInterest(context.money(item.costOfFinanceFils!)),
                style: const TextStyle(color: SahelColors.textMuted, fontSize: 13),
              ),
          ],
          if (href != null) ...[
            const SizedBox(height: SahelSpace.sm),
            OutlinedButton(key: Key('bundle-link-${item.id}'), onPressed: () => context.push(href), child: Text(l.lifeView)),
          ],
        ]),
      ),
    );
  }
}

class _ItemFigure extends StatelessWidget {
  const _ItemFigure(this.item);
  final BundleItem item;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (item.monthlyFils == 0) {
      return item.placeholder ? Text(l.lifeComingSoon, style: const TextStyle(color: SahelColors.textMuted, fontWeight: FontWeight.w600)) : const SizedBox.shrink();
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
      Text(l.perMonth(context.money(item.monthlyFils)),
          key: Key('bundle-monthly-${item.id}'), style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.bold, fontSize: 16)),
      if (!item.countsTowardDbr) Text(l.lifeIndicativePremium, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
    ]);
  }
}

/// Home entry tile.
class LifeEventsEntryCard extends StatelessWidget {
  const LifeEventsEntryCard({super.key});

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      key: const Key('life-events-cta'),
      child: ListTile(
        leading: const CircleAvatar(backgroundColor: SahelColors.islamicSoft, child: Text('💍', style: TextStyle(fontSize: 20))),
        title: Text(l.lifeEntryTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(l.lifeEntrySubtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/life-events'),
      ),
    );
  }
}
