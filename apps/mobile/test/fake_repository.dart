import 'dart:convert';
import 'dart:io';

import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/repository.dart';

/// Recorded responses from the real shared API (apps/web/app/api/v1), refreshed by
/// re-running the curl commands in test/fixtures/README.md.
dynamic fixture(String name) => (jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>)['data'];

class FakeSahelRepository implements SahelRepository {
  final payments = <String, int>{};
  int shares = 0;

  @override
  Future<List<Vehicle>> vehicles({String? query, String? condition, int? maxMonthlyFils}) async {
    final all = [for (final j in fixture('vehicles')['items'] as List) Vehicle.fromJson(j as Json)];
    return all
        .where((v) => condition == null || v.condition == condition)
        .where((v) => maxMonthlyFils == null || v.fromMonthlyFils <= maxMonthlyFils)
        .where((v) => query == null || v.title.toLowerCase().contains(query.toLowerCase()))
        .toList();
  }

  @override
  Future<Vehicle> vehicle(String id) async => Vehicle.fromJson(fixture('vehicle_crv') as Json);

  @override
  Future<List<Property>> properties({String? purpose}) async => [
        for (final j in fixture('properties')['items'] as List)
          if (purpose == null || (j as Json)['purpose'] == purpose) Property.fromJson(j as Json),
      ];

  @override
  Future<Property> property(String id) async => (await properties()).firstWhere((p) => p.id == id);

  @override
  Future<List<CardProduct>> cards() async => [for (final j in fixture('cards')['items'] as List) CardProduct.fromJson(j as Json)];

  @override
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    required int downPaymentFils,
    required int tenureMonths,
  }) async =>
      FinanceComparison.fromJson(fixture('quotes_crv') as Json);

  @override
  Future<List<MotorQuote>> motorQuotes({required int vehicleValueFils, required bool comprehensive, required bool takafulOnly}) async => [
        for (final j in fixture('motor_quotes')['quotes'] as List)
          if (!takafulOnly || (j as Json)['takaful'] == true) MotorQuote.fromJson(j as Json),
      ];

  @override
  Future<CustomerOverview> me() async => CustomerOverview.fromJson(fixture('me') as Json);

  @override
  Future<PreApprovalShare> sharePreApproval() async {
    shares++;
    // Recorded shape, with a fresh expiry so the countdown is live.
    final recorded = PreApprovalShare.fromJson(fixture('preapproval_token') as Json);
    return PreApprovalShare(
      token: recorded.token,
      expiresAt: DateTime.now().add(Duration(seconds: recorded.ttlSeconds)),
      ttlSeconds: recorded.ttlSeconds,
    );
  }

  @override
  Future<Payment> pay({
    required int amountFils,
    required PaymentMethod method,
    required String purpose,
    required String reference,
    required String idempotencyKey,
  }) async {
    payments[idempotencyKey] = amountFils;
    return Payment(id: 'pay_test_${payments.length}', status: 'CAPTURED', amountFils: amountFils);
  }

  /// Last pre-approval request, so tests can check what the app sent to the API.
  Map<String, Object>? lastPreApproval;
  final cardApplications = <String>[];

  @override
  Future<EKeyIdentity> ekeyLogin(String cpr) async {
    // Mirrors the API's 422 for a malformed CPR.
    if (!RegExp(r'^\d{9}$').hasMatch(cpr)) throw ApiException(422, 'INVALID_CPR', 'CPR must be exactly 9 digits');
    return EKeyIdentity.fromJson(fixture('ekey') as Json);
  }

  @override
  Future<OnboardingResult> preApproval({
    required int monthlySalaryFils,
    required int existingObligationsFils,
    required String employer,
    required List<String> consentScopes,
  }) async {
    lastPreApproval = {
      'monthlySalaryFils': monthlySalaryFils,
      'existingObligationsFils': existingObligationsFils,
      'employer': employer,
      'consentScopes': consentScopes,
    };
    // Mirrors the API's 422 CONSENT_REQUIRED (recorded fixture is for both consents).
    if (!consentScopes.contains('CRB') || !consentScopes.contains('OPEN_BANKING')) {
      throw ApiException(422, 'CONSENT_REQUIRED', 'consent required');
    }
    return OnboardingResult.fromJson(fixture('onboarding_preapproval') as Json);
  }

  @override
  Future<CardApplication> applyForCard(String cardId) async {
    cardApplications.add(cardId);
    // Recorded: imtiaz-world (approved) and imtiaz-world-elite (declined, below minimum salary).
    return CardApplication.fromJson(fixture(cardId == 'imtiaz-world-elite' ? 'card_apply_declined' : 'card_apply') as Json);
  }

  @override
  Future<List<VirtualCard>> myCards() async => [for (final j in fixture('me_cards')['items'] as List) VirtualCard.fromJson(j as Json)];
}
