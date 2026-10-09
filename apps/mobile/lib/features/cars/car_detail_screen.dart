import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:intl/intl.dart' show DateFormat;

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';
import '../bids/bids_models.dart';
import '../bids/bids_providers.dart';
import '../checkout/checkout_screen.dart';
import '../finance/apply_button.dart';
import '../finance/finance_calculator.dart';
import '../insurance/insurance_quotes.dart';
import '../tradein/tradein_screen.dart';

class CarDetailScreen extends ConsumerStatefulWidget {
  const CarDetailScreen({super.key, required this.id, this.requestId, this.bidId});
  final String id;

  /// The accepted "Bid For Me" bid to apply with (from the request page's apply link). The API checks it again when
  /// the customer applies and prices the application from it.
  final String? requestId;
  final String? bidId;

  @override
  ConsumerState<CarDetailScreen> createState() => _CarDetailScreenState();
}

class _CarDetailScreenState extends ConsumerState<CarDetailScreen> {
  /// Carried from the finance calculator, so "Apply for finance" applies for what is shown.
  FinanceSelection? _selection;

  /// Down payment from the session's trade-in offer, once the customer chose to use it (computed by the API).
  int? _tradeInDownFils;

  /// "Use my trade-in" was pressed: applying asks the API to count the customer's offer in the down payment.
  bool _useTradeIn = false;

  /// The accepted bid for this car from the customer's own request (null if it is not the accepted one for this car).
  Bid? _acceptedBid(BidRequest? r) {
    final a = r?.accepted;
    if (r == null || a == null || a.bidId != widget.bidId || a.vehicleId != widget.id) return null;
    return r.bids.where((b) => b.id == a.bidId).firstOrNull;
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final id = widget.id;
    final car = ref.watch(vehicleProvider(id));
    final sel = _selection;
    final requestId = widget.requestId;
    final bidId = widget.bidId;
    final hasBidLink = requestId != null && bidId != null;
    final request = hasBidLink ? ref.watch(bidRequestProvider(requestId)) : null;
    final bid = _acceptedBid(request?.value);
    // The price actually financed: the accepted bid's, else the list price.
    // Reservation deposit from GET /config (same value as the web).
    final deposit = ref.watch(configProvider).value?.reservationDepositFils;
    return Scaffold(
      appBar: AppBar(actions: const [LanguageButton()]),
      body: AsyncView(
        value: car,
        onRetry: () => ref.invalidate(vehicleProvider(id)),
        data: (v) => ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              AssetArt(hue: v.accentHue, icon: Icons.directions_car, height: 200),
              Padding(
                padding: const EdgeInsets.all(SahelSpace.md),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${v.title} ${v.trim}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                  Text(
                    [
                      '${v.year}',
                      v.isNew ? l.conditionNew : l.conditionUsed,
                      if (!v.isNew) l.km(context.number(v.mileageKm)),
                      l.seats('${v.seats}'),
                      context.loc(v.color),
                    ].join(' · '),
                    style: const TextStyle(color: SahelColors.textMuted),
                  ),
                  Text(l.soldBy(context.loc(v.seller.name)), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
                  const SizedBox(height: SahelSpace.sm),
                  Text(context.money(v.priceFils, decimals: 0), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: SahelSpace.md),
                  FilledButton(
                    key: const Key('reserve'),
                    onPressed: deposit == null
                        ? null
                        : () => context.push(CheckoutScreen.link(
                              purpose: 'reservation_deposit',
                              amountFils: deposit,
                              reference: v.id,
                              label: '${v.title} ${v.year}',
                            )),
                    child: Text(l.reserveCar(deposit == null ? '…' : context.money(deposit, decimals: 0))),
                  ),
                  const SizedBox(height: SahelSpace.sm),
                  ApplyButton(
                    filled: false,
                    terms: sel == null
                        ? null
                        : (
                            productLine: 'vehicle',
                            structure: sel.structure,
                            tenureMonths: sel.tenureMonths,
                            vehicleId: v.id,
                            propertyId: null,
                            downPaymentFils: sel.downPaymentFils,
                            amountFils: null,
                            requestId: bid == null ? null : requestId,
                            bidId: bid == null ? null : bidId,
                            useTradeIn: _useTradeIn,
                          ),
                  ),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: SahelSpace.md),
          if (bid != null) _AcceptedBidCard(bid: bid, validUntil: request!.value!.accepted!.validUntil),
          if (hasBidLink && bid == null && (request!.hasError || request.hasValue))
            Padding(
              padding: const EdgeInsets.only(bottom: SahelSpace.md),
              child: Text(l.carryBidUnavailable, key: const Key('car-bid-unavailable'), style: const TextStyle(color: SahelColors.textMuted)),
            ),
          TradeInUseCard(
            vehicleId: v.id,
            onUse: (down) => setState(() {
              _tradeInDownFils = down;
              _useTradeIn = true;
            }),
          ),
          FinanceCalculator(
            // Restarts from the trade-in down payment when the customer uses their offer, and at the bid's price.
            key: ValueKey('calc-${_tradeInDownFils ?? 'listing'}-${bid?.pricing.priceFils ?? v.priceFils}'),
            productLine: 'vehicle',
            assetPriceFils: bid?.pricing.priceFils ?? v.priceFils,
            initialDownPaymentFils: _tradeInDownFils,
            onChanged: (s) => setState(() => _selection = s),
          ),
          const SizedBox(height: SahelSpace.md),
          InsuranceQuotes(vehicleValueFils: v.priceFils, reference: v.id),
        ]),
      ),
    );
  }
}

/// The customer's accepted bid on this car: list price, the dealer's discount, the bid price and the extras, all from the
/// API (GET /requests/{id}). The finance calculator and Apply use this price; the API checks the bid again on apply.
class _AcceptedBidCard extends StatelessWidget {
  const _AcceptedBidCard({required this.bid, required this.validUntil});
  final Bid bid;
  final DateTime validUntil;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = bid.pricing;
    final until = DateFormat.MMMd(context.lang).add_Hm().format(validUntil.toUtc().add(const Duration(hours: 3)));
    return Card(
      key: const Key('car-bid'),
      color: SahelColors.islamicSoft,
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('✓ ${l.carryBidTitle(context.loc(bid.sellerName))}', style: const TextStyle(fontWeight: FontWeight.bold, color: SahelColors.islamic)),
          const SizedBox(height: SahelSpace.xs),
          KeyValueRow(l.carryBidListPrice, context.money(p.listPriceFils, decimals: 0)),
          if (p.discountFils > 0) KeyValueRow(l.carryBidDiscount, '−${context.money(p.discountFils, decimals: 0)}'),
          Row(children: [
            Expanded(child: Text(l.carryBidPrice, style: const TextStyle(fontWeight: FontWeight.bold))),
            Text(context.money(p.priceFils, decimals: 0), key: const Key('car-bid-price'), style: const TextStyle(fontWeight: FontWeight.bold)),
          ]),
          if (bid.extras.isNotEmpty) ...[
            const SizedBox(height: SahelSpace.xs),
            Text(l.carryBidExtras, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
            PillRow([for (final x in bid.extras) Pill(bidExtraLabel(l, x), color: SahelColors.islamic, background: SahelColors.surface)], compact: true),
          ],
          const SizedBox(height: SahelSpace.xs),
          Text(l.carryBidValidUntil(until), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
          Text(l.carryBidApplyNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
        ]),
      ),
    );
  }
}
