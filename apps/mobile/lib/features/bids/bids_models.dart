// "Bid For Me" models. They mirror the JSON contract in api/openapi.yaml (BidRules, BidRequest, Bid); every rule
// (headroom check, matching, pricing, ranking, expiry) lives in packages/domain, never in Dart.

import '../../core/models.dart';

/// The active trade-in offer a request can use towards its down payment.
class BidTradeIn {
  const BidTradeIn({required this.offerId, required this.offerFils, required this.validUntil});
  final String offerId;
  final int offerFils;
  final String validUntil;

  static BidTradeIn? maybe(Object? j) => j == null
      ? null
      : BidTradeIn(offerId: (j as Json)['offerId'] as String, offerFils: j['offerFils'] as int, validUntil: j['validUntil'] as String);
}

/// Request form rules from GET /config (`bids`), for the session customer. POST /requests still validates.
class BidRules {
  const BidRules({
    required this.bodyTypes,
    required this.conditions,
    required this.fuels,
    required this.seatOptions,
    required this.mileageOptionsKm,
    required this.minYear,
    required this.maxYear,
    required this.structures,
    required this.minTenureMonths,
    required this.maxTenureMonths,
    required this.tenureStepMonths,
    required this.defaultTenureMonths,
    required this.downPaymentStepFils,
    required this.maxCashDownPaymentFils,
    required this.minMonthlyFils,
    required this.maxMonthlyFils,
    required this.monthlyStepFils,
    required this.defaultMonthlyFils,
    required this.canPost,
    required this.insurancePreferences,
    required this.validityHours,
    required this.pollSeconds,
    this.tradeIn,
  });

  final List<String> bodyTypes;
  final List<String> conditions;
  final List<String> fuels;
  final List<int> seatOptions;
  final List<int> mileageOptionsKm;
  final int minYear;
  final int maxYear;
  final List<String> structures;
  final int minTenureMonths;
  final int maxTenureMonths;
  final int tenureStepMonths;
  final int defaultTenureMonths;
  final int downPaymentStepFils;
  final int maxCashDownPaymentFils;
  final int minMonthlyFils;

  /// The customer's DBR headroom on the monthly step: the highest maximum monthly they can post.
  final int maxMonthlyFils;
  final int monthlyStepFils;
  final int defaultMonthlyFils;
  final bool canPost;
  final List<String> insurancePreferences;
  final int validityHours;
  final int pollSeconds;
  final BidTradeIn? tradeIn;

  factory BidRules.fromJson(Json j) => BidRules(
        bodyTypes: [for (final x in j['bodyTypes'] as List) x as String],
        conditions: [for (final x in j['conditions'] as List) x as String],
        fuels: [for (final x in j['fuels'] as List) x as String],
        seatOptions: [for (final x in j['seatOptions'] as List) x as int],
        mileageOptionsKm: [for (final x in j['mileageOptionsKm'] as List) x as int],
        minYear: j['minYear'] as int,
        maxYear: j['maxYear'] as int,
        structures: [for (final x in j['structures'] as List) x as String],
        minTenureMonths: j['minTenureMonths'] as int,
        maxTenureMonths: j['maxTenureMonths'] as int,
        tenureStepMonths: j['tenureStepMonths'] as int,
        defaultTenureMonths: j['defaultTenureMonths'] as int,
        downPaymentStepFils: j['downPaymentStepFils'] as int,
        maxCashDownPaymentFils: j['maxCashDownPaymentFils'] as int,
        minMonthlyFils: j['minMonthlyFils'] as int,
        maxMonthlyFils: j['maxMonthlyFils'] as int,
        monthlyStepFils: j['monthlyStepFils'] as int,
        defaultMonthlyFils: j['defaultMonthlyFils'] as int,
        canPost: j['canPost'] as bool,
        insurancePreferences: [for (final x in j['insurancePreferences'] as List) x as String],
        validityHours: j['validityHours'] as int,
        pollSeconds: j['pollSeconds'] as int,
        tradeIn: BidTradeIn.maybe(j['tradeIn']),
      );
}

