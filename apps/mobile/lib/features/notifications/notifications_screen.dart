import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'notifications_models.dart';
import 'notifications_providers.dart';

/// Shell tabs are opened with go (they live in the bottom navigation); every other deep link is pushed.
const _shellRoots = {'/', '/cars', '/property', '/cards', '/account'};

/// Shows an API timestamp in Bahrain time (UTC+3, as the API's Asia/Bahrain dates), e.g. "07:00".
String bahrainTime(BuildContext context, DateTime t, {bool withDate = false}) {
  final local = t.toUtc().add(const Duration(hours: 3));
  return (withDate ? DateFormat('d MMM, HH:mm', context.lang) : DateFormat('HH:mm', context.lang)).format(local);
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final inbox = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.notifTitle), actions: [
        IconButton(
          key: const Key('notif-prefs-link'),
          tooltip: l.notifPrefsLink,
          icon: const Icon(Icons.tune),
          onPressed: () => context.push('/notifications/preferences'),
        ),
      ]),
      body: AsyncView(
        value: inbox,
        onRetry: () => ref.invalidate(notificationsProvider),
        data: (inbox) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(notificationsProvider),
          child: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            Row(children: [
              Expanded(child: Text(l.notifUnreadCount('${inbox.unreadCount}'), key: const Key('notif-unread-count'))),
              TextButton(
                key: const Key('notif-read-all'),
                onPressed: inbox.unreadCount == 0 ? null : () => ref.read(notificationsProvider.notifier).markAllRead(),
                child: Text(l.notifMarkAllRead),
              ),
            ]),
            if (inbox.items.isEmpty)
              Padding(
                key: const Key('notif-empty'),
                padding: const EdgeInsets.all(SahelSpace.lg),
                child: Text(l.notifEmpty, textAlign: TextAlign.center),
              ),
            for (final group in const ['today', 'week', 'earlier'])
              if (inbox.items.any((n) => n.group == group)) ...[
                SectionHeader(notificationGroupLabel(l, group)),
                for (final n in inbox.items.where((n) => n.group == group)) _NotificationTile(n),
              ],
            const SizedBox(height: SahelSpace.md),
            Text('⚠️ ${l.notifSandboxNote}', style: const TextStyle(fontSize: 12, color: SahelColors.textMuted)),
          ]),
        ),
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile(this.n);
  final AppNotification n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final notifier = ref.read(notificationsProvider.notifier);
    final delivery = n.channels.isEmpty
        ? l.notifInAppOnly
        : l.notifWouldSend(n.channels.map((c) => notificationChannelLabel(l, c)).join(', '));
    final deferred = n.deferredUntil == null ? '' : ' ${l.notifDeferred(bahrainTime(context, n.deferredUntil!))}';
    return Card(
      key: Key('notif-${n.id}'),
      shape: n.read
          ? null
          : RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(SahelRadius.md),
              side: const BorderSide(color: SahelColors.brand),
            ),
      child: InkWell(
        onTap: () async {
          if (!n.read) await notifier.markRead(n.id);
          if (!context.mounted) return;
          final path = Uri.parse(n.link).path;
          _shellRoots.contains(path) ? context.go(n.link) : context.push(n.link);
        },
        child: Padding(
          padding: const EdgeInsets.all(SahelSpace.md),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              if (!n.read)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 6),
                  child: Semantics(
                    label: l.notifUnread,
                    child: const Icon(Icons.circle, size: 10, color: SahelColors.brand),
                  ),
                ),
              Expanded(child: Text(context.loc(n.title), style: const TextStyle(fontWeight: FontWeight.bold))),
              if (n.priority == 'high') Pill(l.notifImportant, color: SahelColors.danger, background: const Color(0x1AC0392B)),
            ]),
            const SizedBox(height: 4),
            Text(context.loc(n.body)),
            const SizedBox(height: 4),
            Text(bahrainTime(context, n.occurredAt, withDate: n.group != 'today'),
                style: const TextStyle(fontSize: 12, color: SahelColors.textMuted)),
            Text('⚠️ $delivery$deferred',
                key: Key('notif-delivery-${n.id}'), style: const TextStyle(fontSize: 12, color: SahelColors.textMuted)),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              if (n.mandatory) Pill(l.notifRequired, color: SahelColors.textMuted, background: SahelColors.background),
              const Spacer(),
              if (!n.read)
                TextButton(key: Key('notif-read-${n.id}'), onPressed: () => notifier.markRead(n.id), child: Text(l.notifMarkRead)),
              TextButton(key: Key('notif-dismiss-${n.id}'), onPressed: () => notifier.dismiss(n.id), child: Text(l.notifDismiss)),
            ]),
          ]),
        ),
      ),
    );
  }
}
