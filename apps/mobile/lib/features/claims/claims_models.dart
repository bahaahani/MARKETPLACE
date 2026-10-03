// Motor claim models (J6). They mirror the JSON contract in api/openapi.yaml (Claim, ClaimRules); every rule
// (validation, status machine, estimate, garages, replacement car) lives in packages/domain, never in Dart.

import 'dart:convert';
import 'dart:typed_data';

import '../../core/models.dart';

/// Motor claim form rules from GET /config (`claims`). The API still validates every claim.
class ClaimRules {
  const ClaimRules({
    required this.types,
    required this.severities,
    required this.minPhotos,
    required this.maxPhotos,
    required this.maxPhotoBytes,
    required this.photoMaxDimensionPx,
    required this.descriptionMinLength,
    required this.descriptionMaxLength,
    required this.locationMaxLength,
    required this.policeReportMaxLength,
    required this.policeReportRequiredFor,
  });

  final List<String> types;
  final List<String> severities;
  final Map<String, int> minPhotos;
  final int maxPhotos;
  final int maxPhotoBytes;
  final int photoMaxDimensionPx;
  final int descriptionMinLength;
  final int descriptionMaxLength;
  final int locationMaxLength;
  final int policeReportMaxLength;
  final List<String> policeReportRequiredFor;

  factory ClaimRules.fromJson(Json j) => ClaimRules(
        types: [for (final t in j['types'] as List) t as String],
        severities: [for (final s in j['severities'] as List) s as String],
        minPhotos: {for (final e in (j['minPhotos'] as Json).entries) e.key: e.value as int},
        maxPhotos: j['maxPhotos'] as int,
        maxPhotoBytes: j['maxPhotoBytes'] as int,
        photoMaxDimensionPx: j['photoMaxDimensionPx'] as int,
        descriptionMinLength: j['descriptionMinLength'] as int,
        descriptionMaxLength: j['descriptionMaxLength'] as int,
        locationMaxLength: j['locationMaxLength'] as int,
        policeReportMaxLength: j['policeReportMaxLength'] as int,
        policeReportRequiredFor: [for (final t in j['policeReportRequiredFor'] as List) t as String],
      );
}

/// A photo picked on the device (already resized and compressed by the picker).
class ClaimPhotoUpload {
  const ClaimPhotoUpload(this.bytes, {this.mimeType});
  final Uint8List bytes;

  /// Optional label; the API detects the real type from the bytes.
  final String? mimeType;

  Json toJson() => {'dataBase64': base64Encode(bytes), 'mimeType': ?mimeType};
}

/// What the customer reports (POST /claims).
class ClaimDraft {
  const ClaimDraft({
    required this.policyId,
    required this.incidentAt,
    required this.location,
    required this.type,
    required this.severity,
    required this.description,
    required this.thirdPartyInvolved,
    this.policeReportNumber,
    this.photos = const [],
  });

  final String policyId;
  final DateTime incidentAt;
  final String location;
  final String type;
  final String severity;
  final String description;
  final bool thirdPartyInvolved;
  final String? policeReportNumber;
  final List<ClaimPhotoUpload> photos;

  Json toJson() => {
        'policyId': policyId,
        // An instant (UTC); the API derives the Bahrain date.
        'incidentAt': incidentAt.toUtc().toIso8601String(),
        'location': location,
        'type': type,
        'severity': severity,
        'description': description,
        'thirdPartyInvolved': thirdPartyInvolved,
        'policeReportNumber': ?policeReportNumber,
        'photos': [for (final p in photos) p.toJson()],
      };
}

class ClaimGarage {
  const ClaimGarage({required this.id, required this.name, required this.area, required this.agency});
  final String id;
  final Localized name;
  final Localized area;
  final bool agency;

  factory ClaimGarage.fromJson(Json j) => ClaimGarage(
        id: (j['id'] ?? j['garageId']) as String,
        name: Localized.fromJson(j['name'] as Json),
        area: Localized.fromJson(j['area'] as Json),
        agency: j['agency'] as bool,
      );
}

/// ⚠️ Sandbox rules table by type and severity, not AI (decided by the API).
class DamageEstimate {
  const DamageEstimate({required this.estimateFils, required this.lowFils, required this.highFils, required this.totalLoss});
  final int estimateFils;
  final int lowFils;
  final int highFils;
  final bool totalLoss;