/// What the customer posts (POST /requests). Null criteria mean "any".
class BidRequestDraft {
  const BidRequestDraft({
    required this.bodyType,
    required this.condition,
    required this.fuel,
    required this.maxMonthlyFils,
    required this.structure,
    required this.tenureMonths,
    required this.downPaymentFils,
    required this.useTradeIn,
    required this.insurance,
    this.minYear,
    this.maxMileageKm,
    this.minSeats,
  });

  final String bodyType;
  final String condition;
  final String fuel;
  final int? minYear;
  final int? maxMileageKm;
  final int? minSeats;
  final int maxMonthlyFils;
  final String structure;
  final int tenureMonths;
  final int downPaymentFils;
  final bool useTradeIn;
  final String insurance;

  Json toJson() => {
        'bodyType': bodyType,
        'condition': condition,
        'minYear': minYear,
        'maxMileageKm': maxMileageKm,
        'fuel': fuel,
        'minSeats': minSeats,
        'maxMonthlyFils': maxMonthlyFils,
        'structure': structure,
        'tenureMonths': tenureMonths,
        'downPaymentFils': downPaymentFils,
        'useTradeIn': useTradeIn,
        'insurance': insurance,
      };
}

class BidCriteria {
  const BidCriteria({required this.bodyType, required this.condition, required this.fuel, this.minYear, this.maxMileageKm, this.minSeats});
  final String bodyType;
  final String condition;
  final String fuel;
  final int? minYear;
  final int? maxMileageKm;
  final int? minSeats;

  factory BidCriteria.fromJson(Json j) => BidCriteria(
        bodyType: j['bodyType'] as String,
        condition: j['condition'] as String,
        fuel: j['fuel'] as String,
        minYear: j['minYear'] as int?,
        maxMileageKm: j['maxMileageKm'] as int?,
        minSeats: j['minSeats'] as int?,
      );
}

class BidTerms {
  const BidTerms({
    required this.maxMonthlyFils,
    required this.structure,
    required this.tenureMonths,
    required this.downPaymentFils,
    required this.insurance,
    this.tradeIn,
  });
  final int maxMonthlyFils;
  final String structure;
  final int tenureMonths;
  final int downPaymentFils;
  final String insurance;
  final BidTradeIn? tradeIn;

  factory BidTerms.fromJson(Json j) => BidTerms(
        maxMonthlyFils: j['maxMonthlyFils'] as int,
        structure: j['structure'] as String,
        tenureMonths: j['tenureMonths'] as int,
        downPaymentFils: j['downPaymentFils'] as int,
        insurance: j['insurance'] as String,
        tradeIn: BidTradeIn.maybe(j['tradeIn']),
      );
}

class BidVehicle {
  const BidVehicle({required this.id, required this.title, required this.year, required this.condition, required this.mileageKm});
  final String id;
  final String title;
  final int year;
  final String condition;
  final int mileageKm;

  factory BidVehicle.fromJson(Json j) => BidVehicle(
        id: j['id'] as String,
        title: j['title'] as String,
        year: j['year'] as int,
        condition: j['condition'] as String,
        mileageKm: j['mileageKm'] as int,
      );
}

class BidInsuranceEstimate {
  const BidInsuranceEstimate({required this.insurerName, required this.takaful, required this.annualPremiumFils});
  final Localized insurerName;
  final bool takaful;
  final int annualPremiumFils;

  static BidInsuranceEstimate? maybe(Object? j) => j == null
      ? null
      : BidInsuranceEstimate(
          insurerName: Localized.fromJson((j as Json)['insurerName'] as Json),
          takaful: j['takaful'] as bool,
          annualPremiumFils: j['annualPremiumFils'] as int,
        );
}

/// An offer priced by the API on the customer's terms (shared pricing engine).
class BidPricing {
  const BidPricing({
    required this.listPriceFils,
    required this.discountFils,
    required this.priceFils,
    required this.downPaymentFils,
    required this.monthlyFils,
    required this.totalCostFils,
    this.insurance,
  });
  final int listPriceFils;
  final int discountFils;
  final int priceFils;
  final int downPaymentFils;
  final int monthlyFils;
  final int totalCostFils;
  final BidInsuranceEstimate? insurance;

  factory BidPricing.fromJson(Json j) => BidPricing(
        listPriceFils: j['listPriceFils'] as int,
        discountFils: j['discountFils'] as int,
        priceFils: j['priceFils'] as int,
        downPaymentFils: j['downPaymentFils'] as int,
        monthlyFils: j['monthlyFils'] as int,
        totalCostFils: j['totalCostFils'] as int,
        insurance: BidInsuranceEstimate.maybe(j['insurance']),
      );
}

