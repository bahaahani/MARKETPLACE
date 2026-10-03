import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/insurance.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/checkout/checkout_screen.dart';
import 'package:sahel/features/insurance/home_insurance_screen.dart';
import 'package:sahel/features/insurance/insurance_screen.dart';
import 'package:sahel/features/insurance/travel_screen.dart';
import 'package:sahel/features/property/property_detail_screen.dart';

import 'fake_repository.dart';

Future<FakeSahelRepository> pumpApp(WidgetTester tester, {String location = '/'}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeSahelRepository();
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return repo;
}

/// Scroll the given screen's own list (other shell branches keep offstage scrollables alive).
Future<void> scrollTo<T extends Widget>(WidgetTester tester, Finder target, {double delta = 200}) async {
  final list = find.descendant(of: find.byType(T), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(target, delta, scrollable: list);
  await tester.pumpAndSettle();
}

Future<void> tapOn<T extends Widget>(WidgetTester tester, Finder target) async {
  await scrollTo<T>(tester, target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  test('API contract: insurance fixtures parse', () {
    final travel = [for (final j in fixture('travel_quotes')['quotes'] as List) TravelQuote.fromJson(j as Json)];
    expect(travel, hasLength(4));
    final premiums = travel.map((q) => q.premiumFils).toList();
    expect(premiums, [...premiums]..sort());
    final home = HomeQuotes.fromJson(fixture('home_quotes') as Json);
    expect(home.input.propertyId, 'p-saar-villa-4br');
    expect(home.input.buildingSumInsuredFils, 141000000);
    expect(home.input.toRequest(), containsPair('propertyId', 'p-saar-villa-4br'));
    final quote = PolicyQuote.fromJson(fixture('policy_quote_travel') as Json);
    expect(quote.id, startsWith('pq_'));
    expect(PolicyQuote.isQuoteReference('insurance_premium', quote.id), isTrue);
    expect(PolicyQuote.isQuoteReference('installment', quote.id), isFalse);
    final policy = Policy.fromJson(fixture('policy_travel') as Json);
    expect(policy.premiumFils, quote.premiumFils);
    expect(policy.active, isTrue);
    final mine = [for (final j in fixture('me_policies')['items'] as List) Policy.fromJson(j as Json)];
    expect(mine.map((p) => p.status), ['ACTIVE', 'EXPIRED']);
    expect(mine.last.cover.region, 'gcc');
    expect(isoDate(DateTime(2026, 3, 7)), '2026-03-07');
  });

  testWidgets('insurance hub shows motor, travel and home; travel compares insurers and filters Takaful', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance');
    expect(find.byKey(const Key('insurance-line-motor')), findsOneWidget);
    expect(find.byKey(const Key('insurance-line-home')), findsOneWidget);
    await tester.tap(find.byKey(const Key('insurance-line-travel')));
    await tester.pumpAndSettle();
    expect(find.byType(TravelInsuranceScreen), findsOneWidget);
    expect(find.text('Travel insurance'), findsOneWidget);

    // Default request: GCC, Basic, 1 adult, a week from a week ahead.
    final first = repo.travelRequests.last;
    expect(first, containsPair('region', 'gcc'));
    expect(first, containsPair('adults', 1));
    expect(DateTime.parse(first['endDate']! as String).difference(DateTime.parse(first['startDate']! as String)).inDays, 6);

    await scrollTo<TravelInsuranceScreen>(tester, find.byKey(const Key('travel-quote-manama-assurance')));
    expect(find.byKey(const Key('travel-quote-pearl-takaful')), findsOneWidget);
    expect(find.text('BHD 3.150 total'), findsOneWidget);

    // Back to the top for the Takaful filter.
    await tester.drag(find.descendant(of: find.byType(TravelInsuranceScreen), matching: find.byType(Scrollable)).first, const Offset(0, 3000));
    await tester.pumpAndSettle();
    await tapOn<TravelInsuranceScreen>(tester, find.descendant(of: find.byType(TravelInsuranceScreen), matching: find.byKey(const Key('takaful-only'))));
    await scrollTo<TravelInsuranceScreen>(tester, find.byKey(const Key('travel-quote-awal-takaful')));
    expect(find.byKey(const Key('travel-quote-manama-assurance')), findsNothing);
    expect(find.byKey(const Key('travel-quote-dilmun-insurance')), findsNothing);
  });

  testWidgets('travel: more travellers re-quotes; invalid counts show the API error', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/travel');
    final adultsPlus = find.descendant(of: find.byKey(const Key('adults')), matching: find.byKey(const Key('plus')));
    await tapOn<TravelInsuranceScreen>(tester, adultsPlus);
    expect(repo.travelRequests.last, containsPair('adults', 2));
    await tapOn<TravelInsuranceScreen>(tester, find.byKey(const Key('region-worldwide')));
    expect(repo.travelRequests.last, containsPair('region', 'worldwide'));
    for (var i = 0; i < 5; i++) {
      await tapOn<TravelInsuranceScreen>(tester, adultsPlus);
    }
    expect(repo.travelRequests.last, containsPair('adults', 7));
    await scrollTo<TravelInsuranceScreen>(tester, find.byKey(const Key('quote-error')));
    expect(find.text('Check the travellers: 1 to 6 adults and up to 8 children.'), findsOneWidget);
  });

  testWidgets('buy travel insurance: hold the quote, pay it, policy issued', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/travel');
    await tapOn<TravelInsuranceScreen>(tester, find.byKey(const Key('buy-pearl-takaful')));
    final held = repo.heldQuotes.single;
    expect(held['line'], 'travel');
    expect(held['insurerId'], 'pearl-takaful');
    expect((held['input']! as Map)['region'], 'gcc');

    // Checkout pays the server-held premium with the quote id as reference.
    expect(find.byType(CheckoutScreen), findsOneWidget);
    final quote = PolicyQuote.fromJson(fixture('policy_quote_travel') as Json);
    expect(find.text('BHD 3.150'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(repo.payments.values.single, quote.premiumFils);
    expect(repo.confirmedPolicies.single, ('pay_test_1', quote.id));
    expect(find.byKey(const Key('policy-issued')), findsOneWidget);
    expect(find.text('Your policy is issued · SBX-TRV-26-000001'), findsOneWidget);
  });

  testWidgets('installment checkout does not try to issue a policy', (tester) async {
    final repo = await pumpApp(tester, location: '/checkout?purpose=installment&amount=233042&reference=c-1001-15&label=Honda');
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('payment-success')), findsOneWidget);
    expect(repo.confirmedPolicies, isEmpty);
    expect(find.byKey(const Key('policy-issued')), findsNothing);
  });

  testWidgets('home insurance from a property listing: sums suggested by the API, then buy', (tester) async {
    final repo = await pumpApp(tester, location: '/property/p-saar-villa-4br');
    await tapOn<PropertyDetailScreen>(tester, find.byKey(const Key('insure-home')));
    expect(find.byType(HomeInsuranceScreen), findsOneWidget);
    expect(repo.homeRequests.first, {'propertyType': null, 'buildingSumInsuredFils': null, 'contentsSumInsuredFils': null, 'propertyId': 'p-saar-villa-4br'});
    expect(find.text('For: 4-bedroom villa with garden'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('building-sum'))).controller!.text, '141000');
    expect(tester.widget<TextField>(find.byKey(const Key('contents-sum'))).controller!.text, '17500');

    await tapOn<HomeInsuranceScreen>(tester, find.byKey(const Key('buy-dilmun-insurance')));
    expect(repo.heldQuotes.single, {
      'line': 'home',
      'insurerId': 'dilmun-insurance',
      'input': {'propertyType': 'villa', 'buildingSumInsuredFils': 141000000, 'contentsSumInsuredFils': 17500000, 'propertyId': 'p-saar-villa-4br'},
    });
    expect(find.byType(CheckoutScreen), findsOneWidget);
  });

  testWidgets('home insurance: sums are sent as fils and API validation errors are shown', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/home');
    expect(repo.homeRequests.first['buildingSumInsuredFils'], 150000000);
    await tester.enterText(find.byKey(const Key('building-sum')), '9,999.5');
    await tapOn<HomeInsuranceScreen>(tester, find.byKey(const Key('get-quotes')));
    expect(repo.homeRequests.last['buildingSumInsuredFils'], 9999500);
    await scrollTo<HomeInsuranceScreen>(tester, find.byKey(const Key('quote-error')));
    expect(find.textContaining('Check the sums insured'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('building-sum')), 'abc');
    await tapOn<HomeInsuranceScreen>(tester, find.byKey(const Key('get-quotes')));
    expect(repo.homeRequests.last['buildingSumInsuredFils'], 9999500, reason: 'unparseable input is not sent');
    expect(find.byKey(const Key('quote-error')), findsOneWidget);
  });

  testWidgets('motor "Buy" on the hub holds a motor quote for the garage car', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance');
    await tapOn<InsuranceScreen>(tester, find.byKey(const Key('buy-pearl-takaful')));
    expect(repo.heldQuotes.single['line'], 'motor');
    expect(repo.heldQuotes.single['input'], {'vehicleValueFils': 14900000, 'cover': 'comprehensive', 'reference': '123456'});
    expect(find.byType(CheckoutScreen), findsOneWidget);
  });

  testWidgets('account shows My policies with active and expired policies', (tester) async {
    await pumpApp(tester, location: '/account');
    await scrollTo<AccountScreen>(tester, find.byKey(const Key('policy-SBX-TRV-25-000000')));
    expect(find.text('My policies'), findsOneWidget);
    expect(find.byKey(const Key('policy-SBX-TRV-26-000001')), findsOneWidget);
    expect(find.byKey(const Key('policy-status-ACTIVE')), findsOneWidget);
    expect(find.byKey(const Key('policy-status-EXPIRED')), findsOneWidget);
    expect(find.text('Travel · Pearl Takaful (demo)'), findsNWidgets(2));
    expect(find.text('GCC · Basic · 3 travellers'), findsOneWidget);
  });

  testWidgets('Arabic travel screen is right-to-left', (tester) async {
    await pumpApp(tester, location: '/insurance/travel');
    await tester.tap(find.byKey(const Key('language-switch')));
    await tester.pumpAndSettle();
    expect(find.text('تأمين السفر'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(TravelInsuranceScreen))), TextDirection.rtl);
  });
}
