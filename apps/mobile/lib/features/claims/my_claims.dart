import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'claims_providers.dart';

/// "My claims" on the account screen (GET /me/claims, same list as the web account page). Hidden when empty.
class MyClaimsSection extends ConsumerWidget {
  const MyClaimsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    return switch (ref.watch(myClaimsProvider)) {
      AsyncData(:final value) when value.isNotEmpty => Column(key: const Key('my-claims'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SectionHeader(l.claimMyClaims),
          for (final c in value)
            Card(
              child: ListTile(
                key: Key('claim-${c.claimNumber}'),
                title: Text('${claimTypeLabel(l, c.type)} · ${l.claimVehicle(c.vehicleReference)}'),
                subtitle: Text('${c.claimNumber} · ${l.claimFiledOn(context.date(c.createdAt))}'),
                trailing: Builder(builder: (context) {
                  final (fg, bg) = claimStatusColors(c.status);
                  return Pill(claimStatusLabel(l, c.status), color: fg, background: bg);
                }),
                onTap: () => context.push('/claims/${c.id}'),
              ),
            ),
        ]),
      _ => const SizedBox.shrink(),
    };
  }
}

/// "I had an accident" button, used on My Garage and on active motor policies.
class AccidentButton extends StatelessWidget {
  const AccidentButton({super.key, required this.query});

  /// e.g. plate=123456 or policyId=pol_…
  final String query;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        style: OutlinedButton.styleFrom(foregroundColor: SahelColors.danger),
        onPressed: () => context.push('/claims/new?$query'),
        icon: const Icon(Icons.car_crash_outlined),
        label: Text(context.l10n.claimAccidentButton),
      );
}
