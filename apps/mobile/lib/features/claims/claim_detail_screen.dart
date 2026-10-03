import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'claims_models.dart';
import 'claims_providers.dart';

/// Date and time in Bahrain (UTC+3, no daylight saving), as the web timeline shows them.
String bahrainDateTime(BuildContext context, DateTime instant) =>
    DateFormat.yMMMd(context.lang).add_Hm().format(instant.toUtc().add(const Duration(hours: 3)));

/// Claim detail: status timeline, sandbox estimate, garage, replacement car. Mirrors /{locale}/claims/{id} on the web.
class ClaimDetailScreen extends ConsumerStatefulWidget {
  const ClaimDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ClaimDetailScreen> createState() => _ClaimDetailScreenState();
}

class _ClaimDetailScreenState extends ConsumerState<ClaimDetailScreen> {
  bool _busy = false;
  bool _error = false;
  Claim? _updated;

  Future<void> _run(Future<Claim> Function() action) async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final c = await action();
      ref.invalidate(myClaimsProvider);
      if (mounted) setState(() => _updated = c);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final repo = ref.read(repositoryProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.claimProgress), actions: const [LanguageButton()]),
      body: AsyncView(
        value: ref.watch(claimProvider(widget.id)),
        onRetry: () => ref.invalidate(claimProvider(widget.id)),
        data: (fetched) {
          final c = _updated ?? fetched;
          final e = c.estimate;
          final (fg, bg) = claimStatusColors(c.status);
          final forward = c.nextStatuses.where((s) => s != 'REJECTED').firstOrNull;
          return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
            Text('${claimTypeLabel(l, c.type)} · ${l.claimVehicle(c.vehicleReference)}', style: const TextStyle(color: SahelColors.textMuted)),
            Row(children: [
              Expanded(
                child: Text(l.claimTitle(c.claimNumber),
                    key: const Key('claim-number'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
              ),
              Pill(claimStatusLabel(l, c.status), key: Key('claim-status-${c.status}'), color: fg, background: bg),
            ]),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(l.insPolicyNumber(c.policyNumber), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11, fontFamily: 'monospace')),
            ),
            const SizedBox(height: SahelSpace.md),
            Card(
              key: const Key('claim-estimate'),
              child: Padding(
                padding: const EdgeInsets.all(SahelSpace.md),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.claimEstimateTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(
                    e.totalLoss ? context.money(e.estimateFils) : l.claimEstimateRange(context.money(e.lowFils), context.money(e.highFils)),
                    key: const Key('claim-estimate-range'),
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  if (e.totalLoss) Text(l.claimEstimateTotalLoss),
                  if (c.approvedAmountFils != null) Text('${l.claimApprovedAmount}: ${context.money(c.approvedAmountFils!)}', key: const Key('claim-approved-amount')),
                  const SizedBox(height: SahelSpace.sm),
                  Container(
                    padding: const EdgeInsets.all(SahelSpace.sm),
                    decoration: BoxDecoration(color: const Color(0x1AE8A317), borderRadius: BorderRadius.circular(SahelRadius.sm)),
                    child: Text('⚠️ ${l.claimEstimateNotAi}', key: const Key('estimate-not-ai'), style: const TextStyle(fontSize: 12, color: Color(0xFF8A5C00))),
                  ),
                ]),
              ),
            ),
            if (c.garage != null || c.canBookGarage || (!e.totalLoss && c.status != 'REJECTED' && c.status != 'SETTLED'))
              Card(
                key: const Key('claim-garage'),
                child: Padding(
                  padding: const EdgeInsets.all(SahelSpace.md),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l.claimGarageTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                    if (c.garage != null)
                      Text('✓ ${l.claimGarageBooked(context.loc(c.garage!.name))}',
                          key: const Key('garage-booked'), style: const TextStyle(color: SahelColors.islamic, fontWeight: FontWeight.w600))
                    else if (c.canBookGarage) ...[
                      if (c.agencyRepair) Text(l.claimGarageAgencyHint, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
                      for (final g in c.garageOptions)
                        ListTile(
                          key: Key('garage-${g.id}'),
                          contentPadding: EdgeInsets.zero,
                          title: Text(context.loc(g.name)),
                          subtitle: Text(context.loc(g.area)),
                          leading: g.agency ? Pill(l.claimGarageAgency) : null,
                          trailing: OutlinedButton(
                            key: Key('book-${g.id}'),
                            onPressed: _busy ? null : () => _run(() => repo.bookClaimGarage(c.id, g.id)),
                            child: Text(l.claimGarageBook),
                          ),
                        ),
                    ] else
                      Text(l.claimGarageAfterApproval, style: const TextStyle(color: SahelColors.textMuted)),
                  ]),
                ),
              ),
            if (c.replacementCar.offered)
              Card(
                key: const Key('replacement-car'),
                child: ListTile(
                  leading: const Icon(Icons.directions_car_outlined, color: SahelColors.islamic),
                  title: Text(l.claimReplacementTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(
                    '${l.claimReplacementBody(context.loc(c.replacementCar.provider), context.loc(c.replacementCar.vehicleClass), '${c.replacementCar.days}')}\n${l.claimReplacementNote}',
                  ),
                ),
              ),
            SectionHeader(l.claimProgress),
            for (final s in c.progress)
              ListTile(
                key: Key('claim-step-${s.status}'),
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  s.done ? (s.status == 'REJECTED' ? Icons.cancel : Icons.check_circle) : Icons.radio_button_unchecked,
                  color: s.done ? (s.status == 'REJECTED' ? SahelColors.danger : SahelColors.islamic) : SahelColors.textMuted,
                ),
                title: Text(claimStatusLabel(l, s.status),
                    style: TextStyle(fontWeight: s.current ? FontWeight.bold : FontWeight.normal, color: s.done ? null : SahelColors.textMuted)),
                subtitle: s.at == null ? null : Text(bahrainDateTime(context, s.at!)),
              ),
            SectionHeader(l.claimDetails),
            _Detail(l.claimIncident, bahrainDateTime(context, c.incidentAt)),
            _Detail(l.claimLocation, c.location),
            _Detail(l.claimSeverity, claimSeverityLabel(l, c.severity)),
            _Detail(l.claimPhotos, l.claimPhotosReceived('${c.photoCount}')),
            Text(c.thirdPartyInvolved ? l.claimThirdPartyYes : l.claimThirdPartyNo),
            if (c.policeReportNumber != null) Text(l.claimPoliceReportNumber(c.policeReportNumber!)),
            const SizedBox(height: SahelSpace.xs),
            Text(c.description, style: const TextStyle(color: SahelColors.textMuted)),
            if (c.nextStatuses.isNotEmpty) ...[
              const SizedBox(height: SahelSpace.md),
              Card(
                key: const Key('sandbox-advance'),
                color: SahelColors.background,
                child: Padding(
                  padding: const EdgeInsets.all(SahelSpace.md),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('⚠️ ${l.claimSandboxAdvanceNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
                    Wrap(spacing: 8, children: [
                      if (forward != null)
                        OutlinedButton(
                          key: const Key('advance'),
                          onPressed: _busy ? null : () => _run(() => repo.advanceClaim(c.id, to: forward)),
                          child: Text(l.claimSandboxAdvance),
                        ),
                      if (c.nextStatuses.contains('REJECTED'))
                        OutlinedButton(
                          key: const Key('reject'),
                          onPressed: _busy ? null : () => _run(() => repo.advanceClaim(c.id, to: 'REJECTED')),
                          child: Text(l.claimSandboxReject, style: const TextStyle(color: SahelColors.danger)),
                        ),
                    ]),
                  ]),
                ),
              ),
            ],
            if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
            const SizedBox(height: SahelSpace.sm),
            Text('⚠️ ${l.claimSandboxNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
          ]);
        },
      ),
    );
  }
}

/// Label and value; long values (a location) wrap instead of overflowing.
class _Detail extends StatelessWidget {
  const _Detail(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(label, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12))),
          Flexible(flex: 2, child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12))),
        ]),
      );
}
