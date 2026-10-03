import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/config.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/claims/claim_detail_screen.dart';
import 'package:sahel/features/claims/claim_form_screen.dart';
import 'package:sahel/features/claims/claims_models.dart';
import 'package:sahel/features/claims/claims_providers.dart';

import 'fake_repository.dart';

/// A real 1×1 PNG, so Image.memory can decode the preview.
final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

/// Stands in for image_picker (no platform channel in widget tests).
class FakePhotoPicker implements ClaimPhotoPicker {
  final requests = <({bool camera, int maxDimensionPx, int limit})>[];
  List<ClaimPhotoUpload> next = [ClaimPhotoUpload(Uint8List.fromList(_png), mimeType: 'image/png')];

  @override
  Future<List<ClaimPhotoUpload>> pick({required bool camera, required int maxDimensionPx, required int limit}) async {
    requests.add((camera: camera, maxDimensionPx: maxDimensionPx, limit: limit));
    return next;
  }
}

Future<(FakeSahelRepository, FakePhotoPicker)> pumpApp(WidgetTester tester, {String location = '/', bool motorCover = true}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeSahelRepository()..motorCover = motorCover;
  final picker = FakePhotoPicker();
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo), claimPhotoPickerProvider.overrideWithValue(picker)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return (repo, picker);
}

