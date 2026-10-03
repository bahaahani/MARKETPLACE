import 'dart:convert';
import 'dart:io';

import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/bundles.dart';
import 'package:sahel/core/models/insurance.dart';
import 'package:sahel/core/repository.dart';

/// Recorded responses from the real shared API (apps/web/app/api/v1), refreshed by
/// re-running the curl commands in test/fixtures/README.md.
dynamic fixture(String name) => (jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>)['data'];

class FakeSahelRepository implements SahelRepository {
  final payments = <String, int>{};
  int shares = 0;

  /// Every application request, as sent (idempotency key included).
  final applied = <Map<String, Object?>>[];
  final accepted = <String>{};

  static FinanceApplication _app(String name) => FinanceApplication.fromJson(fixture(name) as Json);
  static final _byId = {for (final n in ['application_crv', 'application_declined', 'application_personal']) _app(n).id: n};

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
      FinanceComparison.fromJson(fixture(productLine == 'personal' ? 'quotes_personal' : 'quotes_crv') as Json);

  @override
  Future<List<MotorQuote>> motorQuotes({required int vehicleValueFils, required bool comprehensive, required bool takafulOnly}) async => [
        for (final j in fixture('motor_quotes')['quotes'] as List)
          if (!takafulOnly || (j as Json)['takaful'] == true) MotorQuote.fromJson(j as Json),
      ];

  @override
  Future<CustomerOverview> me() async {
    final j = fixture('me') as Json;
    // Apply sandbox autopay changes, like the API does.
    j['contracts'] = [
      for (final c in j['contracts'] as List) {...c as Json, if (autopay.containsKey(c['id'])) 'autopay': autopay[c['id']]},
    ];
    return CustomerOverview.fromJson(j);
  }

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

  @override
  Future<FinanceApplication> applyForFinance({
    required String productLine,
    required FinanceStructure structure,
    required int tenureMonths,
    String? vehicleId,
    int? downPaymentFils,
    int? amountFils,
    required String idempotencyKey,
  }) async {
    applied.add({
      'productLine': productLine,
      'structure': structure.name,
      'tenureMonths': tenureMonths,
      'vehicleId': vehicleId,
      'downPaymentFils': downPaymentFils,
      'amountFils': amountFils,
      'idempotencyKey': idempotencyKey,
    });
    if (productLine == 'personal') return _app('application_personal');
    return _app(vehicleId == 'v-cadillac-escalade-2026' ? 'application_declined' : 'application_crv');
  }

  @override
  Future<FinanceApplication> application(String id) async {
    if (accepted.contains(id)) return _app('application_crv_accepted');
    final name = _byId[id];
    if (name == null) throw StateError('no fixture for application $id');
    return _app(name);
  }

  @override
  Future<List<FinanceApplication>> applications() async =>
      [for (final j in fixture('applications')['items'] as List) FinanceApplication.fromJson(j as Json)];

  @override
  Future<FinanceApplication> acceptApplication(String id) async {
    // Only the CR-V Murabaha application has a recorded "accepted" response.
    if (_byId[id] != 'application_crv') throw StateError('no accepted fixture for $id');
    accepted.add(id);
    return _app('application_crv_accepted');
  }

  // --- Life events and early settlement / autopay ---

  final bundleRequests = <String>[];

  /// Autopay changes sent to the API, by contract id; applied to the next me() response.
  final autopay = <String, bool>{};

  @override
  Future<List<LifeEvent>> lifeEvents() async => [for (final j in fixture('life_events')['items'] as List) LifeEvent.fromJson(j as Json)];

  @override
  Future<LifeEventBundle> lifeEventBundle(String id, BundleStructure structure) async {
    bundleRequests.add('$id:${structure.name}');
    // Recorded: married (islamic, conventional) and new-baby (islamic).
    final name = 'bundle_${id.replaceAll('-', '_')}_${structure.name}';
    if (!File('test/fixtures/$name.json').existsSync()) throw StateError('no fixture $name');
    return LifeEventBundle.fromJson(fixture(name) as Json);
  }

  @override
  Future<SettlementQuote> settlementQuote(String contractId) async =>
      SettlementQuote.fromJson(fixture('settlement_${contractId.replaceAll('-', '')}') as Json);

  @override
  Future<Contract> setAutopay(String contractId, bool on) async {
    autopay[contractId] = on;
    final recorded = fixture('contract_autopay_on') as Json;
    return Contract.fromJson({...recorded, 'id': contractId, 'autopay': on});
  }

  // ---- Insurance (travel, home, policies)

  /// Every travel / home quote request and every held policy quote, as sent.
  final travelRequests = <Map<String, Object?>>[];
  final homeRequests = <Map<String, Object?>>[];
  final heldQuotes = <Map<String, Object?>>[];

  /// (paymentId, quoteId) of every policy confirmation.
  final confirmedPolicies = <(String, String)>[];

  @override
  Future<List<TravelQuote>> travelQuotes({
    required String region,
    required String tier,
    required String startDate,
    required String endDate,
    required int adults,
    required int children,
    required bool takafulOnly,
  }) async {
    travelRequests.add({'region': region, 'tier': tier, 'startDate': startDate, 'endDate': endDate, 'adults': adults, 'children': children});
    // Mirrors the API's 422 for traveller limits (recorded fixture: GCC, Basic, 1 adult, 7 days).
    if (adults < 1 || adults > 6) throw ApiException(422, 'INVALID_TRAVELLERS', 'adults must be between 1 and 6');
    return [
      for (final j in fixture('travel_quotes')['quotes'] as List)
        if (!takafulOnly || (j as Json)['takaful'] == true) TravelQuote.fromJson(j as Json),
    ];
  }

  @override
  Future<HomeQuotes> homeQuotes({
    String? propertyType,
    int? buildingSumInsuredFils,
    int? contentsSumInsuredFils,
    String? propertyId,
    required bool takafulOnly,
  }) async {
    homeRequests.add({
      'propertyType': propertyType,
      'buildingSumInsuredFils': buildingSumInsuredFils,
      'contentsSumInsuredFils': contentsSumInsuredFils,
      'propertyId': propertyId,
    });
    // Mirrors the API's 422 for a building sum below the minimum (recorded fixture: the Saar villa listing).
    if (buildingSumInsuredFils != null && buildingSumInsuredFils > 0 && buildingSumInsuredFils < 10000000) {
      throw ApiException(422, 'INVALID_SUM_INSURED', 'building sum out of range');
    }
    final recorded = fixture('home_quotes') as Json;
    return HomeQuotes.fromJson({
      'input': recorded['input'],
      'quotes': [
        for (final j in recorded['quotes'] as List)
          if (!takafulOnly || (j as Json)['takaful'] == true) j,
      ],
    });
  }

  @override
  Future<PolicyQuote> holdPolicyQuote({required String line, required String insurerId, required Json input}) async {
    heldQuotes.add({'line': line, 'insurerId': insurerId, 'input': input});
    return PolicyQuote.fromJson(fixture('policy_quote_travel') as Json);
  }

  @override
  Future<Policy> confirmPolicy({required String paymentId, required String quoteId}) async {
    confirmedPolicies.add((paymentId, quoteId));
    return Policy.fromJson(fixture('policy_travel') as Json);
  }

  @override
  Future<List<Policy>> myPolicies() async => [for (final j in fixture('me_policies')['items'] as List) Policy.fromJson(j as Json)];
}
