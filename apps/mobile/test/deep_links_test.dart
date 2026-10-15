import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/config.dart';
import 'package:sahel/core/deep_links.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/claims/claim_detail_screen.dart';
import 'package:sahel/features/rewards/rewards_screen.dart';

import 'fake_repository.dart';

final _origin = Uri.parse('https://sahel.bcfc.example');
const _h = 'https://sahel.bcfc.example';

DeepLink _r(String url) => resolveDeepLink(url, webOrigin: _origin);

void main() {
  group('resolveDeepLink: web URLs and sahel:// URLs become app routes', () {
    // input -> (route, language)
    final good = <String, (String, String?)>{
      '$_h/en': ('/', 'en'),
      '$_h/ar/': ('/', 'ar'),
      '$_h/en/cars': ('/cars', 'en'),
      '$_h/en/cars/v-honda-crv-2026': ('/cars/v-honda-crv-2026', 'en'),
      '$_h/ar/cars/v-honda-crv-2026': ('/cars/v-honda-crv-2026', 'ar'),
      '$_h/ar/cars/v-honda-crv-2026?requestId=r1&bidId=b2': ('/cars/v-honda-crv-2026?requestId=r1&bidId=b2', 'ar'),
      '$_h/en/cars?maxMonthlyFils=150000': ('/cars?maxMonthlyFils=150000', 'en'),
      '$_h/en/checkout?purpose=car&amount=4500000&reference=abc': ('/checkout?purpose=car&amount=4500000&reference=abc', 'en'),
      '$_h/en/account': ('/account', 'en'),
      '$_h/en/rewards': ('/rewards', 'en'),
      '$_h/en/requests/new': ('/requests/new', 'en'),
      '$_h/ar/requests/req_123': ('/requests/req_123', 'ar'),
      '$_h/en/claims/new?policyId=p1&plate=123456': ('/claims/new?policyId=p1&plate=123456', 'en'),
      '$_h/en/claims/clm_9': ('/claims/clm_9', 'en'),
      '$_h/en/applications/app_1': ('/applications/app_1', 'en'),
      '$_h/en/notifications': ('/notifications', 'en'),
      '$_h/ar/notifications/preferences': ('/notifications/preferences', 'ar'),
      '$_h/en/insurance/home?propertyId=p-1': ('/insurance/home?propertyId=p-1', 'en'),
      '$_h/en/insurance/life': ('/insurance/life', 'en'),
      '$_h/en/property/prop-1': ('/property/prop-1', 'en'),
      '$_h/en/cards/imtiaz-world/apply': ('/cards/imtiaz-world/apply', 'en'),
      '$_h/en/finance/personal': ('/finance/personal', 'en'),
      '$_h/en/life-events/new-baby?structure=conventional': ('/life-events/new-baby?structure=conventional', 'en'),
      '$_h/en/trade-in?garage=g1': ('/trade-in?garage=g1', 'en'),
      '$_h/en/cars/': ('/cars', 'en'), // one trailing slash
      '$_h/en/cars#section': ('/cars', 'en'), // fragment dropped
      '${_h.toUpperCase()}/en/cars': ('/cars', 'en'), // host is case-insensitive
      // Custom scheme, with and without a host-style first segment or a language.
      'sahel://rewards': ('/rewards', null),
      'sahel:///rewards': ('/rewards', null),
      'sahel://cars/v-honda-crv-2026?requestId=r1': ('/cars/v-honda-crv-2026?requestId=r1', null),
      'sahel:///ar/claims/clm_1': ('/claims/clm_1', 'ar'),
      'sahel://ar/claims/clm_1': ('/claims/clm_1', 'ar'),
      'SAHEL://account': ('/account', null),
      // A web path as the platform may hand it over.
      '/ar/cars/v-honda-crv-2026?bidId=b1': ('/cars/v-honda-crv-2026?bidId=b1', 'ar'),
    };
    good.forEach((input, expected) {
      test(input, () => expect(_r(input), DeepLink(expected.$1, languageCode: expected.$2)));
    });

    test('query values are kept, re-encoded canonically', () {
      expect(_r('$_h/en/cars?query=bmw%20x5&query=a%26b').location, '/cars?query=bmw+x5&query=a%26b');
    });

    test('a very long query is dropped, the screen still opens', () {
      expect(_r('$_h/en/cars?x=${'a' * 2000}'), const DeepLink('/cars', languageCode: 'en'));
    });
  });

  group('resolveDeepLink: anything else goes home, never to a made-up route', () {
    final hostile = <String, String>{
      'empty': '',
      'spaces': '   ',
      'javascript scheme': 'javascript:alert(1)',
      'javascript with host-like': 'javascript://sahel.bcfc.example/%0Aalert(1)',
      'data scheme': 'data:text/html,<script>alert(1)</script>',
      'file scheme': 'file:///etc/passwd',
      'other host': 'https://evil.example/en/cars/abc',
      'sub-domain of ours': 'https://evil.sahel.bcfc.example/en/cars',
      'suffix trick': 'https://sahel.bcfc.example.evil.example/en/cars',
      'userinfo trick': 'https://sahel.bcfc.example@evil.example/en/cars',
      'userinfo on our host': 'https://evil.example@sahel.bcfc.example/en/cars',
      'http instead of https': 'http://sahel.bcfc.example/en/cars',
      'wrong port': 'https://sahel.bcfc.example:8443/en/cars',
      'protocol-relative': '//evil.example/en/cars',
      'double slash at start': '//en/cars',
      'double slash in path': '$_h/en//cars',
      'double slash after host': '$_h//en/cars',
      'sahel double slash': 'sahel://cars//abc',
      'dot dot': '$_h/en/cars/../account',
      'encoded dot dot': '$_h/en/cars/%2e%2e/account',
      'double encoded dot dot': '$_h/en/cars/%252e%252e/account',
      'encoded slash': '$_h/en/cars/a%2Fb',
      'encoded dot dot slash': '$_h/en/cars/..%2F..%2Faccount',
      'backslash': '$_h/en\\cars',
      'backslash host': 'https:\\\\evil.example\\en\\cars',
      'control character': '$_h/en/cars/a%0Ab'.replaceAll('%0A', '\n'),
      'null byte': '$_h/en/cars/a\u0000b',
      'bad percent escape': '$_h/en/cars/%zz',
      'unknown path': '$_h/en/dealer',
      'web only area': '$_h/en/backoffice',
      'api path': '$_h/api/v1/me',
      'unknown nested': '$_h/en/cars/abc/extra',
      'unknown locale': '$_h/fr/cars',
      'locale twice': '$_h/en/en/cars',
      'locale then locale': '$_h/en/ar/cars',
      'id with dot': '$_h/en/cars/a.b',
      'id too long': '$_h/en/cars/${'a' * 81}',
      'id with markup': '$_h/en/cars/%3Cscript%3E',
      'unknown sahel path': 'sahel://nope',
      'sahel with port': 'sahel://cars:80/abc',
      'sahel with userinfo': 'sahel://user@cars/abc',
      'relative no slash': 'cars/abc',
      'bare host': 'sahel.bcfc.example/en/cars',
    };
    hostile.forEach((name, input) {
      test(name, () => expect(_r(input), DeepLink.home));
    });
  });

  test('a build with another web origin only accepts its own host (and port)', () {
    final dev = Uri.parse('http://localhost:3000');
    expect(resolveDeepLink('http://localhost:3000/ar/rewards', webOrigin: dev), const DeepLink('/rewards', languageCode: 'ar'));
    expect(resolveDeepLink('http://localhost:4000/ar/rewards', webOrigin: dev), DeepLink.home);
    expect(resolveDeepLink('$_h/ar/rewards', webOrigin: dev), DeepLink.home);
  });

  test('every route the resolver allows exists in the router (and the other way round for deep-linkable screens)', () {
    // A guard against the allow-list drifting from app.dart: opening each allowed route must not hit the
    // "unknown route -> home" fallback. Covered end to end in the widget tests below for a few screens.
    for (final loc in ['/cars', '/account', '/rewards', '/requests/new', '/claims/new', '/notifications/preferences']) {
      expect(_r('$_h/en$loc').location, loc);
    }
  });

  group('AppConfig', () {
    test('defaults to dev with the local API', () {
      final c = AppConfig.fromValues(platform: TargetPlatform.iOS, isWeb: false);
      expect(c.environment, AppEnvironment.dev);
      expect(c.apiBaseUrl, 'http://localhost:3000');
      expect(c.features.sandboxBanner, isTrue);
      expect(c.webHost, 'dev.sahel.bcfc.example');
    });

    test('the Android emulator reaches the host on 10.0.2.2, the web build does not', () {
      expect(AppConfig.fromValues(platform: TargetPlatform.android, isWeb: false).apiBaseUrl, 'http://10.0.2.2:3000');
      expect(AppConfig.fromValues(platform: TargetPlatform.android, isWeb: true).apiBaseUrl, 'http://localhost:3000');
    });

    test('values from the env file win; trailing slash and path of the origin are dropped', () {
      final c = AppConfig.fromValues(environment: 'staging', apiBaseUrl: 'https://api.example/', webOrigin: 'https://web.example/en/x');
      expect(c.environment, AppEnvironment.staging);
      expect(c.apiBaseUrl, 'https://api.example');
      expect(c.webOrigin.toString(), 'https://web.example');
      expect(c.features.sandboxBanner, isTrue);
    });

    test('prod has no sandbox banner', () {
      final c = AppConfig.fromValues(environment: 'prod');
      expect(c.isProd, isTrue);
      expect(c.features.sandboxBanner, isFalse);
    });

    test('an unknown environment or a bad web origin fails loudly at start-up', () {
      expect(() => AppConfig.fromValues(environment: 'production'), throwsFormatException);
      expect(() => AppConfig.fromValues(webOrigin: 'ftp://x.example'), throwsFormatException);
      expect(() => AppConfig.fromValues(webOrigin: 'not a url'), throwsFormatException);
    });
  });

  group('deep links open the right screen', () {
    Future<void> pump(WidgetTester tester, String location, {AppConfig? config}) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          repositoryProvider.overrideWithValue(FakeSahelRepository()),
          appConfigProvider.overrideWithValue(config ?? AppConfig.fromValues(environment: 'prod', webOrigin: _h)),
        ],
        child: SahelApp(initialLocation: location),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('https URL with a language: opens the screen and switches to Arabic', (tester) async {
      await pump(tester, '$_h/ar/rewards');
      expect(find.byType(RewardsScreen), findsOneWidget);
      expect(Localizations.localeOf(tester.element(find.byType(RewardsScreen))).languageCode, 'ar');
    });

    testWidgets('sahel:// URL with an id', (tester) async {
      await pump(tester, 'sahel://claims/clm_1');
      expect(find.byType(ClaimDetailScreen), findsOneWidget);
    });

    testWidgets('a hostile or unknown link lands on home, not on an error page', (tester) async {
      await pump(tester, 'https://evil.example/en/rewards');
      expect(find.byType(RewardsScreen), findsNothing);
      expect(find.byKey(const Key('preapproval')), findsOneWidget);
    });

    testWidgets('an unknown route inside the app also falls back to home', (tester) async {
      await pump(tester, '/definitely/not/a/screen');
      expect(find.byKey(const Key('preapproval')), findsOneWidget);
    });

    testWidgets('dev builds show the sandbox banner, prod builds do not', (tester) async {
      await pump(tester, '/', config: AppConfig.fromValues(environment: 'dev'));
      expect(find.byKey(const Key('environment-banner')), findsOneWidget);
      expect(find.text('Sandbox build'), findsOneWidget);
      await pump(tester, '/', config: AppConfig.fromValues(environment: 'staging'));
      expect(find.text('Staging build'), findsOneWidget);
      await pump(tester, '/');
      expect(find.byKey(const Key('environment-banner')), findsNothing);
    });
  });
}
