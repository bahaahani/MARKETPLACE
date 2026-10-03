import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models/insurance.dart';
import '../../core/theme/tokens.g.dart';
import '../../l10n/gen/app_localizations.dart';
import '../../widgets/common.dart';
import 'insurance_providers.dart';

/// "My policies" on the account screen (GET /me/policies, same list as the web account page).
class MyPoliciesSection extends ConsumerWidget {
  const MyPoliciesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return Column(key: const Key('my-policies'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionHeader(l.insMyPolicies, action: l.navInsurance, onAction: () => context.push('/insurance')),
      switch (ref.watch(myPoliciesProvider)) {
        AsyncData(:final value) when value.isEmpty => Text(l.insNoPolicies, style: const TextStyle(color: SahelColors.textMuted)),
        AsyncData(:final value) => Column(children: [for (final p in value) PolicyCard(p)]),
        AsyncError() => TextButton(onPressed: () => ref.invalidate(myPoliciesProvider), child: Text(l.retry)),
        _ => const Center(child: CircularProgressIndicator()),
      },
    ]);
  }
}

class PolicyCard extends StatelessWidget {
  const PolicyCard(this.p, {super.key});
  final Policy p;

  static String coverSummary(BuildContext context, AppLocalizations l, PolicyCover c) => switch (c.line) {
        'motor' => ['#${c.reference ?? ''}', c.motorCover == 'comprehensive' ? l.comprehensive : l.thirdParty].join(' · '),
        'travel' => [
            regionLabel(l, c.region ?? ''),
            tierLabel(l, c.tier ?? ''),
            l.insTravellersCount('${(c.adults ?? 0) + (c.children ?? 0)}'),
          ].join(' · '),
        _ => [
            c.propertyTitle != null ? context.loc(c.propertyTitle!) : propertyTypeLabel(l, c.propertyType ?? ''),
            if ((c.buildingSumInsuredFils ?? 0) > 0) l.insBuildingCover(context.money(c.buildingSumInsuredFils!, decimals: 0)),
            if ((c.contentsSumInsuredFils ?? 0) > 0) l.insContentsCover(context.money(c.contentsSumInsuredFils!, decimals: 0)),
          ].join(' · '),
      };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      key: Key('policy-${p.policyNumber}'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text('${lineLabel(l, p.line)} · ${context.loc(p.insurerName)}', style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            if (p.takaful) ...[Pill(l.takaful, color: SahelColors.islamic, background: SahelColors.islamicSoft), const SizedBox(width: 6)],
            Pill(
              p.active ? l.insPolicyActive : l.insPolicyExpired,
              key: Key('policy-status-${p.status}'),
              color: p.active ? SahelColors.islamic : SahelColors.textMuted,
              background: p.active ? SahelColors.islamicSoft : SahelColors.background,
            ),
          ]),
          Directionality(
            textDirection: TextDirection.ltr,
            child: Text(l.insPolicyNumber(p.policyNumber), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11, fontFamily: 'monospace')),
          ),
          const SizedBox(height: SahelSpace.xs),
          Text(coverSummary(context, l, p.cover)),
          const SizedBox(height: SahelSpace.xs),
          Row(children: [
            Expanded(
              child: Text(l.insPolicyPeriod(context.date(p.startDate), context.date(p.endDate)), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
            ),
            Text(l.insPremiumPaid(context.money(p.premiumFils)), style: const TextStyle(fontWeight: FontWeight.w600)),
          ]),
        ]),
      ),
    );
  }
}
