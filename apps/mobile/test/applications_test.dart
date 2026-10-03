import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/cars/car_detail_screen.dart';
import 'package:sahel/features/finance/application_screen.dart';
import 'package:sahel/features/finance/personal_finance_screen.dart';

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

FinanceApplication fixtureApp(String name) => FinanceApplication.fromJson(fixture(name) as Json);

void main() {
  test('API contract: application fixtures parse', () {
    final crv = fixtureApp('application_crv');
    expect(crv.status, 'APPROVED');
    expect(crv.decision!.reasons, ['OK']);
    expect(crv.steps.where((s) => s.murabaha).map((s) => s.status),
        ['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER']);
    final done = fixtureApp('application_crv_accepted');
    expect(done.status, 'COMPLETED');
    expect(done.steps.every((s) => s.done && s.at != null), isTrue);
    expect(fixtureApp('application_declined').decision!.reasons, ['DBR_EXCEEDED', 'AMOUNT_ABOVE_PREAPPROVAL']);
    expect((fixture('applications')['items'] as List).map((j) => FinanceApplication.fromJson(j as Json)), isNotEmpty);
  });

  testWidgets('apply from car detail with the calculator selection, accept, see the Murabaha steps in order', (tester) async {
    final repo = await pumpApp(tester, location: '/cars/v-honda-crv-2026');
    final apply = find.byKey(const Key('apply-finance'));
    expect(tester.widget<OutlinedButton>(apply).onPressed, isNotNull);
    await tester.tap(apply);
    await tester.pumpAndSettle();

    // Same terms the calculator shows by default (Murabaha, BHD 3,000 down, 60 months), price from the catalog server-side.
    final sent = repo.applied.single;
    expect(sent['productLine'], 'vehicle');
    expect(sent['structure'], 'murabaha');
    expect(sent['vehicleId'], 'v-honda-crv-2026');
    expect(sent['downPaymentFils'], 3000000);
    expect(sent['tenureMonths'], 60);
    expect((sent['idempotencyKey'] as String).length, greaterThanOrEqualTo(8));

    expect(find.byType(ApplicationScreen), findsOneWidget);
    expect(find.byKey(const Key('decision-APPROVED')), findsOneWidget);
    expect(find.text('Honda CR-V 2026'), findsOneWidget);
    expect(find.byKey(const Key('offer-monthly')), findsOneWidget);
    expect(find.text('BHD 233.042'), findsOneWidget);

    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('accept-offer')));
    await tester.tap(find.byKey(const Key('accept-offer')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('accept-offer')), findsNothing);

    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('step-COMPLETED-done')));
    expect(find.byKey(const Key('murabaha-steps')), findsOneWidget);
    expect(find.textContaining("Shari'a requirement"), findsOneWidget);
    // BCFC buys, then owns, then sells.
    final y = [
      for (final s in ['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER', 'COMPLETED'])
        tester.getTopLeft(find.byKey(Key('step-$s-done'))).dy,
    ];
    expect(y, [...y]..sort());
  });

  testWidgets('choosing conventional in the calculator applies for conventional', (tester) async {
    final repo = await pumpApp(tester, location: '/cars/v-honda-crv-2026');
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('quote-conventional')));
    await tester.tap(find.byKey(const Key('quote-conventional')));
    await tester.pumpAndSettle();
    await scrollTo<CarDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();
    expect(repo.applied.single['structure'], 'conventional');
  });

  testWidgets('declined application shows plain-language reasons and no accept button', (tester) async {
    await pumpApp(tester, location: '/applications/${fixtureApp('application_declined').id}');
    expect(find.byKey(const Key('decision-DECLINED')), findsOneWidget);
    expect(find.textContaining('50% debt-burden limit'), findsOneWidget);
    expect(find.textContaining('pre-approved limit of BHD 25,100'), findsOneWidget);
    expect(find.byKey(const Key('accept-offer')), findsNothing);
    expect(find.byKey(const Key('murabaha-steps')), findsNothing);
  });

  testWidgets('personal finance from the home pre-approval tile', (tester) async {
    final repo = await pumpApp(tester);
    await tester.tap(find.byKey(const Key('personal-finance-link')));
    await tester.pumpAndSettle();
    expect(find.byType(PersonalFinanceScreen), findsOneWidget);
    expect(find.byKey(const Key('amount')), findsOneWidget);
    expect(find.text('BHD 5,000'), findsWidgets);
    await tester.tap(find.byKey(const Key('quote-conventional')));
    await tester.pumpAndSettle();
    await scrollTo<PersonalFinanceScreen>(tester, find.byKey(const Key('apply-finance')));
    await tester.tap(find.byKey(const Key('apply-finance')));
    await tester.pumpAndSettle();

    expect(repo.applied.single, containsPair('amountFils', 5000000));
    expect(repo.applied.single, containsPair('tenureMonths', 48));
    expect(repo.applied.single, containsPair('structure', 'conventional'));
    expect(find.byKey(const Key('decision-APPROVED')), findsOneWidget);
    expect(find.byKey(const Key('application-title')), findsOneWidget);
    expect(find.text('Personal finance'), findsWidgets);
  });

  testWidgets('application screen in Arabic is right-to-left', (tester) async {
    await pumpApp(tester, location: '/applications/${fixtureApp('application_crv').id}');
    await tester.tap(find.byKey(const Key('language-switch')).last);
    await tester.pumpAndSettle();
    expect(find.text('تمت الموافقة'), findsWidgets);
    expect(Directionality.of(tester.element(find.byKey(const Key('offer-summary')))), TextDirection.rtl);
  });
}
