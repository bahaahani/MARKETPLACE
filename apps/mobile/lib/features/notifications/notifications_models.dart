// Notification models. They mirror the JSON contract in api/openapi.yaml (NotificationInbox, NotificationPreferences);
// every rule (what is due, thresholds, Bahrain dates, ids, mandatory categories, quiet hours) lives in
// packages/domain/src/notifications.ts, never in Dart. The texts arrive localized from the API.

import '../../core/models.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.category,
    required this.priority,
    required this.mandatory,
    required this.link,
    required this.occurredAt,
    required this.group,
    required this.read,
    required this.title,
    required this.body,
    required this.channels,
    this.deferredUntil,
  });

  final String id;
  final String type;
  final String category;

  /// high, normal or low
  final String priority;
  final bool mandatory;

  /// Deep link, the same path as on the web (go_router route), e.g. /applications/app_1
  final String link;
  final DateTime occurredAt;

  /// today, week or earlier (Bahrain days, computed by the API)
  final String group;
  final bool read;
  final Localized title;
  final Localized body;

  /// ⚠️ Sandbox: where it WOULD be sent (nothing is sent)
  final List<String> channels;
  final DateTime? deferredUntil;

  factory AppNotification.fromJson(Json j) {
    final delivery = j['delivery'] as Json;
    return AppNotification(
      id: j['id'] as String,
      type: j['type'] as String,
      category: j['category'] as String,
      priority: j['priority'] as String,
      mandatory: j['mandatory'] as bool,
      link: j['link'] as String,
      occurredAt: DateTime.parse(j['occurredAt'] as String),
      group: j['group'] as String,
      read: j['read'] as bool,
      title: Localized.fromJson(j['title'] as Json),
      body: Localized.fromJson(j['body'] as Json),
      channels: [for (final c in delivery['channels'] as List) c as String],
      deferredUntil: delivery['deferredUntil'] == null ? null : DateTime.parse(delivery['deferredUntil'] as String),
    );
  }
}

class NotificationInbox {
  const NotificationInbox({required this.items, required this.unreadCount, required this.total});
  final List<AppNotification> items;
  final int unreadCount;
  final int total;

  factory NotificationInbox.fromJson(Json j) => NotificationInbox(
        items: [for (final i in j['items'] as List) AppNotification.fromJson(i as Json)],
        unreadCount: j['unreadCount'] as int,
        total: j['total'] as int,
      );
}

class NotificationCategoryPrefs {
  const NotificationCategoryPrefs({required this.category, required this.mandatory, required this.channels});
  final String category;
  final bool mandatory;

  /// channel → on
  final Map<String, bool> channels;

  factory NotificationCategoryPrefs.fromJson(Json j) => NotificationCategoryPrefs(
        category: j['category'] as String,
        mandatory: j['mandatory'] as bool,
        channels: {for (final e in (j['channels'] as Json).entries) e.key: e.value as bool},
      );

  NotificationCategoryPrefs withChannel(String channel, bool on) =>
      NotificationCategoryPrefs(category: category, mandatory: mandatory, channels: {...channels, channel: on});

  Json toJson() => {'category': category, 'channels': channels};
}

class QuietHours {
  const QuietHours({required this.enabled, required this.start, required this.end});
  final bool enabled;

  /// "HH:MM", Bahrain time
  final String start;
  final String end;

  factory QuietHours.fromJson(Json j) => QuietHours(enabled: j['enabled'] as bool, start: j['start'] as String, end: j['end'] as String);

  QuietHours copyWith({bool? enabled, String? start, String? end}) =>
      QuietHours(enabled: enabled ?? this.enabled, start: start ?? this.start, end: end ?? this.end);

  Json toJson() => {'enabled': enabled, 'start': start, 'end': end};
}

class NotificationPreferences {
  const NotificationPreferences({required this.channels, required this.categories, required this.quietHours});
  final List<String> channels;
  final List<NotificationCategoryPrefs> categories;
  final QuietHours quietHours;

  factory NotificationPreferences.fromJson(Json j) => NotificationPreferences(
        channels: [for (final c in j['channels'] as List) c as String],
        categories: [for (final c in j['categories'] as List) NotificationCategoryPrefs.fromJson(c as Json)],
        quietHours: QuietHours.fromJson(j['quietHours'] as Json),
      );

  NotificationPreferences copyWith({List<NotificationCategoryPrefs>? categories, QuietHours? quietHours}) =>
      NotificationPreferences(channels: channels, categories: categories ?? this.categories, quietHours: quietHours ?? this.quietHours);

  /// PUT /me/notification-preferences body (the API validates it).
  Json toJson() => {'categories': [for (final c in categories) c.toJson()], 'quietHours': quietHours.toJson()};
}
