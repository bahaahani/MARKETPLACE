// Product rules from GET /api/v1/config (api/openapi.yaml: ClientConfig). The app hard-codes none of these:
// slider ranges, steps, defaults and the consent period all come from the API (@sahel/domain).

import '../models.dart';

class CalculatorRules {
  const CalculatorRules({
    required this.minTenureMonths,
    required this.maxTenureMonths,
    required this.defaultTenureMonths,
    required this.downPaymentStepFils,
    required this.tenureStepMonths,
  });

  final int minTenureMonths;
  final int maxTenureMonths;
  final int defaultTenureMonths;
  final int downPaymentStepFils;
  final int tenureStepMonths;

  factory CalculatorRules.fromJson(Json j) => CalculatorRules(
        minTenureMonths: j['minTenureMonths'] as int,
        maxTenureMonths: j['maxTenureMonths'] as int,
        defaultTenureMonths: j['defaultTenureMonths'] as int,
        downPaymentStepFils: j['downPaymentStepFils'] as int,
        tenureStepMonths: j['tenureStepMonths'] as int,
      );
}

/// Personal finance slider for the current customer: from the product minimum up to their pre-approved limit.
class PersonalFinanceRange {
  const PersonalFinanceRange({
    required this.preApprovedFils,
    required this.minAmountFils,
    required this.maxAmountFils,
    required this.defaultAmountFils,
    required this.amountStepFils,
    required this.defaultTenureMonths,
    required this.tenureStepMonths,
    required this.minTenureMonths,
    required this.maxTenureMonths,
  });

  final int preApprovedFils;
  final int minAmountFils;
  final int maxAmountFils;
  final int defaultAmountFils;
  final int amountStepFils;
  final int defaultTenureMonths;
  final int tenureStepMonths;
  final int minTenureMonths;
  final int maxTenureMonths;

  factory PersonalFinanceRange.fromJson(Json j) => PersonalFinanceRange(
        preApprovedFils: j['preApprovedFils'] as int,
        minAmountFils: j['minAmountFils'] as int,
        maxAmountFils: j['maxAmountFils'] as int,
        defaultAmountFils: j['defaultAmountFils'] as int,
        amountStepFils: j['amountStepFils'] as int,
        defaultTenureMonths: j['defaultTenureMonths'] as int,
        tenureStepMonths: j['tenureStepMonths'] as int,
        minTenureMonths: j['minTenureMonths'] as int,
        maxTenureMonths: j['maxTenureMonths'] as int,
      );
}

/// Travel insurance form: options, limits and the starting trip (the quote endpoint still validates).
class TravelRules {
  const TravelRules({
    required this.regions,
    required this.tiers,
    required this.minAdults,
    required this.maxAdults,
    required this.maxChildren,
    required this.maxTripDays,
    required this.maxDaysAhead,
    required this.defaultStartInDays,
    required this.defaultTripDays,
  });

  final List<String> regions;
  final List<String> tiers;
  final int minAdults;
  final int maxAdults;
  final int maxChildren;
  final int maxTripDays;
  final int maxDaysAhead;
  final int defaultStartInDays;
  final int defaultTripDays;

  factory TravelRules.fromJson(Json j) => TravelRules(
        regions: [for (final r in j['regions'] as List) r as String],
        tiers: [for (final t in j['tiers'] as List) t as String],
        minAdults: j['minAdults'] as int,
        maxAdults: j['maxAdults'] as int,
        maxChildren: j['maxChildren'] as int,
        maxTripDays: j['maxTripDays'] as int,
        maxDaysAhead: j['maxDaysAhead'] as int,
        defaultStartInDays: j['defaultStartInDays'] as int,
        defaultTripDays: j['defaultTripDays'] as int,
      );
}

/// Home insurance form: insurable property types and the starting sums insured (the quote endpoint still validates).
class HomeRules {
  const HomeRules({
    required this.propertyTypes,
    required this.defaultPropertyType,
    required this.defaultBuildingSumInsuredFils,
    required this.defaultContentsSumInsuredFils,
  });

  final List<String> propertyTypes;
  final String defaultPropertyType;
  final int defaultBuildingSumInsuredFils;
  final int defaultContentsSumInsuredFils;

  factory HomeRules.fromJson(Json j) => HomeRules(
        propertyTypes: [for (final t in j['propertyTypes'] as List) t as String],
        defaultPropertyType: j['defaultPropertyType'] as String,
        defaultBuildingSumInsuredFils: j['defaultBuildingSumInsuredFils'] as int,
        defaultContentsSumInsuredFils: j['defaultContentsSumInsuredFils'] as int,
      );
}

class ClientConfig {
  const ClientConfig({
    required this.consentScopes,
    required this.consentValidityDays,
    required this.finance,
    required this.personalFinance,
    required this.reservationDepositFils,
    required this.travel,
    required this.home,
  });

  final List<String> consentScopes;
  final int consentValidityDays;
  final Map<String, CalculatorRules> finance;
  final PersonalFinanceRange personalFinance;
  final int reservationDepositFils;
  final TravelRules travel;
  final HomeRules home;

  factory ClientConfig.fromJson(Json j) {
    final consent = j['consent'] as Json;
    return ClientConfig(
      consentScopes: [for (final s in consent['scopes'] as List) s as String],
      consentValidityDays: consent['validityDays'] as int,
      finance: {for (final e in (j['finance'] as Json).entries) e.key: CalculatorRules.fromJson(e.value as Json)},
      personalFinance: PersonalFinanceRange.fromJson(j['personalFinance'] as Json),
      reservationDepositFils: j['reservationDepositFils'] as int,
      travel: TravelRules.fromJson((j['insurance'] as Json)['travel'] as Json),
      home: HomeRules.fromJson((j['insurance'] as Json)['home'] as Json),
    );
  }
}
