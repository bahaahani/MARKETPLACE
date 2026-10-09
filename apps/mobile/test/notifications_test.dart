import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahel/app.dart';
import 'package:sahel/core/format.dart';
import 'package:sahel/core/models.dart';
import 'package:sahel/core/providers.dart';
import 'package:sahel/features/finance/application_screen.dart';
import 'package:sahel/features/notifications/notification_preferences_screen.dart';
import 'package:sahel/features/notifications/notifications_models.dart';
import 'package:sahel/features/notifications/notifications_screen.dart';

import 'fake_repository.dart';

Future<FakeSahelRepository> pumpApp(WidgetTester tester, {String location = '/'}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeSahelRepository();
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: SahelApp(initialLocation: location),
  ));
  await tester.pumpAndSettle();
  return repo;
}

NotificationInbox inboxFixture(String name) => NotificationInbox.fromJson(fixture(name) as Json);

/// Scrolls the screen's list until [target] is built and visible.
Future<void> reveal(WidgetTester tester, Finder target, {bool up = false}) async {
  await tester.scrollUntilVisible(target, up ? -200 : 200, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

AppNotification applicationNotification(NotificationInbox inbox) => inbox.items.firstWhere((n) => n.type == 'application_update');

/// The recorded inbox with its first notification marked mandatory (an overdue notice).
class _MandatoryRepo extends FakeSahelRepository {
  @override
  Future<NotificationInbox> notifications() async {
    final json = jsonDecode(jsonEncode(fixture('notifications'))) as Json;
    ((json['items'] as List).first as Json)['mandatory'] = true;
    return NotificationInbox.fromJson(json);
  }
}

void main() {
  test('Bahrain calendar day: an instant near midnight UTC is already the next day in Bahrain, whatever the device zone', () {
    expect(bahrainCalendarDay(DateTime.utc(2026, 10, 8, 21, 30)), DateTime(2026, 10, 9));
    expect(bahrainCalendarDay(DateTime.utc(2026, 10, 8, 20, 59)), DateTime(2026, 10, 8));
    expect(bahrainCalendarDay(DateTime.parse('2026-12-31T21:00:00Z')), DateTime(2027, 1, 1));
  });

  testWidgets('a mandatory (overdue) notice has no dismiss button; the others do', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [repositoryProvider.overrideWithValue(_MandatoryRepo())],
      child: const SahelApp(initialLocation: '/notifications'),
    ));
    await tester.pumpAndSettle();
    final items = inboxFixture('notifications').items;
    final first = items.first;
    expect(find.byKey(Key('notif-${first.id}')), findsOneWidget);
    expect(find.byKey(Key('notif-dismiss-${first.id}')), findsNothing);
    final other = items[1];
    await reveal(tester, find.byKey(Key('notif-${other.id}')));
    expect(find.byKey(Key('notif-dismiss-${other.id}')), findsOneWidget);
  });

  test('API contract: notification fixtures parse', () {
    final inbox = inboxFixture('notifications');
    expect(inbox.unreadCount, inbox.total);
    expect(inbox.items.map((n) => n.type), containsAll(['application_update', 'registration_expiring', 'garage_insurance_expiring']));
    final app = applicationNotification(inbox);
    expect(app.link, startsWith('/applications/app_sbx_'));
    expect(app.priority, 'high');
    expect(app.title.en, 'Your car finance is approved');
    expect(app.title.ar, isNotEmpty);
    expect(app.channels, ['push', 'email']);
    expect(inbox.items.every((n) => ['today', 'week', 'earlier'].contains(n.group)), isTrue);
    expect(applicationNotification(inboxFixture('notifications_read')).read, isTrue);
    expect(inboxFixture('notifications_read').unreadCount, inbox.unreadCount - 1);
    expect(inboxFixture('notifications_dismissed').items.any((n) => n.type == 'application_update'), isFalse);
    expect(inboxFixture('notifications_read_all').unreadCount, 0);

    final prefs = NotificationPreferences.fromJson(fixture('notification_preferences') as Json);
    expect(prefs.channels, ['push', 'sms', 'whatsapp', 'email']);
    expect(prefs.categories.where((c) => c.mandatory).map((c) => c.category), ['overdue']);
    expect(prefs.quietHours.start, '22:00');
    final saved = NotificationPreferences.fromJson(fixture('notification_preferences_saved') as Json);
    expect(saved.categories.firstWhere((c) => c.category == 'payments').channels['whatsapp'], isTrue);
    expect(saved.quietHours.end, '06:30');
  });

  testWidgets('home app bar bell shows the unread count and opens the inbox', (tester) async {
    await pumpApp(tester);
    final unread = inboxFixture('notifications').unreadCount;
    expect(find.byKey(const Key('notif-bell')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('notif-badge')), matching: find.text('$unread')), findsOneWidget);
    expect(find.bySemanticsLabel('Notifications, $unread unread'), findsOneWidget);
    await tester.tap(find.byKey(const Key('notif-bell')));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationsScreen), findsOneWidget);
    expect(find.text('Your car finance is approved'), findsOneWidget);
    expect(find.text('$unread unread'), findsOneWidget);
  });

  testWidgets('tapping a notification marks it read and opens its deep link (same path as the web)', (tester) async {
    final repo = await pumpApp(tester, location: '/notifications');
    final app = applicationNotification(inboxFixture('notifications'));
    await tester.tap(find.text('Your car finance is approved'));
    await tester.pumpAndSettle();
    expect(repo.notificationCalls, ['read:${app.id}']);
    expect(find.byType(ApplicationScreen), findsOneWidget);
    final screen = tester.widget<ApplicationScreen>(find.byType(ApplicationScreen));
    expect('/applications/${screen.id}', app.link);
  });

  testWidgets('mark read, dismiss and mark all read show the API answer; badge follows', (tester) async {
    final repo = await pumpApp(tester);
    final inbox = inboxFixture('notifications');
    final app = applicationNotification(inbox);
    await tester.tap(find.byKey(const Key('notif-bell')));
    await tester.pumpAndSettle();
    expect(find.byKey(Key('notif-read-${app.id}')), findsOneWidget);
    await tester.tap(find.byKey(Key('notif-read-${app.id}')));
    await tester.pumpAndSettle();
    expect(find.byKey(Key('notif-read-${app.id}')), findsNothing);
    expect(find.text('${inbox.unreadCount - 1} unread'), findsOneWidget);

    await tester.tap(find.byKey(Key('notif-dismiss-${app.id}')));
    await tester.pumpAndSettle();
    expect(find.text('Your car finance is approved'), findsNothing);

    await tester.tap(find.byKey(const Key('notif-read-all')));
    await tester.pumpAndSettle();
    expect(find.text('0 unread'), findsOneWidget);
    expect(repo.notificationCalls, ['read:${app.id}', 'dismiss:${app.id}', 'read-all']);

    // Back on home, the badge is gone and the bell says "Notifications".
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Notifications'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('notif-badge')), matching: find.text('0')), findsNothing);
  });

  testWidgets('each notification says where it would be sent (sandbox) in Arabic too', (tester) async {
    await pumpApp(tester, location: '/notifications');
    final app = applicationNotification(inboxFixture('notifications'));
    expect(find.textContaining('Sandbox: would also send by Push, Email'), findsWidgets);
    expect(find.byKey(Key('notif-delivery-${app.id}')), findsOneWidget);
    await tester.tap(find.byKey(const Key('notif-prefs-link')));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationPreferencesScreen), findsOneWidget);
  });

  testWidgets('Arabic inbox is right-to-left with Arabic text from the API', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(overrides: [repositoryProvider.overrideWithValue(FakeSahelRepository())]);
    addTearDown(container.dispose);
    container.read(localeProvider.notifier).toggle();
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const SahelApp(initialLocation: '/notifications')));
    await tester.pumpAndSettle();
    final app = applicationNotification(inboxFixture('notifications'));
    expect(find.text(app.title.ar), findsOneWidget);
    expect(Directionality.of(tester.element(find.text(app.title.ar))), TextDirection.rtl);
    expect(find.text('الإشعارات'), findsOneWidget);
  });

  testWidgets('preferences: a mandatory category refused by the API, then a saved change', (tester) async {
    final repo = await pumpApp(tester, location: '/notifications/preferences');
    expect(find.textContaining('Required: keep at least one channel on'), findsOneWidget);
    // Switch off both default channels of overdue payments: the API refuses (422 MANDATORY_CATEGORY).
    await tester.tap(find.byKey(const Key('notif-pref-overdue-push')));
    await tester.tap(find.byKey(const Key('notif-pref-overdue-sms')));
    await tester.pump();
    await reveal(tester, find.byKey(const Key('notif-prefs-save')));
    await tester.tap(find.byKey(const Key('notif-prefs-save')));
    await tester.pumpAndSettle();
    expect(find.text('Overdue payment notices need at least one channel.'), findsOneWidget);
    final sent = repo.savedPreferences.single['categories'] as List;
    expect((sent.firstWhere((c) => (c as Json)['category'] == 'overdue') as Json)['channels'], {'push': false, 'sms': false, 'whatsapp': false, 'email': false});

    await reveal(tester, find.byKey(const Key('notif-pref-overdue-whatsapp')), up: true);
    await tester.tap(find.byKey(const Key('notif-pref-overdue-whatsapp')));
    await tester.pump();
    await reveal(tester, find.byKey(const Key('notif-prefs-save')));
    await tester.tap(find.byKey(const Key('notif-prefs-save')));
    await tester.pumpAndSettle();
    expect(find.text('✓ Settings saved'), findsOneWidget);
    expect(repo.savedPreferences, hasLength(2));
    // The screen shows what the API saved (recorded: quiet hours 23:00–06:30).
    expect(find.text('To 06:30'), findsOneWidget);
  });
}
