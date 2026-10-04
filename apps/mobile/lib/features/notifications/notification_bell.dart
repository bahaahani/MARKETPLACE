import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import 'notifications_providers.dart';

/// Bell in the home app bar with the unread count from the API. Screen readers hear "Notifications, N unread".
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final unread = ref.watch(notificationsProvider).value?.unreadCount ?? 0;
    final label = unread > 0 ? l.notifBellUnread('$unread') : l.notifBellLabel;
    return IconButton(
      key: const Key('notif-bell'),
      tooltip: label,
      icon: Semantics(
        label: label,
        excludeSemantics: true,
        child: Badge(
          key: const Key('notif-badge'),
          isLabelVisible: unread > 0,
          label: Text(unread > 99 ? '99+' : '$unread'),
          child: const Icon(Icons.notifications_outlined),
        ),
      ),
      onPressed: () => context.push('/notifications'),
    );
  }
}
