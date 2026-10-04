import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/rewards/rewards_models.dart';
import 'package:sahel/features/rewards/rewards_screen.dart';

import 'fake_repository.dart';

Future<T> pumpApp<T extends FakeSahelRepository>(WidgetTester tester, T repo, String location) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return repo;
}

Future<void> scrollToReward(WidgetTester tester, Finder target, {double delta = 200}) async {
  final list = find.descendant(of: find.byType(RewardsScreen), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(target, delta, scrollable: list);
  await tester.pumpAndSettle();
}

void main() {
  test('API contract: rewards fixtures parse; points, tier and masked vouchers come from the API', () {
    final start = RewardsSummary.fromJson(fixture('rewards') as Json);
    final me = CustomerOverview.fromJson(fixture('me') as Json);
    // The demo balance on /me is only the opening balance; the ledger adds the derived bonuses.
    expect(start.openingBalance, me.rewardsPoints);
    expect(start.balance, greaterThan(start.openingBalance));
    expect(start.tier.id, 'silver');
    expect(start.nextTier!.id, 'gold');
    expect(start.entries.map((e) => e.source), containsAll(['opening_balance', 'good_payer_streak', 'autopay']));
    expect(start.earnRules.firstWhere((r) => r.id == 'installment_on_time').pointsPerBhd, isNotNull);

    final paid = RewardsSummary.fromJson(fixture('rewards_paid') as Json);
    final earned = paid.entries.first;
    expect(earned.source, 'payment');
    expect(paid.balance, start.balance + earned.points);
    expect(paid.tier.id, 'gold');

    final r = RedemptionResult.fromJson(fixture('rewards_redemption') as Json);
    expect(r.redemption.code, matches(RegExp(r'^IMZ-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$')));
    expect(r.balance, paid.balance - r.redemption.pointsCost);
    final listed = [for (final j in fixture('rewards_redemptions')['items'] as List) RewardRedemption.fromJson(j as Json)];
    expect(listed.single.code, isNull);
    expect(listed.single.codeMasked, 'IMZ-••••-••••-${r.redemption.code!.substring(r.redemption.code!.length - 4)}');
    final redeemed = RewardsSummary.fromJson(fixture('rewards_redeemed') as Json);
    expect(redeemed.balance, r.balance);
    expect(redeemed.entries.first.points, -r.redemption.pointsCost);

    final cat = RewardsCatalogue.fromJson(fixture('rewards_catalogue') as Json);
    expect(cat.balance, start.balance);
    expect(cat.items.any((i) => i.demoPartner), isTrue);
    expect(cat.items.map((i) => i.id), contains('installment-credit-10'));
  });

  testWidgets('account shows the API balance (not the demo opening balance) and opens the rewards screen', (tester) async {
    await pumpApp(tester, FakeSahelRepository(), '/account');
    final start = RewardsSummary.fromJson(fixture('rewards') as Json);
    final badge = find.text('★ ${_n(start.balance)} points');
    await tester.scrollUntilVisible(badge, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(badge, findsOneWidget);
    expect(find.textContaining(_n(CustomerOverview.fromJson(fixture('me') as Json).rewardsPoints)), findsNothing);
    await tester.tap(badge);
    await tester.pumpAndSettle();
    expect(find.byType(RewardsScreen), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('rew-balance'))).data, '${_n(start.balance)} points');
    expect(find.text('★ Silver tier'), findsOneWidget);
    expect(find.text('${_n(start.pointsToNextTier)} more points to Gold'), findsOneWidget);
    expect(find.byKey(const Key('rew-sandbox')), findsOneWidget);
  });

  testWidgets('after an on-time installment the screen shows the new balance, Gold tier and the earn entry', (tester) async {
    final repo = FakeSahelRepository()..rewardsState = 'rewards_paid';
    await pumpApp(tester, repo, '/rewards');
    final paid = RewardsSummary.fromJson(fixture('rewards_paid') as Json);
    expect(find.text('${_n(paid.balance)} points'), findsOneWidget);
    expect(find.text('★ Gold tier'), findsOneWidget);
    final entry = find.byKey(Key('rew-entry-${paid.entries.first.id}'));
    await scrollToReward(tester, entry);
    expect(find.descendant(of: entry, matching: find.text('+${_n(paid.entries.first.points)}')), findsOneWidget);
    expect(find.descendant(of: entry, matching: find.textContaining('paid on time')), findsOneWidget);
  });

  testWidgets('redeem → confirm → voucher code once, then masked in My vouchers; one idempotency key', (tester) async {
    final repo = FakeSahelRepository()..rewardsState = 'rewards_paid';
    await pumpApp(tester, repo, '/rewards');
    final r = RedemptionResult.fromJson(fixture('rewards_redemption') as Json);
    final button = find.byKey(const Key('rew-redeem-fuel-5'));
    await scrollToReward(tester, button);

    // Cancel first: nothing is redeemed.
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.text('Redeem BHD 5 fuel voucher for 1,500 points?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(repo.redeemed, isEmpty);

    await tester.tap(button);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('rew-confirm')));
    await tester.pumpAndSettle();
    expect(repo.redeemed.single.$1, 'fuel-5');
    expect(repo.redeemed.single.$2.length, greaterThanOrEqualTo(8));
    await scrollToReward(tester, find.byKey(const Key('rew-code')), delta: -200);
    expect(find.text(r.redemption.code!), findsOneWidget);
    expect(find.text('New balance: ${_n(r.balance)} points'), findsOneWidget);
    await scrollToReward(tester, find.byKey(const Key('rew-balance')), delta: -200);
    expect(tester.widget<Text>(find.byKey(const Key('rew-balance'))).data, '${_n(r.balance)} points'); // reloaded from the API
    final voucher = find.byKey(Key('rew-voucher-${r.redemption.id}'));
    await scrollToReward(tester, voucher);
    expect(find.descendant(of: voucher, matching: find.text(r.redemption.codeMasked)), findsOneWidget);
    expect(find.descendant(of: voucher, matching: find.text(r.redemption.code!)), findsNothing);
  });

  testWidgets('an item the balance does not cover is disabled; a 422 from the API shows the insufficient message', (tester) async {
    final repo = FakeSahelRepository()
      ..unaffordable.add('takaful-15')
      ..rewardsInsufficient = true;
    await pumpApp(tester, repo, '/rewards');
    final takaful = find.byKey(const Key('rew-redeem-takaful-15'));
    await scrollToReward(tester, takaful);
    expect(tester.widget<FilledButton>(takaful).onPressed, isNull);
    expect(find.descendant(of: takaful, matching: find.text('Not enough points')), findsOneWidget);

    final fuel = find.byKey(const Key('rew-redeem-fuel-5'));
    await scrollToReward(tester, fuel, delta: -200);
    await tester.tap(fuel);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('rew-confirm')));
    await tester.pumpAndSettle();
    expect(find.text("You don't have enough points for this reward."), findsOneWidget);
    expect(find.byKey(const Key('rew-issued')), findsNothing);
  });

  testWidgets('home links to rewards with balance and tier; Arabic is RTL', (tester) async {
    await pumpApp(tester, FakeSahelRepository(), '/');
    final start = RewardsSummary.fromJson(fixture('rewards') as Json);
    final entry = find.byKey(const Key('rewards-entry'));
    await tester.scrollUntilVisible(entry, 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('${_n(start.balance)} points · Silver tier'), findsOneWidget);
    await tester.tap(find.byKey(const Key('language-switch')).first);
    await tester.pumpAndSettle();
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(find.byType(RewardsScreen), findsOneWidget);
    expect(find.text('نقاط امتياز'), findsWidgets);
    expect(Directionality.of(tester.element(find.byKey(const Key('rew-balance')))), TextDirection.rtl);
    expect(find.text('★ الفئة: فضي'), findsOneWidget);
  });
}

String _n(int n) {
  final s = n.toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}
