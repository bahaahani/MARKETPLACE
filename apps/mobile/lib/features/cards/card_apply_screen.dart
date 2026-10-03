import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'card_face.dart';

/// Instant card application (journey J3), same flow as the web at /{locale}/cards/{id}/apply.
/// ⚠️ SANDBOX: the API issues a display-only virtual card (masked number), and "Add to Wallet"
/// only shows a snackbar until Apple Pay / Google Pay / Samsung Pay push provisioning is integrated.
class CardApplyScreen extends ConsumerStatefulWidget {
  const CardApplyScreen({super.key, required this.cardId});
  final String cardId;

  @override
  ConsumerState<CardApplyScreen> createState() => _CardApplyScreenState();
}

class _CardApplyScreenState extends ConsumerState<CardApplyScreen> {
  bool _busy = false;
  bool _error = false;
  CardApplication? _result;

  Future<void> _apply() async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final r = await ref.read(repositoryProvider).applyForCard(widget.cardId);
      if (mounted) setState(() => _result = r);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.cardsTitle)),
      body: AsyncView(
        value: ref.watch(cardsProvider),
        onRetry: () => ref.invalidate(cardsProvider),
        data: (cards) {
          final card = cards.where((c) => c.id == widget.cardId).firstOrNull;
          if (card == null) return Center(child: Text(l.errorGeneric));
          final result = _result;
          return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            Text(l.applyCardTitle(context.loc(card.name)), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: SahelSpace.md),
            if (result == null) ..._confirm(card) else if (result.approved) ..._approved(card, result.virtualCard!) else ..._declined(result),
          ]);
        },
      ),
    );
  }

  List<Widget> _confirm(CardProduct card) {
    final l = context.l10n;
    final me = ref.watch(meProvider).value;
    return [
      ClipRRect(borderRadius: BorderRadius.circular(SahelRadius.lg), child: CardFace(gradient: card.gradient, tier: card.tier)),
      const SizedBox(height: SahelSpace.md),
      // The eligibility check comes from the pre-approval the API already computed.
      KeyValueRow(
        l.yourPreApprovedLimit,
        card.tier == 'prepaid' ? l.prepaidNoLimit : (me == null ? '…' : context.money(me.preApproval.cardLimitFils, decimals: 0)),
        key: const Key('offered-limit'),
      ),
      KeyValueRow(l.annualFee, card.annualFeeFils == 0 ? l.free : context.money(card.annualFeeFils, decimals: 0)),
      const SizedBox(height: SahelSpace.sm),
      Text(l.cardEligibilityDone, style: const TextStyle(color: SahelColors.textMuted)),
      if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
      const SizedBox(height: SahelSpace.md),
      FilledButton(key: const Key('confirm-card'), onPressed: _busy ? null : _apply, child: Text(l.confirmAndIssue)),
      _note(l.cardSandboxNote),
    ];
  }

  List<Widget> _approved(CardProduct card, VirtualCard vc) {
    final l = context.l10n;
    void addToWallet(String wallet) => ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      // ⚠️ Sandbox: production calls the issuer's push-provisioning SDK (PassKit / Google Pay / Samsung Pay).
      ..showSnackBar(SnackBar(content: Text(l.walletAddedSandbox(wallet))));
    return [
      Text('✓ ${l.cardApproved}', key: const Key('card-approved'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      const SizedBox(height: SahelSpace.md),
      ClipRRect(
        borderRadius: BorderRadius.circular(SahelRadius.lg),
        child: CardFace(gradient: vc.gradient, tier: card.tier, panMasked: vc.panMasked, expiry: vc.expiry, validThruLabel: l.cardValidThru),
      ),
      const SizedBox(height: SahelSpace.md),
      KeyValueRow(l.cardLimit, card.tier == 'prepaid' ? l.prepaidNoLimit : context.money(vc.limitFils, decimals: 0), key: const Key('card-limit')),
      KeyValueRow(l.cardValidThru, vc.expiry),
      KeyValueRow(l.cardStatus, vc.status == 'ACTIVE' ? l.cardStatusActive : vc.status),
      const SizedBox(height: SahelSpace.md),
      if (vc.wallet.applePay)
        OutlinedButton.icon(
          key: const Key('wallet-apple'),
          onPressed: () => addToWallet('Apple Wallet'),
          icon: const Icon(Icons.wallet),
          label: Text(l.addToAppleWallet),
        ),
      if (vc.wallet.googlePay)
        OutlinedButton.icon(
          key: const Key('wallet-google'),
          onPressed: () => addToWallet('Google Wallet'),
          icon: const Icon(Icons.wallet),
          label: Text(l.addToGoogleWallet),
        ),
      if (vc.wallet.samsungPay)
        OutlinedButton.icon(
          key: const Key('wallet-samsung'),
          onPressed: () => addToWallet('Samsung Wallet'),
          icon: const Icon(Icons.wallet),
          label: Text(l.addToSamsungWallet),
        ),
      _note(l.cardSandboxNote),
      const SizedBox(height: SahelSpace.sm),
      FilledButton(onPressed: () => context.go('/account'), child: Text(l.done)),
    ];
  }

  List<Widget> _declined(CardApplication r) {
    final l = context.l10n;
    return [
      Text(l.cardDeclined, key: const Key('card-declined'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      Text(r.reason == 'BELOW_MIN_SALARY' ? l.declineBelowMinSalary : l.declineNoDbrHeadroom, style: const TextStyle(color: SahelColors.textMuted)),
      const SizedBox(height: SahelSpace.md),
      FilledButton(onPressed: () => context.go('/cards'), child: Text(l.seeOtherCards)),
    ];
  }

  Widget _note(String text) => Padding(
        padding: const EdgeInsets.only(top: SahelSpace.sm),
        child: Text('⚠️ $text', textAlign: TextAlign.center, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      );
}
