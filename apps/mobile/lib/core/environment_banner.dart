import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/gen/app_localizations.dart';
import 'config.dart';

/// A small "Sandbox build" / "Staging build" label over every screen on non-prod builds, so a test build is
/// never mistaken for the live app. Added once through the app builder; feature screens do not know about it.
/// It ignores taps and is left out of the accessibility tree (a build marker, not content).
class EnvironmentBanner extends ConsumerWidget {
  const EnvironmentBanner({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    if (!config.features.sandboxBanner) return child;
    final t = AppLocalizations.of(context);
    final label = config.environment == AppEnvironment.staging ? t.mobEnvBannerStaging : t.mobEnvBannerDev;
    final top = MediaQuery.paddingOf(context).top;
    return Stack(
      textDirection: Directionality.of(context),
      children: [
        child,
        PositionedDirectional(
          top: top > 0 ? top - 14 : 0,
          start: 0,
          end: 0,
          child: IgnorePointer(
            child: ExcludeSemantics(
              child: Center(
                child: DecoratedBox(
                  key: const Key('environment-banner'),
                  decoration: BoxDecoration(
                    color: config.environment == AppEnvironment.staging ? const Color(0xFFB45309) : const Color(0xFF6D28D9),
                    borderRadius: const BorderRadius.vertical(bottom: Radius.circular(6)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
                    child: Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        decoration: TextDecoration.none,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
