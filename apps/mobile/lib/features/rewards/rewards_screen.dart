import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'rewards_models.dart';
import 'rewards_providers.dart';

/// IMTIAZ Points Everywhere (⚠️ sandbox, placeholder rates): balance, tier, catalogue with redeem → confirm, vouchers,
/// history and earn rules. Same API as the web page (/rewards); nothing is computed here.
class RewardsScreen extends ConsumerStatefulWidget {
  const RewardsScreen({super.key});

  @override
  ConsumerState<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends ConsumerState<RewardsScreen> {
  RedemptionResult? _issued;
  bool _busy = false;

  /// One key per confirmation, so a double tap never redeems twice.
  static String _newKey() => List.generate(24, (_) => Random.secure().nextInt(16).toRadixString(16)).join();

  Future<void> _redeem(RewardItem item) async {
    final l = context.l10n;
    final key = _newKey();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('rew-confirm-dialog'),
        title: Text(l.rewConfirmTitle(context.loc(item.name), context.number(item.pointsCost))),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l.rewCancel)),
          FilledButton(key: const Key('rew-confirm'), onPressed: () => Navigator.of(context).pop(true), child: Text(l.rewConfirm)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final r = await ref.read(repositoryProvider).redeemReward(item.id, idempotencyKey: key);
      if (!mounted) return;
      setState(() => _issued = r);
      refreshRewards(ref);
    } catch (e) {
      if (!mounted) return;
      final text = e is ApiException && e.code == 'INSUFFICIENT_POINTS' ? l.rewErrorInsufficient : l.errorGeneric;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(key: const Key('rew-error'), content: Text(text)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final issued = _issued;
    return Scaffold(
      appBar: AppBar(title: Text(l.rewTitle), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(myRewardsProvider),
        onRetry: () => refreshRewards(ref),
        data: (s) => RefreshIndicator(
          onRefresh: () async => refreshRewards(ref),
          child: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            _SummaryCard(s),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: SahelSpace.sm),
              child: Text('⚠️ ${l.rewSandboxNote}', key: const Key('rew-sandbox'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
            ),
            if (issued != null) _IssuedCard(issued),
            SectionHeader(l.rewCatalogue),
            ...switch (ref.watch(rewardsCatalogueProvider)) {
              AsyncData(:final value) => [for (final i in value.items) _ItemCard(i, busy: _busy, onRedeem: () => _redeem(i))],
              AsyncError() => [TextButton(onPressed: () => ref.invalidate(rewardsCatalogueProvider), child: Text(l.retry))],
              _ => const [Center(child: CircularProgressIndicator())],
            },
            ...switch (ref.watch(myRedemptionsProvider)) {
              AsyncData(:final value) when value.isNotEmpty => [
                  SectionHeader(l.rewMyVouchers),
                  for (final v in value)
                    Card(
                      child: ListTile(
                        key: Key('rew-voucher-${v.id}'),
                        title: Text(context.loc(v.itemName)),
                        subtitle: Text('${context.loc(v.partner)} · ${l.rewExpires(context.date(v.expiresOn))}'),
                        trailing: Directionality(
                          textDirection: TextDirection.ltr,
                          child: Text(v.codeMasked, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ),
                ],
              _ => const <Widget>[],
            },
            SectionHeader(l.rewHistory),
            if (s.entries.isEmpty) Text(l.rewHistoryEmpty, style: const TextStyle(color: SahelColors.textMuted)),
            for (final e in s.entries)
              Card(
                child: ListTile(
                  key: Key('rew-entry-${e.id}'),
                  title: Text(context.loc(e.title)),
                  subtitle: Text(context.bahrainDate(e.at)),
                  trailing: Directionality(
                    textDirection: TextDirection.ltr,
                    child: Text(
                      e.points < 0 ? '−${context.number(-e.points)}' : '+${context.number(e.points)}',
                      style: TextStyle(fontWeight: FontWeight.bold, color: e.points < 0 ? SahelColors.danger : SahelColors.islamic),
                    ),
                  ),
                ),
              ),
            SectionHeader(l.rewHowToEarn),
            for (final r in s.earnRules)
              ListTile(
                dense: true,
                title: Text(context.loc(r.title)),
                trailing: Text(
                  r.pointsPerBhd != null ? l.rewRulePerBhd(context.number(r.pointsPerBhd!)) : l.rewRuleFixed(context.number(r.points ?? 0)),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard(this.s);
  final RewardsSummary s;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final next = s.nextTier;
    final progress = next != null ? l.rewTierProgress(context.number(s.pointsToNextTier), context.loc(next.name)) : l.rewTierTop;
    return Container(
      key: const Key('rew-summary'),
      padding: const EdgeInsets.all(SahelSpace.lg),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SahelRadius.lg),
        gradient: const LinearGradient(colors: [SahelColors.brandDark, SahelColors.brand]),
      ),
      child: DefaultTextStyle(
        style: const TextStyle(color: Colors.white),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.rewBalance, style: const TextStyle(color: Colors.white70, fontSize: 12)),
          Text(l.rewardsPoints(context.number(s.balance)),
              key: const Key('rew-balance'), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
          Text(l.rewTotals(context.number(s.earned), context.number(s.burned)), style: const TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: SahelSpace.md),
          Text('★ ${l.rewTier(context.loc(s.tier.name))}', key: const Key('rew-tier'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: SahelSpace.xs),
          Semantics(
            label: progress,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: s.progressPct / 100,
                minHeight: 8,
                color: SahelColors.accent,
                backgroundColor: Colors.white24,
              ),
            ),
          ),
          const SizedBox(height: SahelSpace.xs),
          Text(progress, key: const Key('rew-progress'), style: const TextStyle(color: Colors.white70, fontSize: 12)),
          Text(l.rewTierWindow(context.number(s.tierPoints), context.date(s.windowFrom)), style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ]),
      ),
    );
  }
}

class _IssuedCard extends StatelessWidget {
  const _IssuedCard(this.r);
  final RedemptionResult r;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      key: const Key('rew-issued'),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SahelRadius.md), side: const BorderSide(color: SahelColors.islamic)),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${l.rewCodeTitle}: ${context.loc(r.redemption.itemName)}', style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: SahelSpace.sm),
          Directionality(
            textDirection: TextDirection.ltr,
            child: SelectableText(
              r.redemption.code ?? r.redemption.codeMasked,
              key: const Key('rew-code'),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 2),
            ),
          ),
          const SizedBox(height: SahelSpace.xs),
          Text('${l.rewCodeNote} ${l.rewExpires(context.date(r.redemption.expiresOn))}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
          Text(l.rewNewBalance(context.number(r.balance)), key: const Key('rew-new-balance'), style: const TextStyle(fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard(this.i, {required this.busy, required this.onRedeem});
  final RewardItem i;
  final bool busy;
  final VoidCallback onRedeem;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final value = i.valueFils;
    return Card(
      key: Key('rew-item-${i.id}'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.loc(i.name), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(context.loc(i.partner), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
              ]),
            ),
            Pill(l.rewCost(context.number(i.pointsCost))),
          ]),
          if (i.demoPartner)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Pill('⚠️ ${l.rewDemoPartner}', color: const Color(0xFF8A5C00), background: const Color(0x26E8A317)),
            ),
          const SizedBox(height: SahelSpace.xs),
          Text(context.loc(i.description)),
          Text(
            [if (value != null) l.rewValue(context.money(value, decimals: 0)), l.rewValidDays(context.number(i.validityDays))].join(' · '),
            style: const TextStyle(color: SahelColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: SahelSpace.sm),
          FilledButton(
            key: Key('rew-redeem-${i.id}'),
            onPressed: i.affordable && !busy ? onRedeem : null,
            child: Text(i.affordable ? l.rewRedeem : l.rewNotEnough),
          ),
        ]),
      ),
    );
  }
}

/// Entry to the rewards screen with the live balance (account and home).
class RewardsBadge extends ConsumerWidget {
  const RewardsBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final s = ref.watch(myRewardsProvider).value;
    return Card(
      child: ListTile(
        key: const Key('rewards-entry'),
        leading: const CircleAvatar(backgroundColor: Color(0x26E8A317), child: Text('★', style: TextStyle(color: Color(0xFF8A5C00)))),
        title: Text(l.rewTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(
          s == null ? l.rewOpen : l.rewHomeSubtitle(context.number(s.balance), context.loc(s.tier.name)),
          key: const Key('rewards-entry-balance'),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/rewards'),
      ),
    );
  }
}
