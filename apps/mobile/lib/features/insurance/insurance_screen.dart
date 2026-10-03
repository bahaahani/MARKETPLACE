import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'insurance_quotes.dart';

/// Insurance hub: motor, travel and home, each comparing several insurers (Tasheelat Insurance is a broker).
/// Same layout as the web /insurance page.
class InsuranceScreen extends ConsumerStatefulWidget {
  const InsuranceScreen({super.key});

  @override
  ConsumerState<InsuranceScreen> createState() => _InsuranceScreenState();
}

class _InsuranceScreenState extends ConsumerState<InsuranceScreen> {
  final _motorKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final me = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.navInsurance), actions: const [LanguageButton()]),
      body: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Text(l.insHubSubtitle, style: const TextStyle(color: SahelColors.textMuted)),
        const SizedBox(height: SahelSpace.sm),
        _LineCard(
          key: const Key('insurance-line-motor'),
          icon: Icons.directions_car_outlined,
          title: l.insMotorTitle,
          body: l.insMotorBody,
          onTap: () {
            final target = _motorKey.currentContext;
            if (target != null) Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 300));
          },
        ),
        _LineCard(
          key: const Key('insurance-line-travel'),
          icon: Icons.flight_takeoff,
          title: l.insTravelTitle,
          body: l.insTravelBody,
          onTap: () => context.push('/insurance/travel'),
        ),
        _LineCard(
          key: const Key('insurance-line-home'),
          icon: Icons.home_outlined,
          title: l.insHomeTitle,
          body: l.insHomeBody,
          onTap: () => context.push('/insurance/home'),
        ),
        const SizedBox(height: SahelSpace.md),
        AsyncView(
          value: me,
          onRetry: () => ref.invalidate(meProvider),
          data: (me) {
            if (me.garage.isEmpty) return const SizedBox();
            final g = me.garage.first;
            return Column(key: _motorKey, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${g.title} · ${l.insuranceExpiry(context.date(g.insuranceExpiry))}', style: const TextStyle(color: SahelColors.textMuted)),
              const SizedBox(height: SahelSpace.sm),
              AsyncView(
                value: ref.watch(vehicleProvider(g.vehicleId)),
                data: (v) => InsuranceQuotes(vehicleValueFils: v.priceFils, reference: g.plate, defaultTakaful: true),
              ),
            ]);
          },
        ),
        const SizedBox(height: SahelSpace.sm),
        Text(l.insSandboxNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      ]),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({super.key, required this.icon, required this.title, required this.body, required this.onTap});
  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: Icon(icon, color: SahelColors.brand),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text(body),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}
