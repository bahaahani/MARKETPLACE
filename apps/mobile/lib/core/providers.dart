import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/session.dart';
import 'api/session_store.dart';
import 'config.dart';
import 'models.dart';
import 'models/config.dart';
import 'repository.dart';

/// Secure storage on iOS and Android; memory on web, where the browser app has its own HttpOnly cookie.
final sessionStoreProvider = Provider<SessionStore>((ref) => kIsWeb ? MemorySessionStore() : SecureSessionStore());

final repositoryProvider = Provider<SahelRepository>(
  (ref) => ApiSahelRepository(ApiClient(
    baseUrl: ref.watch(appConfigProvider).apiBaseUrl,
    session: SandboxSession(store: ref.watch(sessionStoreProvider)),
  )),
);

/// App language. Arabic (RTL) and English are equal citizens.
class LocaleNotifier extends Notifier<Locale> {
  @override
  Locale build() => const Locale('en');

  /// Sets the language, e.g. from a deep link such as https://HOST/ar/cars/... .
  void set(Locale locale) => state = locale;

  void toggle() => state = state.languageCode == 'en' ? const Locale('ar') : const Locale('en');
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(LocaleNotifier.new);

final meProvider = FutureProvider<CustomerOverview>((ref) => ref.watch(repositoryProvider).me());

typedef VehicleQuery = ({String? query, String? condition, int? maxMonthlyFils});

final vehiclesProvider = FutureProvider.family<List<Vehicle>, VehicleQuery>(
  (ref, q) => ref.watch(repositoryProvider).vehicles(query: q.query, condition: q.condition, maxMonthlyFils: q.maxMonthlyFils),
);

final vehicleProvider = FutureProvider.family<Vehicle, String>((ref, id) => ref.watch(repositoryProvider).vehicle(id));

final propertiesProvider =
    FutureProvider.family<List<Property>, String?>((ref, purpose) => ref.watch(repositoryProvider).properties(purpose: purpose));

final propertyProvider = FutureProvider.family<Property, String>((ref, id) => ref.watch(repositoryProvider).property(id));

final cardsProvider = FutureProvider<List<CardProduct>>((ref) => ref.watch(repositoryProvider).cards());

/// Null down payment / tenure: the API quotes its listing defaults.
typedef FinanceQuery = ({String productLine, int assetPriceFils, int? downPaymentFils, int? tenureMonths});

final financeQuotesProvider = FutureProvider.family<FinanceComparison, FinanceQuery>(
  (ref, q) => ref.watch(repositoryProvider).financeQuotes(
        productLine: q.productLine,
        assetPriceFils: q.assetPriceFils,
        downPaymentFils: q.downPaymentFils,
        tenureMonths: q.tenureMonths,
      ),
);

typedef MotorQuery = ({int vehicleValueFils, bool comprehensive, bool takafulOnly});

final motorQuotesProvider = FutureProvider.family<List<MotorQuote>, MotorQuery>(
  (ref, q) => ref
      .watch(repositoryProvider)
      .motorQuotes(vehicleValueFils: q.vehicleValueFils, comprehensive: q.comprehensive, takafulOnly: q.takafulOnly),
);

final applicationProvider =
    FutureProvider.family<FinanceApplication, String>((ref, id) => ref.watch(repositoryProvider).application(id));

final applicationsProvider = FutureProvider<List<FinanceApplication>>((ref) => ref.watch(repositoryProvider).applications());

/// Product rules from GET /api/v1/config. Depends on the customer (personal finance range), so it is
/// refreshed after onboarding.
final configProvider = FutureProvider<ClientConfig>((ref) => ref.watch(repositoryProvider).config());

/// Virtual cards issued to the current (sandbox) customer, for "My cards".
final myCardsProvider = FutureProvider<List<VirtualCard>>((ref) => ref.watch(repositoryProvider).myCards());

/// After onboarding stores the customer's own financials, everything derived from them is reloaded.
void refreshCustomer(WidgetRef ref) {
  ref.invalidate(meProvider);
  ref.invalidate(cardsProvider);
  ref.invalidate(configProvider);
  ref.invalidate(myCardsProvider);
  ref.invalidate(applicationsProvider);
}
