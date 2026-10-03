// Instant trade-in (api/openapi.yaml: TradeInOffer, TradeInApplication, TradeInRules).
// ⚠️ Sandbox: the API values cars with a deterministic rules model, not AI. The app computes nothing: the range,
// the offer, the breakdown and the down payment it gives a car all come from the API.

import '../models.dart';

/// Trade-in form rules from GET /config `tradeIn`: makes, models, years and limits, and My Garage cars to pre-fill.
class TradeInRules {
  const TradeInRules({
    required this.makes,
    required this.minYear,
    required this.maxYear,
    required this.maxMileageKm,
    required this.conditions,
    required this.offerValidityDays,
    required this.garage,
  });

  /// Make → its models with the first model year the API accepts.
  final Map<String, Map<String, int>> makes;
  final int minYear;
  final int maxYear;
  final int maxMileageKm;
  final List<String> conditions;
  final int offerValidityDays;
  final List<TradeInGarageCar> garage;

  factory TradeInRules.fromJson(Json j) => TradeInRules(
        makes: {
          for (final m in j['makes'] as List)
            (m as Json)['make'] as String: {
              for (final x in m['models'] as List) (x as Json)['model'] as String: x['firstYear'] as int,
            },
        },
        minYear: j['minYear'] as int,
        maxYear: j['maxYear'] as int,
        maxMileageKm: j['maxMileageKm'] as int,
        conditions: [for (final c in j['conditions'] as List) c as String],
        offerValidityDays: j['offerValidityDays'] as int,
        garage: [for (final g in j['garage'] as List) TradeInGarageCar.fromJson(g as Json)],
      );
}

class TradeInGarageCar {
  const TradeInGarageCar({
    required this.garageVehicleId,
    required this.title,
    required this.make,
    required this.model,
    required this.year,
    required this.mileageKm,
    required this.plateMasked,
  });

  final String garageVehicleId;
  final String title;
  final String make;
  final String model;
  final int year;
  final int mileageKm;
  final String plateMasked;

  factory TradeInGarageCar.fromJson(Json j) => TradeInGarageCar(
        garageVehicleId: j['garageVehicleId'] as String,
        title: j['title'] as String,
        make: j['make'] as String,
        model: j['model'] as String,
        year: j['year'] as int,
        mileageKm: j['mileageKm'] as int,
        plateMasked: j['plateMasked'] as String,
      );
}

class TradeInStep {
  const TradeInStep({required this.code, required this.amountFils, required this.valueAfterFils});
  final String code;
  final int amountFils;
  final int valueAfterFils;

  factory TradeInStep.fromJson(Json j) =>
      TradeInStep(code: j['code'] as String, amountFils: j['amountFils'] as int, valueAfterFils: j['valueAfterFils'] as int);
}

class TradeInOffer {
  const TradeInOffer({
    required this.id,
    required this.offerFils,
    required this.validUntil,
    required this.make,
    required this.model,
    required this.year,
    required this.mileageKm,
    required this.condition,
    required this.accidentHistory,
    required this.plateMasked,
    required this.ageYears,
    required this.rangeLowFils,
    required this.rangeHighFils,
    required this.breakdown,
  });

  final String id;
  final int offerFils;
  final DateTime validUntil;
  final String make;
  final String model;
  final int year;
  final int mileageKm;
  final String condition;
  final bool accidentHistory;
  final String? plateMasked;
  final int ageYears;
  final int rangeLowFils;
  final int rangeHighFils;
  final List<TradeInStep> breakdown;

  factory TradeInOffer.fromJson(Json j) {
    final v = j['valuation'] as Json;
    final car = v['vehicle'] as Json;
    return TradeInOffer(
      id: j['id'] as String,
      offerFils: j['offerFils'] as int,
      validUntil: DateTime.parse(j['validUntil'] as String),
      make: car['make'] as String,
      model: car['model'] as String,
      year: car['year'] as int,
      mileageKm: car['mileageKm'] as int,
      condition: car['condition'] as String,
      accidentHistory: car['accidentHistory'] as bool,
      plateMasked: car['plateMasked'] as String?,
      ageYears: v['ageYears'] as int,
      rangeLowFils: v['rangeLowFils'] as int,
      rangeHighFils: v['rangeHighFils'] as int,
      breakdown: [for (final s in v['breakdown'] as List) TradeInStep.fromJson(s as Json)],
    );
  }
}

/// The down payment an offer gives one car: min(offer, maximum down payment), computed by the API.
class TradeInApplication {
  const TradeInApplication({
    required this.vehicleId,
    required this.offerFils,
    required this.downPaymentFils,
    required this.creditedFils,
    required this.capped,
    required this.cashTopUpFils,
  });

  final String vehicleId;
  final int offerFils;
  final int downPaymentFils;
  final int creditedFils;
  final bool capped;
  final int cashTopUpFils;

  factory TradeInApplication.fromJson(Json j) => TradeInApplication(
        vehicleId: j['vehicleId'] as String,
        offerFils: j['offerFils'] as int,
        downPaymentFils: j['downPaymentFils'] as int,
        creditedFils: j['creditedFils'] as int,
        capped: j['capped'] as bool,
        cashTopUpFils: j['cashTopUpFils'] as int,
      );
}

/// GET /me/trade-in: the active offer (null when none) and, for a car, what it gives as down payment.
class TradeInStatus {
  const TradeInStatus({this.offer, this.forVehicle});
  final TradeInOffer? offer;
  final TradeInApplication? forVehicle;

  factory TradeInStatus.fromJson(Json j) => TradeInStatus(
        offer: j['offer'] == null ? null : TradeInOffer.fromJson(j['offer'] as Json),
        forVehicle: j['forVehicle'] == null ? null : TradeInApplication.fromJson(j['forVehicle'] as Json),
      );
}
