import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/finance/application_screen.dart';

import 'fake_repository.dart';

/// A referred application decided by a credit officer in the back office (web staff tool). The customer's
/// application screen shows the officer's outcome and "Reviewed by credit officer" (recorded API response).
void main() {
  final reviewed = FinanceApplication.fromJson(fixture('application_reviewed') as Json);

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [repositoryProvider.overrideWithValue(FakeSahelRepository())],
      child: SahelApp(initialLocation: '/applications/${reviewed.id}'),
    ));
    await tester.pumpAndSettle();
  }

  test('API contract: a reviewed application carries the officer review, not the internal note', () {
    expect(reviewed.status, 'APPROVED');
    expect(reviewed.decision!.outcome, 'REFERRED');
    expect(reviewed.decision!.reasons, ['HIGH_DBR_UTILISATION']);
    expect(reviewed.review!.outcome, 'APPROVED');
    expect(reviewed.outcome, 'APPROVED');
    expect(reviewed.canAccept, isTrue);
    final approved = reviewed.steps.firstWhere((s) => s.status == 'APPROVED');
    expect(approved.done && approved.reviewedByOfficer, isTrue);
    expect(reviewed.steps.where((s) => s.reviewedByOfficer), hasLength(1));
    expect(reviewed.steps.last.status, 'COMPLETED');
    expect(fixture('application_reviewed').toString(), isNot(contains('Stable employment')));
  });

  testWidgets('application approved by a credit officer: approved, reviewed by credit officer, offer can be accepted', (tester) async {
    await pump(tester);
    expect(find.byType(ApplicationScreen), findsOneWidget);
    expect(find.byKey(const Key('decision-APPROVED')), findsOneWidget);
    expect(find.byKey(const Key('decision-REFERRED')), findsNothing);
    expect(find.byKey(const Key('reviewed-by-officer')), findsOneWidget);
    expect(find.text('Reviewed by credit officer'), findsWidgets);
    expect(find.textContaining('A credit officer reviewed your application and approved it'), findsOneWidget);
    final list = find.descendant(of: find.byType(ApplicationScreen), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const Key('accept-offer')), 200, scrollable: list);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('accept-offer')), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const Key('step-APPROVED-reviewed-by-officer')), 200, scrollable: list);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('step-APPROVED-reviewed-by-officer')), findsOneWidget);
    expect(find.byKey(const Key('step-COMPLETED-upcoming')), findsOneWidget);
  });

  testWidgets('in Arabic the review is shown right-to-left', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('language-switch')).last);
    await tester.pumpAndSettle();
    expect(find.text('تمت المراجعة من مسؤول الائتمان'), findsWidgets);
    expect(Directionality.of(tester.element(find.byKey(const Key('reviewed-by-officer')))), TextDirection.rtl);
  });
}
