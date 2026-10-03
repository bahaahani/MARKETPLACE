import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models/insurance.dart';
import '../../core/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import '../checkout/checkout_screen.dart';

typedef TravelQuery = ({String region, String tier, String startDate, String endDate, int adults, int children, bool takafulOnly});

final travelQuotesProvider = FutureProvider.autoDispose.family<List<TravelQuote>, TravelQuery>(
  (ref, q) => ref.watch(repositoryProvider).travelQuotes(
        region: q.region,
        tier: q.tier,
        startDate: q.startDate,
        endDate: q.endDate,
        adults: q.adults,
        children: q.children,
        takafulOnly: q.takafulOnly,
      ),
);

typedef HomeQuery = ({String? propertyType, int? buildingSumInsuredFils, int? contentsSumInsuredFils, String? propertyId, bool takafulOnly});

final homeQuotesProvider = FutureProvider.autoDispose.family<HomeQuotes, HomeQuery>(
  (ref, q) => ref.watch(repositoryProvider).homeQuotes(
        propertyType: q.propertyType,
        buildingSumInsuredFils: q.buildingSumInsuredFils,
        contentsSumInsuredFils: q.contentsSumInsuredFils,
        propertyId: q.propertyId,
        takafulOnly: q.takafulOnly,
      ),
);

final myPoliciesProvider = FutureProvider<List<Policy>>((ref) => ref.watch(repositoryProvider).myPolicies());

/// Localized message for an insurance API error (codes from packages/domain).
String insuranceErrorText(AppLocalizations l, Object error) => switch (error) {
      ApiException(code: 'INVALID_DATES') => l.insErrorDates,
      ApiException(code: 'TRIP_TOO_LONG') => l.insErrorTripTooLong,
      ApiException(code: 'INVALID_TRAVELLERS') => l.insErrorTravellers,
      ApiException(code: 'INVALID_SUM_INSURED') => l.insErrorSumInsured,
      ApiException(code: 'PROPERTY_NOT_INSURABLE') => l.insErrorNotInsurable,
      _ => l.errorGeneric,
    };

String regionLabel(AppLocalizations l, String region) => switch (region) {
      'gcc' => l.insRegionGcc,
      'worldwide-excl-us-ca' => l.insRegionWorldwideExclUsCa,
      _ => l.insRegionWorldwide,
    };

String tierLabel(AppLocalizations l, String tier) => tier == 'plus' ? l.insTierPlus : l.insTierBasic;

String propertyTypeLabel(AppLocalizations l, String type) => switch (type) {
      'villa' => l.insTypeVilla,
      'apartment' => l.insTypeApartment,
      'townhouse' => l.insTypeTownhouse,
      'office' => l.insTypeOffice,
      _ => type,
    };

String lineLabel(AppLocalizations l, String line) => switch (line) {
      'motor' => l.insLineMotor,
      'travel' => l.insLineTravel,
      _ => l.insLineHome,
    };

/// "Buy": the API re-prices and holds the quote, then checkout pays that exact premium.
/// The policy is issued once the payment is captured (see CheckoutScreen).
Future<void> buyPolicy(
  BuildContext context,
  WidgetRef ref, {
  required String line,
  required String insurerId,
  required Json input,
  required String label,
}) async {
  try {
    final quote = await ref.read(repositoryProvider).holdPolicyQuote(line: line, insurerId: insurerId, input: input);
    if (!context.mounted) return;
    await context.push(CheckoutScreen.link(purpose: 'insurance_premium', amountFils: quote.premiumFils, reference: quote.id, label: label));
  } catch (_) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.errorGeneric)));
  }
}
