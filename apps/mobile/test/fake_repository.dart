import 'dart:convert';
import 'dart:io';

import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/bundles.dart';
import 'package:sahel/core/models/config.dart';
import 'package:sahel/core/models/insurance.dart';
import 'package:sahel/core/models/payment_price.dart';

import 'package:sahel/core/models/tradein.dart';
import 'package:sahel/core/repository.dart';
import 'package:sahel/features/assistant/assistant_models.dart';
import 'package:sahel/features/claims/claims_models.dart';
import 'package:sahel/features/rewards/rewards_models.dart';

import 'package:sahel/features/notifications/notifications_models.dart';

/// Recorded responses from the real shared API (apps/web/app/api/v1), refreshed by
/// re-running the curl commands in test/fixtures/README.md.
dynamic fixture(String name) => (jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>)['data'];

class FakeSahelRepository implements SahelRepository {
  final payments = <String, int>{};

  /// Contracts closed by an early-settlement payment.
  final settled = <String>{};
  int shares = 0;

  /// Every application request, as sent (idempotency key included).
  final applied = <Map<String, Object?>>[];
  final accepted = <String>{};

  static FinanceApplication _app(String name) => FinanceApplication.fromJson(fixture(name) as Json);
  static final _byId = {
    for (final n in [
      'application_crv',
      'application_declined',
      'application_personal',
      'application_reviewed',
      'application_home_ijara',
      'application_home_conventional',
    ])
      _app(n).id: n,
  };

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
  Future<List<CardProduct>> cards() async =>
      [for (final j in fixture(onboarded ? 'cards_onboarded' : 'cards')['items'] as List) CardProduct.fromJson(j as Json)];

