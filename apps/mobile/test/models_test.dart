import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';

import 'fake_repository.dart';

void main() {
  group('API contract', () {
    test('parses every recorded API response', () {
      expect((fixture('vehicles')['items'] as List).map((j) => Vehicle.fromJson(j as Json)), isNotEmpty);
      expect((fixture('properties')['items'] as List).map((j) => Property.fromJson(j as Json)), isNotEmpty);
      expect((fixture('cards')['items'] as List).map((j) => CardProduct.fromJson(j as Json)), isNotEmpty);
      final me = CustomerOverview.fromJson(fixture('me') as Json);
      expect(me.contracts, hasLength(2));
      expect(me.preApproval.limits.map((l) => l.productLine), ['vehicle', 'personal', 'home']);
      final share = PreApprovalShare.fromJson(fixture('preapproval_token') as Json);
      expect(share.token, matches(RegExp(r'^[0-9A-Z]{4}-[0-9A-Z]{4}$')));
      expect(share.ttlSeconds, 900);
    });

    test('finance comparison has conventional and murabaha for vehicles', () {
      final c = FinanceComparison.fromJson(fixture('quotes_crv') as Json);
      expect(c.quotes.map((q) => q.structure), [FinanceStructure.conventional, FinanceStructure.murabaha]);
      final m = c.quotes.last;
      expect(m.salePriceFils, m.financedFils + m.costOfFinanceFils);
      expect(m.rateBasis, 'flat');
    });
  });

  test('money formatting matches the web (formatBhd in @sahel/domain)', () {
    final cases = jsonDecode(File('test/fixtures/money.json').readAsStringSync()) as List;
    for (final c in cases.cast<Map<String, dynamic>>()) {
      expect(
        formatBhd(c['fils'] as int, c['locale'] as String, decimals: c['decimals'] as int),
        c['text'],
        reason: 'fils=${c['fils']} locale=${c['locale']} decimals=${c['decimals']}',
      );
    }
  });
}
