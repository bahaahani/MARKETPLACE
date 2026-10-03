import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/cars/car_detail_screen.dart';

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

void main() {
  testWidgets('home shows pre-approval in English (LTR)', (tester) async {
    await pumpApp(tester);
    expect(find.text("You're pre-approved"), findsOneWidget);
    expect(Directionality.of(tester.element(find.byKey(const Key('preapproval')))), TextDirection.ltr);
  });

  testWidgets('switching to Arabic flips the layout to RTL', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.byKey(const Key('language-switch')));
    await tester.pumpAndSettle();
    expect(find.text('أنت مؤهل مبدئياً'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byKey(const Key('preapproval')))), TextDirection.rtl);
  });

  testWidgets('car detail compares conventional and Murabaha with API figures', (tester) async {
    await pumpApp(tester, location: '/cars/v-honda-crv-2026');
    expect(find.byKey(const Key('finance-calculator')), findsOneWidget);
    // Same numbers the web shows for the same inputs (BHD 3,000 down, 60 months).
    expect(find.text('BHD 232.838'), findsOneWidget);
    expect(find.text('BHD 233.042'), findsOneWidget);
    await tester.tap(find.byKey(const Key('quote-conventional')));
    await tester.pumpAndSettle();
  });

  testWidgets('insurance comparison filters Takaful only', (tester) async {
    await pumpApp(tester, location: '/cars/v-honda-crv-2026');
    // Scroll the detail screen's list (other shell branches keep offstage scrollables alive).
    final detailList = find.descendant(of: find.byType(CarDetailScreen), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const Key('takaful-only')), 200, scrollable: detailList);
    await tester.ensureVisible(find.byKey(const Key('takaful-only')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('motor-quote-manama-assurance')), findsOneWidget);
    await tester.tap(find.byKey(const Key('takaful-only')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('motor-quote-manama-assurance')), findsNothing);
    expect(find.byKey(const Key('motor-quote-pearl-takaful')), findsOneWidget);
  });

  testWidgets('pay an installment with BenefitPay (sandbox)', (tester) async {
    final repo = await pumpApp(tester, location: '/checkout?purpose=installment&amount=233042&reference=c-1001-15&label=Honda');
    expect(find.text('BHD 233.042'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('payment-success')), findsOneWidget);
    expect(repo.payments.values.single, 233042);
  });

  testWidgets('invalid checkout link shows an error instead of crashing', (tester) async {
    await pumpApp(tester, location: '/checkout?amount=-1');
    expect(find.text('Something went wrong. Please try again.'), findsOneWidget);
  });

  testWidgets('share pre-approval with a dealer shows a code, QR and countdown', (tester) async {
    final repo = await pumpApp(tester, location: '/account');
    final list = find.descendant(of: find.byType(AccountScreen), matching: find.byType(Scrollable)).first;
    final button = find.byKey(const Key('share-preapproval-button'));
    await tester.scrollUntilVisible(button, 200, scrollable: list);
    // Bring it clear of the bottom navigation bar.
    await tester.drag(list, const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(find.text('Share my pre-approval with a dealer'), findsOneWidget);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(repo.shares, 1);
    expect(find.byKey(const Key('share-token')), findsOneWidget);
    expect(find.text(fixture('preapproval_token')['token'] as String), findsOneWidget);
    expect(find.byKey(const Key('share-qr')), findsOneWidget);
    expect(find.textContaining(RegExp(r'^Expires in 1[45]:\d\d$')), findsOneWidget);
    // The button is replaced by the code while it is valid.
    expect(button, findsNothing);
  });

  test('countdown formats minutes and seconds', () {
    expect(formatCountdown(const Duration(minutes: 15)), '15:00');
    expect(formatCountdown(const Duration(seconds: 61, milliseconds: 200)), '1:02');
    expect(formatCountdown(const Duration(seconds: -5)), '0:00');
  });
}
