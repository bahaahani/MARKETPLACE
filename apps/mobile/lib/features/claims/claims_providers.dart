import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../l10n/gen/app_localizations.dart';
import 'claims_models.dart';

final myClaimsProvider = FutureProvider<List<Claim>>((ref) => ref.watch(repositoryProvider).myClaims());

final claimProvider = FutureProvider.autoDispose.family<Claim, String>((ref, id) => ref.watch(repositoryProvider).claim(id));

/// Where claim photos come from. Widget tests override it (no platform channel).
abstract interface class ClaimPhotoPicker {
  /// Photos resized so the longer side is at most [maxDimensionPx] and compressed; at most [limit] of them.
  Future<List<ClaimPhotoUpload>> pick({required bool camera, required int maxDimensionPx, required int limit});
}

/// image_picker: resizes and re-encodes on the device (which also drops EXIF metadata such as GPS on most platforms).
class ImagePickerClaimPhotoPicker implements ClaimPhotoPicker {
  ImagePickerClaimPhotoPicker([ImagePicker? picker]) : _picker = picker ?? ImagePicker();
  final ImagePicker _picker;

  @override
  Future<List<ClaimPhotoUpload>> pick({required bool camera, required int maxDimensionPx, required int limit}) async {
    final size = maxDimensionPx.toDouble();
    final files = camera
        ? [?await _picker.pickImage(source: ImageSource.camera, maxWidth: size, maxHeight: size, imageQuality: 70)]
        : limit <= 1
            ? [?await _picker.pickImage(source: ImageSource.gallery, maxWidth: size, maxHeight: size, imageQuality: 70)]
            : await _picker.pickMultiImage(maxWidth: size, maxHeight: size, imageQuality: 70, limit: limit);
    return [for (final f in files.take(limit)) ClaimPhotoUpload(await f.readAsBytes(), mimeType: f.mimeType)];
  }
}

final claimPhotoPickerProvider = Provider<ClaimPhotoPicker>((ref) => ImagePickerClaimPhotoPicker());

String claimTypeLabel(AppLocalizations l, String type) => switch (type) {
      'collision' => l.claimTypeCollision,
      'theft' => l.claimTypeTheft,
      'glass' => l.claimTypeGlass,
      'fire' => l.claimTypeFire,
      _ => l.claimTypeOther,
    };

String claimSeverityLabel(AppLocalizations l, String severity) => switch (severity) {
      'minor' => l.claimSeverityMinor,
      'moderate' => l.claimSeverityModerate,
      _ => l.claimSeveritySevere,
    };

String claimStatusLabel(AppLocalizations l, String status) => switch (status) {
      'SUBMITTED' => l.claimStatusSubmitted,
      'UNDER_ASSESSMENT' => l.claimStatusUnderAssessment,
      'APPROVED' => l.claimStatusApproved,
      'REJECTED' => l.claimStatusRejected,
      'REPAIR_BOOKED' => l.claimStatusRepairBooked,
      _ => l.claimStatusSettled,
    };

/// (text, background) per status, same tones as the web.
(Color, Color) claimStatusColors(String status) => switch (status) {
      'SUBMITTED' => (SahelColors.brand, SahelColors.brandSoft),
      'UNDER_ASSESSMENT' => (const Color(0xFF8A5C00), const Color(0x26E8A317)),
      'APPROVED' || 'REPAIR_BOOKED' => (SahelColors.islamic, SahelColors.islamicSoft),
      'REJECTED' => (SahelColors.danger, const Color(0x1AC0392B)),
      _ => (SahelColors.textMuted, SahelColors.background),
    };

/// Localized message for a POST /claims error (codes from packages/domain).
String claimErrorText(AppLocalizations l, Object error) => switch (error) {
      ApiException(code: 'INCIDENT_IN_FUTURE') => l.claimErrorFuture,
      ApiException(code: 'INCIDENT_OUTSIDE_POLICY') => l.claimErrorOutsidePolicy,
      ApiException(code: 'INCIDENT_TOO_OLD') => l.claimErrorTooOld,
      ApiException(code: 'INVALID_INCIDENT_TIME') => l.claimErrorTime,
      ApiException(code: 'POLICE_REPORT_REQUIRED' || 'INVALID_POLICE_REPORT') => l.claimErrorPoliceReport,
      ApiException(code: 'PHOTOS_REQUIRED') => l.claimErrorPhotosRequired,
      ApiException(code: 'PHOTO_INVALID' || 'PHOTO_TOO_LARGE' || 'BODY_TOO_LARGE') => l.claimErrorPhoto,
      ApiException(code: 'TOO_MANY_PHOTOS') => l.claimErrorTooManyPhotos,
      ApiException(code: 'NOT_COVERED') => l.claimErrorNotCovered,
      ApiException(code: 'INVALID_LOCATION') => l.claimErrorLocation,
      ApiException(code: 'INVALID_DESCRIPTION') => l.claimErrorDescription,
      ApiException(code: 'POLICY_NOT_FOUND' || 'POLICY_NOT_ACTIVE' || 'NOT_MOTOR_POLICY') => l.claimErrorPolicy,
      _ => l.errorGeneric,
    };
