import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/bids/bids_models.dart';
import 'package:sahel/features/cars/car_detail_screen.dart';
import 'package:sahel/features/finance/application_screen.dart';

import 'fake_repository.dart';

/// Records the asset prices the calculator asks the API to quote.
class _QuoteRepository extends FakeSahelRepository {
  final assetPrices = <int>[];

  @override
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    int? downPaymentFils,
    int? tenureMonths,
  }) {
    assetPrices.add(assetPriceFils);
    return super.financeQuotes(productLine: productLine, assetPriceFils: assetPriceFils, downPaymentFils: downPaymentFils, tenureMonths: tenureMonths);
  }
}

/// The API refuses the bid (e.g. it is no longer the accepted one).
class _RefusingRepository extends FakeSahelRepository {
  @override
  Future<FinanceApplication> applyForFinance({
    required String productLine,
    required FinanceStructure structure,
    required int tenureMonths,
    String? vehicleId,
    String? propertyId,
    int? downPaymentFils,
    int? amountFils,
    String? requestId,
    String? bidId,
    bool useTradeIn = false,
    required String idempotencyKey,
  }) async =>
      throw ApiException(409, 'BID_NOT_ACCEPTED', 'this bid was not accepted');
}

Future<T> pumpApp<T extends FakeSahelRepository>(WidgetTester tester, T repo, String location) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return repo;
}

