import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'core/theme/theme.dart';
import 'features/account/account_screen.dart';
import 'features/cards/card_apply_screen.dart';
import 'features/cards/cards_screen.dart';
import 'features/cars/car_detail_screen.dart';
import 'features/cars/cars_screen.dart';
import 'features/checkout/checkout_screen.dart';
import 'features/finance/application_screen.dart';
import 'features/finance/personal_finance_screen.dart';
import 'features/home/home_screen.dart';
import 'features/insurance/home_insurance_screen.dart';
import 'features/insurance/insurance_screen.dart';
import 'features/insurance/life_screen.dart';
import 'features/insurance/medical_screen.dart';
import 'features/insurance/travel_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/property/property_detail_screen.dart';
import 'features/property/property_screen.dart';
import 'features/shell/app_shell.dart';
import 'l10n/gen/app_localizations.dart';
import 'core/models/bundles.dart';
import 'features/bundles/life_events_screen.dart';
import 'features/assistant/assistant_screen.dart';
import 'features/claims/claim_detail_screen.dart';
import 'features/claims/claim_form_screen.dart';
import 'features/tradein/tradein_screen.dart';
import 'features/rewards/rewards_screen.dart';
import 'features/notifications/notification_preferences_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/bids/bid_request_detail_screen.dart';
import 'features/bids/bid_request_screen.dart';

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
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/cards',
                builder: (_, _) => const CardsScreen(),
                routes: [GoRoute(path: ':id/apply', builder: (_, s) => CardApplyScreen(cardId: s.pathParameters['id']!))],
              ),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
          ],
        ),
        GoRoute(
          path: '/insurance',
          builder: (_, _) => const InsuranceScreen(),
          routes: [
            GoRoute(path: 'travel', builder: (_, _) => const TravelInsuranceScreen()),
            GoRoute(path: 'home', builder: (_, s) => HomeInsuranceScreen(propertyId: s.uri.queryParameters['propertyId'])),
            GoRoute(path: 'medical', builder: (_, _) => const MedicalInsuranceScreen()),
            GoRoute(path: 'life', builder: (_, _) => const LifeInsuranceScreen()),
          ],
        ),
        GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
        GoRoute(path: '/checkout', builder: (_, s) => CheckoutScreen.fromQuery(s.uri.queryParameters)),
        GoRoute(path: '/finance/personal', builder: (_, _) => const PersonalFinanceScreen()),
        GoRoute(path: '/applications/:id', builder: (_, s) => ApplicationScreen(id: s.pathParameters['id']!)),
        GoRoute(
          path: '/life-events',
          builder: (_, _) => const LifeEventsScreen(),
          routes: [
            GoRoute(
              path: ':id',
              builder: (_, s) => LifeEventBundleScreen(
                id: s.pathParameters['id']!,
                initialStructure: s.uri.queryParameters['structure'] == 'conventional' ? BundleStructure.conventional : BundleStructure.islamic,
              ),
            ),
          ],
        ),
        GoRoute(path: '/assistant', builder: (_, _) => const AssistantScreen()),
        GoRoute(path: '/trade-in', builder: (_, s) => TradeInScreen(garageVehicleId: s.uri.queryParameters['garage'])),
        GoRoute(
          path: '/claims/new',
          builder: (_, s) => ClaimFormScreen(policyId: s.uri.queryParameters['policyId'], plate: s.uri.queryParameters['plate']),
        ),
        GoRoute(path: '/claims/:id', builder: (_, s) => ClaimDetailScreen(id: s.pathParameters['id']!)),
        GoRoute(path: '/rewards', builder: (_, _) => const RewardsScreen()),
        GoRoute(
          path: '/notifications',
          builder: (_, _) => const NotificationsScreen(),
          routes: [GoRoute(path: 'preferences', builder: (_, _) => const NotificationPreferencesScreen())],
        ),
        GoRoute(path: '/requests/new', builder: (_, _) => const NewBidRequestScreen()),
        GoRoute(path: '/requests/:id', builder: (_, s) => BidRequestDetailScreen(id: s.pathParameters['id']!)),
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
