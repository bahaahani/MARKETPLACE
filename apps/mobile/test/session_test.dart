import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/config.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/cards/cards_screen.dart';
import 'package:sahel/features/home/home_screen.dart';

import 'fake_repository.dart';

Future<FakeSahelRepository> _pump(WidgetTester tester, {String location = '/', FakeSahelRepository? repo}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final r = repo ?? FakeSahelRepository();
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(r)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return r;
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  group('sandbox session header (X-Sahel-Session)', () {
    test('asks for a session once, then sends the id the API returned', () async {
      final seen = <String?>[];
      final first = Completer<void>();
      final client = MockClient((req) async {
        seen.add(req.headers['X-Sahel-Session']);
        if (seen.length == 1) await first.future;
        return http.Response(jsonEncode({'data': <String, Object>{}}), 200, headers: {'x-sahel-session': 'abcDEF123_-abcDEF123_-abcDEF123_'});
      });
      final api = ApiClient(baseUrl: 'http://test', client: client);
      // Parallel requests at start-up: only the first opens a session, the others wait for its id.
      final a = api.get('/me');
      final b = api.get('/cards');
      final c = api.post('/me/preapproval-token', const {});
      await Future<void>.delayed(Duration.zero);
      expect(seen, ['new']);
      first.complete();
      await Future.wait([a, b, c]);
      expect(seen, ['new', 'abcDEF123_-abcDEF123_-abcDEF123_', 'abcDEF123_-abcDEF123_-abcDEF123_']);
      expect(api.session.id, 'abcDEF123_-abcDEF123_-abcDEF123_');
    });

    test('adopts a new id when the API starts a new session (e.g. after a restart)', () async {
      var n = 0;
      final client = MockClient((req) async => http.Response('{"data":{}}', 200, headers: {'x-sahel-session': 'session-${++n}'.padRight(32, 'x')}));
      final api = ApiClient(baseUrl: 'http://test', client: client);
      await api.get('/me');
      await api.get('/me');
      expect(api.session.id, 'session-2'.padRight(32, 'x'));
    });

    test('a failed first request lets the next one open the session', () async {
      var fail = true;
      final client = MockClient((req) async {
        if (fail) {
          fail = false;
          throw http.ClientException('offline');
        }
        return http.Response('{"data":{}}', 200, headers: {'x-sahel-session': 'S'.padRight(32, 's')});
      });
      final api = ApiClient(baseUrl: 'http://test', client: client);
      await expectLater(api.get('/me'), throwsA(isA<http.ClientException>()));
      await api.get('/me');
      expect(api.session.id, 'S'.padRight(32, 's'));
    });
  });

  group('rules come from the API', () {
    test('config and card eligibility parse from the recorded responses', () {
      final cfg = ClientConfig.fromJson(fixture('config') as Json);
      expect(cfg.consentValidityDays, 90);
      expect(cfg.consentScopes, ['CRB', 'OPEN_BANKING']);
      expect(cfg.finance['home']!.downPaymentStepFils, 1000000);
      expect(cfg.finance['personal']!.tenureStepMonths, 6);
      expect(cfg.personalFinance.minAmountFils, 500000);
      final limits = FinanceComparison.fromJson(fixture('quotes_crv') as Json).limits;
      expect(limits.defaultDownPaymentFils, 3000000);
      expect(limits.defaultTenureMonths, 60);
      final cards = [for (final j in fixture('cards')['items'] as List) CardProduct.fromJson(j as Json)];
      final elite = cards.firstWhere((c) => c.id == 'imtiaz-world-elite');
      expect((elite.eligible, elite.ineligibleReason), (false, 'BELOW_MIN_SALARY'));
      expect(cards.firstWhere((c) => c.id == 'imtiaz-world').offeredLimitFils, 2800000);
      expect(CustomerOverview.fromJson(fixture('me') as Json).onboarded, isFalse);
      expect(CustomerOverview.fromJson(fixture('me_onboarded') as Json).onboarded, isTrue);
    });

    testWidgets('cards list uses the API\'s eligibility and shows why a card is not available', (tester) async {
      await _pump(tester, location: '/cards');
      final list = find.descendant(of: find.byType(CardsScreen), matching: find.byType(Scrollable)).first;
      final elite = find.byKey(const Key('apply-imtiaz-world-elite'));
      await tester.scrollUntilVisible(elite, 300, scrollable: list);
      expect(tester.widget<FilledButton>(elite).onPressed, isNull);
      expect(find.byKey(const Key('ineligible-imtiaz-world-elite')), findsOneWidget);
      expect(find.text("Your salary is below this card's minimum."), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('apply-imtiaz-world')), 300, scrollable: list);
      expect(tester.widget<FilledButton>(find.byKey(const Key('apply-imtiaz-world'))).onPressed, isNotNull);
    });

    testWidgets('card apply shows the limit the API offers this customer', (tester) async {
      await _pump(tester, location: '/cards/imtiaz-world/apply');
      expect(find.descendant(of: find.byKey(const Key('offered-limit')), matching: find.text('BHD 2,800')), findsOneWidget);
    });
  });

  testWidgets('after onboarding, home shows the customer\'s own pre-approval (saved in the session)', (tester) async {
    final repo = await _pump(tester);
    expect(find.descendant(of: find.byKey(const Key('preapproval')), matching: find.text('Up to BHD 25,100')), findsOneWidget);

    await _tap(tester, find.byKey(const Key('onboarding-cta')));
    await tester.enterText(find.byKey(const Key('cpr-field')), '880412345');
    await _tap(tester, find.byKey(const Key('ekey-login')));
    await tester.enterText(find.byKey(const Key('salary-field')), '1400');
    await tester.enterText(find.byKey(const Key('obligations-field')), '300');
    await _tap(tester, find.byKey(const Key('employment-continue')));
    await _tap(tester, find.byKey(const Key('consent-CRB')));
    await _tap(tester, find.byKey(const Key('consent-OPEN_BANKING')));
    await _tap(tester, find.byKey(const Key('see-preapproval')));
    expect(repo.onboarded, isTrue);

    GoRouter.of(tester.element(find.byKey(const Key('onboarding-result')))).go('/');
    await tester.pumpAndSettle();
    final hero = find.byKey(const Key('preapproval'));
    // The home list kept its scroll position from opening onboarding; go back to the top.
    await tester.scrollUntilVisible(hero, -300, scrollable: find.descendant(of: find.byType(HomeScreen), matching: find.byType(Scrollable)).first);
    expect(find.descendant(of: hero, matching: find.text('Up to BHD 26,900')), findsOneWidget);
    expect(find.descendant(of: hero, matching: find.text('Up to BHD 19,900')), findsOneWidget);
  });

  testWidgets('My cards on the account screen lists issued virtual cards (masked, status, limit)', (tester) async {
    await _pump(tester, location: '/account');
    final list = find.descendant(of: find.byType(AccountScreen), matching: find.byType(Scrollable)).first;
    final vc = VirtualCard.fromJson((fixture('me_cards')['items'] as List).first as Json);
    final card = find.byKey(Key('my-card-${vc.id}'));
    await tester.scrollUntilVisible(card, 200, scrollable: list);
    expect(find.text('My cards'), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text(vc.panMasked)), findsOneWidget);
    expect(vc.panMasked, matches(RegExp(r'^5xxx xxxx xxxx \d{4}$')));
    expect(find.descendant(of: card, matching: find.text('Active')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('BHD 2,800')), findsOneWidget);
    // The sandbox session is labelled as such.
    await tester.scrollUntilVisible(find.byKey(const Key('session-note')), 200, scrollable: list);
    expect(find.textContaining('this session only'), findsOneWidget);
  });

  testWidgets('My cards shows an empty state with a way to apply', (tester) async {
    await _pump(tester, location: '/account', repo: _NoCardsRepository());
    expect(find.text('No cards yet. Apply in minutes from Cards.'), findsOneWidget);
  });
}

class _NoCardsRepository extends FakeSahelRepository {
  @override
  Future<List<VirtualCard>> myCards() async => const [];
}
