import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';

/// Terms to apply for. Vehicle: vehicleId + downPaymentFils. Home: propertyId + downPaymentFils. Personal: amountFils.
typedef ApplicationTerms = ({
  String productLine,
  FinanceStructure structure,
  int tenureMonths,
  String? vehicleId,
  String? propertyId,
  int? downPaymentFils,
  int? amountFils,
});

/// "Apply for finance": POST /api/v1/applications (same API as the web), then opens /applications/:id.
/// One idempotency key per set of terms, so a double tap never creates two applications.
class ApplyButton extends ConsumerStatefulWidget {
  const ApplyButton({super.key, required this.terms, this.filled = true, this.label});

  /// Null while the terms are not known yet (button disabled).
  final ApplicationTerms? terms;
  final bool filled;

  /// Button text; defaults to "Apply for finance".
  final String? label;

  @override
  ConsumerState<ApplyButton> createState() => _ApplyButtonState();
}

class _ApplyButtonState extends ConsumerState<ApplyButton> {
  bool _busy = false;
  bool _error = false;
  ApplicationTerms? _keyedTerms;
  String _key = '';

  String _idempotencyKey(ApplicationTerms terms) {
    if (terms != _keyedTerms) {
      _keyedTerms = terms;
      _key = List.generate(24, (_) => Random.secure().nextInt(16).toRadixString(16)).join();
    }
    return _key;
  }

  Future<void> _apply(ApplicationTerms t) async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final app = await ref.read(repositoryProvider).applyForFinance(
            productLine: t.productLine,
            structure: t.structure,
            tenureMonths: t.tenureMonths,
            vehicleId: t.vehicleId,
            propertyId: t.propertyId,
            downPaymentFils: t.downPaymentFils,
            amountFils: t.amountFils,
            idempotencyKey: _idempotencyKey(t),
          );
      ref.invalidate(applicationsProvider);
      if (mounted) context.push('/applications/${app.id}');
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final terms = widget.terms;
    final onPressed = terms == null || _busy ? null : () => _apply(terms);
    final label = Text(widget.label ?? l.applyFinance);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      widget.filled
          ? FilledButton(key: const Key('apply-finance'), onPressed: onPressed, child: label)
          : OutlinedButton(key: const Key('apply-finance'), onPressed: onPressed, child: label),
      if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
      const SizedBox(height: 4),
      Text(l.applyConsent, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
    ]);
  }
}