class Bid {
  const Bid({
    required this.id,
    required this.sellerId,
    required this.sellerName,
    required this.vehicle,
    required this.extras,
    required this.pricing,
    required this.status,
    this.rank,
  });
  final String id;
  final String sellerId;
  final Localized sellerName;
  final BidVehicle vehicle;
  final List<String> extras;
  final BidPricing pricing;

  /// ACTIVE, ACCEPTED or LOST
  final String status;

  /// Position in the chosen ranking (null for a lost bid)
  final int? rank;

  factory Bid.fromJson(Json j) => Bid(
        id: j['id'] as String,
        sellerId: j['sellerId'] as String,
        sellerName: Localized.fromJson((j['seller'] as Json)['name'] as Json),
        vehicle: BidVehicle.fromJson(j['vehicle'] as Json),
        extras: [for (final x in j['extras'] as List) x as String],
        pricing: BidPricing.fromJson(j['pricing'] as Json),
        status: j['status'] as String,
        rank: j['rank'] as int?,
      );
}

class InstantMatch {
  const InstantMatch({required this.vehicle, required this.sellerName, required this.pricing, required this.href});
  final BidVehicle vehicle;
  final Localized sellerName;
  final BidPricing pricing;

  /// Locale-free car page path (same as the web)
  final String href;

  factory InstantMatch.fromJson(Json j) => InstantMatch(
        vehicle: BidVehicle.fromJson(j['vehicle'] as Json),
        sellerName: Localized.fromJson((j['seller'] as Json)['name'] as Json),
        pricing: BidPricing.fromJson(j['pricing'] as Json),
        href: j['href'] as String,
      );
}

class BidAccepted {
  const BidAccepted({required this.bidId, required this.vehicleId, required this.applyHref, required this.validUntil});
  final String bidId;
  final String vehicleId;

  /// Car page path with the accepted bid (?requestId=&bidId=): applying there is priced from the bid
  final String applyHref;

  /// Until when the accepted price and extras can be used for a finance application
  final DateTime validUntil;
}

/// A request as the customer who posted it sees it (GET /requests/{id}).
class BidRequest {
  const BidRequest({
    required this.id,
    required this.status,
    required this.criteria,
    required this.terms,
    required this.instantMatches,
    required this.bids,
    required this.sort,
    required this.bidCount,
    required this.canAccept,
    required this.canCancel,
    required this.pollSeconds,
    required this.expiresAt,
    this.accepted,
  });

  final String id;

  /// OPEN, CLOSED, CANCELLED or EXPIRED
  final String status;
  final BidCriteria criteria;
  final BidTerms terms;
  final List<InstantMatch> instantMatches;

  /// Ranked by the API (`sort`)
  final List<Bid> bids;
  final String sort;
  final int bidCount;
  final bool canAccept;
  final bool canCancel;
  final int pollSeconds;
  final DateTime expiresAt;
  final BidAccepted? accepted;

  bool get open => status == 'OPEN';

  factory BidRequest.fromJson(Json j) {
    final a = j['accepted'] as Json?;
    return BidRequest(
      id: j['id'] as String,
      status: j['status'] as String,
      criteria: BidCriteria.fromJson(j['criteria'] as Json),
      terms: BidTerms.fromJson(j['terms'] as Json),
      instantMatches: [for (final m in j['instantMatches'] as List) InstantMatch.fromJson(m as Json)],
      bids: [for (final b in j['bids'] as List) Bid.fromJson(b as Json)],
      sort: j['sort'] as String,
      bidCount: j['bidCount'] as int,
      canAccept: j['canAccept'] as bool,
      canCancel: j['canCancel'] as bool,
      pollSeconds: j['pollSeconds'] as int,
      expiresAt: DateTime.parse(j['expiresAt'] as String),
      accepted: a == null
          ? null
          : BidAccepted(
              bidId: a['bidId'] as String,
              vehicleId: a['vehicleId'] as String,
              applyHref: a['applyHref'] as String,
              validUntil: DateTime.parse(a['validUntil'] as String),
            ),
    );
  }
}
