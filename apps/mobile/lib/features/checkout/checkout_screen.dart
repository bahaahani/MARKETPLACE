import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';

/// Sandbox checkout. Production replaces the "pay" step with the Tap Flutter SDKs
/// (BenefitPay, Apple Pay, Google Pay, Samsung Pay, Click to Pay, card); the backend
/// confirms only after the verified Tap webhook.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, required this.amountFils, required this.purpose, required this.reference, required this.label});

  final int amountFils;
  final String purpose;
  final String reference;
  final String label;

  /// Same query format as the web checkout URL (/{locale}/checkout?...).
  static String link({required String purpose, required int amountFils, required String reference, required String label}) =>
      Uri(path: '/checkout', queryParameters: {'purpose': purpose, 'amount': '$amountFils', 'reference': reference, 'label': label}).toString();

  static Widget fromQuery(Map<String, String> q) {
    final amount = int.tryParse(q['amount'] ?? '');
    if (amount == null || amount <= 0 || q['purpose'] == null || q['reference'] == null) {
      return const _InvalidCheckout();
    }
    return CheckoutScreen(amountFils: amount, purpose: q['purpose']!, reference: q['reference']!, label: q['label'] ?? q['reference']!);
  }

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  PaymentMethod _method = PaymentMethod.benefitpay;
  bool _busy = false;
  bool _error = false;
  Payment? _result;
  // One key per checkout attempt, so a double tap never double-charges.
  final String _idempotencyKey = List.generate(24, (_) => Random.secure().nextInt(16).toRadixString(16)).join();

  Future<void> _pay() async {
    setState(() {
      _busy = true;
      _error = false;
    });
    try {
      final p = await ref.read(repositoryProvider).pay(
            amountFils: widget.amountFils,
            method: _method,
            purpose: widget.purpose,
            reference: widget.reference,
            idempotencyKey: _idempotencyKey,
          );
      if (mounted) setState(() => _result = p);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _methodLabel(PaymentMethod m) {
    final l = context.l10n;
    return switch (m) {
      PaymentMethod.benefitpay => l.methodBenefitpay,
      PaymentMethod.applePay => l.methodApplePay,
      PaymentMethod.googlePay => l.methodGooglePay,
      PaymentMethod.samsungPay => l.methodSamsungPay,
      PaymentMethod.clickToPay => l.methodClickToPay,
      PaymentMethod.card => l.methodCard,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final amount = context.money(widget.amountFils);
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: Text(l.choosePaymentMethod)),
      body: result != null
          ? Center(
              key: const Key('payment-success'),
              child: Padding(
                padding: const EdgeInsets.all(SahelSpace.lg),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const CircleAvatar(radius: 32, backgroundColor: SahelColors.islamicSoft, child: Icon(Icons.check, color: SahelColors.islamic, size: 36)),
                  const SizedBox(height: SahelSpace.md),
                  Text(l.paymentSuccess, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                  Text(amount, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                  Text(widget.label, style: const TextStyle(color: SahelColors.textMuted)),
                  Text(l.paymentReference(result.id), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11, fontFamily: 'monospace')),
                  const SizedBox(height: SahelSpace.lg),
                  FilledButton(onPressed: () => context.go('/account'), child: Text(l.done)),
                ]),
              ),
            )
          : ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
              Text(widget.label, style: const TextStyle(color: SahelColors.textMuted)),
              Text(amount, style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
              const SizedBox(height: SahelSpace.md),
              RadioGroup<PaymentMethod>(
                groupValue: _method,
                onChanged: (m) => setState(() => _method = m ?? _method),
                child: Column(children: [
                  for (final m in PaymentMethod.values)
                    RadioListTile<PaymentMethod>(key: Key('method-${m.wire}'), value: m, title: Text(_methodLabel(m))),
                ]),
              ),
              if (_error) Text(l.errorGeneric, style: const TextStyle(color: SahelColors.danger)),
              const SizedBox(height: SahelSpace.md),
              FilledButton(key: const Key('pay'), onPressed: _busy ? null : _pay, child: Text(l.pay(amount))),
              const SizedBox(height: SahelSpace.sm),
              Text(l.sandboxNotice, textAlign: TextAlign.center, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
            ]),
    );
  }
}

class _InvalidCheckout extends StatelessWidget {
  const _InvalidCheckout();

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(), body: Center(child: Text(context.l10n.errorGeneric)));
}
