import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../l10n/gen/app_localizations.dart';
import '../../widgets/common.dart';
import '../checkout/checkout_screen.dart';
import '../checkout/payment_price.dart';

/// Finance application: decision with reasons, offer, "Accept & e-sign", and the timeline.
/// Mirrors /{locale}/applications/{id} on the web. Everything shown comes from the API as-is.
class ApplicationScreen extends ConsumerStatefulWidget {
  const ApplicationScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ApplicationScreen> createState() => _ApplicationScreenState();
}

class _ApplicationScreenState extends ConsumerState<ApplicationScreen> {
  bool _busy = false;
  bool _error = false;
  FinanceApplication? _accepted;

  Future<void> _accept() async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final app = await ref.read(repositoryProvider).acceptApplication(widget.id);
      ref.invalidate(applicationsProvider);
      if (mounted) setState(() => _accepted = app);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final loaded = ref.watch(applicationProvider(widget.id));
    return Scaffold(
      appBar: AppBar(title: Text(l.applicationTitle), actions: const [LanguageButton()]),
      body: AsyncView(
        value: loaded,
        onRetry: () => ref.invalidate(applicationProvider(widget.id)),
        data: (fetched) {
          final app = _accepted ?? fetched;
          return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            _Title(app),
            const SizedBox(height: SahelSpace.md),
            if (app.decision != null) _DecisionCard(app),
            const SizedBox(height: SahelSpace.md),
            _OfferSummary(app.quote, productLine: app.productLine),
            if (app.nextAction?.type == 'PAY_VALUATION_FEE') ...[
              const SizedBox(height: SahelSpace.md),
              _ValuationStep(app.nextAction!, onContinue: _busy ? null : _accept),
              if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
            ],
            if (app.status == 'LEASE_STARTED') ...[
              const SizedBox(height: SahelSpace.md),
              Container(
                key: const Key('lease-active'),
                padding: const EdgeInsets.all(SahelSpace.md),
                decoration: BoxDecoration(
                  color: SahelColors.islamicSoft,
                  border: Border.all(color: SahelColors.islamic),
                  borderRadius: BorderRadius.circular(SahelRadius.md),
                ),
                child: Text(l.homeLeaseActive, style: const TextStyle(color: SahelColors.islamic)),
              ),
            ],
            if (app.canAccept) ...[
              const SizedBox(height: SahelSpace.md),
              FilledButton(key: const Key('accept-offer'), onPressed: _busy ? null : _accept, child: Text(l.acceptAndSign)),
              if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
              Text(l.sandboxNotice, textAlign: TextAlign.center, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
            ],
            const SizedBox(height: SahelSpace.md),
            _Timeline(app.steps),
          ]);
        },
      ),
    );
  }
}

class _Title extends ConsumerWidget {
  const _Title(this.app);
  final FinanceApplication app;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final String title;
    if (app.productLine == 'personal') {
      title = l.personalFinanceTitle;
    } else if (app.productLine == 'home') {
      final p = ref.watch(propertyProvider(app.reference)).value;
      title = p == null ? app.reference : context.loc(p.title);
    } else {
      final v = ref.watch(vehicleProvider(app.reference)).value;
      title = v == null ? app.reference : '${v.title} ${v.year}';
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, key: const Key('application-title'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
      Text(l.applicationReference(app.id), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11, fontFamily: 'monospace')),
    ]);
  }
}

class _DecisionCard extends StatelessWidget {
  const _DecisionCard(this.app);
  final FinanceApplication app;

