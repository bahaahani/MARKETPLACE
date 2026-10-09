import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/config.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/bids/bid_request_detail_screen.dart';
import 'package:sahel/features/bids/bid_request_screen.dart';
import 'package:sahel/features/bids/bids_models.dart';
import 'package:sahel/features/cars/car_detail_screen.dart';
import 'package:sahel/features/home/home_screen.dart';

import 'fake_repository.dart';

Future<FakeSahelRepository> pumpApp(WidgetTester tester, {String location = '/', String? requestState}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeSahelRepository()..requestState = requestState;
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return repo;
}

Future<void> scrollTo<T extends Widget>(WidgetTester tester, Finder target, {bool up = false}) async {
  final list = find.descendant(of: find.byType(T), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(target, up ? -200 : 200, scrollable: list);
  await tester.pumpAndSettle();
}

Future<void> tapOn<T extends Widget>(WidgetTester tester, Finder target) async {
  await scrollTo<T>(tester, target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

BidRequest request(String name) => BidRequest.fromJson(fixture(name) as Json);

void main() {
  test('API contract: Bid For Me fixtures parse', () {
    final rules = ClientConfig.fromJson(fixture('config') as Json).bids!;
    expect(rules.structures, ['conventional', 'murabaha']);
    expect(rules.canPost, isTrue);
    expect(rules.maxMonthlyFils, 370000); // demo customer's DBR headroom on the BHD 5 step
    expect(rules.validityHours, 72);
    expect(rules.tradeIn, isNull);
    expect(ClientConfig.fromJson(fixture('config_onboarded') as Json).bids, isNotNull);

    final open = request('bid_request_open');
    expect(open.status, 'OPEN');
    expect(open.criteria.bodyType, 'suv');
    expect(open.terms.structure, 'murabaha');
    expect(open.instantMatches.map((m) => m.vehicle.id), ['v-haval-jolion-2026', 'v-haval-h9-2026', 'v-honda-crv-2026']);
    expect(open.instantMatches.first.href, '/cars/v-haval-jolion-2026');
    expect(open.instantMatches.first.pricing.insurance!.takaful, isTrue);
    expect(open.bids, isEmpty);
    expect(open.expiresAt.difference(DateTime.now()).inHours, lessThanOrEqualTo(72));

    final withBids = request('bid_request_bids');
    expect(withBids.bids.map((b) => b.sellerId), ['nmc', 'tac']); // cheapest monthly first
    expect(withBids.bids.map((b) => b.rank), [1, 2]);
    expect(withBids.bids.every((b) => b.pricing.monthlyFils <= withBids.terms.maxMonthlyFils), isTrue);
    expect(withBids.bids.last.pricing.discountFils, 2925000);
    expect(request('bid_request_bids_extras').bids.first.sellerId, 'tac'); // 3 years of service + floor mats

    final accepted = request('bid_request_accepted');
    expect(accepted.status, 'CLOSED');
    expect(accepted.accepted!.applyHref, '/cars/v-nissan-patrol-2021?requestId=${accepted.id}&bidId=${accepted.accepted!.bidId}');
    expect(accepted.bids.map((b) => b.status).toSet(), {'ACCEPTED', 'LOST'});
    expect(accepted.canAccept, isFalse);
    expect(request('bid_request_cancelled').status, 'CANCELLED');
    expect((fixture('me_requests')['items'] as List), hasLength(1));
    final overBudget = jsonDecode(File('test/fixtures/bid_over_budget.json').readAsStringSync()) as Json;
    expect((overBudget['error'] as Json)['code'], 'OVER_BUDGET');

    final draft = const BidRequestDraft(
      bodyType: 'suv',
      condition: 'any',
      fuel: 'any',
      maxMonthlyFils: 300000,
      structure: 'murabaha',
      tenureMonths: 60,
      downPaymentFils: 3000000,
      useTradeIn: false,
      insurance: 'takaful',
    ).toJson();
    expect(draft['minYear'], isNull);
    expect(draft['maxMonthlyFils'], 300000);
  });

  testWidgets('"Bid For Me" from home: post an SUV request and see instant matches', (tester) async {
    final repo = await pumpApp(tester);
    await tapOn<HomeScreen>(tester, find.byKey(const Key('bid-entry')));
    expect(find.byType(NewBidRequestScreen), findsOneWidget);

    await tapOn<NewBidRequestScreen>(tester, find.byKey(const Key('bid-body-suv')));
    await scrollTo<NewBidRequestScreen>(tester, find.byKey(const Key('bid-max-monthly')));
    await tester.enterText(find.byKey(const Key('bid-max-monthly')), '300');
    await scrollTo<NewBidRequestScreen>(tester, find.byKey(const Key('bid-down-payment')));
    await tester.enterText(find.byKey(const Key('bid-down-payment')), '3000');
    await tapOn<NewBidRequestScreen>(tester, find.byKey(const Key('bid-structure-murabaha')));
    await tapOn<NewBidRequestScreen>(tester, find.byKey(const Key('bid-post')));

    final body = repo.postedRequests.single;
    expect(body['bodyType'], 'suv');
    expect(body['maxMonthlyFils'], 300000);
    expect(body['downPaymentFils'], 3000000);
    expect(body['structure'], 'murabaha');
    expect(body['tenureMonths'], 60);
    expect(body['insurance'], 'takaful');

    expect(find.byType(BidRequestDetailScreen), findsOneWidget);
    expect(find.byKey(const Key('request-status-OPEN')), findsOneWidget);
    expect(find.byKey(const Key('bids-empty')), findsOneWidget);
    final first = request('bid_request_open').instantMatches.first;
    await scrollTo<BidRequestDetailScreen>(tester, find.byKey(const Key('instant-v-haval-jolion-2026')));
    expect(find.text('${formatBhd(first.pricing.monthlyFils, 'en')} / month'), findsOneWidget);
  });

  testWidgets('a maximum monthly above the pre-approval shows the reason and does not post', (tester) async {
    final repo = await pumpApp(tester, location: '/requests/new');
    await scrollTo<NewBidRequestScreen>(tester, find.byKey(const Key('bid-max-monthly')));
    await tester.enterText(find.byKey(const Key('bid-max-monthly')), '900');
    await tapOn<NewBidRequestScreen>(tester, find.byKey(const Key('bid-post')));
    expect(find.text('That monthly is above what your pre-approval allows. Lower it to post.'), findsOneWidget);
    expect(find.byType(NewBidRequestScreen), findsOneWidget);
    expect(repo.requestState, isNull);
  });

  testWidgets('with an open request, the form links to it instead', (tester) async {
    await pumpApp(tester, location: '/requests/new', requestState: 'bid_request_open');
    expect(find.byKey(const Key('bid-open-exists')), findsOneWidget);
    expect(find.byKey(const Key('bid-post')), findsNothing);
  });

  testWidgets('compare bids, accept one, then apply for finance on the car', (tester) async {
    final r = request('bid_request_bids');
    final repo = await pumpApp(tester, location: '/requests/${r.id}', requestState: 'bid_request_bids');
    final nmc = r.bids.first;
    final tac = r.bids.last;
    expect(find.byKey(Key('bid-${nmc.id}')), findsOneWidget);
    expect(find.text('#1'), findsOneWidget);
    expect(find.text('${formatBhd(tac.pricing.monthlyFils, 'en')} / month'), findsOneWidget);
    expect(find.text('Discount BHD 2,925'), findsOneWidget);

    // Ranking comes from the API.
    await tapOn<BidRequestDetailScreen>(tester, find.byKey(const Key('bid-sort')));
    await tester.tap(find.text('Most extras').last);
    await tester.pumpAndSettle();
    expect(repo.requestedSorts.last, 'extras');

    await tapOn<BidRequestDetailScreen>(tester, find.byKey(Key('accept-${tac.id}')));
    expect(repo.acceptedBids.single, (r.id, tac.id));
    await scrollTo<BidRequestDetailScreen>(tester, find.byKey(const Key('request-status-CLOSED')), up: true);
    expect(find.textContaining("You accepted Tasheelat Automotive's bid"), findsOneWidget);
    expect(find.byKey(const Key('bid-cancel')), findsNothing);

    await tapOn<BidRequestDetailScreen>(tester, find.byKey(const Key('bid-apply-link')));
    expect(find.byType(CarDetailScreen), findsOneWidget);
  });

  testWidgets('cancel an open request', (tester) async {
    final r = request('bid_request_open');
    final repo = await pumpApp(tester, location: '/requests/${r.id}', requestState: 'bid_request_open');
    await tapOn<BidRequestDetailScreen>(tester, find.byKey(const Key('bid-cancel')));
    expect(repo.cancelledRequests.single, r.id);
    expect(find.byKey(const Key('request-status-CANCELLED')), findsOneWidget);
  });
}
