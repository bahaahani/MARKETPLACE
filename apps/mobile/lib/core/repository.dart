import 'api/api_client.dart';
import 'models.dart';
import 'models/bundles.dart';
import 'models/config.dart';
import 'models/insurance.dart';
import '../features/assistant/assistant_models.dart';

/// Everything the app needs from the backend. The API implementation calls the same
/// endpoints as the Next.js web app, so both channels show identical data and pricing.
abstract interface class SahelRepository {
  Future<List<Vehicle>> vehicles({String? query, String? condition, int? maxMonthlyFils});
  Future<Vehicle> vehicle(String id);
  Future<List<Property>> properties({String? purpose});
  Future<Property> property(String id);
  Future<List<CardProduct>> cards();
  /// Without downPaymentFils / tenureMonths the API quotes its listing defaults (see FinanceLimits).
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    int? downPaymentFils,
    int? tenureMonths,
  });
  Future<List<MotorQuote>> motorQuotes({required int vehicleValueFils, required bool comprehensive, required bool takafulOnly});
  Future<CustomerOverview> me();
  Future<PreApprovalShare> sharePreApproval();
  Future<Payment> pay({
    required int amountFils,
    required PaymentMethod method,
    required String purpose,
    required String reference,
    required String idempotencyKey,
  });

  /// ⚠️ Sandbox eKey login: returns a fictional verified identity for a 9-digit CPR.
  Future<EKeyIdentity> ekeyLogin(String cpr);

  /// Live pre-approval; throws ApiException(422, CONSENT_REQUIRED) without both consents.
  Future<OnboardingResult> preApproval({
    required int monthlySalaryFils,
    required int existingObligationsFils,
    required String employer,
    required List<String> consentScopes,
  });

  /// ⚠️ Sandbox instant card decision; approved applications carry a masked virtual card.
  Future<CardApplication> applyForCard(String cardId);

  /// Virtual cards issued in this sandbox session.
  Future<List<VirtualCard>> myCards();

  /// Apply for vehicle finance (vehicleId + downPaymentFils) or personal finance (amountFils).
  /// The API decides immediately.
  Future<FinanceApplication> applyForFinance({
    required String productLine,
    required FinanceStructure structure,
    required int tenureMonths,
    String? vehicleId,
    int? downPaymentFils,
    int? amountFils,
    required String idempotencyKey,
  });
  Future<FinanceApplication> application(String id);
  Future<List<FinanceApplication>> applications();

  /// Accept the offer and e-sign (sandbox).
  Future<FinanceApplication> acceptApplication(String id);

  /// Life-Event Engine: curated events, and a priced bundle checked against the DBR headroom.
  Future<List<LifeEvent>> lifeEvents();
  Future<LifeEventBundle> lifeEventBundle(String id, BundleStructure structure);

  /// Early-settlement quote for one of the customer's contracts.
  Future<SettlementQuote> settlementQuote(String contractId);

  /// Turn autopay on or off (sandbox).
  Future<Contract> setAutopay(String contractId, bool autopay);

  /// Travel insurance comparison, cheapest first. Invalid dates or travellers throw ApiException(422).
  Future<List<TravelQuote>> travelQuotes({
    required String region,
    required String tier,
    required String startDate,
    required String endDate,
    required int adults,
    required int children,
    required bool takafulOnly,
  });

  /// Home insurance comparison. With only [propertyId], the API suggests the sums insured from the listing.
  Future<HomeQuotes> homeQuotes({
    String? propertyType,
    int? buildingSumInsuredFils,
    int? contentsSumInsuredFils,
    String? propertyId,
    required bool takafulOnly,
  });

  /// Hold a server-priced quote from one insurer before checkout ([input] is the line's quote request).
  Future<PolicyQuote> holdPolicyQuote({required String line, required String insurerId, required Json input});

  /// Issue the policy for a captured premium payment.
  Future<Policy> confirmPolicy({required String paymentId, required String quoteId});

  /// The customer's insurance policies, active first.
  Future<List<Policy>> myPolicies();

  /// Product rules (consent period, calculator ranges and steps, personal finance range) from GET /config.
  Future<ClientConfig> config();

  /// Suhail & Suhaila: one message; the reply's suggested actions are links the customer confirms (⚠️ sandbox).
  Future<AssistantReply> sendAssistantMessage({required String text, required String locale, required AssistantPersona persona});
}

