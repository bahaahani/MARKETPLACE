import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'insurance_quotes.dart';

class InsuranceScreen extends ConsumerWidget {
  const InsuranceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final me = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.navInsurance), actions: const [LanguageButton()]),
      body: AsyncView(
        value: me,
        onRetry: () => ref.invalidate(meProvider),
        data: (me) {
          if (me.garage.isEmpty) return const SizedBox();
          final g = me.garage.first;
          final vehicle = ref.watch(vehicleProvider(g.vehicleId));
          return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            Text('${g.title} · ${l.insuranceExpiry(context.date(g.insuranceExpiry))}', style: const TextStyle(color: SahelColors.textMuted)),
            const SizedBox(height: SahelSpace.sm),
            AsyncView(
              value: vehicle,
              data: (v) => InsuranceQuotes(vehicleValueFils: v.priceFils, reference: g.plate, defaultTakaful: true),
            ),
          ]);
        },
      ),
    );
  }
}
