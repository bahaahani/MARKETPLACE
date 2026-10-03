import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';
import '../bundles/life_events_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.appName, style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.bold)), actions: [
        // Suhail & Suhaila 2.0
        IconButton(
          key: const Key('assistant-entry'),
          tooltip: context.l10n.aiOpen,
          icon: const Icon(Icons.chat_bubble_outline),
          onPressed: () => context.push('/assistant'),
        ),
        const LanguageButton(),
      ]),
      body: AsyncView(
        value: me,
        onRetry: () => ref.invalidate(meProvider),
        data: (me) => _HomeBody(me: me),
      ),
    );
  }
}

class _HomeBody extends ConsumerWidget {
  const _HomeBody({required this.me});
  final CustomerOverview me;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final pa = me.preApproval;
    final cars = ref.watch(vehiclesProvider((query: null, condition: null, maxMonthlyFils: pa.maxMonthlyFils)));
    final homes = ref.watch(propertiesProvider('sale'));
    String limitLabel(String line) => switch (line) {
          'vehicle' => l.preApprovalVehicle,
          'personal' => l.preApprovalPersonal,
          _ => l.preApprovalHome,
        };

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(meProvider),
      child: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Container(
          key: const Key('preapproval'),
          padding: const EdgeInsets.all(SahelSpace.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(SahelRadius.lg),
            gradient: const LinearGradient(colors: [SahelColors.brandDark, SahelColors.brand]),
          ),
          child: DefaultTextStyle(
            style: const TextStyle(color: Colors.white),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.greeting(context.loc(me.name)), style: const TextStyle(color: Colors.white70)),
              Text(l.preApprovedTitle, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
              Text(l.preApprovedSubtitle(context.date(pa.validUntil)), style: const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: SahelSpace.md),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.2,
                children: [
                  for (final lim in pa.limits)
                    _LimitTile(
                      limitLabel(lim.productLine),
                      l.upTo(context.money(lim.maxFinanceFils, decimals: 0)),
                      // Personal finance has no listing to start from, so its tile is the entry point.
                      onTap: lim.productLine == 'personal' ? () => context.push('/finance/personal') : null,
                      tileKey: lim.productLine == 'personal' ? const Key('personal-finance-link') : null,
                    ),
                  _LimitTile(l.preApprovalCard, context.money(pa.cardLimitFils, decimals: 0)),
                ],
              ),
            ]),
          ),
        ),
        const SizedBox(height: SahelSpace.md),
        Card(
          key: const Key('onboarding-cta'),
          child: ListTile(
            leading: const CircleAvatar(backgroundColor: SahelColors.brandSoft, child: Icon(Icons.verified_outlined, color: SahelColors.brand)),
            title: Text(l.onboardingTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text(l.onboardingIntro),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/onboarding'),
          ),
        ),
        const SizedBox(height: SahelSpace.sm),
        const LifeEventsEntryCard(),
        const SizedBox(height: SahelSpace.sm),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => context.push('/insurance'), icon: const Icon(Icons.shield_outlined), label: Text(l.navInsurance))),
          const SizedBox(width: SahelSpace.sm),
          Expanded(child: OutlinedButton.icon(onPressed: () => context.go('/cards'), icon: const Icon(Icons.credit_card), label: Text(l.navCards))),
        ]),
        SectionHeader(l.featuredCars, action: l.seeAll, onAction: () => context.go('/cars?maxMonthlyFils=${pa.maxMonthlyFils}')),
        AsyncView(
          value: cars,
          data: (list) => _Carousel(children: [for (final v in list.take(5)) VehicleTile(v, compact: true)]),
        ),
        SectionHeader(l.featuredProperty, action: l.seeAll, onAction: () => context.go('/property')),
        AsyncView(
          value: homes,
          data: (list) => _Carousel(children: [for (final p in list.take(5)) PropertyTile(p, compact: true)]),
        ),
      ]),
    );
  }
}

class _LimitTile extends StatelessWidget {
  const _LimitTile(this.label, this.value, {this.onTap, this.tileKey});
  final String label;
  final String value;
  final VoidCallback? onTap;
  final Key? tileKey;

  @override
  Widget build(BuildContext context) => onTap == null
      ? _tile()
      : InkWell(key: tileKey, onTap: onTap, borderRadius: BorderRadius.circular(SahelRadius.md), child: _tile());

  Widget _tile() => Container(
        padding: const EdgeInsets.all(SahelSpace.sm + 2),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(SahelRadius.md)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
          FittedBox(child: Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15))),
        ]),
      );
}

class _Carousel extends StatelessWidget {
  const _Carousel({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 300,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: children.length,
          separatorBuilder: (_, _) => const SizedBox(width: SahelSpace.sm),
          itemBuilder: (_, i) => SizedBox(width: 260, child: children[i]),
        ),
      );
}