class ApiSahelRepository implements SahelRepository {
  ApiSahelRepository(this._api);
  final ApiClient _api;

  List<dynamic> _items(dynamic data) => (data as Map<String, dynamic>)['items'] as List<dynamic>;

  @override
  Future<List<Vehicle>> vehicles({String? query, String? condition, int? maxMonthlyFils}) async {
    final data = await _api.get('/vehicles', query: {'q': query, 'condition': condition, 'maxMonthlyFils': maxMonthlyFils?.toString()});
    return [for (final j in _items(data)) Vehicle.fromJson(j as Json)];
  }

  @override
  Future<Vehicle> vehicle(String id) async => Vehicle.fromJson(await _api.get('/vehicles/$id') as Json);

  @override
  Future<List<Property>> properties({String? purpose}) async {
    final data = await _api.get('/properties', query: {'purpose': purpose});
    return [for (final j in _items(data)) Property.fromJson(j as Json)];
  }

  @override
  Future<Property> property(String id) async => Property.fromJson(await _api.get('/properties/$id') as Json);

  @override
  Future<List<CardProduct>> cards() async => [for (final j in _items(await _api.get('/cards'))) CardProduct.fromJson(j as Json)];

  @override
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    int? downPaymentFils,
    int? tenureMonths,
  }) async =>
      FinanceComparison.fromJson(await _api.post('/quotes/finance', {
        'productLine': productLine,
        'assetPriceFils': assetPriceFils,
        'downPaymentFils': ?downPaymentFils,
        'tenureMonths': ?tenureMonths,
      }) as Json);

  @override
  Future<List<MotorQuote>> motorQuotes({required int vehicleValueFils, required bool comprehensive, required bool takafulOnly}) async {
    final data = await _api.post('/insurance/motor-quotes', {
      'vehicleValueFils': vehicleValueFils,
      'cover': comprehensive ? 'comprehensive' : 'third-party',
      'takafulOnly': takafulOnly,
    }) as Json;
    return [for (final q in data['quotes'] as List) MotorQuote.fromJson(q as Json)];
  }

  @override
  Future<CustomerOverview> me() async => CustomerOverview.fromJson(await _api.get('/me') as Json);

  @override
  Future<PreApprovalShare> sharePreApproval() async =>
      PreApprovalShare.fromJson(await _api.post('/me/preapproval-token', const {}) as Json);

  @override
  Future<Payment> pay({
    required int amountFils,
    required PaymentMethod method,
    required String purpose,
    required String reference,
    required String idempotencyKey,
  }) async {
    // Sandbox flow. Production: the Tap SDK (BenefitPay / Apple Pay / card) completes the customer
    // step, and the backend confirms via the verified Tap webhook.
    final created = Payment.fromJson(await _api.post(
      '/payments',
      {'amountFils': amountFils, 'method': method.wire, 'purpose': purpose, 'reference': reference},
      headers: {'Idempotency-Key': idempotencyKey},
    ) as Json);
    return Payment.fromJson(await _api.post('/payments/${created.id}/confirm', const {}) as Json);
  }

  @override
  Future<EKeyIdentity> ekeyLogin(String cpr) async =>
      EKeyIdentity.fromJson(await _api.post('/onboarding/ekey', {'cpr': cpr}) as Json);

  @override
  Future<OnboardingResult> preApproval({
    required int monthlySalaryFils,
    required int existingObligationsFils,
    required String employer,
    required List<String> consentScopes,
  }) async =>
      OnboardingResult.fromJson(await _api.post('/onboarding/pre-approval', {
        'monthlySalaryFils': monthlySalaryFils,
        'existingObligationsFils': existingObligationsFils,
        'employer': employer,
        'consentScopes': consentScopes,
      }) as Json);

  @override
  Future<CardApplication> applyForCard(String cardId) async =>
      CardApplication.fromJson(await _api.post('/cards/${Uri.encodeComponent(cardId)}/apply', const {}) as Json);

  @override
  Future<List<VirtualCard>> myCards() async => [for (final j in _items(await _api.get('/me/cards'))) VirtualCard.fromJson(j as Json)];

  @override
  Future<FinanceApplication> applyForFinance({
    required String productLine,
    required FinanceStructure structure,
    required int tenureMonths,
    String? vehicleId,
    int? downPaymentFils,
    int? amountFils,
    required String idempotencyKey,
  }) async =>
      FinanceApplication.fromJson(await _api.post(
        '/applications',
        {
          'productLine': productLine,
          'structure': structure.name,
          'tenureMonths': tenureMonths,
          'vehicleId': ?vehicleId,
          'downPaymentFils': ?downPaymentFils,
          'amountFils': ?amountFils,
        },
        headers: {'Idempotency-Key': idempotencyKey},
      ) as Json);

  @override
  Future<FinanceApplication> application(String id) async => FinanceApplication.fromJson(await _api.get('/applications/$id') as Json);

  @override
  Future<List<FinanceApplication>> applications() async =>
      [for (final j in _items(await _api.get('/applications'))) FinanceApplication.fromJson(j as Json)];

  @override
  Future<FinanceApplication> acceptApplication(String id) async =>
      FinanceApplication.fromJson(await _api.post('/applications/$id/accept', const {}) as Json);

  @override
  Future<List<LifeEvent>> lifeEvents() async => [for (final j in _items(await _api.get('/life-events'))) LifeEvent.fromJson(j as Json)];

  @override
  Future<LifeEventBundle> lifeEventBundle(String id, BundleStructure structure) async => LifeEventBundle.fromJson(
      await _api.get('/life-events/${Uri.encodeComponent(id)}/bundle', query: {'structure': structure.name}) as Json);

  @override
  Future<SettlementQuote> settlementQuote(String contractId) async =>
      SettlementQuote.fromJson(await _api.get('/me/contracts/${Uri.encodeComponent(contractId)}/settlement-quote') as Json);

  @override
  Future<Contract> setAutopay(String contractId, bool autopay) async =>
      Contract.fromJson(await _api.patch('/me/contracts/${Uri.encodeComponent(contractId)}', {'autopay': autopay}) as Json);

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
    final data = await _api.post('/insurance/travel-quotes', {
      'region': region,
      'tier': tier,
      'startDate': startDate,
      'endDate': endDate,
      'adults': adults,
      'children': children,
      'takafulOnly': takafulOnly,
    }) as Json;
    return [for (final q in data['quotes'] as List) TravelQuote.fromJson(q as Json)];
  }

  @override
  Future<HomeQuotes> homeQuotes({
    String? propertyType,
    int? buildingSumInsuredFils,
    int? contentsSumInsuredFils,
    String? propertyId,
    required bool takafulOnly,
  }) async =>
      HomeQuotes.fromJson(await _api.post('/insurance/home-quotes', {
        'propertyType': ?propertyType,
        'buildingSumInsuredFils': ?buildingSumInsuredFils,
        'contentsSumInsuredFils': ?contentsSumInsuredFils,
        'propertyId': ?propertyId,
        'takafulOnly': takafulOnly,
      }) as Json);

  @override
  Future<PolicyQuote> holdPolicyQuote({required String line, required String insurerId, required Json input}) async =>
      PolicyQuote.fromJson(await _api.post('/policies/quotes', {'line': line, 'insurerId': insurerId, 'input': input}) as Json);

  @override
  Future<Policy> confirmPolicy({required String paymentId, required String quoteId}) async =>
      Policy.fromJson(await _api.post('/policies/confirm', {'paymentId': paymentId, 'quoteId': quoteId}) as Json);

  @override
  Future<List<Policy>> myPolicies() async => [for (final j in _items(await _api.get('/me/policies'))) Policy.fromJson(j as Json)];

  @override
  Future<ClientConfig> config() async => ClientConfig.fromJson(await _api.get('/config') as Json);

  @override
  Future<AssistantReply> sendAssistantMessage({required String text, required String locale, required AssistantPersona persona}) async =>
      AssistantReply.fromJson(await _api.post('/assistant/messages', {'text': text, 'locale': locale, 'persona': persona.wire}) as Json);
}
