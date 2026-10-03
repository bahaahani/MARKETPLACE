import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../checkout/checkout_screen.dart';
import '../finance/application_screen.dart';
import '../insurance/insurance_providers.dart';
import '../insurance/policies.dart';
import '../settlement/settlement_panel.dart';
import 'my_cards.dart';

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
          onRefresh: () async {
            ref.invalidate(meProvider);
            ref.invalidate(applicationsProvider);
            ref.invalidate(myCardsProvider);
            ref.invalidate(myPoliciesProvider);
          },
          child: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            ...switch (ref.watch(applicationsProvider)) {
              AsyncData(:final value) when value.isNotEmpty => [
                  SectionHeader(l.myApplications),
                  for (final a in value) _ApplicationTile(a),
                ],
              _ => const <Widget>[],
            },
            const MyCardsSection(),
            const MyPoliciesSection(),
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
                    OutlinedButton.icon(
                      key: Key('garage-tradein-${g.vehicleId}'),
                      icon: const Icon(Icons.swap_horiz),
                      onPressed: () => context.push('/trade-in?garage=${Uri.encodeQueryComponent(g.vehicleId)}'),
                      label: Text(l.tradeEntryGarage),
                    ),
                  ]),
                ),
              ),
            const SizedBox(height: SahelSpace.lg),
            const SharePreApprovalCard(),
            Padding(
              padding: const EdgeInsets.only(top: SahelSpace.sm),
              child: Text('⚠️ ${l.sessionSandboxNote}', key: const Key('session-note'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
            ),
          ]),
        ),
      ),
    );
  }
}

/// "Share my pre-approval with a dealer": a short-lived code and QR the showroom scans (J7).
/// The dealer only sees first name, car finance limit and max monthly.
class SharePreApprovalCard extends ConsumerStatefulWidget {
  const SharePreApprovalCard({super.key});

  @override
  ConsumerState<SharePreApprovalCard> createState() => _SharePreApprovalCardState();
}

class _SharePreApprovalCardState extends ConsumerState<SharePreApprovalCard> {
  PreApprovalShare? _share;
  bool _busy = false;
  bool _error = false;
  Timer? _ticker;

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final share = await ref.read(repositoryProvider).sharePreApproval();
      if (!mounted) return;
      _ticker?.cancel();
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
      setState(() => _share = share);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final share = _share;
    final remaining = share?.expiresAt.difference(DateTime.now());
    final expired = remaining != null && remaining <= Duration.zero;
    if (expired) _ticker?.cancel();
    return Card(
      key: const Key('share-preapproval'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l.dealerShareTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: SahelSpace.xs),
          Text(l.dealerShareHint, style: const TextStyle(color: SahelColors.textMuted, fontSize: 13)),
          if (share != null && !expired) ...[
            const SizedBox(height: SahelSpace.md),
            Text(l.dealerShareCode, textAlign: TextAlign.center),
            const SizedBox(height: SahelSpace.sm),
            Center(
              child: Semantics(
                label: l.dealerQrAlt(share.token),
                child: QrImageView(key: const Key('share-qr'), data: share.token, size: 200, backgroundColor: SahelColors.surface),
              ),
            ),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(
                share.token,
                key: const Key('share-token'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: 4, fontFamily: 'monospace'),
              ),
            ),
            Text(
              l.dealerShareExpiresIn(formatCountdown(remaining!)),
              key: const Key('share-countdown'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: SahelColors.textMuted),
            ),
          ],
          if (expired) ...[
            const SizedBox(height: SahelSpace.sm),
            Text(l.dealerShareExpired, style: const TextStyle(color: SahelColors.danger)),
          ],
          if (_error) ...[
            const SizedBox(height: SahelSpace.sm),
            Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
          ],
          if (share == null || expired) ...[
            const SizedBox(height: SahelSpace.md),
            FilledButton.icon(
              key: const Key('share-preapproval-button'),
              onPressed: _busy ? null : _create,
              icon: const Icon(Icons.qr_code_2),
              label: Text(expired ? l.dealerShareAgain : l.dealerShareButton),
            ),
          ],
        ]),
      ),
    );
  }
}

/// "m:ss" with Latin digits, same as the web countdown.
String formatCountdown(Duration d) {
  final s = d.isNegative ? 0 : (d.inMilliseconds / 1000).ceil();
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

class _ContractCard extends StatelessWidget {
  const _ContractCard(this.c);
  final Contract c;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final islamic = c.structure != FinanceStructure.conventional;
    final next = c.nextInstallment;
    final settled = c.settlement;
    return Card(
      key: Key('contract-${c.id}'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(context.loc(c.title), style: const TextStyle(fontWeight: FontWeight.w600))),
            if (settled != null)
              Pill('✓ ${l.contractSettled(context.date(settled.settledOn))}',
                  key: Key('contract-settled-${c.id}'), color: SahelColors.islamic, background: SahelColors.islamicSoft)
            else
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
          // A settled contract has nothing left to pay, settle or automate.
          if (settled == null) ContractSettlementPanel(c),
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

class _ApplicationTile extends StatelessWidget {
  const _ApplicationTile(this.a);
  final FinanceApplication a;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      child: ListTile(
        key: Key('application-${a.id}'),
        title: Text(a.productLine == 'personal' ? l.personalFinanceTitle : l.preApprovalVehicle),
        subtitle: Text('${structureLabel(l, a.structure)} · ${statusLabel(l, a.status)}'),
        trailing: TextButton(onPressed: () => context.push('/applications/${a.id}'), child: Text(l.viewApplication)),
      ),
    );
  }
}