  factory DamageEstimate.fromJson(Json j) => DamageEstimate(
        estimateFils: j['estimateFils'] as int,
        lowFils: j['lowFils'] as int,
        highFils: j['highFils'] as int,
        totalLoss: j['totalLoss'] as bool,
      );
}

class ReplacementCarOffer {
  const ReplacementCarOffer({required this.offered, required this.provider, required this.vehicleClass, required this.days});
  final bool offered;
  final Localized provider;
  final Localized vehicleClass;
  final int days;

  factory ReplacementCarOffer.fromJson(Json j) => ReplacementCarOffer(
        offered: j['offered'] as bool,
        provider: Localized.fromJson(j['provider'] as Json),
        vehicleClass: Localized.fromJson(j['vehicleClass'] as Json),
        days: j['days'] as int,
      );
}

class ClaimProgressStep {
  const ClaimProgressStep({required this.status, required this.done, required this.current, this.at});
  final String status;
  final bool done;
  final bool current;
  final DateTime? at;

  factory ClaimProgressStep.fromJson(Json j) => ClaimProgressStep(
        status: j['status'] as String,
        done: j['done'] as bool,
        current: j['current'] as bool,
        at: j['at'] == null ? null : DateTime.parse(j['at'] as String),
      );
}

class Claim {
  const Claim({
    required this.id,
    required this.claimNumber,
    required this.policyNumber,
    required this.vehicleReference,
    required this.incidentAt,
    required this.location,
    required this.type,
    required this.severity,
    required this.description,
    required this.thirdPartyInvolved,
    required this.photoCount,
    required this.estimate,
    required this.status,
    required this.createdAt,
    required this.garageOptions,
    required this.canBookGarage,
    required this.replacementCar,
    required this.nextStatuses,
    required this.progress,
    required this.agencyRepair,
    this.policeReportNumber,
    this.approvedAmountFils,
    this.garage,
  });

  final String id;
  final String claimNumber;
  final String policyNumber;
  final String vehicleReference;
  final DateTime incidentAt;
  final String location;
  final String type;
  final String severity;
  final String description;
  final bool thirdPartyInvolved;
  final String? policeReportNumber;
  final int photoCount;
  final DamageEstimate estimate;

  /// SUBMITTED, UNDER_ASSESSMENT, APPROVED, REJECTED, REPAIR_BOOKED or SETTLED
  final String status;
  final DateTime createdAt;
  final int? approvedAmountFils;
  final ClaimGarage? garage;
  final List<ClaimGarage> garageOptions;
  final bool canBookGarage;
  final bool agencyRepair;
  final ReplacementCarOffer replacementCar;

  /// Where the ⚠️ sandbox "advance" call may move the claim
  final List<String> nextStatuses;
  final List<ClaimProgressStep> progress;

  factory Claim.fromJson(Json j) => Claim(
        id: j['id'] as String,
        claimNumber: j['claimNumber'] as String,
        policyNumber: j['policyNumber'] as String,
        vehicleReference: j['vehicleReference'] as String,
        incidentAt: DateTime.parse(j['incidentAt'] as String),
        location: j['location'] as String,
        type: j['type'] as String,
        severity: j['severity'] as String,
        description: j['description'] as String,
        thirdPartyInvolved: j['thirdPartyInvolved'] as bool,
        policeReportNumber: j['policeReportNumber'] as String?,
        photoCount: (j['photos'] as List).length,
        estimate: DamageEstimate.fromJson(j['estimate'] as Json),
        status: j['status'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
        approvedAmountFils: j['approvedAmountFils'] as int?,
        garage: j['garage'] == null ? null : ClaimGarage.fromJson(j['garage'] as Json),
        garageOptions: [for (final g in j['garageOptions'] as List) ClaimGarage.fromJson(g as Json)],
        canBookGarage: j['canBookGarage'] as bool,
        agencyRepair: j['agencyRepair'] as bool,
        replacementCar: ReplacementCarOffer.fromJson(j['replacementCar'] as Json),
        nextStatuses: [for (final s in j['nextStatuses'] as List) s as String],
        progress: [for (final p in j['progress'] as List) ClaimProgressStep.fromJson(p as Json)],
      );
}
