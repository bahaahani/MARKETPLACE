import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';

import 'fake_repository.dart';

/// Applies the API's home-finance rules (20% minimum down payment) and returns the limits the API would,
/// so the calculator is exercised against what POST /quotes/finance really accepts.
class _HomeRulesRepository extends FakeSahelRepository {
  final downPayments = <int>[];

  @override
  Future<FinanceComparison> financeQuotes({
    required String productLine,
    required int assetPriceFils,
    required int downPaymentFils,
    required int tenureMonths,
  }) async {
    downPayments.add(downPaymentFils);
    final minDown = (assetPriceFils * 20 + 99) ~/ 100;
    if (downPaymentFils < minDown) throw ApiException(422, 'DOWN_PAYMENT_TOO_LOW', 'down payment must be at least 20%');
    final recorded = fixture('quotes_crv') as Json;
    return FinanceComparison.fromJson({
      'quotes': recorded['quotes'],
      'limits': {
        'minTenureMonths': 60,
        'maxTenureMonths': 300,
        'minDownPaymentFils': minDown,
        'maxDownPaymentFils': assetPriceFils * 9 ~/ 10,
        'structures': ['conventional', 'ijara'],
      },
    });
  }
}

void main() {
  testWidgets('home calculator never starts below the minimum down payment (land plot, BHD 72,000)', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final repo = _HomeRulesRepository();
    await tester.pumpWidget(ProviderScope(
      overrides: [repositoryProvider.overrideWithValue(repo)],
      child: const SahelApp(initialLocation: '/property/p-hamala-land'),
    ));
    await tester.pumpAndSettle();
    // 20% of BHD 72,000 is BHD 14,400; rounding to BHD 1,000 steps used to send BHD 14,000 (rejected by the API).
    expect(repo.downPayments, isNotEmpty);
    expect(repo.downPayments.every((d) => d >= 14400000), isTrue, reason: '${repo.downPayments}');
    expect(repo.downPayments.last, 14400000); // same default as the web calculator
    expect(find.text('Something went wrong. Please try again.'), findsNothing);
    expect(find.text('BHD 14,400'), findsOneWidget);
  });

  test('parseBhdInput rejects amounts above the safe integer range, like the TypeScript version', () {
    expect(parseBhdInput('9007199254740.991'), 9007199254740991);
    expect(parseBhdInput('9007199254740.992'), isNull);
    expect(parseBhdInput('9999999999999999'), isNull); // used to overflow to a negative number
    expect(parseBhdInput('1,400.5'), 1400500);
  });
}