  String _reason(BuildContext context, String code, ApplicationDecision d) {
    final l = context.l10n;
    return switch (code) {
      'DBR_EXCEEDED' => l.reasonDbrExceeded(context.money(d.monthlyFils), context.money(d.maxMonthlyFils), '${d.dbrCapPct}'),
      'AMOUNT_ABOVE_PREAPPROVAL' =>
        l.reasonAmountAbovePreapproval(context.money(app.quote.financedFils, decimals: 0), context.money(d.preApprovedLimitFils, decimals: 0)),
      'HIGH_DBR_UTILISATION' => l.reasonHighDbrUtilisation(context.money(d.monthlyFils), context.money(d.maxMonthlyFils)),
      _ => l.reasonOk,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = app.decision!;
    // A credit officer's review of a referred application replaces the automatic outcome.
    final review = app.review;
    final outcome = app.outcome!;
    var (title, body, color, background) = switch (outcome) {
      'APPROVED' => (l.decisionApproved, l.decisionApprovedBody, SahelColors.islamic, SahelColors.islamicSoft),
      'REFERRED' => (l.decisionReferred, l.decisionReferredBody, SahelColors.accent, SahelColors.background),
      _ => (l.decisionDeclined, l.decisionDeclinedBody, SahelColors.danger, SahelColors.background),
    };
    if (review != null) body = review.outcome == 'APPROVED' ? l.boReviewedApprovedBody : l.boReviewedDeclinedBody;
    return Container(
      key: Key('decision-$outcome'),
      padding: const EdgeInsets.all(SahelSpace.md),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: color, width: 2),
        borderRadius: BorderRadius.circular(SahelRadius.md),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
        if (review != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Chip(
              key: const Key('reviewed-by-officer'),
              label: Text(l.boReviewedByOfficer, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              visualDensity: VisualDensity.compact,
            ),
          ),
        Text(body),
        const SizedBox(height: SahelSpace.sm),
        Text(l.decisionReasons, style: const TextStyle(color: SahelColors.textMuted, fontWeight: FontWeight.w600, fontSize: 12)),
        for (final r in d.reasons)
          Padding(
            key: Key('reason-$r'),
            padding: const EdgeInsets.only(top: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('•  '),
              Expanded(child: Text(_reason(context, r, d), style: const TextStyle(fontSize: 13))),
            ]),
          ),
        if (outcome == 'DECLINED') ...[
          const SizedBox(height: SahelSpace.sm),
          Text(l.tryLowerAmount, style: const TextStyle(fontSize: 13)),
        ],
      ]),
    );
  }
}

class _OfferSummary extends StatelessWidget {
  const _OfferSummary(this.q, {required this.productLine});
  final FinanceQuote q;
  final String productLine;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final rateLabel = switch (q.rateBasis) { 'apr' => l.rateApr, 'flat' => l.rateFlat, _ => l.rateProfit };
    return Card(
      key: const Key('offer-summary'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.yourOffer, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          Text(structureLabel(l, q.structure),
              style: TextStyle(color: q.isIslamic ? SahelColors.islamic : SahelColors.brand, fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: SahelSpace.sm),
          Text(q.structure == FinanceStructure.ijara ? l.monthlyRental : l.monthlyInstallment,
              style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
          Text(context.money(q.monthlyFils), key: const Key('offer-monthly'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: SahelSpace.sm),
          if (productLine != 'personal') ...[
            KeyValueRow(l.price, context.money(q.assetPriceFils, decimals: 0)),
            KeyValueRow(l.downPayment, context.money(q.downPaymentFils, decimals: 0)),
          ],
          KeyValueRow(l.financedAmount, context.money(q.financedFils, decimals: 0)),
          KeyValueRow(l.tenure, l.months('${q.tenureMonths}')),
          if (q.salePriceFils != null) KeyValueRow(l.salePrice, context.money(q.salePriceFils!, decimals: 0)),
          KeyValueRow(q.isIslamic ? l.profitCost : l.interestCost, context.money(q.costOfFinanceFils, decimals: 0)),
          KeyValueRow(l.totalPayable, context.money(q.totalPayableFils, decimals: 0)),
          KeyValueRow(rateLabel, '${q.ratePct}%'),
          if (q.rateBasis != 'apr') KeyValueRow(l.aprEquivalent, '${q.aprPct}%'),
          const SizedBox(height: SahelSpace.sm),
          Text(l.illustrativeDisclaimer, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
        ]),
      ),
    );
  }
}

String structureLabel(AppLocalizations l, FinanceStructure s) => switch (s) {
      FinanceStructure.conventional => l.structureConventional,
      FinanceStructure.murabaha => l.structureMurabaha,
      FinanceStructure.ijara => l.structureIjara,
    };

String statusLabel(AppLocalizations l, String status) => switch (status) {
      'DRAFT' => l.statusDraft,
      'SUBMITTED' => l.statusSubmitted,
      'APPROVED' => l.statusApproved,
      'REFERRED' => l.statusReferred,
      'DECLINED' => l.statusDeclined,
      'OFFER_ACCEPTED' => l.statusOfferAccepted,
      'CONTRACT_SIGNED' => l.statusContractSigned,
      'ASSET_PURCHASED_BY_BCFC' => l.statusAssetPurchased,
      'OWNERSHIP_TRANSFERRED_TO_BCFC' => l.statusOwnershipTransferred,
      'SALE_TO_CUSTOMER' => l.statusSaleToCustomer,
      'VALUATION_CONFIRMED' => l.homeStatusValuationConfirmed,
      'LEASE_STARTED' => l.homeStatusLeaseStarted,
      'OWNERSHIP_TRANSFERRED_TO_CUSTOMER' => l.homeStatusOwnershipToCustomer,
      'DISBURSED' => l.statusDisbursed,
      'COMPLETED' => l.statusCompleted,
      _ => status,
    };

/// Vertical timeline. Consecutive Murabaha or Ijara steps are grouped and explained (BCFC owns before it sells or leases).
class _Timeline extends StatelessWidget {
  const _Timeline(this.steps);
  final List<ApplicationStep> steps;