Future<void> scrollTo<T extends Widget>(WidgetTester tester, Finder target, {double delta = 200}) async {
  final list = find.descendant(of: find.byType(T), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(target, delta, scrollable: list);
  await tester.pumpAndSettle();
}

FinanceApplication app(String name) => FinanceApplication.fromJson(fixture(name) as Json);

void main() {
  test('API contract: the accepted request carries the bid link and validity; applications carry the pricing', () {
    final r = BidRequest.fromJson(fixture('bid_request_accepted_crv') as Json);
    expect(r.status, 'CLOSED');
    expect(r.accepted!.applyHref, '/cars/v-honda-crv-2026?requestId=${r.id}&bidId=${r.accepted!.bidId}');
    expect(r.accepted!.validUntil.isAfter(DateTime.now()), isTrue);

    final bid = app('application_crv_bid');
    expect(bid.fromBid, isTrue);
    expect(bid.quote.assetPriceFils, 14400000);
    expect(bid.pricing!.listPriceFils, 14900000);
    expect(bid.pricing!.discountFils, 500000);
    expect(bid.pricing!.priceFils, 14400000);
    expect(bid.pricing!.tradeInCreditFils, 0);
    expect(bid.pricing!.extras, ['service-1y', 'window-tint']);
    expect(bid.pricing!.financedFils, bid.quote.financedFils);
    expect(bid.hasBreakdown, isTrue);

    final both = app('application_crv_bid_tradein');
    expect(both.pricing!.tradeInCreditFils, greaterThan(0));
    expect(both.pricing!.cashDownPaymentFils + both.pricing!.tradeInCreditFils, both.pricing!.downPaymentFils);
    expect(both.pricing!.financedFils, both.pricing!.priceFils - both.pricing!.downPaymentFils);

    // A plain application keeps working: no breakdown.
    final plain = app('application_crv');
    expect(plain.fromBid, isFalse);
    expect(plain.hasBreakdown, isFalse);
    expect(plain.pricing, isNull);
  });

  testWidgets('car page with the accepted bid: bid price in the calculator, apply names the bid, application shows the breakdown',
      (tester) async {
    final r = BidRequest.fromJson(fixture('bid_request_accepted_crv') as Json);
    final repo = _QuoteRepository()..requestState = 'bid_request_accepted_crv';
    await pumpApp(tester, repo, r.accepted!.applyHref);

    expect(find.byType(CarDetailScreen), findsOneWidget);
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('car-bid')));
    expect(find.byKey(const Key('car-bid')), findsOneWidget);
    expect(find.text('BHD 14,400'), findsWidgets);
    expect(find.text('−BHD 500'), findsOneWidget);
    expect(find.text('1 year free service'), findsOneWidget);
    // The calculator prices the discounted car.
    expect(repo.assetPrices.last, 14400000);

    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();
    final sent = repo.applied.single;
    expect(sent['requestId'], r.id);
    expect(sent['bidId'], r.accepted!.bidId);
    expect(sent['useTradeIn'], false);
    // Never a price: only ids.
    expect(sent.keys, isNot(contains('assetPriceFils')));

    expect(find.byType(ApplicationScreen), findsOneWidget);
    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('pricing-breakdown')));
    expect(find.byKey(const Key('pricing-from-bid')), findsOneWidget);
    expect(find.text('BHD 14,900'), findsOneWidget);
    expect(find.text('−BHD 500'), findsOneWidget);
    expect(find.text('BHD 14,400'), findsWidgets);
    expect(find.text('Window tint'), findsOneWidget);
    expect(find.byKey(const Key('pricing-tradein-note')), findsNothing);
  });

  testWidgets('"Use my trade-in" together with the bid: apply asks for the trade-in and the application shows the credit',
      (tester) async {
    final r = BidRequest.fromJson(fixture('bid_request_accepted_crv') as Json);
    final repo = FakeSahelRepository()
      ..requestState = 'bid_request_accepted_crv'
      ..tradeInActive = true;
    await pumpApp(tester, repo, r.accepted!.applyHref);

    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('tradein-use-button')));
    await tester.tap(find.byKey(const Key('tradein-use-button')));
    await tester.pumpAndSettle();
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();

    final sent = repo.applied.single;
    expect(sent['bidId'], r.accepted!.bidId);
    expect(sent['useTradeIn'], true);

    final both = app('application_crv_bid_tradein');
    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('pricing-breakdown')));
    expect(find.text('Trade-in credit BHD 10,500, credited at delivery.'), findsOneWidget);
    expect(find.text('−BHD 10,500'), findsOneWidget);
    expect(both.pricing!.cashDownPaymentFils, 0);
    expect(find.text('BHD 0'), findsOneWidget);
  });

  testWidgets('without a bid link or trade-in the application is unchanged: list price, no breakdown', (tester) async {
    final repo = await pumpApp(tester, FakeSahelRepository(), '/cars/v-honda-crv-2026');
    expect(find.byKey(const Key('car-bid')), findsNothing);
    expect(find.byKey(const Key('car-bid-unavailable')), findsNothing);
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();
    expect(repo.applied.single['requestId'], isNull);
    expect(repo.applied.single['bidId'], isNull);
    expect(repo.applied.single['useTradeIn'], false);
    expect(find.byType(ApplicationScreen), findsOneWidget);
    expect(find.byKey(const Key('pricing-breakdown')), findsNothing);
  });

  testWidgets('a bid link that is not the customer\'s falls back to the list price', (tester) async {
    // No request in the fake: GET /requests/{id} is 404, like another customer's request.
    final repo = await pumpApp(tester, _QuoteRepository(), '/cars/v-honda-crv-2026?requestId=breq_forged&bidId=bid_forged');
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('car-bid-unavailable')));
    expect(find.byKey(const Key('car-bid')), findsNothing);
    expect(repo.assetPrices.last, 14900000);
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();
    expect(repo.applied.single['bidId'], isNull);
  });

  testWidgets('the API refusing the bid shows a clear message, not the generic error', (tester) async {
    final r = BidRequest.fromJson(fixture('bid_request_accepted_crv') as Json);
    final repo = _RefusingRepository()..requestState = 'bid_request_accepted_crv';
    await pumpApp(tester, repo, r.accepted!.applyHref);
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('apply-error-bid')), findsOneWidget);
    expect(find.byType(CarDetailScreen), findsOneWidget);
  });
}