Future<void> scrollTo<T extends Widget>(WidgetTester tester, Finder target, {bool up = false}) async {
  final list = find.descendant(of: find.byType(T), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(target, up ? -200 : 200, scrollable: list);
  await tester.pumpAndSettle();
}

Future<void> tapOn<T extends Widget>(WidgetTester tester, Finder target) async {
  await scrollTo<T>(tester, target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> enterOn<T extends Widget>(WidgetTester tester, Finder target, String text) async {
  await scrollTo<T>(tester, target);
  await tester.enterText(target, text);
  await tester.pumpAndSettle();
}

void main() {
  test('API contract: claim fixtures parse', () {
    final submitted = Claim.fromJson(fixture('claim_submitted') as Json);
    expect(submitted.claimNumber, matches(RegExp(r'^SBX-CLM-\d{2}-\d{6}$')));
    expect(submitted.status, 'SUBMITTED');
    expect(submitted.vehicleReference, '123456');
    expect(submitted.photoCount, 1);
    expect(submitted.estimate.estimateFils, 600000);
    expect(submitted.progress.map((s) => s.status), ['SUBMITTED', 'UNDER_ASSESSMENT', 'APPROVED', 'REPAIR_BOOKED', 'SETTLED']);
    expect(submitted.progress.first.done, isTrue);
    expect(submitted.replacementCar.offered, isTrue);
    expect(submitted.canBookGarage, isFalse);
    final approved = Claim.fromJson(fixture('claim_approved') as Json);
    expect(approved.canBookGarage, isTrue);
    expect(approved.approvedAmountFils, 600000);
    expect(approved.garageOptions.map((g) => g.id), contains('g-sitra-auto-works'));
    final booked = Claim.fromJson(fixture('claim_repair_booked') as Json);
    expect(booked.garage!.id, 'g-sitra-auto-works');
    expect(booked.nextStatuses, ['SETTLED']);
    expect((fixture('me_claims')['items'] as List), hasLength(1));
    final rules = ClientConfig.fromJson(fixture('config') as Json).claims;
    expect(rules.types, ['collision', 'theft', 'glass', 'fire', 'other']);
    expect(rules.policeReportRequiredFor, ['theft']);
    expect(rules.maxPhotos, 6);
    // Requests carry an instant and base64 photos.
    final draft = ClaimDraft(
      policyId: 'pol_1',
      incidentAt: DateTime.utc(2026, 10, 3, 10, 30),
      location: 'Seef',
      type: 'collision',
      severity: 'minor',
      description: 'Scratched in a car park',
      thirdPartyInvolved: false,
      photos: [ClaimPhotoUpload(Uint8List.fromList(_png), mimeType: 'image/png')],
    ).toJson();
    expect(draft['incidentAt'], '2026-10-03T10:30:00.000Z');
    expect((draft['photos'] as List).single, {'dataBase64': base64Encode(_png), 'mimeType': 'image/png'});
    expect(draft.containsKey('policeReportNumber'), isFalse);
  });

  testWidgets('without motor cover the claim form offers to get cover', (tester) async {
    await pumpApp(tester, location: '/claims/new?plate=123456', motorCover: false);
    expect(find.byKey(const Key('claim-no-policy')), findsOneWidget);
    expect(find.text('Get motor cover'), findsOneWidget);
  });

  testWidgets('"I had an accident" from My Garage: file a claim with a photo, then see it', (tester) async {
    final (repo, picker) = await pumpApp(tester, location: '/account');
    await tapOn<AccountScreen>(tester, find.byKey(const Key('garage-accident-123456')));
    expect(find.byType(ClaimFormScreen), findsOneWidget);
    expect(find.text('Report an accident'), findsOneWidget);

    await enterOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-location')), 'Sheikh Khalifa Highway');
    await enterOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-description')), 'Rear-ended at a traffic light.');
    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-third-party')));

    // No photo yet: the API's error is shown.
    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-submit')));
    expect(find.text('Add at least one photo of the damage.'), findsOneWidget);

    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-photos-gallery')));
    expect(picker.requests.single, (camera: false, maxDimensionPx: 1600, limit: 6));
    expect(find.text('1 of 6 photos'), findsOneWidget);
    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-submit')));

    final (body, key) = repo.filedClaims.last;
    final policy = (fixture('me_policies_motor')['items'] as List).first as Json;
    expect(body['policyId'], policy['id']);
    expect(body['type'], 'collision');
    expect(body['severity'], 'moderate');
    expect(body['thirdPartyInvolved'], isTrue);
    expect(body['location'], 'Sheikh Khalifa Highway');
    expect((body['photos'] as List).single['dataBase64'], base64Encode(_png));
    expect(DateTime.parse(body['incidentAt'] as String).isUtc, isTrue);
    expect(key, repo.filedClaims.first.$2, reason: 'one idempotency key per form');

    expect(find.byType(ClaimDetailScreen), findsOneWidget);
    final submitted = Claim.fromJson(fixture('claim_submitted') as Json);
    expect(find.text('Claim ${submitted.claimNumber}'), findsOneWidget);
    expect(find.byKey(const Key('claim-status-SUBMITTED')), findsOneWidget);
    expect(find.text('BHD 480.000 to BHD 720.000'), findsOneWidget);
    expect(find.textContaining('not an AI estimate'), findsOneWidget);
    expect(find.byKey(const Key('replacement-car')), findsOneWidget);
  });

  testWidgets('theft needs a police report number (API error shown)', (tester) async {
    final (repo, _) = await pumpApp(tester, location: '/claims/new?plate=123456');
    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-type-theft')));
    expect(find.text('Police report number (required for theft)'), findsOneWidget);
    await enterOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-location')), 'Seef Mall car park');
    await enterOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-description')), 'The car was taken overnight.');
    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-submit')));
    expect(find.text('Enter a valid police report number.'), findsOneWidget);
    await enterOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-police-report')), ' PR-2026-0042 ');
    await tapOn<ClaimFormScreen>(tester, find.byKey(const Key('claim-submit')));
    expect(repo.filedClaims.last.$1['policeReportNumber'], 'PR-2026-0042');
    expect(find.byType(ClaimDetailScreen), findsOneWidget);
  });

  testWidgets('claim detail: sandbox assessment, then book a garage', (tester) async {
    final submitted = Claim.fromJson(fixture('claim_submitted') as Json);
    final (repo, _) = await pumpApp(tester, location: '/claims/${submitted.id}');
    expect(find.text('You can choose a garage once the claim is approved.'), findsOneWidget);
    await scrollTo<ClaimDetailScreen>(tester, find.byKey(const Key('claim-step-SUBMITTED')));
    await scrollTo<ClaimDetailScreen>(tester, find.byKey(const Key('claim-step-SETTLED')));
    await tapOn<ClaimDetailScreen>(tester, find.byKey(const Key('advance')));
    expect(repo.advances.single, (submitted.id, 'UNDER_ASSESSMENT'));
    await scrollTo<ClaimDetailScreen>(tester, find.byKey(const Key('claim-status-APPROVED')), up: true);
    expect(find.text('Approved amount: BHD 600.000'), findsOneWidget);
    await tapOn<ClaimDetailScreen>(tester, find.byKey(const Key('book-g-sitra-auto-works')));
    expect(repo.garageBookings.single, (submitted.id, 'g-sitra-auto-works'));
    await scrollTo<ClaimDetailScreen>(tester, find.byKey(const Key('garage-booked')));
    expect(find.text('✓ Repair booked at Sitra Auto Works (demo)'), findsOneWidget);
    await scrollTo<ClaimDetailScreen>(tester, find.byKey(const Key('claim-status-REPAIR_BOOKED')), up: true);
  });

  testWidgets('account: My claims and "I had an accident" on the active motor policy', (tester) async {
    await pumpApp(tester, location: '/account');
    final policy = (fixture('me_policies_motor')['items'] as List).first as Json;
    await scrollTo<AccountScreen>(tester, find.byKey(Key('policy-accident-${policy['policyNumber']}')));
    final claim = Claim.fromJson((fixture('me_claims')['items'] as List).first as Json);
    await tapOn<AccountScreen>(tester, find.byKey(Key('claim-${claim.claimNumber}')));
    expect(find.byType(ClaimDetailScreen), findsOneWidget);
  });

  testWidgets('Arabic claim form is right-to-left', (tester) async {
    await pumpApp(tester, location: '/claims/new');
    await tester.tap(find.byKey(const Key('language-switch')));
    await tester.pumpAndSettle();
    expect(find.text('الإبلاغ عن حادث'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(ClaimFormScreen))), TextDirection.rtl);
  });
}
