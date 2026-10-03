import 'dart:convert';
import 'dart:io';

import 'package:sahel/core/models.dart';
import 'package:sahel/core/repository.dart';

/// Recorded responses from the real shared API (apps/web/app/api/v1), refreshed by
/// re-running the curl commands in test/fixtures/README.md.
dynamic fixture(String name) => (jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>)['data'];

class FakeSahelRepository implements SahelRepository {
  final payments = <String, int>{};

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
  Future<CustomerOverview> me() async => CustomerOverview.fromJson(fixture('me') as Json);

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
}
