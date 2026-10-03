import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/assistant/assistant_models.dart';
import 'package:sahel/features/assistant/assistant_screen.dart';
import 'package:sahel/features/cars/car_detail_screen.dart';
import 'package:sahel/features/cars/cars_screen.dart';
import 'package:sahel/features/checkout/checkout_screen.dart';
import 'package:sahel/widgets/common.dart';

import 'fake_repository.dart';

AssistantReply reply(String name) => AssistantReply.fromJson(fixture(name) as Json);

Future<FakeSahelRepository> pumpApp(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeSahelRepository();
  await tester.pumpWidget(ProviderScope(overrides: [repositoryProvider.overrideWithValue(repo)], child: const SahelApp()));
  await tester.pumpAndSettle();
  return repo;
}

Future<void> openAssistant(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('assistant-entry')));
  await tester.pumpAndSettle();
  expect(find.byType(AssistantScreen), findsOneWidget);
}

Future<void> ask(WidgetTester tester, String text) async {
  await tester.enterText(find.byKey(const Key('assistant-input')), text);
  await tester.tap(find.byKey(const Key('assistant-send')));
  await tester.pumpAndSettle();
}

void main() {
  test('API contract: recorded assistant replies parse; actions are links, payments go to the checkout', () {
    final balance = reply('assistant_balance_en');
    expect(balance.intent, 'outstanding_balance');
    expect(balance.locale, 'en');
    final me = CustomerOverview.fromJson(fixture('me') as Json);
    expect(balance.cards.single.rows.single.amountFils, me.contracts.firstWhere((c) => c.id == 'c-1001').outstandingFils);

    final settle = reply('assistant_settle_en');
    expect(settle.intent, 'settlement_quote');
    final pay = settle.actions.firstWhere((a) => a.isPayment);
    final uri = Uri.parse(pay.href);
    expect(uri.path, '/checkout');
    expect(uri.queryParameters['purpose'], 'early_settlement');
    expect(uri.queryParameters['reference'], 'c-1001-settle');
    expect(int.parse(uri.queryParameters['amount']!), settle.cards.single.rows.firstWhere((r) => r.emphasis).amountFils);

    final next = reply('assistant_next_en');
    expect(next.actions.where((a) => a.isPayment).map((a) => Uri.parse(a.href).queryParameters['purpose']), ['installment']);

    // Arabic answer to Arabic text, with the same monthly prices as the catalog API.
    final cars = reply('assistant_cars_ar');
    expect(cars.locale, 'ar');
    expect(cars.persona, AssistantPersona.suhail);
    expect(cars.personaName, 'سهيل');
    final catalog = {for (final j in fixture('vehicles')['items'] as List) (j as Json)['id']: Vehicle.fromJson(j)};
    for (final v in cars.cards.single.vehicles) {
      expect(v.fromMonthlyFils, lessThanOrEqualTo(200000));
      expect(v.fromMonthlyFils, catalog[v.id]!.fromMonthlyFils);
      expect(v.href, '/cars/${v.id}');
    }
  });

  testWidgets('home → assistant: suggestion, follow-up, persona; the settle action opens the checkout (not paid)', (tester) async {
    final repo = await pumpApp(tester);
    await openAssistant(tester);
    expect(find.byKey(const Key('assistant-greeting')), findsOneWidget);
    expect(find.textContaining("I'm Suhaila"), findsOneWidget);
    expect(find.textContaining('never pay, sign or apply'), findsOneWidget);

    await tester.tap(find.byKey(const Key('assistant-persona-suhail')));
    await tester.pumpAndSettle();
    expect(find.textContaining("I'm Suhail,"), findsOneWidget);

    await tester.tap(find.byKey(const Key('assistant-suggestion-0')));
    await tester.pumpAndSettle();
    expect(repo.assistantMessages.single, ('How much do I still owe on the car?', 'en', AssistantPersona.suhail));
    expect(find.text(reply('assistant_balance_en').text), findsOneWidget);

    await ask(tester, 'And what if I pay it all off now?');
    final settle = reply('assistant_settle_en');
    expect(find.text(settle.text), findsOneWidget);
    final amount = settle.cards.single.rows.firstWhere((r) => r.emphasis).amountFils;
    expect(tester.widget<Text>(find.byKey(const Key('assistant-amount-emphasis'))).data, formatBhd(amount, 'en'));
    // The follow-up suggestions now come from the API reply.
    expect(find.text(settle.suggestions.first), findsOneWidget);

    final action = find.byKey(const Key('assistant-action-settle-c-1001'));
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.byType(CheckoutScreen), findsOneWidget);
    expect(find.text(formatBhd(amount, 'en')), findsWidgets);
    expect(repo.payments, isEmpty);
  });

  testWidgets('Arabic: the reply is right-to-left; "see all" opens the Cars tab with the same budget', (tester) async {
    final repo = await pumpApp(tester);
    await tester.tap(find.byType(LanguageButton));
    await tester.pumpAndSettle();
    await openAssistant(tester);
    expect(find.text('سهيل وسهيلة'), findsOneWidget);

    await ask(tester, 'أبي سيارة تحت ٢٠٠ بالشهر');
    expect(repo.assistantMessages.single.$2, 'ar');
    final cars = reply('assistant_cars_ar');
    final text = find.text(cars.text);
    expect(text, findsOneWidget);
    expect(Directionality.of(tester.element(text)), TextDirection.rtl);

    expect(find.byKey(Key('assistant-vehicle-${cars.cards.single.vehicles.first.id}')), findsOneWidget);

    // "See all matching cars" opens the Cars tab with the same monthly budget.
    final all = find.byKey(const Key('assistant-action-cars'));
    await tester.ensureVisible(all);
    await tester.pumpAndSettle();
    await tester.tap(all);
    await tester.pumpAndSettle();
    expect(find.byType(CarsScreen), findsOneWidget);
    expect(tester.widget<CarsScreen>(find.byType(CarsScreen)).initialMaxMonthlyFils, 200000);
  });

  testWidgets('a car in the answer opens its listing', (tester) async {
    await pumpApp(tester);
    await openAssistant(tester);
    await ask(tester, 'كم سيارة؟');
    final first = find.byKey(Key('assistant-vehicle-${reply('assistant_cars_ar').cards.single.vehicles.first.id}'));
    await tester.ensureVisible(first);
    await tester.pumpAndSettle();
    await tester.tap(first);
    await tester.pumpAndSettle();
    expect(find.byType(CarDetailScreen), findsOneWidget);
  });
}
