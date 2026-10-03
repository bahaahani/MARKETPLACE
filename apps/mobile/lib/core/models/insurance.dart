// Insurance models (travel, home, policies). They mirror the JSON contract in api/openapi.yaml;
// prices and rules are computed server-side (packages/domain), never in Dart.

import '../models.dart';

/// Formats a calendar date the way the API expects (YYYY-MM-DD).
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class TravelQuote {
  const TravelQuote({
    required this.insurerId,
    required this.insurerName,
    required this.takaful,
    required this.region,
    required this.tier,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.adults,
    required this.children,
    required this.premiumFils,
    required this.medicalCoverFils,
    required this.schengenCompliant,
  });

  final String insurerId;
  final Localized insurerName;
  final bool takaful;

  /// gcc, worldwide-excl-us-ca or worldwide
  final String region;

  /// basic or plus
  final String tier;
  final String startDate;
  final String endDate;
  final int days;
  final int adults;
  final int children;
  final int premiumFils;
  final int medicalCoverFils;
  final bool schengenCompliant;

  factory TravelQuote.fromJson(Json j) => TravelQuote(
        insurerId: j['insurerId'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        takaful: j['takaful'] as bool,
        region: j['region'] as String,
        tier: j['tier'] as String,
        startDate: j['startDate'] as String,
        endDate: j['endDate'] as String,
        days: j['days'] as int,
        adults: j['adults'] as int,
        children: j['children'] as int,
        premiumFils: j['premiumFils'] as int,
        medicalCoverFils: j['medicalCoverFils'] as int,
        schengenCompliant: j['schengenCompliant'] as bool,
      );
}

/// What the home quote endpoint priced (sums suggested from a listing when only propertyId was sent).
class HomeInput {
  const HomeInput({
    required this.propertyType,
    required this.buildingSumInsuredFils,
    required this.contentsSumInsuredFils,
    this.propertyId,
    this.propertyTitle,
  });

  final String propertyType;
  final int buildingSumInsuredFils;
  final int contentsSumInsuredFils;
  final String? propertyId;
  final Localized? propertyTitle;

  factory HomeInput.fromJson(Json j) => HomeInput(
        propertyType: j['propertyType'] as String,
        buildingSumInsuredFils: j['buildingSumInsuredFils'] as int,
        contentsSumInsuredFils: j['contentsSumInsuredFils'] as int,
        propertyId: j['propertyId'] as String?,
        propertyTitle: j['propertyTitle'] == null ? null : Localized.fromJson(j['propertyTitle'] as Json),
      );

  /// Request body for the same input (used to hold a quote for one insurer).
  Json toRequest() => {
        'propertyType': propertyType,
        'buildingSumInsuredFils': buildingSumInsuredFils,
        'contentsSumInsuredFils': contentsSumInsuredFils,
        'propertyId': ?propertyId,
      };
}

class HomeQuote {
  const HomeQuote({
    required this.insurerId,
    required this.insurerName,
    required this.takaful,
    required this.buildingSumInsuredFils,
    required this.contentsSumInsuredFils,
    required this.annualPremiumFils,
    required this.accidentalDamage,
    required this.temporaryAccommodation,
  });

  final String insurerId;
  final Localized insurerName;
  final bool takaful;
  final int buildingSumInsuredFils;
  final int contentsSumInsuredFils;
  final int annualPremiumFils;
  final bool accidentalDamage;
  final bool temporaryAccommodation;

  factory HomeQuote.fromJson(Json j) => HomeQuote(
        insurerId: j['insurerId'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        takaful: j['takaful'] as bool,
        buildingSumInsuredFils: j['buildingSumInsuredFils'] as int,
        contentsSumInsuredFils: j['contentsSumInsuredFils'] as int,
        annualPremiumFils: j['annualPremiumFils'] as int,
        accidentalDamage: j['accidentalDamage'] as bool,
        temporaryAccommodation: j['temporaryAccommodation'] as bool,
      );
}

class HomeQuotes {
  const HomeQuotes({required this.input, required this.quotes});
  final HomeInput input;
  final List<HomeQuote> quotes;

  factory HomeQuotes.fromJson(Json j) => HomeQuotes(
        input: HomeInput.fromJson(j['input'] as Json),
        quotes: [for (final q in j['quotes'] as List) HomeQuote.fromJson(q as Json)],
      );
}

/// What a policy covers. Fields depend on [line] (motor, travel or home).
class PolicyCover {
  const PolicyCover({
    required this.line,
    this.motorCover,
    this.reference,
    this.region,
    this.tier,
    this.adults,
    this.children,
    this.propertyType,
    this.buildingSumInsuredFils,
    this.contentsSumInsuredFils,
    this.propertyTitle,
  });

  final String line;

  /// Motor: comprehensive or third-party
  final String? motorCover;

  /// Motor: plate or vehicle id
  final String? reference;
  final String? region;
  final String? tier;
  final int? adults;
  final int? children;
  final String? propertyType;
  final int? buildingSumInsuredFils;
  final int? contentsSumInsuredFils;
  final Localized? propertyTitle;

  factory PolicyCover.fromJson(Json j) => PolicyCover(
        line: j['line'] as String,
        motorCover: j['line'] == 'motor' ? j['cover'] as String? : null,
        reference: j['reference'] as String?,
        region: j['region'] as String?,
        tier: j['tier'] as String?,
        adults: j['adults'] as int?,
        children: j['children'] as int?,
        propertyType: j['propertyType'] as String?,
        buildingSumInsuredFils: j['buildingSumInsuredFils'] as int?,
        contentsSumInsuredFils: j['contentsSumInsuredFils'] as int?,
        propertyTitle: j['propertyTitle'] == null ? null : Localized.fromJson(j['propertyTitle'] as Json),
      );
}

/// A server-priced quote held for checkout (POST /policies/quotes). Pay [premiumFils] with reference [id].
class PolicyQuote {
  const PolicyQuote({required this.id, required this.line, required this.insurerName, required this.premiumFils});
  final String id;
  final String line;
  final Localized insurerName;
  final int premiumFils;

  factory PolicyQuote.fromJson(Json j) => PolicyQuote(
        id: j['id'] as String,
        line: j['line'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        premiumFils: j['premiumFils'] as int,
      );

  /// Checkouts paying a held quote issue the policy once the payment is captured.
  static bool isQuoteReference(String purpose, String reference) => purpose == 'insurance_premium' && reference.startsWith('pq_');
}

class Policy {
  const Policy({
    required this.id,
    required this.policyNumber,
    required this.line,
    required this.insurerName,
    required this.takaful,
    required this.premiumFils,
    required this.cover,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  final String id;
  final String policyNumber;
  final String line;
  final Localized insurerName;
  final bool takaful;
  final int premiumFils;
  final PolicyCover cover;
  final DateTime startDate;
  final DateTime endDate;

  /// ACTIVE or EXPIRED (decided by the API from the dates)
  final String status;

  bool get active => status == 'ACTIVE';

  factory Policy.fromJson(Json j) => Policy(
        id: j['id'] as String,
        policyNumber: j['policyNumber'] as String,
        line: j['line'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        takaful: j['takaful'] as bool,
        premiumFils: j['premiumFils'] as int,
        cover: PolicyCover.fromJson(j['cover'] as Json),
        startDate: DateTime.parse(j['startDate'] as String),
        endDate: DateTime.parse(j['endDate'] as String),
        status: j['status'] as String,
      );
}
