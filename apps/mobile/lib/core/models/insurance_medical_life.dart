// Medical and life insurance models. They mirror the JSON contract in api/openapi.yaml; premiums, ages and limits
// are computed and validated server-side (packages/domain), never in Dart. Quotes are indicative only.

import '../models.dart';

/// Medical insurance form: options, member limits and the starting age (the quote endpoint still validates).
class MedicalRules {
  const MedicalRules({
    required this.tiers,
    required this.nationalities,
    required this.adultMinAge,
    required this.adultMaxAge,
    required this.childMaxAge,
    required this.maxChildren,
    required this.defaultPrimaryAge,
  });

  final List<String> tiers;
  final List<String> nationalities;
  final int adultMinAge;
  final int adultMaxAge;
  final int childMaxAge;
  final int maxChildren;
  final int defaultPrimaryAge;

  factory MedicalRules.fromJson(Json j) => MedicalRules(
        tiers: [for (final t in j['tiers'] as List) t as String],
        nationalities: [for (final n in j['nationalities'] as List) n as String],
        adultMinAge: j['adultMinAge'] as int,
        adultMaxAge: j['adultMaxAge'] as int,
        childMaxAge: j['childMaxAge'] as int,
        maxChildren: j['maxChildren'] as int,
        defaultPrimaryAge: j['defaultPrimaryAge'] as int,
      );
}

/// Life insurance form: limits and the starting values (the quote endpoint still validates).
class LifeRules {
  const LifeRules({
    required this.minAge,
    required this.maxAge,
    required this.maxEndAge,
    required this.defaultAge,
    required this.minSumAssuredFils,
    required this.maxSumAssuredFils,
    required this.sumAssuredStepFils,
    required this.defaultSumAssuredFils,
    required this.minTermYears,
    required this.maxTermYears,
    required this.defaultTermYears,
  });

  final int minAge;
  final int maxAge;

  /// Age at start plus the term cannot exceed this
  final int maxEndAge;
  final int defaultAge;
  final int minSumAssuredFils;
  final int maxSumAssuredFils;
  final int sumAssuredStepFils;
  final int defaultSumAssuredFils;
  final int minTermYears;
  final int maxTermYears;
  final int defaultTermYears;

  factory LifeRules.fromJson(Json j) => LifeRules(
        minAge: j['minAge'] as int,
        maxAge: j['maxAge'] as int,
        maxEndAge: j['maxEndAge'] as int,
        defaultAge: j['defaultAge'] as int,
        minSumAssuredFils: j['minSumAssuredFils'] as int,
        maxSumAssuredFils: j['maxSumAssuredFils'] as int,
        sumAssuredStepFils: j['sumAssuredStepFils'] as int,
        defaultSumAssuredFils: j['defaultSumAssuredFils'] as int,
        minTermYears: j['minTermYears'] as int,
        maxTermYears: j['maxTermYears'] as int,
        defaultTermYears: j['defaultTermYears'] as int,
      );
}

class MedicalQuote {
  const MedicalQuote({
    required this.insurerId,
    required this.insurerName,
    required this.takaful,
    required this.tier,
    required this.adults,
    required this.children,
    required this.annualPremiumFils,
    required this.annualLimitFils,
    required this.coPayPct,
    required this.inpatient,
    required this.outpatient,
    required this.maternityWaitingMonths,
    required this.dental,
    required this.optical,
    required this.preExistingStatus,
    required this.preExistingSurchargeFils,
    required this.buyable,
  });

  final String insurerId;
  final Localized insurerName;
  final bool takaful;
  final String tier;
  final int adults;
  final int children;

  /// Indicative premium for all members for one year
  final int annualPremiumFils;
  final int annualLimitFils;
  final int coPayPct;
  final bool inpatient;
  final bool outpatient;

  /// Null when maternity is not covered
  final int? maternityWaitingMonths;
  final bool dental;
  final bool optical;

  /// none, surcharge or referred
  final String preExistingStatus;
  final int preExistingSurchargeFils;

  /// False when the quote is referred to the insurer (it cannot be bought online)
  final bool buyable;

  factory MedicalQuote.fromJson(Json j) => MedicalQuote(
        insurerId: j['insurerId'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        takaful: j['takaful'] as bool,
        tier: j['tier'] as String,
        adults: j['adults'] as int,
        children: j['children'] as int,
        annualPremiumFils: j['annualPremiumFils'] as int,
        annualLimitFils: j['annualLimitFils'] as int,
        coPayPct: j['coPayPct'] as int,
        inpatient: j['inpatient'] as bool,
        outpatient: j['outpatient'] as bool,
        maternityWaitingMonths: j['maternityWaitingMonths'] as int?,
        dental: j['dental'] as bool,
        optical: j['optical'] as bool,
        preExistingStatus: j['preExistingStatus'] as String,
        preExistingSurchargeFils: j['preExistingSurchargeFils'] as int,
        buyable: j['buyable'] as bool,
      );
}

class LifeQuote {
  const LifeQuote({
    required this.insurerId,
    required this.insurerName,
    required this.takaful,
    required this.productType,
    required this.sumAssuredFils,
    required this.termYears,
    required this.criticalIllnessRider,
    required this.annualPremiumFils,
    required this.monthlyPremiumFils,
    required this.totalPremiumsFils,
  });

  final String insurerId;
  final Localized insurerName;
  final bool takaful;

  /// conventional or family-takaful
  final String productType;
  final int sumAssuredFils;
  final int termYears;
  final bool criticalIllnessRider;
  final int annualPremiumFils;

  /// Annual premium / 12 (a comparison figure; the annual premium is what is paid)
  final int monthlyPremiumFils;

  /// Annual premium × term
  final int totalPremiumsFils;

  factory LifeQuote.fromJson(Json j) => LifeQuote(
        insurerId: j['insurerId'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        takaful: j['takaful'] as bool,
        productType: j['productType'] as String,
        sumAssuredFils: j['sumAssuredFils'] as int,
        termYears: j['termYears'] as int,
        criticalIllnessRider: j['criticalIllnessRider'] as bool,
        annualPremiumFils: j['annualPremiumFils'] as int,
        monthlyPremiumFils: j['monthlyPremiumFils'] as int,
        totalPremiumsFils: j['totalPremiumsFils'] as int,
      );
}
