import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'notifications_models.dart';
import 'notifications_providers.dart';

/// Channel switches per category and quiet hours (PUT /me/notification-preferences). The API enforces every rule
/// (mandatory categories keep a channel, valid times); this screen shows its answer.
class NotificationPreferencesScreen extends ConsumerWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: Text(context.l10n.notifPrefsTitle)),
        body: AsyncView(
          value: ref.watch(notificationPreferencesProvider),
          onRetry: () => ref.invalidate(notificationPreferencesProvider),
          data: (prefs) => _PreferencesForm(initial: prefs),
        ),
      );
}

class _PreferencesForm extends ConsumerStatefulWidget {
  const _PreferencesForm({required this.initial});
  final NotificationPreferences initial;

  @override
  ConsumerState<_PreferencesForm> createState() => _PreferencesFormState();
}

enum _Status { idle, busy, saved, mandatory, error }

class _PreferencesFormState extends ConsumerState<_PreferencesForm> {
  late NotificationPreferences prefs = widget.initial;
  _Status status = _Status.idle;

  void _toggle(NotificationCategoryPrefs c, String channel, bool on) => setState(() {
        status = _Status.idle;
        prefs = prefs.copyWith(categories: [for (final x in prefs.categories) x.category == c.category ? x.withChannel(channel, on) : x]);
      });

  Future<void> _pickTime(bool start) async {
    final current = start ? prefs.quietHours.start : prefs.quietHours.end;
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.parse(current.substring(0, 2)), minute: int.parse(current.substring(3, 5))),
    );
    if (picked == null) return;
    final hhmm = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    setState(() => prefs = prefs.copyWith(quietHours: start ? prefs.quietHours.copyWith(start: hhmm) : prefs.quietHours.copyWith(end: hhmm)));
  }

  Future<void> _save() async {
    setState(() => status = _Status.busy);
    try {
      final saved = await ref.read(repositoryProvider).saveNotificationPreferences(prefs);
      ref.invalidate(notificationsProvider);
      setState(() {
        prefs = saved;
        status = _Status.saved;
      });
    } on ApiException catch (e) {
      setState(() => status = e.code == 'MANDATORY_CATEGORY' ? _Status.mandatory : _Status.error);
    } catch (_) {
      setState(() => status = _Status.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    const muted = TextStyle(fontSize: 12, color: SahelColors.textMuted);
    return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
      Text(l.notifPrefsIntro),
      for (final c in prefs.categories)
        Card(
          key: Key('notif-pref-${c.category}'),
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.sm),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(notificationCategoryLabel(l, c.category), style: const TextStyle(fontWeight: FontWeight.bold)),
              if (c.mandatory) Text('⚠️ ${l.notifPrefsMandatory}', style: muted),
              Wrap(spacing: 6, children: [
                for (final ch in prefs.channels)
                  FilterChip(
                    key: Key('notif-pref-${c.category}-$ch'),
                    label: Text(notificationChannelLabel(l, ch)),
                    selected: c.channels[ch] ?? false,
                    onSelected: (on) => _toggle(c, ch, on),
                  ),
              ]),
            ]),
          ),
        ),
      SectionHeader(l.notifPrefsQuietHours),
      Text(l.notifPrefsQuietHoursHint, style: muted),
      SwitchListTile(
        key: const Key('notif-quiet-enabled'),
        contentPadding: EdgeInsets.zero,
        title: Text(l.notifPrefsQuietEnabled),
        value: prefs.quietHours.enabled,
        onChanged: (on) => setState(() => prefs = prefs.copyWith(quietHours: prefs.quietHours.copyWith(enabled: on))),
      ),
      Row(children: [
        Expanded(
          child: OutlinedButton(
            key: const Key('notif-quiet-start'),
            onPressed: prefs.quietHours.enabled ? () => _pickTime(true) : null,
            child: Text('${l.notifPrefsQuietFrom} ${prefs.quietHours.start}'),
          ),
        ),
        const SizedBox(width: SahelSpace.sm),
        Expanded(
          child: OutlinedButton(
            key: const Key('notif-quiet-end'),
            onPressed: prefs.quietHours.enabled ? () => _pickTime(false) : null,
            child: Text('${l.notifPrefsQuietTo} ${prefs.quietHours.end}'),
          ),
        ),
      ]),
      const SizedBox(height: SahelSpace.md),
      FilledButton(
        key: const Key('notif-prefs-save'),
        onPressed: status == _Status.busy ? null : _save,
        child: Text(l.notifPrefsSave),
      ),
      const SizedBox(height: SahelSpace.sm),
      Text(
        switch (status) {
          _Status.saved => '✓ ${l.notifPrefsSaved}',
          _Status.mandatory => l.notifPrefsErrorMandatory,
          _Status.error => l.errorGeneric,
          _ => '',
        },
        key: const Key('notif-prefs-status'),
        style: TextStyle(color: status == _Status.saved ? SahelColors.islamic : SahelColors.danger),
      ),
      const SizedBox(height: SahelSpace.md),
      Text('⚠️ ${l.notifPrefsSandboxNote}', style: muted),
    ]);
  }
}
