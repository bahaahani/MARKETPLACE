import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'bids_models.dart';
import 'bids_providers.dart';

/// The customer's request: instant matches and dealer bids ranked by the API (monthly, total cost or extras), accept and
/// cancel. Mirrors /{locale}/requests/{id} on the web, and polls the API every `pollSeconds` while the request is open.
class BidRequestDetailScreen extends ConsumerStatefulWidget {
  const BidRequestDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<BidRequestDetailScreen> createState() => _BidRequestDetailScreenState();
}

class _BidRequestDetailScreenState extends ConsumerState<BidRequestDetailScreen> {
  BidRequest? _request;
  Object? _loadError;
  String _sort = 'monthly';
  bool _busy = false;
  bool _actionError = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await ref.read(repositoryProvider).bidRequest(widget.id, sort: _sort);
      if (!mounted) return;
      setState(() {
        _request = r;
        _loadError = null;
      });
      _schedule(r);
    } catch (e) {
      // A failed poll keeps the last board; only the first load shows the error.
      if (mounted && _request == null) setState(() => _loadError = e);
    }
  }

  void _schedule(BidRequest r) {
    _poll?.cancel();
    _poll = r.open ? Timer(Duration(seconds: r.pollSeconds), _load) : null;
  }

  Future<void> _act(Future<BidRequest> Function() action) async {
    setState(() {
      _busy = true;
      _actionError = false;
    });
    try {
      final r = await action();
      ref.invalidate(myBidRequestsProvider);
      if (mounted) setState(() => _request = r);
      _schedule(r);
    } catch (_) {
      if (mounted) setState(() => _actionError = true);
      await _load();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final r = _request;
    return Scaffold(
      appBar: AppBar(title: Text(l.bidRequestTitle), actions: const [LanguageButton()]),
      body: r == null
          ? AsyncView<BidRequest>(
              value: _loadError != null ? AsyncValue.error(_loadError!, StackTrace.empty) : const AsyncValue.loading(),
              onRetry: () {
                setState(() => _loadError = null);
                _load();
              },
              data: (_) => const SizedBox.shrink(),
            )
          : RefreshIndicator(onRefresh: _load, child: _board(context, r)),
    );
  }

  Widget _board(BuildContext context, BidRequest r) {
    final l = context.l10n;
    final repo = ref.read(repositoryProvider);
    final c = r.criteria;
    final chips = [
      bidBodyLabel(l, c.bodyType),
      bidConditionLabel(l, c.condition),
      if (c.minYear != null) '${l.bidMinYear} ${c.minYear}',
      if (c.maxMileageKm != null) '${l.bidMaxMileage} ${l.km(context.number(c.maxMileageKm!))}',
      if (c.fuel != 'any') bidFuelLabel(l, c.fuel),
      if (c.minSeats != null) l.bidSeatsAtLeast('${c.minSeats}'),
      bidStructureLabel(l, r.terms.structure),
      l.months('${r.terms.tenureMonths}'),
      l.bidDownPaymentValue(context.money(r.terms.downPaymentFils, decimals: 0)),
      bidInsuranceLabel(l, r.terms.insurance),
    ];
    final accepted = r.accepted == null ? null : r.bids.where((b) => b.id == r.accepted!.bidId).firstOrNull;
    // Bahrain is UTC+3 all year.
    final expires = DateFormat.MMMd(context.lang).add_Hm().format(r.expiresAt.toUtc().add(const Duration(hours: 3)));
    return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
      Row(children: [
        Expanded(
          child: Text(l.bidSummaryMonthly(context.money(r.terms.maxMonthlyFils, decimals: 0)),
              key: const Key('request-max-monthly'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: SahelColors.brand)),
        ),
        Pill(bidRequestStatusLabel(l, r.status), key: Key('request-status-${r.status}')),
      ]),
      const SizedBox(height: SahelSpace.xs),
      PillRow([for (final x in chips) Pill(x, color: SahelColors.text, background: SahelColors.background)], compact: true),
      if (r.open) ...[
        const SizedBox(height: SahelSpace.xs),
        Text('${l.bidExpiresAt(expires)} · ${l.bidLiveRefresh('${r.pollSeconds}')}',
            key: const Key('request-expires'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      ],
      if (accepted != null) ...[
        const SizedBox(height: SahelSpace.md),
        Card(
          key: const Key('bid-accepted'),
          color: SahelColors.islamicSoft,
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('✓ ${l.bidAcceptedTitle(context.loc(accepted.sellerName))}', style: const TextStyle(fontWeight: FontWeight.bold, color: SahelColors.islamic)),
              Text(accepted.vehicle.title, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(l.bidAcceptedBody),
              const SizedBox(height: SahelSpace.sm),
              FilledButton(key: const Key('bid-apply-link'), onPressed: () => context.push(r.accepted!.applyHref), child: Text(l.bidApplyCta)),
            ]),
          ),
        ),
      ],
      SectionHeader('${l.bidBidsTitle} (${r.bidCount})'),
      DropdownButtonFormField<String>(
        key: const Key('bid-sort'),
        initialValue: _sort,
        decoration: InputDecoration(labelText: l.bidSortBy),
        items: [for (final s in const ['monthly', 'total', 'extras']) DropdownMenuItem(value: s, child: Text(bidSortLabel(l, s)))],
        onChanged: (s) {
          if (s == null) return;
          setState(() => _sort = s);
          _load();
        },
      ),
      const SizedBox(height: SahelSpace.sm),
      if (_actionError) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
      if (r.bids.isEmpty) Text(l.bidBidsEmpty, key: const Key('bids-empty'), style: const TextStyle(color: SahelColors.textMuted)),
      for (final b in r.bids)
        _OfferCard(
          key: Key('bid-${b.id}'),
          title: b.vehicle.title,
          seller: context.loc(b.sellerName),
          pricing: b.pricing,
          badge: b.status == 'ACTIVE' ? (b.rank == null ? null : l.bidRank('${b.rank}')) : bidStatusLabel(l, b.status),
          extras: [for (final x in b.extras) bidExtraLabel(l, x)],
          action: r.canAccept && b.status == 'ACTIVE'
              ? FilledButton(
                  key: Key('accept-${b.id}'),
                  onPressed: _busy ? null : () => _act(() => repo.acceptBid(r.id, b.id)),
                  child: Text(l.bidAccept),
                )
              : null,
        ),
      SectionHeader(l.bidInstantTitle),
      Text(l.bidInstantSubtitle, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      if (r.instantMatches.isEmpty) Text(l.bidInstantEmpty, key: const Key('instant-empty')),
      for (final m in r.instantMatches)
        _OfferCard(
          key: Key('instant-${m.vehicle.id}'),
          title: m.vehicle.title,
          seller: context.loc(m.sellerName),
          pricing: m.pricing,
          action: TextButton(onPressed: () => context.push(m.href), child: Text(l.bidViewCar)),
        ),
      if (r.canCancel) ...[
        const SizedBox(height: SahelSpace.md),
        OutlinedButton(
          key: const Key('bid-cancel'),
          onPressed: _busy ? null : () => _act(() => repo.cancelBidRequest(r.id)),
          child: Text(l.bidCancel, style: const TextStyle(color: SahelColors.danger)),
        ),
      ],
      const SizedBox(height: SahelSpace.sm),
      Text('⚠️ ${l.bidSandboxNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
    ]);
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({super.key, required this.title, required this.seller, required this.pricing, this.badge, this.extras = const [], this.action});
  final String title;
  final String seller;
  final BidPricing pricing;
  final String? badge;
  final List<String> extras;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    const muted = TextStyle(color: SahelColors.textMuted, fontSize: 12);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold))),
            if (badge != null) Pill(badge!),
          ]),
          Text(seller, style: muted),
          Text(l.bidMonthly(context.money(pricing.monthlyFils)), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: SahelColors.brand)),
          Text('${l.bidNetPrice(context.money(pricing.priceFils, decimals: 0))} · ${l.bidDownPaymentValue(context.money(pricing.downPaymentFils, decimals: 0))}', style: muted),
          Text(l.bidTotalCost(context.money(pricing.totalCostFils, decimals: 0)), style: muted),
          if (pricing.discountFils > 0)
            Text(l.bidDiscount(context.money(pricing.discountFils, decimals: 0)), style: const TextStyle(color: SahelColors.islamic, fontWeight: FontWeight.w600)),
          if (pricing.insurance != null)
            Text(l.bidInsuranceEstimate(context.loc(pricing.insurance!.insurerName), context.money(pricing.insurance!.annualPremiumFils, decimals: 0)), style: muted),
          if (extras.isNotEmpty)
            PillRow([for (final x in extras) Pill(x, color: SahelColors.islamic, background: SahelColors.islamicSoft)], compact: true),
          if (action != null) Align(alignment: AlignmentDirectional.centerEnd, child: action),
        ]),
      ),
    );
  }
}
