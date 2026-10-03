import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'models.dart';
import 'repository.dart';

final repositoryProvider = Provider<SahelRepository>(
  (ref) => ApiSahelRepository(ApiClient(baseUrl: defaultApiBaseUrl())),
);

/// App language. Arabic (RTL) and English are equal citizens.
class LocaleNotifier extends Notifier<Locale> {
  @override
  Locale build() => const Locale('en');

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

typedef FinanceQuery = ({String productLine, int assetPriceFils, int downPaymentFils, int tenureMonths});

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
