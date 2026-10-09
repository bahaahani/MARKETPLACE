import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/models/config.dart';
import 'package:sahel/core/models/insurance.dart';
import 'package:sahel/core/models/insurance_medical_life.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/account/account_screen.dart';
import 'package:sahel/features/checkout/checkout_screen.dart';
import 'package:sahel/features/insurance/life_screen.dart';
import 'package:sahel/features/insurance/medical_screen.dart';

import 'fake_repository.dart';

Future<FakeSahelRepository> pumpApp(WidgetTester tester, {String location = '/', bool shelf = false}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeSahelRepository()..insuranceShelf = shelf;
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return repo;
}

/// Scroll the given screen's own list (other shell branches keep offstage scrollables alive).
Future<void> scrollTo<T extends Widget>(WidgetTester tester, Finder target, {double delta = 200}) async {
  final list = find.descendant(of: find.byType(T), matching: find.byType(Scrollable)).first;
  // Start from the top: a lazily built list does not keep targets that moved far below the viewport.
  tester.state<ScrollableState>(list).position.jumpTo(0);
  await tester.pump();
  await tester.scrollUntilVisible(target, delta, scrollable: list);
  await tester.pumpAndSettle();
}

Future<void> tapOn<T extends Widget>(WidgetTester tester, Finder target) async {
  await scrollTo<T>(tester, target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  test('API contract: medical and life fixtures parse', () {
    final med = [for (final j in fixture('medical_quotes')['quotes'] as List) MedicalQuote.fromJson(j as Json)];
    expect(med, hasLength(4));
    final premiums = med.map((q) => q.annualPremiumFils).toList();
    expect(premiums, [...premiums]..sort());
    expect(med.every((q) => q.tier == 'enhanced' && q.adults == 2 && q.children == 1 && q.buyable), isTrue);
    expect(med.first.maternityWaitingMonths, 12);
    final pre = [for (final j in fixture('medical_quotes_pre_existing')['quotes'] as List) MedicalQuote.fromJson(j as Json)];
    expect(pre.where((q) => !q.buyable).map((q) => q.preExistingStatus).toSet(), {'referred'});
    expect(pre.where((q) => q.buyable).map((q) => q.preExistingStatus).toSet(), {'surcharge'});
    final life = [for (final j in fixture('life_quotes')['quotes'] as List) LifeQuote.fromJson(j as Json)];
    expect(life, hasLength(4));
    expect(life.first.totalPremiumsFils, life.first.annualPremiumFils * life.first.termYears);
    expect(life.map((q) => q.productType).toSet(), {'conventional', 'family-takaful'});
    final policies = [for (final j in fixture('me_policies_shelf')['items'] as List) Policy.fromJson(j as Json)];
    expect(policies.map((p) => p.line), ['medical', 'life', 'travel']);
    expect(policies.first.cover.annualLimitFils, 150000000);
    expect(policies[1].cover.termYears, 20);
    final cfg = ClientConfig.fromJson(fixture('config') as Json);
    expect(cfg.medical.maxChildren, 5);
    expect(cfg.life.maxEndAge, 70);
    expect(cfg.life.sumAssuredStepFils, 5000000);
  });

  testWidgets('insurance hub has Medical and Life cards that open their screens', (tester) async {
    await pumpApp(tester, location: '/insurance');
    await tapOn<Scaffold>(tester, find.byKey(const Key('insurance-line-medical')));
    expect(find.byType(MedicalInsuranceScreen), findsOneWidget);
    expect(find.text('Medical insurance'), findsWidgets);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tapOn<Scaffold>(tester, find.byKey(const Key('insurance-line-life')));
    expect(find.byType(LifeInsuranceScreen), findsOneWidget);
  });

  testWidgets('medical: indicative note, default request from the API rules, Takaful filter, spouse and children re-quote', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/medical');
    expect(find.byKey(const Key('medical-indicative')), findsOneWidget);
    final first = repo.medicalRequests.first;
    expect(first, containsPair('tier', 'basic'));
    expect(first, containsPair('nationality', 'bahraini'));
    expect(first['spouseDateOfBirth'], isNull);
    expect(first['childrenDatesOfBirth'], isEmpty);
    // The primary member starts at the API's default age (35).
    final dob = DateTime.parse(first['primaryDateOfBirth']! as String);
    expect(DateTime.now().year - dob.year, 35);

    await scrollTo<MedicalInsuranceScreen>(tester, find.byKey(const Key('medical-quote-manama-assurance')));
    expect(find.byKey(const Key('medical-quote-pearl-takaful')), findsOneWidget);
    expect(find.text('BHD 1,071.000 / year'), findsOneWidget);

    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('add-spouse')));
    expect(repo.medicalRequests.last['spouseDateOfBirth'], isNotNull);
    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('add-child')));
    expect((repo.medicalRequests.last['childrenDatesOfBirth']! as List), hasLength(1));
    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('tier-premium')));
    expect(repo.medicalRequests.last, containsPair('tier', 'premium'));
    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('nationality-expat')));
    expect(repo.medicalRequests.last, containsPair('nationality', 'expat'));

    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('takaful-only')));
    await scrollTo<MedicalInsuranceScreen>(tester, find.byKey(const Key('medical-quote-awal-takaful')));
    expect(find.byKey(const Key('medical-quote-manama-assurance')), findsNothing);
    expect(find.byKey(const Key('medical-quote-dilmun-insurance')), findsNothing);
  });

  testWidgets('medical: the child limit comes from the API rules', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/medical');
    for (var i = 0; i < 5; i++) {
      await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('add-child')));
    }
    expect((repo.medicalRequests.last['childrenDatesOfBirth']! as List), hasLength(5));
    await scrollTo<MedicalInsuranceScreen>(tester, find.byKey(const Key('add-child')));
    expect(tester.widget<TextButton>(find.byKey(const Key('add-child'))).onPressed, isNull);
    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('remove-child-0')));
    expect((repo.medicalRequests.last['childrenDatesOfBirth']! as List), hasLength(4));
  });

  testWidgets('medical: a pre-existing declaration surcharges or refers, never declines; referred quotes cannot be bought', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/medical');
    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('pre-existing')));
    expect(repo.medicalRequests.last, containsPair('preExistingConditions', true));
    await scrollTo<MedicalInsuranceScreen>(tester, find.byKey(const Key('medical-quote-manama-assurance')));
    // All four insurers still answer.
    expect(find.byKey(const Key('medical-quote-pearl-takaful')), findsOneWidget);
    expect(find.byKey(const Key('medical-quote-awal-takaful')), findsOneWidget);
    expect(find.byKey(const Key('medical-quote-dilmun-insurance')), findsOneWidget);
    expect(find.textContaining('Referred to the insurer'), findsNWidgets(2));
    expect(find.textContaining('Includes a pre-existing surcharge'), findsNWidgets(2));
    expect(find.byKey(const Key('buy-pearl-takaful')), findsOneWidget);
    expect(find.byKey(const Key('buy-awal-takaful')), findsOneWidget);
    expect(find.byKey(const Key('buy-dilmun-insurance')), findsNothing);
    expect(find.byKey(const Key('buy-manama-assurance')), findsNothing);
  });

  testWidgets('buy medical insurance: hold the quote, pay it, policy issued', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/medical');
    await tapOn<MedicalInsuranceScreen>(tester, find.byKey(const Key('buy-pearl-takaful')));
    final held = repo.heldQuotes.single;
    expect(held['line'], 'medical');
    expect(held['insurerId'], 'pearl-takaful');
    expect((held['input']! as Map)['tier'], 'basic');
    expect((held['input']! as Map)['nationality'], 'bahraini');
    expect((held['input']! as Map).containsKey('takafulOnly'), isFalse);

    expect(find.byType(CheckoutScreen), findsOneWidget);
    final quote = PolicyQuote.fromJson(fixture('policy_quote_medical') as Json);
    expect(find.text('BHD 1,071.000'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(repo.payments.values.single, quote.premiumFils);
    expect(repo.confirmedPolicies.single, ('pay_test_1', quote.id));
    expect(find.text('Your policy is issued · SBX-MED-26-000001'), findsOneWidget);
  });

  testWidgets('life: indicative, defaults from the API, rider and smoker re-quote, family takaful label, total vs sum assured', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/life');
    expect(find.byKey(const Key('life-indicative')), findsOneWidget);
    final first = repo.lifeRequests.first;
    expect(first, containsPair('sumAssuredFils', 100000000));
    expect(first, containsPair('termYears', 20));
    expect(first, containsPair('smoker', false));
    expect(first, containsPair('criticalIllnessRider', false));
    expect(DateTime.now().year - DateTime.parse(first['dateOfBirth']! as String).year, 35);

    await scrollTo<LifeInsuranceScreen>(tester, find.byKey(const Key('life-quote-manama-assurance')));
    expect(find.text('BHD 113.100 / year'), findsOneWidget);
    expect(find.textContaining('BHD 9.425 / month'), findsOneWidget);
    expect(find.textContaining('Total over 20 years: BHD 2,262.000'), findsOneWidget);
    expect(find.textContaining('Sum assured BHD 100,000'), findsWidgets);
    expect(find.textContaining('Family takaful'), findsWidgets);
    expect(find.textContaining('Conventional'), findsWidgets);
    expect(find.text('Beneficiary names are not collected in this quote. They are collected when the policy is issued.'), findsOneWidget);

    await tapOn<LifeInsuranceScreen>(tester, find.byKey(const Key('smoker')));
    expect(repo.lifeRequests.last, containsPair('smoker', true));
    await tapOn<LifeInsuranceScreen>(tester, find.byKey(const Key('ci-rider')));
    expect(repo.lifeRequests.last, containsPair('criticalIllnessRider', true));
    await tapOn<LifeInsuranceScreen>(tester, find.byKey(const Key('takaful-only')));
    await scrollTo<LifeInsuranceScreen>(tester, find.byKey(const Key('life-quote-awal-takaful')));
    expect(find.byKey(const Key('life-quote-dilmun-insurance')), findsNothing);
    expect(find.byKey(const Key('life-quote-manama-assurance')), findsNothing);
  });

  testWidgets('life: the sum and term sliders use the steps from the API and re-quote when released', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/life');
    final term = find.byKey(const Key('term-years'));
    await scrollTo<LifeInsuranceScreen>(tester, term);
    // Drag the term slider to its right end: the API's maximum term.
    await tester.drag(term, const Offset(2000, 0));
    await tester.pumpAndSettle();
    expect(repo.lifeRequests.last, containsPair('termYears', 30));
    expect(find.text('Term: 30 years'), findsOneWidget);
    final sum = find.byKey(const Key('sum-assured'));
    await tester.drag(sum, const Offset(-3000, 0));
    await tester.pumpAndSettle();
    expect(repo.lifeRequests.last, containsPair('sumAssuredFils', 10000000));
  });

  testWidgets('buy life insurance: hold the quote, pay it, policy issued', (tester) async {
    final repo = await pumpApp(tester, location: '/insurance/life');
    await tapOn<LifeInsuranceScreen>(tester, find.byKey(const Key('buy-dilmun-insurance')));
    final held = repo.heldQuotes.single;
    expect(held['line'], 'life');
    expect(held['insurerId'], 'dilmun-insurance');
    expect((held['input']! as Map)['termYears'], 20);
    expect((held['input']! as Map)['sumAssuredFils'], 100000000);
    expect(find.byType(CheckoutScreen), findsOneWidget);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(repo.confirmedPolicies.single.$2, (fixture('policy_quote_life') as Json)['id']);
    expect(find.text('Your policy is issued · SBX-LIF-26-000002'), findsOneWidget);
  });

  testWidgets('account lists medical and life policies with their labels', (tester) async {
    await pumpApp(tester, location: '/account', shelf: true);
    await scrollTo<AccountScreen>(tester, find.byKey(const Key('policy-SBX-LIF-26-000002')));
    expect(find.text('Medical · Pearl Takaful (demo)'), findsOneWidget);
    expect(find.text('Life · Dilmun Insurance (demo)'), findsOneWidget);
    expect(find.text('Enhanced · 3 members · Annual limit BHD 150,000 per member'), findsOneWidget);
    expect(find.text('Conventional · Sum assured BHD 100,000 · 20-year term'), findsOneWidget);
    expect(find.byKey(const Key('policy-SBX-TRV-25-000000')), findsOneWidget);
  });

  testWidgets('Arabic medical and life screens are right-to-left', (tester) async {
    await pumpApp(tester, location: '/insurance/life');
    await tester.tap(find.byKey(const Key('language-switch')));
    await tester.pumpAndSettle();
    expect(find.text('التأمين على الحياة'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(LifeInsuranceScreen))), TextDirection.rtl);
  });
}
