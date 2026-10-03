import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'core/theme/theme.dart';
import 'features/account/account_screen.dart';
import 'features/cards/cards_screen.dart';
import 'features/cars/car_detail_screen.dart';
import 'features/cars/cars_screen.dart';
import 'features/checkout/checkout_screen.dart';
import 'features/home/home_screen.dart';
import 'features/insurance/insurance_screen.dart';
import 'features/property/property_detail_screen.dart';
import 'features/property/property_screen.dart';
import 'features/shell/app_shell.dart';
import 'l10n/gen/app_localizations.dart';

/// Routes mirror the web URLs (minus the /en|/ar prefix), so the same deep link
/// (e.g. /cars/v-honda-crv-2026 or /checkout?...) opens the same screen on every channel.
GoRouter buildRouter({String initialLocation = '/'}) => GoRouter(
      initialLocation: initialLocation,
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => AppShell(shell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/cars',
                builder: (_, s) => CarsScreen(initialMaxMonthlyFils: int.tryParse(s.uri.queryParameters['maxMonthlyFils'] ?? '')),
                routes: [GoRoute(path: ':id', builder: (_, s) => CarDetailScreen(id: s.pathParameters['id']!))],
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/property',
                builder: (_, _) => const PropertyScreen(),
                routes: [GoRoute(path: ':id', builder: (_, s) => PropertyDetailScreen(id: s.pathParameters['id']!))],
              ),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/cards', builder: (_, _) => const CardsScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
          ],
        ),
        GoRoute(path: '/insurance', builder: (_, _) => const InsuranceScreen()),
        GoRoute(path: '/checkout', builder: (_, s) => CheckoutScreen.fromQuery(s.uri.queryParameters)),
      ],
    );

class SahelApp extends ConsumerStatefulWidget {
  const SahelApp({super.key, this.initialLocation = '/'});
  final String initialLocation;

  @override
  ConsumerState<SahelApp> createState() => _SahelAppState();
}

class _SahelAppState extends ConsumerState<SahelApp> {
  late final GoRouter _router = buildRouter(initialLocation: widget.initialLocation);

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Sahel',
      debugShowCheckedModeBanner: false,
      theme: sahelTheme(),
      locale: ref.watch(localeProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: _router,
    );
  }
}
