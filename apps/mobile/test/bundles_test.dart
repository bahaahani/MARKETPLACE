import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/bundles.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/bundles/life_events_screen.dart';
import 'package:sahel/features/home/home_screen.dart';

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
  // Bring it to the middle, clear of the bottom navigation bar.
  await tester.runAsync(() => Scrollable.ensureVisible(tester.element(target), alignment: 0.4));
  await tester.pumpAndSettle();
}

LifeEventBundle bundle(String name) => LifeEventBundle.fromJson(fixture(name) as Json);
SettlementQuote settlement(String name) => SettlementQuote.fromJson(fixture(name) as Json);

void main() {
  test('API contract: bundle and settlement fixtures parse, with integer fils', () {
    final events = [for (final j in fixture('life_events')['items'] as List) LifeEvent.fromJson(j as Json)];
    expect(events.map((e) => e.id), ['married', 'new-job', 'first-home', 'new-baby']);

    final married = bundle('bundle_married_islamic');
    expect(married.structure, BundleStructure.islamic);
    expect(married.fits, isFalse);
    expect(married.totalMonthlyFils, married.items.where((i) => i.countsTowardDbr).fold<int>(0, (s, i) => s + i.monthlyFils));
    expect(married.shortfallFils, married.totalMonthlyFils - married.maxMonthlyFils);
    expect(married.items.where((i) => i.structure != null).every((i) => i.isIslamic), isTrue);
    expect(bundle('bundle_married_conventional').items.where((i) => i.structure != null).every((i) => !i.isIslamic), isTrue);
    expect(bundle('bundle_new_baby_islamic').fits, isTrue);

    final murabaha = settlement('settlement_c1001');
    expect(murabaha.lines.map((l) => l.kind), ['remaining_sale_price', 'ibra_rebate']);
    expect(murabaha.settlementAmountFils, lessThan(murabaha.remainingScheduledFils));
    expect(murabaha.paymentPurpose, 'early_settlement');
    final conventional = settlement('settlement_c1002');
    expect(conventional.lines.map((l) => l.kind), ['remaining_principal', 'settlement_fee']);
    expect(conventional.settlementAmountFils, lessThan(conventional.remainingScheduledFils));

    // The settlement baseline equals the outstanding balance on "My installments".
    final me = CustomerOverview.fromJson(fixture('me') as Json);
    expect(me.contracts.firstWhere((c) => c.id == 'c-1001').outstandingFils, murabaha.remainingScheduledFils);
  });

  testWidgets('home → life events → married bundle with the API figures and verdict', (tester) async {
    await pumpApp(tester);
    await scrollTo<HomeScreen>(tester, find.byKey(const Key('life-events-cta')));
    await tester.tap(find.byKey(const Key('life-events-cta')));
    await tester.pumpAndSettle();
    expect(find.byType(LifeEventsScreen), findsOneWidget);
    expect(find.text('Getting married'), findsOneWidget);

    await tester.tap(find.byKey(const Key('life-event-married')));
    await tester.pumpAndSettle();
    final b = bundle('bundle_married_islamic');
    expect(find.text('! Over budget'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('bundle-total'))).data, formatBhd(b.totalMonthlyFils, 'en'));
    expect(tester.widget<Text>(find.byKey(const Key('bundle-headroom'))).data, formatBhd(b.maxMonthlyFils, 'en'));
    expect(find.text('${formatBhd(b.shortfallFils, 'en')}/month over your budget'), findsOneWidget);
    // Islamic: profit, never interest.
    expect(find.textContaining('Profit:'), findsWidgets);
    expect(find.textContaining('Interest'), findsNothing);
  });

  testWidgets('toggle the whole bundle to conventional', (tester) async {
    final repo = await pumpApp(tester, location: '/life-events/married');
    await tester.tap(find.byKey(const Key('structure-conventional')));
    await tester.pumpAndSettle();
    expect(repo.bundleRequests, ['married:islamic', 'married:conventional']);
    final b = bundle('bundle_married_conventional');
    expect(tester.widget<Text>(find.byKey(const Key('bundle-total'))).data, formatBhd(b.totalMonthlyFils, 'en'));
    expect(find.textContaining('Interest:'), findsWidgets);
    expect(find.text('Conventional'), findsWidgets);
  });

  testWidgets('new baby bundle fits and links to the 7-seat car', (tester) async {
    await pumpApp(tester, location: '/life-events/new-baby');
    expect(find.text('✓ Fits your budget'), findsOneWidget);
    expect(find.text('Family Takaful'), findsOneWidget);
    expect(find.textContaining('Plus cover premiums'), findsOneWidget);
    await tester.tap(find.byKey(const Key('bundle-link-family-car')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('finance-calculator')), findsOneWidget);
  });

  testWidgets('life events in Arabic are RTL', (tester) async {
    await pumpApp(tester, location: '/life-events/married');
    await tester.tap(find.byKey(const Key('language-switch')).first);
    await tester.pumpAndSettle();
    expect(find.text('! يتجاوز ميزانيتك'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byKey(const Key('bundle-summary')))), TextDirection.rtl);
  });

  testWidgets('Murabaha early settlement: Ibra\' rebate, savings, settle through checkout', (tester) async {
    final repo = await pumpApp(tester, location: '/account');
    final tile = find.byKey(const Key('settlement-c-1001'));
    await scrollTo<AccountScreen>(tester, tile);
    await tester.tap(tile);
    await tester.pumpAndSettle();
    final q = settlement('settlement_c1001');
    expect(tester.widget<Text>(find.byKey(const Key('settle-amount-c-1001'))).data, formatBhd(q.settlementAmountFils, 'en'));
    expect(find.text('You save ${formatBhd(q.savingsFils, 'en')}'), findsOneWidget);
    expect(find.text("Ibra' rebate ⚠️"), findsOneWidget);
    expect(find.textContaining('Interest'), findsNothing);

    final settle = find.byKey(const Key('settle-now-c-1001'));
    await scrollTo<AccountScreen>(tester, settle);
    await tester.tap(settle);
    await tester.pumpAndSettle();
    expect(find.text('Early settlement: Honda CR-V: Vehicle Murabaha'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('payment-success')), findsOneWidget);
    expect(repo.payments.values.single, q.settlementAmountFils);
  });

  testWidgets('autopay toggle calls the API and refreshes the contract', (tester) async {
    final repo = await pumpApp(tester, location: '/account');
    final toggle = find.byKey(const Key('autopay-c-1002'));
    await scrollTo<AccountScreen>(tester, toggle);
    expect(tester.widget<SwitchListTile>(toggle).value, isFalse);
    expect(find.text('Autopay off'), findsOneWidget);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(repo.autopay, {'c-1002': true});
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('autopay-c-1002'))).value, isTrue);
    expect(find.text('Autopay off'), findsNothing);
  });
}
