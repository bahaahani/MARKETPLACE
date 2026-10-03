import 'api/api_client.dart';
import 'models.dart';

/// Everything the app needs from the backend. The API implementation calls the same
/// endpoints as the Next.js web app, so both channels show identical data and pricing.
abstract interface class SahelRepository {
  Future<List<Vehicle>> vehicles({String? query, String? condition, int? maxMonthlyFils});
  Future<Vehicle> vehicle(String id);
  Future<List<Property>> properties({String? purpose});
  Future<Property> property(String id);
  Future<List<CardProduct>> cards();
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    required int downPaymentFils,
    required int tenureMonths,
  });
  Future<List<MotorQuote>> motorQuotes({required int vehicleValueFils, required bool comprehensive, required bool takafulOnly});
  Future<CustomerOverview> me();
  Future<Payment> pay({
    required int amountFils,
    required PaymentMethod method,
    required String purpose,
    required String reference,
    required String idempotencyKey,
  });
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
    required int downPaymentFils,
    required int tenureMonths,
  }) async =>
      FinanceComparison.fromJson(await _api.post('/quotes/finance', {
        'productLine': productLine,
        'assetPriceFils': assetPriceFils,
        'downPaymentFils': downPaymentFils,
        'tenureMonths': tenureMonths,
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
}
