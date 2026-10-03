import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/payment_price.dart';
import 'package:sahel/features/checkout/checkout_screen.dart';
import 'package:sahel/features/finance/application_screen.dart';
import 'package:sahel/features/property/property_detail_screen.dart';

import 'applications_test.dart' show fixtureApp, pumpApp, scrollTo;
import 'fake_repository.dart';

/// Home finance (J4) and server-priced payments, driven by responses recorded from the API (test/fixtures/README.md).
Future<void> tapOn<T extends Widget>(WidgetTester tester, Finder target, {double delta = 200}) async {
  await scrollTo<T>(tester, target, delta: delta);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

const property = 'p-amwaj-apt-2br';

void main() {
  test('API contract: home finance and payment price fixtures parse', () {
    final ijara = fixtureApp('application_home_ijara');
    expect(ijara.productLine, 'home');
    expect(ijara.structure, FinanceStructure.ijara);
    expect(ijara.reference, property);
    expect(ijara.steps.where((s) => s.ijara).map((s) => s.status), ['ASSET_PURCHASED_BY_BCFC', 'LEASE_STARTED', 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER']);
    expect(ijara.steps.any((s) => s.murabaha), isFalse);
    final leased = fixtureApp('application_home_ijara_accepted');
    expect(leased.status, 'LEASE_STARTED');
    expect(leased.steps.where((s) => !s.done).map((s) => s.status), ['OWNERSHIP_TRANSFERRED_TO_CUSTOMER', 'COMPLETED']);
    final signed = fixtureApp('application_home_conventional_signed');
    expect(signed.status, 'CONTRACT_SIGNED');
    expect(signed.nextAction?.type, 'PAY_VALUATION_FEE');
    expect(signed.nextAction?.reference, property);
    expect(fixtureApp('application_home_conventional_completed').status, 'COMPLETED');
    expect(fixtureApp('application_home_conventional_completed').nextAction, isNull);
    expect(PaymentPrice.fromJson(fixture('payment_price_valuation') as Json).amountFils, 150000);
    expect(PaymentPrice.fromJson(fixture('payment_price_deposit') as Json).amountFils,
        (fixture('config') as Json)['reservationDepositFils']);
  });

  test('API contract: a settled contract frees DBR headroom', () {
    final me = fixture('me') as Json;
    final settled = fixture('me_settled') as Json;
    expect(settled['existingObligationsFils'] as int, lessThan(me['existingObligationsFils'] as int));
    expect(CustomerOverview.fromJson(settled).preApproval.maxMonthlyFils, greaterThan(CustomerOverview.fromJson(me).preApproval.maxMonthlyFils));
  });

  testWidgets('Ijara: apply from the property with the calculator selection, accept, BCFC buys then leases', (tester) async {
    final repo = await pumpApp(tester, location: '/property/$property');
    final apply = find.byKey(const Key('apply-finance'));
    expect(find.text('Apply for home finance'), findsOneWidget);
    expect(tester.widget<FilledButton>(apply).onPressed, isNotNull);
    // The valuation fee shown is the server's.
    expect(find.text('Request valuation · BHD 150'), findsOneWidget);
    expect(repo.priceRequests, contains('valuation_fee:$property'));
    await tapOn<PropertyDetailScreen>(tester, apply);

    // Default selection from the API (Ijara, listing defaults); the price is not sent: the API takes it from the catalog.
    expect(repo.applied.single, containsPair('productLine', 'home'));
    expect(repo.applied.single, containsPair('propertyId', property));
    expect(repo.applied.single, containsPair('structure', 'ijara'));
    expect(repo.applied.single, containsPair('downPaymentFils', 20000000));
    expect(repo.applied.single, containsPair('tenureMonths', 240));
    expect(repo.applied.single['vehicleId'], isNull);

    expect(find.byType(ApplicationScreen), findsOneWidget);
    expect(find.text('Sea-view 2-bedroom apartment'), findsOneWidget);
    expect(find.byKey(const Key('decision-APPROVED')), findsOneWidget);
    expect(find.text('Monthly rental'), findsOneWidget);
    expect(find.textContaining('nterest'), findsNothing);
    await tapOn<ApplicationScreen>(tester, find.byKey(const Key('accept-offer')));

    expect(find.byKey(const Key('lease-active')), findsOneWidget);
    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('step-COMPLETED-upcoming')));
    expect(find.byKey(const Key('ijara-steps')), findsOneWidget);
    expect(find.textContaining('BCFC must own the home before leasing it'), findsOneWidget);
    expect(find.text('Ownership transfers to you after the final rental'), findsOneWidget);
    final y = [
      for (final k in [
        'step-ASSET_PURCHASED_BY_BCFC-done',
        'step-LEASE_STARTED-done',
        'step-OWNERSHIP_TRANSFERRED_TO_CUSTOMER-upcoming',
        'step-COMPLETED-upcoming',
      ])
        tester.getTopLeft(find.byKey(Key(k))).dy,
    ];
    expect(y, [...y]..sort());
  });

  testWidgets('conventional: waits for the valuation fee (server amount), then continues to completion', (tester) async {
    final repo = await pumpApp(tester, location: '/property/$property');
    await tapOn<PropertyDetailScreen>(tester, find.byKey(const Key('quote-conventional')));
    await tapOn<PropertyDetailScreen>(tester, find.byKey(const Key('apply-finance')), delta: -200);
    expect(repo.applied.single, containsPair('structure', 'conventional'));
    await tapOn<ApplicationScreen>(tester, find.byKey(const Key('accept-offer')));

    expect(find.byKey(const Key('valuation-step')), findsOneWidget);
    expect(find.text('Pay valuation fee · BHD 150'), findsOneWidget);
    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('step-VALUATION_CONFIRMED-upcoming')));
    expect(find.byKey(const Key('step-CONTRACT_SIGNED-done')), findsOneWidget);
    expect(find.byKey(const Key('step-DISBURSED-upcoming')), findsOneWidget);

    await tapOn<ApplicationScreen>(tester, find.byKey(const Key('pay-valuation')));
    expect(find.byType(CheckoutScreen), findsOneWidget);
    expect(find.byKey(const Key('server-priced')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('checkout-amount'))).data, 'BHD 150.000');
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('payment-success')), findsOneWidget);
    expect(repo.payments.values.single, 150000);
    expect(repo.valuationsPaid, {property});

    // Back on the application: continue runs VALUATION_CONFIRMED, DISBURSED, COMPLETED.
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tapOn<ApplicationScreen>(tester, find.byKey(const Key('continue-fulfilment')));
    expect(find.byKey(const Key('valuation-step')), findsNothing);
    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('step-COMPLETED-done')));
    final y = [
      for (final s in ['CONTRACT_SIGNED', 'VALUATION_CONFIRMED', 'DISBURSED', 'COMPLETED']) tester.getTopLeft(find.byKey(Key('step-$s-done'))).dy,
    ];
    expect(y, [...y]..sort());
  });

  testWidgets('checkout pays the server amount for a valuation fee, whatever the link says', (tester) async {
    final repo = await pumpApp(tester, location: '/checkout?purpose=valuation_fee&amount=1&reference=$property&label=Valuation');
    expect(tester.widget<Text>(find.byKey(const Key('checkout-amount'))).data, 'BHD 150.000');
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(repo.payments.values.single, 150000);
  });

  testWidgets('checkout keeps the link amount for purposes the server does not price here', (tester) async {
    final repo = await pumpApp(tester, location: '/checkout?purpose=installment&amount=12345&reference=c-1001-15&label=Installment');
    expect(tester.widget<Text>(find.byKey(const Key('checkout-amount'))).data, 'BHD 12.345');
    expect(find.byKey(const Key('server-priced')), findsNothing);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(repo.payments.values.single, 12345);
  });

  testWidgets('Arabic: Ijara application is right-to-left with the Ijara note', (tester) async {
    await pumpApp(tester, location: '/applications/${fixtureApp('application_home_ijara').id}');
    await tester.tap(find.byKey(const Key('language-switch')).last);
    await tester.pumpAndSettle();
    expect(Directionality.of(tester.element(find.byKey(const Key('offer-summary')))), TextDirection.rtl);
    expect(find.text('الإيجار الشهري'), findsWidgets);
    await scrollTo<ApplicationScreen>(tester, find.byKey(const Key('ijara-steps')));
    expect(find.textContaining('يجب أن تتملك BCFC المنزل قبل تأجيره لك'), findsOneWidget);
    expect(find.text('تنتقل الملكية إليك بعد دفع آخر أجرة'), findsOneWidget);
  });
}
