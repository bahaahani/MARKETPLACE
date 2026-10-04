import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import 'notifications_models.dart';

/// The inbox (GET /me/notifications). Read / dismiss answer with the new inbox, which replaces it.
class NotificationsNotifier extends AsyncNotifier<NotificationInbox> {
  @override
  Future<NotificationInbox> build() => ref.watch(repositoryProvider).notifications();

  Future<void> _apply(Future<NotificationInbox> Function() call) async {
    try {
      state = AsyncData(await call());
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> markRead(String id) => _apply(() => ref.read(repositoryProvider).markNotificationRead(id));
  Future<void> markAllRead() => _apply(() => ref.read(repositoryProvider).markAllNotificationsRead());
  Future<void> dismiss(String id) => _apply(() => ref.read(repositoryProvider).dismissNotification(id));
}

final notificationsProvider = AsyncNotifierProvider<NotificationsNotifier, NotificationInbox>(NotificationsNotifier.new);

final notificationPreferencesProvider =
    FutureProvider.autoDispose<NotificationPreferences>((ref) => ref.watch(repositoryProvider).notificationPreferences());

String notificationChannelLabel(AppLocalizations l, String channel) => switch (channel) {
      'push' => l.notifChannelPush,
      'sms' => l.notifChannelSms,
      'whatsapp' => l.notifChannelWhatsapp,
      _ => l.notifChannelEmail,
    };

String notificationCategoryLabel(AppLocalizations l, String category) => switch (category) {
      'payments' => l.notifPrefsCategoryPayments,
      'overdue' => l.notifPrefsCategoryOverdue,
      'insurance' => l.notifPrefsCategoryInsurance,
      'claims' => l.notifPrefsCategoryClaims,
      'applications' => l.notifPrefsCategoryApplications,
      'cards' => l.notifPrefsCategoryCards,
      'vehicle' => l.notifPrefsCategoryVehicle,
      _ => l.notifPrefsCategoryAccount,
    };

String notificationGroupLabel(AppLocalizations l, String group) => switch (group) {
      'today' => l.notifGroupToday,
      'week' => l.notifGroupWeek,
      _ => l.notifGroupEarlier,
    };