  static String _kind(ApplicationStep s) => s.murabaha ? 'murabaha' : (s.ijara ? 'ijara' : 'plain');

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final groups = <List<ApplicationStep>>[];
    for (final s in steps) {
      if (groups.isNotEmpty && _kind(groups.last.first) == _kind(s)) {
        groups.last.add(s);
      } else {
        groups.add([s]);
      }
    }
    return Card(
      key: const Key('timeline'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.applicationProgress, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: SahelSpace.sm),
          for (final g in groups)
            if (_kind(g.first) != 'plain')
              Container(
                key: Key('${_kind(g.first)}-steps'),
                margin: const EdgeInsets.symmetric(vertical: SahelSpace.sm),
                padding: const EdgeInsets.all(SahelSpace.sm),
                decoration: BoxDecoration(
                  color: SahelColors.islamicSoft,
                  border: Border.all(color: SahelColors.islamic),
                  borderRadius: BorderRadius.circular(SahelRadius.md),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(g.first.murabaha ? l.murabahaSequenceNote : l.homeIjaraSequenceNote,
                      style: const TextStyle(color: SahelColors.islamic, fontSize: 12, fontWeight: FontWeight.w600)),
                  const SizedBox(height: SahelSpace.sm),
                  for (final s in g) _StepTile(s),
                ]),
              )
            else
              for (final s in g) _StepTile(s),
        ]),
      ),
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile(this.step);
  final ApplicationStep step;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final color = step.murabaha || step.ijara ? SahelColors.islamic : SahelColors.brand;
    final at = step.at;
    return Padding(
      key: Key('step-${step.status}-${step.done ? 'done' : 'upcoming'}'),
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Icon(step.done ? Icons.check_circle : Icons.radio_button_unchecked, size: 18, color: step.done ? color : SahelColors.border),
        ),
        const SizedBox(width: SahelSpace.sm),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(statusLabel(l, step.status),
                style: TextStyle(fontWeight: FontWeight.w500, color: step.done ? null : SahelColors.textMuted)),
            Text(
              at == null ? l.stepUpcoming : DateFormat.MMMd(context.lang).add_Hm().format(at.toLocal()),
              style: const TextStyle(color: SahelColors.textMuted, fontSize: 11),
            ),
            if (step.reviewedByOfficer)
              Text(l.boReviewedByOfficer,
                  key: Key('step-${step.status}-reviewed-by-officer'),
                  style: const TextStyle(color: SahelColors.brand, fontSize: 11, fontWeight: FontWeight.w600)),
          ]),
        ),
      ]),
    );
  }
}

/// Conventional home finance waits for the TRESCO valuation: pay the fee (amount from GET /payments/price), then
/// continue (the API runs the next steps only once it sees the captured payment).
class _ValuationStep extends ConsumerWidget {
  const _ValuationStep(this.action, {required this.onContinue});
  final ApplicationNextAction action;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final fee = ref.watch(paymentPriceProvider((purpose: action.purpose, reference: action.reference))).value;
    return Card(
      key: const Key('valuation-step'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l.homeValuationPending),
          const SizedBox(height: SahelSpace.sm),
          FilledButton(
            key: const Key('pay-valuation'),
            onPressed: fee == null
                ? null
                : () => context.push(CheckoutScreen.link(
                      purpose: action.purpose,
                      amountFils: fee.amountFils,
                      reference: action.reference,
                      label: l.requestValuation,
                    )),
            child: Text(l.homePayValuation(fee == null ? '…' : context.money(fee.amountFils, decimals: 0))),
          ),
          const SizedBox(height: SahelSpace.sm),
          OutlinedButton(key: const Key('continue-fulfilment'), onPressed: onContinue, child: Text(l.homeContinue)),
        ]),
      ),
    );
  }
}