  @override
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    int? downPaymentFils,
    int? tenureMonths,
  }) async =>
      FinanceComparison.fromJson(fixture(switch (productLine) { 'personal' => 'quotes_personal', 'home' => 'quotes_home', _ => 'quotes_crv' }) as Json);

  @override
  Future<List<MotorQuote>> motorQuotes({required int vehicleValueFils, required bool comprehensive, required bool takafulOnly}) async => [
        for (final j in fixture('motor_quotes')['quotes'] as List)
          if (!takafulOnly || (j as Json)['takaful'] == true) MotorQuote.fromJson(j as Json),
      ];

  @override
  Future<CustomerOverview> me() async {
    final j = fixture(onboarded ? 'me_onboarded' : 'me') as Json;
    // Apply sandbox autopay changes and early settlements, like the API does (settled contract recorded from the API).
    final settledContracts = {for (final c in fixture('me_settled')['contracts'] as List) (c as Json)['id']: c};
    j['contracts'] = [
      for (final c in j['contracts'] as List)
        if (settled.contains(c['id']))
          settledContracts[c['id']]
        else
          {...c as Json, if (autopay.containsKey(c['id'])) 'autopay': autopay[c['id']]},
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
    if (purpose == 'early_settlement') {
      // Mirrors the API: only the quoted amount settles (422 AMOUNT_MISMATCH, nothing captured, otherwise).
      final contractId = reference.replaceFirst(RegExp(r'-settle$'), '');
      final quote = await settlementQuote(contractId);
      if (amountFils != quote.settlementAmountFils) throw ApiException(422, 'AMOUNT_MISMATCH', 'amount does not match the settlement quote');
      settled.add(contractId);
    }
    if (purpose == 'reservation_deposit' || purpose == 'valuation_fee') {
      // Mirrors the API's server-side amount binding (422 AMOUNT_MISMATCH, nothing created).
      final price = await paymentPrice(purpose: purpose, reference: reference);
      if (amountFils != price.amountFils) throw ApiException(422, 'AMOUNT_MISMATCH', 'amount does not match the server price');
      if (purpose == 'valuation_fee') valuationsPaid.add(reference);
    }
    payments[idempotencyKey] = amountFils;
    return Payment(id: 'pay_test_${payments.length}', status: 'CAPTURED', amountFils: amountFils);
  }

  /// Set once onboarding succeeded (the API then keeps the customer's own financials in the session).
  bool onboarded = false;

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
    // Like the API's sandbox session: from now on /me and /cards are this customer's (recorded after onboarding).
    onboarded = true;
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
    String? propertyId,
    int? downPaymentFils,
    int? amountFils,
    required String idempotencyKey,
  }) async {
    applied.add({
      'productLine': productLine,
      'structure': structure.name,
      'tenureMonths': tenureMonths,
      'vehicleId': vehicleId,
      'propertyId': propertyId,
      'downPaymentFils': downPaymentFils,
      'amountFils': amountFils,
      'idempotencyKey': idempotencyKey,
    });
    if (productLine == 'personal') return _app('application_personal');
    // Recorded for p-amwaj-apt-2br with an onboarded customer (BHD 5,000 salary).
    if (productLine == 'home') return _app(structure == FinanceStructure.ijara ? 'application_home_ijara' : 'application_home_conventional');
    return _app(vehicleId == 'v-cadillac-escalade-2026' ? 'application_declined' : 'application_crv');
  }

  @override
  Future<FinanceApplication> application(String id) async {
    final name = _byId[id];
    if (accepted.contains(id)) return _acceptedApp(id, name);
    if (name == null) throw StateError('no fixture for application $id');
    return _app(name);
  }

  @override
  Future<List<FinanceApplication>> applications() async =>
      [for (final j in fixture('applications')['items'] as List) FinanceApplication.fromJson(j as Json)];

  @override
  Future<FinanceApplication> acceptApplication(String id) async {
    // Recorded "accepted" responses: the CR-V Murabaha (automatic or credit officer approval) and the two home
    // finance applications.
    final name = _byId[id];
    if (!const ['application_crv', 'application_reviewed', 'application_home_ijara', 'application_home_conventional'].contains(name)) {
      throw StateError('no accepted fixture for $id');
    }
    accepted.add(id);
    // Like the API: accepting (again) after the valuation fee is captured runs conventional home finance to the end.
    if (name == 'application_home_conventional' && valuationsPaid.contains('p-amwaj-apt-2br')) completedHome.add(id);
    return _acceptedApp(id, name);
  }

  /// Conventional home finance applications accepted again after their valuation fee was paid.
  final completedHome = <String>{};

  /// Like the API: Ijara stops at LEASE_STARTED; conventional home finance waits at CONTRACT_SIGNED (nextAction with
  /// feePaid once the fee is captured) until it is accepted again with the fee paid, then it is COMPLETED.
  FinanceApplication _acceptedApp(String id, String? name) => switch (name) {
        'application_home_ijara' => _app('application_home_ijara_accepted'),
        'application_home_conventional' => completedHome.contains(id) ? _app('application_home_conventional_completed') : _signedHome(),
        'application_reviewed' => _app('application_reviewed_accepted'),
        _ => _app('application_crv_accepted'),
      };

  FinanceApplication _signedHome() {
    final j = Map<String, dynamic>.from(fixture('application_home_conventional_signed') as Json);
    j['nextAction'] = {...j['nextAction'] as Json, 'feePaid': valuationsPaid.contains('p-amwaj-apt-2br')};
    return FinanceApplication.fromJson(j);
  }

  /// Properties whose valuation fee was paid (server amount).
  final valuationsPaid = <String>{};

  /// Every server price requested, as "purpose:reference".
  final priceRequests = <String>[];

  @override
  Future<PaymentPrice> paymentPrice({required String purpose, required String reference}) async {
    priceRequests.add('$purpose:$reference');
    // Recorded: valuation fee (p-amwaj-apt-2br) and reservation deposit (v-honda-crv-2026); same amount for any listing.
    final name = switch (purpose) {
      'valuation_fee' => 'payment_price_valuation',
      'reservation_deposit' => 'payment_price_deposit',
      _ => throw ApiException(422, 'NOT_SERVER_PRICED', 'not server priced'),
    };
    return PaymentPrice.fromJson({...fixture(name) as Json, 'reference': reference});
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
  Future<List<Policy>> myPolicies() async =>
      [for (final j in fixture(motorCover ? 'me_policies_motor' : 'me_policies')['items'] as List) Policy.fromJson(j as Json)];

  // ---- Config

  @override
  Future<ClientConfig> config() async => ClientConfig.fromJson(fixture(onboarded ? 'config_onboarded' : 'config') as Json);

  /// Assistant messages sent, as (text, locale, persona).
  final assistantMessages = <(String, String, AssistantPersona)>[];

  /// Recorded replies (test/fixtures/README.md), picked by what the message is about.
  @override
  Future<AssistantReply> sendAssistantMessage({required String text, required String locale, required AssistantPersona persona}) async {
    assistantMessages.add((text, locale, persona));
    final name = RegExp(r'[\u0600-\u06FF]').hasMatch(text)
        ? 'assistant_cars_ar'
        : text.toLowerCase().contains('next installment')
            ? 'assistant_next_en'
            : text.toLowerCase().contains('pay it all')
                ? 'assistant_settle_en'
                : 'assistant_balance_en';
    return AssistantReply.fromJson(fixture(name) as Json);
  }

  // ---- Trade-in (recorded: test/fixtures/README.md)

  /// Valuation requests, as sent.
  final tradeInRequests = <Json>[];

  /// Whether the session has an active offer (the recorded My Garage CR-V valuation).
  bool tradeInActive = false;

  @override
  Future<TradeInOffer> valueTradeIn(Json request) async {
    tradeInRequests.add(request);
    // An unknown model, as the API answers it (422 with suggestions).
    if (request['model'] == 'Camri') {
      final err = (jsonDecode(File('test/fixtures/tradein_unknown_model.json').readAsStringSync()) as Json)['error'] as Json;
      throw ApiException(422, err['code'] as String, err['message'] as String, suggestions: [for (final x in err['suggestions'] as List) x as String]);
    }
    tradeInActive = true;
    return TradeInOffer.fromJson(fixture('tradein_offer') as Json);
  }

  @override
  Future<TradeInStatus> myTradeIn({String? vehicleId}) async {
    final j = fixture(tradeInActive ? 'tradein_active_crv' : 'tradein_none') as Json;
    return TradeInStatus.fromJson(vehicleId == null ? {'offer': j['offer']} : j);
  }

  @override
  Future<bool> withdrawTradeIn() async {
    final had = tradeInActive;
    tradeInActive = false;
    return had;
  }

  // ---- Motor claims (recorded in test/fixtures/README.md: buy motor cover, file, assess, book a garage)

  /// When true, My policies is the recording with an active motor policy (#123456).
  bool motorCover = false;

  /// Every claim filed (request body and idempotency key), garage booked and sandbox advance, as sent.
  final filedClaims = <(Json, String)>[];
  final garageBookings = <(String, String)>[];
  final advances = <(String, String?)>[];

  /// Recorded state of the claim: claim_submitted, claim_approved or claim_repair_booked.
  String claimState = 'claim_submitted';

  Claim _claim() => Claim.fromJson(fixture(claimState) as Json);

  @override
  Future<Claim> fileClaim(ClaimDraft draft, {required String idempotencyKey}) async {
    final body = draft.toJson();
    filedClaims.add((body, idempotencyKey));
    // Mirrors two of the API's 422s (packages/domain/src/claims.ts).
    if (draft.type != 'theft' && draft.photos.isEmpty) throw ApiException(422, 'PHOTOS_REQUIRED', 'add at least 1 photo of the damage');
    if (draft.type == 'theft' && draft.policeReportNumber == null) throw ApiException(422, 'POLICE_REPORT_REQUIRED', 'police report required');
    claimState = 'claim_submitted';
    return _claim();
  }

  @override
  Future<List<Claim>> myClaims() async =>
      filedClaims.isEmpty && !motorCover ? const [] : [for (final j in fixture('me_claims')['items'] as List) Claim.fromJson(j as Json)];

  @override
  Future<Claim> claim(String id) async {
    final c = _claim();
    if (c.id != id) throw ApiException(404, 'CLAIM_NOT_FOUND', 'claim not found');
    return c;
  }

  @override
  Future<Claim> bookClaimGarage(String claimId, String garageId) async {
    garageBookings.add((claimId, garageId));
    if (claimState != 'claim_approved') throw ApiException(409, 'INVALID_TRANSITION', 'not approved');
    claimState = 'claim_repair_booked';
    return _claim();
  }

  @override
  Future<Claim> advanceClaim(String claimId, {String? to}) async {
    advances.add((claimId, to));
    // Only the approval was recorded; the assessment step in between is skipped here.
    claimState = 'claim_approved';
    return _claim();
  }

  // ---- IMTIAZ points (recorded in test/fixtures/README.md: opening ledger, pay an installment on time, redeem)

  /// Recorded ledger: rewards (fresh session), rewards_paid (after an on-time installment) or rewards_redeemed.
  String rewardsState = 'rewards';

  /// Every redemption request (item, idempotency key), as sent.
  final redeemed = <(String, String)>[];

  /// Answers redemptions like the API does without enough points (422 INSUFFICIENT_POINTS).
  bool rewardsInsufficient = false;

  /// Catalogue items whose `affordable` is forced to false (as the API reports for a low balance).
  final Set<String> unaffordable = {};

  @override
  Future<RewardsSummary> myRewards() async => RewardsSummary.fromJson(fixture(rewardsState) as Json);

  @override
  Future<RewardsCatalogue> rewardsCatalogue() async {
    final j = Map<String, dynamic>.of(fixture('rewards_catalogue') as Json);
    j['items'] = [
      for (final i in j['items'] as List) {...i as Json, if (unaffordable.contains(i['id'])) 'affordable': false},
    ];
    return RewardsCatalogue.fromJson(j);
  }

  @override
  Future<RedemptionResult> redeemReward(String itemId, {required String idempotencyKey}) async {
    redeemed.add((itemId, idempotencyKey));
    if (rewardsInsufficient) throw ApiException(422, 'INSUFFICIENT_POINTS', 'not enough points');
    rewardsState = 'rewards_redeemed';
    return RedemptionResult.fromJson(fixture('rewards_redemption') as Json);
  }

  @override
  Future<List<RewardRedemption>> myRedemptions() async => rewardsState == 'rewards_redeemed'
      ? [for (final j in fixture('rewards_redemptions')['items'] as List) RewardRedemption.fromJson(j as Json)]
      : const [];

  // ---- Notifications (recorded in test/fixtures/README.md: an approved car application on top of the demo reminders)

  /// Recorded inbox state: notifications, notifications_read, notifications_dismissed or notifications_read_all.
  String inboxState = 'notifications';

  /// Every read / dismiss / read-all and preferences save, as sent.
  final notificationCalls = <String>[];
  final savedPreferences = <Json>[];

  NotificationInbox _inbox() => NotificationInbox.fromJson(fixture(inboxState) as Json);

  @override
  Future<NotificationInbox> notifications() async => _inbox();

  @override
  Future<NotificationInbox> markNotificationRead(String id) async {
    notificationCalls.add('read:$id');
    if (!_inbox().items.any((n) => n.id == id)) throw ApiException(404, 'NOTIFICATION_NOT_FOUND', 'no notification');
    // Only the application notification's read was recorded; reading another one answers like read-all.
    inboxState = id.startsWith('application_update.') && inboxState == 'notifications' ? 'notifications_read' : 'notifications_read_all';
    return _inbox();
  }

  @override
  Future<NotificationInbox> markAllNotificationsRead() async {
    notificationCalls.add('read-all');
    inboxState = 'notifications_read_all';
    return _inbox();
  }

  @override
  Future<NotificationInbox> dismissNotification(String id) async {
    notificationCalls.add('dismiss:$id');
    inboxState = 'notifications_dismissed';
    return _inbox();
  }

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      NotificationPreferences.fromJson(fixture(savedPreferences.isEmpty ? 'notification_preferences' : 'notification_preferences_saved') as Json);

  @override
  Future<NotificationPreferences> saveNotificationPreferences(NotificationPreferences prefs) async {
    final body = prefs.toJson();
    savedPreferences.add(body);
    // Mirrors the API's 422 for a mandatory category with every channel off (packages/domain/src/notifications.ts).
    if (prefs.categories.any((c) => c.mandatory && !c.channels.values.any((on) => on))) {
      final err = (jsonDecode(File('test/fixtures/notification_preferences_mandatory.json').readAsStringSync()) as Json)['error'] as Json;
      throw ApiException(422, err['code'] as String, err['message'] as String);
    }
    return NotificationPreferences.fromJson(fixture('notification_preferences_saved') as Json);
  }
}
