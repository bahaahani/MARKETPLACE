import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/config.dart';
import 'package:sahel/core/models/tradein.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/cars/car_detail_screen.dart';
import 'package:sahel/features/tradein/tradein_screen.dart';

import 'fake_repository.dart';

/// Records the down payments the calculator asks the API to quote.
class _TradeInRepository extends FakeSahelRepository {
  final quotedDownPayments = <int?>[];

  @override
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    int? downPaymentFils,
    int? tenureMonths,
  }) {
    quotedDownPayments.add(downPaymentFils);
    return super.financeQuotes(productLine: productLine, assetPriceFils: assetPriceFils, downPaymentFils: downPaymentFils, tenureMonths: tenureMonths);
  }
}

/// Answers every valuation like the API answers an unknown model.
class _UnknownModelRepository extends _TradeInRepository {
  @override
  Future<TradeInOffer> valueTradeIn(Json request) => super.valueTradeIn({...request, 'model': 'Camri'});
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

void main() {
  test('API contract: trade-in fixtures parse; config carries the form rules with the plate masked', () {
    final rules = ClientConfig.fromJson(fixture('config') as Json).tradeIn!;
    expect(rules.conditions, ['excellent', 'good', 'fair', 'poor']);
    expect(rules.makes['Honda'], contains('CR-V'));
    expect(rules.minYear, lessThan(rules.maxYear));
    expect(rules.garage.single.plateMasked, '****56');
    expect(ClientConfig.fromJson(fixture('config_onboarded') as Json).tradeIn, isNotNull);

    final offer = TradeInOffer.fromJson(fixture('tradein_offer') as Json);
    expect(offer.offerFils, offer.rangeLowFils);
    expect(offer.rangeLowFils, lessThan(offer.rangeHighFils));
    expect(offer.plateMasked, '****56');
    expect(offer.breakdown.first.code, 'reference');
    final active = TradeInStatus.fromJson(fixture('tradein_active_crv') as Json);
    expect(active.offer!.id, offer.id);
    expect(active.forVehicle!.downPaymentFils, offer.offerFils); // below the CR-V's maximum down payment
    final none = TradeInStatus.fromJson(fixture('tradein_none') as Json);
    expect(none.offer, isNull);
    expect(none.forVehicle, isNull);
  });

  testWidgets('value the My Garage car from the account screen: pre-filled, plate masked, offer with range and breakdown', (tester) async {
    final repo = await pumpApp(tester, _TradeInRepository(), '/account');
    final entry = find.byKey(const Key('garage-tradein-v-honda-crv-2026'));
    await scrollTo<AccountScreen>(tester, entry);
    await tester.tap(entry);
    await tester.pumpAndSettle();

    expect(find.byType(TradeInScreen), findsOneWidget);
    expect(find.textContaining('not AI'), findsOneWidget);
    expect(find.text('****56'), findsOneWidget);
    expect(find.textContaining('123456'), findsNothing);
    expect(tester.widget<TextField>(find.byKey(const Key('tradein-mileage'))).controller!.text, '27850');

    await tester.ensureVisible(find.byKey(const Key('tradein-submit')));
    await tester.tap(find.byKey(const Key('tradein-submit')));
    await tester.pumpAndSettle();
    expect(repo.tradeInRequests.single, {'garageVehicleId': 'v-honda-crv-2026', 'mileageKm': 27850, 'condition': 'good', 'accidentHistory': false});

    final offer = find.byKey(const Key('tradein-offer'));
    await scrollTo<TradeInScreen>(tester, offer);
    expect(tester.widget<Text>(offer).data, 'BHD 10,500');
    expect(find.text('BHD 10,500 to BHD 12,000'), findsOneWidget);
    expect(find.textContaining('Valid until'), findsOneWidget);
    expect(find.text('Reference price (2026 model)'), findsOneWidget);
    expect(find.textContaining('#****56'), findsOneWidget);
  });

  testWidgets('an unknown model shows the API suggestions', (tester) async {
    await pumpApp(tester, _UnknownModelRepository(), '/trade-in');
    await tester.ensureVisible(find.byKey(const Key('tradein-submit')));
    await tester.tap(find.byKey(const Key('tradein-submit')));
    await tester.pumpAndSettle();
    expect(find.text('Did you mean: Camry?'), findsOneWidget);
    expect(find.byKey(const Key('tradein-result')), findsNothing);
  });

  testWidgets('car page: "Use my trade-in" restarts the calculator from the down payment the API returns', (tester) async {
    final repo = _TradeInRepository()..tradeInActive = true;
    await pumpApp(tester, repo, '/cars/v-honda-crv-2026');
    final use = find.byKey(const Key('tradein-use-button'));
    await scrollTo<CarDetailScreen>(tester, use);
    expect(find.text('Use my trade-in (BHD 10,500)'), findsOneWidget);
    expect(repo.quotedDownPayments.last, isNull); // listing default until used

    await tester.tap(use);
    await tester.pumpAndSettle();
    expect(find.text('Trade-in applied: BHD 10,500 down payment.'), findsOneWidget);
    expect(find.textContaining('credited at delivery'), findsOneWidget);
    expect(repo.quotedDownPayments.last, 10500000);
    expect(find.descendant(of: find.byKey(const Key('finance-calculator')), matching: find.text('BHD 10,500')), findsOneWidget);

    // "Apply for finance" (unchanged) applies for what the calculator shows.
    final apply = find.byKey(const Key('apply-finance'));
    await scrollTo<CarDetailScreen>(tester, apply, delta: -200);
    await tester.tap(apply);
    await tester.pumpAndSettle();
    expect(repo.applied.single['downPaymentFils'], 10500000);
  });

  testWidgets('car page without an offer shows only the calculator; withdrawing removes the offer', (tester) async {
    final repo = await pumpApp(tester, _TradeInRepository(), '/cars/v-honda-crv-2026');
    expect(find.byKey(const Key('tradein-use')), findsNothing);
    expect(find.byKey(const Key('finance-calculator')), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('tradein-entry')));
    await tester.pumpAndSettle();
    expect(find.byType(TradeInScreen), findsOneWidget);

    repo.tradeInActive = true;
    await tester.ensureVisible(find.byKey(const Key('tradein-submit')));
    await tester.tap(find.byKey(const Key('tradein-submit')));
    await tester.pumpAndSettle();
    final withdraw = find.byKey(const Key('tradein-withdraw'));
    await scrollTo<TradeInScreen>(tester, withdraw);
    await tester.tap(withdraw);
    await tester.pumpAndSettle();
    expect(repo.tradeInActive, isFalse);
    expect(find.text('Offer withdrawn.'), findsOneWidget);
    expect(find.byKey(const Key('tradein-result')), findsNothing);
  });

  testWidgets('cars screen links to the trade-in screen, in Arabic too', (tester) async {
    await pumpApp(tester, _TradeInRepository(), '/cars');
    await tester.tap(find.byKey(const Key('language-switch')).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('tradein-entry')));
    await tester.pumpAndSettle();
    expect(find.text('استبدل سيارتك'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(TradeInScreen))), TextDirection.rtl);
  });

  test('ApiException carries suggestions', () {
    expect(ApiException(422, 'UNKNOWN_MAKE', 'x', suggestions: ['Toyota']).suggestions, ['Toyota']);
    expect(ApiException(422, 'X', 'y').suggestions, isEmpty);
  });
}
