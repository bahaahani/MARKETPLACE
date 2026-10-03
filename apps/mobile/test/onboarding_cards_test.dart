import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/cars/cars_screen.dart';
import 'package:sahel/features/cards/cards_screen.dart';
import 'package:sahel/features/onboarding/onboarding_screen.dart';

import 'fake_repository.dart';

Future<FakeSahelRepository> _pump(WidgetTester tester, {String location = '/'}) async {
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

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

final _panLike = RegExp(r'\d(?:[ -]?\d){12,18}');

void main() {
  group('onboarding (J1, sandbox)', () {
    testWidgets('home links to the onboarding wizard', (tester) async {
      await _pump(tester);
      await _tap(tester, find.byKey(const Key('onboarding-cta')));
      expect(find.byType(OnboardingScreen), findsOneWidget);
      expect(find.text('Log in with eKey'), findsWidgets);
    });

    testWidgets('wizard: eKey → salary → consent → pre-approval from the API', (tester) async {
      final repo = await _pump(tester, location: '/onboarding');
      expect(find.textContaining('Sandbox'), findsWidgets);

      await tester.enterText(find.byKey(const Key('cpr-field')), '12345');
      await _tap(tester, find.byKey(const Key('ekey-login')));
      expect(find.text('Enter a 9-digit CPR number.'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('cpr-field')), '880412345');
      await _tap(tester, find.byKey(const Key('ekey-login')));
      expect(find.byKey(const Key('ekey-identity')), findsOneWidget);
      expect(find.text('CPR: ******345'), findsOneWidget);
      expect(find.textContaining('880412345'), findsNothing);

      await tester.enterText(find.byKey(const Key('employer-field')), 'Bahrain Co.');
      await tester.enterText(find.byKey(const Key('salary-field')), '1,400');
      await tester.enterText(find.byKey(const Key('obligations-field')), '300');
      await _tap(tester, find.byKey(const Key('employment-continue')));
      expect(find.textContaining('Your consent lasts 90 days'), findsOneWidget);

      // The API refuses without both consents; the app shows why.
      await _tap(tester, find.byKey(const Key('see-preapproval')));
      expect(find.text('Please give both consents to continue.'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('consent-CRB')));
      await _tap(tester, find.byKey(const Key('consent-OPEN_BANKING')));
      await _tap(tester, find.byKey(const Key('see-preapproval')));

      expect(repo.lastPreApproval, {
        'monthlySalaryFils': 1400000,
        'existingObligationsFils': 300000,
        'employer': 'Bahrain Co.',
        'consentScopes': ['CRB', 'OPEN_BANKING'],
      });
      expect(find.byKey(const Key('onboarding-result')), findsOneWidget);
      // Same figures the web shows (recorded from the shared API).
      expect(find.text('Up to BHD 26,900'), findsOneWidget);
      expect(find.text('BHD 2,800'), findsOneWidget);
      expect(find.text('You can afford up to BHD 400/month'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('browse-budget')));
      expect(find.byType(CarsScreen), findsOneWidget);
    });

    testWidgets('wizard is right-to-left in Arabic', (tester) async {
      await _pump(tester);
      await tester.tap(find.byKey(const Key('language-switch')));
      await tester.pumpAndSettle();
      await _tap(tester, find.byKey(const Key('onboarding-cta')));
      expect(find.text('اعرف ما يمكنك تحمّله'), findsWidgets);
      expect(Directionality.of(tester.element(find.byKey(const Key('onboarding')))), TextDirection.rtl);
    });
  });

  group('instant card (J3, sandbox)', () {
    testWidgets('apply from the cards list → masked virtual card → add to wallet (sandbox)', (tester) async {
      final repo = await _pump(tester, location: '/cards');
      final list = find.descendant(of: find.byType(CardsScreen), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.byKey(const Key('apply-imtiaz-world')), 300, scrollable: list);
      await _tap(tester, find.byKey(const Key('apply-imtiaz-world')));

      expect(find.text('Your eligibility check is already done from your pre-approval.'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('confirm-card')));
      expect(repo.cardApplications, ['imtiaz-world']);
      expect(find.byKey(const Key('card-approved')), findsOneWidget);

      final pan = tester.widget<Text>(find.byKey(const Key('masked-pan'))).data!;
      expect(pan, matches(RegExp(r'^5xxx xxxx xxxx \d{4}$')));
      for (final t in tester.widgetList<Text>(find.byType(Text))) {
        expect(_panLike.hasMatch(t.data ?? ''), isFalse, reason: 'no full card number on screen');
      }

      await _tap(tester, find.byKey(const Key('wallet-apple')));
      expect(find.text('Sandbox: card added to Apple Wallet (simulated).'), findsOneWidget);
      expect(find.byKey(const Key('wallet-google')), findsOneWidget);
      expect(find.byKey(const Key('wallet-samsung')), findsOneWidget);
    });

    testWidgets('declined application explains why', (tester) async {
      await _pump(tester, location: '/cards/imtiaz-world-elite/apply');
      await _tap(tester, find.byKey(const Key('confirm-card')));
      expect(find.byKey(const Key('card-declined')), findsOneWidget);
      expect(find.text("Your salary is below this card's minimum."), findsOneWidget);
    });
  });

  group('API contract (onboarding and cards)', () {
    test('parses the recorded responses', () {
      final id = EKeyIdentity.fromJson(fixture('ekey') as Json);
      expect(id.cprMasked, '******345');
      expect(id.provider, 'ekey-sandbox');
      final r = OnboardingResult.fromJson(fixture('onboarding_preapproval') as Json);
      expect(r.consent.scopes, ['CRB', 'OPEN_BANKING']);
      expect(r.consent.expiresAt.difference(r.consent.grantedAt).inDays, 90);
      final approved = CardApplication.fromJson(fixture('card_apply') as Json);
      expect(approved.approved, isTrue);
      expect(approved.virtualCard!.panMasked, matches(RegExp(r'^5xxx xxxx xxxx \d{4}$')));
      expect(approved.virtualCard!.wallet.applePay, isTrue);
      final declined = CardApplication.fromJson(fixture('card_apply_declined') as Json);
      expect(declined.approved, isFalse);
      expect(declined.reason, 'BELOW_MIN_SALARY');
      expect((fixture('me_cards')['items'] as List).map((j) => VirtualCard.fromJson(j as Json)), isNotEmpty);
    });

    test('parseBhdInput matches the domain parser', () {
      expect(parseBhdInput('1400'), 1400000);
      expect(parseBhdInput('1,400.5'), 1400500);
      expect(parseBhdInput('0.105'), 105);
      expect(parseBhdInput(' 250.25 '), 250250);
      expect(parseBhdInput(''), isNull);
      expect(parseBhdInput('-1'), isNull);
      expect(parseBhdInput('1.2345'), isNull);
      expect(parseBhdInput('abc'), isNull);
    });
  });
}
