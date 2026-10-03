import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../core/providers.dart';
import '../core/theme/tokens.g.dart';

/// Loading / error / data with a retry button.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.data, this.onRetry});
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => switch (value) {
        AsyncData(:final value) => data(value),
        AsyncError() => Center(
            child: Padding(
              padding: const EdgeInsets.all(SahelSpace.lg),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(context.l10n.errorGeneric, textAlign: TextAlign.center),
                if (onRetry != null) TextButton(onPressed: onRetry, child: Text(context.l10n.retry)),
              ]),
            ),
          ),
        _ => const Center(child: Padding(padding: EdgeInsets.all(SahelSpace.lg), child: CircularProgressIndicator())),
      };
}

/// Language switch shown in app bars.
class LanguageButton extends ConsumerWidget {
  const LanguageButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => TextButton(
        key: const Key('language-switch'),
        onPressed: () => ref.read(localeProvider.notifier).toggle(),
        child: Text(context.l10n.languageSwitch),
      );
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = SahelColors.brand, this.background = SahelColors.brandSoft});
  final String text;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(99)),
        child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

/// Badges on one line; in compact layouts they shrink instead of wrapping.
class PillRow extends StatelessWidget {
  const PillRow(this.pills, {super.key, this.compact = false});
  final List<Widget> pills;
  final bool compact;

  @override
  Widget build(BuildContext context) => compact
      ? Row(children: [for (final p in pills) Flexible(child: Padding(padding: const EdgeInsetsDirectional.only(end: 6), child: p))])
      : Wrap(spacing: 6, runSpacing: 4, children: pills);
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: SahelSpace.lg, bottom: SahelSpace.sm),
        child: Row(children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold))),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
        ]),
      );
}

class KeyValueRow extends StatelessWidget {
  const KeyValueRow(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        // Large amounts (home finance) in a narrow column shrink instead of overflowing.
        child: LayoutBuilder(
          builder: (context, c) => Row(children: [
            Expanded(child: Text(label, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12))),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: c.maxWidth * 0.7),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: AlignmentDirectional.centerEnd,
                child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
              ),
            ),
          ]),
        ),
      );
}
