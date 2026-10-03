import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';

/// Onboarding wizard (journey J1), same steps as the web at /{locale}/onboarding.
/// Every decision is made by the shared API; this screen only collects input and renders results.
/// The consent scopes and how long consent lasts come from GET /api/v1/config.
/// On success the API keeps the customer's financials and pre-approval in the (sandbox) session, so the
/// home, account and cards screens are reloaded to show their own numbers.
/// ⚠️ SANDBOX: eKey, CRB and Open Banking are simulated by the API.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _step = 0;
  final _cpr = TextEditingController();
  final _employer = TextEditingController();
  final _salary = TextEditingController();
  final _obligations = TextEditingController(text: '0');
  final _consents = <String, bool>{};
  EKeyIdentity? _identity;
  OnboardingResult? _result;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _cpr.dispose();
    _employer.dispose();
    _salary.dispose();
    _obligations.dispose();
    super.dispose();
  }

  String _errorText(String code) {
    final l = context.l10n;
    return switch (code) {
      'INVALID_CPR' => l.cprInvalid,
      'INVALID_SALARY' => l.salaryInvalid,
      'INVALID_OBLIGATIONS' => l.obligationsInvalid,
      'CONSENT_REQUIRED' || 'CONSENT_EXPIRED' => l.consentRequired,
      _ => l.errorGeneric,
    };
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _errorText(e.code));
    } catch (_) {
      if (mounted) setState(() => _error = context.l10n.errorGeneric);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _go(int step) => setState(() {
        _error = null;
        _step = step;
      });

  void _login() {
    // Format check only, for instant feedback; the API validates too.
    if (!RegExp(r'^\d{9}$').hasMatch(_cpr.text)) {
      setState(() => _error = context.l10n.cprInvalid);
      return;
    }
    _run(() async {
      final id = await ref.read(repositoryProvider).ekeyLogin(_cpr.text);
      // Keep only the masked CPR from here on.
      _cpr.clear();
      setState(() => _identity = id);
      _go(1);
    });
  }

  void _employment() {
    final salary = parseBhdInput(_salary.text);
    if (salary == null || salary == 0) {
      setState(() => _error = context.l10n.salaryInvalid);
      return;
    }
    if (parseBhdInput(_obligations.text) == null) {
      setState(() => _error = context.l10n.obligationsInvalid);
      return;
    }
    _go(2);
  }

  void _submitConsent() => _run(() async {
        final r = await ref.read(repositoryProvider).preApproval(
              monthlySalaryFils: parseBhdInput(_salary.text)!,
              existingObligationsFils: parseBhdInput(_obligations.text)!,
              employer: _employer.text,
              consentScopes: [for (final e in _consents.entries) if (e.value) e.key],
            );
        refreshCustomer(ref);
        setState(() => _result = r);
        _go(3);
      });

  void _restart() => setState(() {
        _cpr.clear();
        _employer.clear();
        _salary.clear();
        _obligations.text = '0';
        _consents.clear();
        _identity = null;
        _result = null;
        _error = null;
        _step = 0;
      });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    // Stepper builds every step's content, so show the error only in the current one.
    Widget error(int step) => _error == null || step != _step
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: SahelSpace.sm),
            child: Text(_error!, key: const Key('onboarding-error'), style: const TextStyle(color: SahelColors.danger)),
          );
    StepState state(int i) => i < _step ? StepState.complete : StepState.indexed;
    final config = ref.watch(configProvider).value;

    return Scaffold(
      appBar: AppBar(title: Text(l.onboardingTitle)),
      body: Stepper(
        key: const Key('onboarding'),
        currentStep: _step,
        controlsBuilder: (_, _) => const SizedBox.shrink(),
        steps: [
          Step(
            title: Text(l.onboardingStepIdentity),
            isActive: _step >= 0,
            state: state(0),
            content: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TextField(
                key: const Key('cpr-field'),
                controller: _cpr,
                keyboardType: TextInputType.number,
                maxLength: 9,
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(labelText: l.cprLabel, helperText: l.cprHint),
              ),
              error(0),
              const SizedBox(height: SahelSpace.sm),
              FilledButton(key: const Key('ekey-login'), onPressed: _busy ? null : _login, child: Text(l.ekeyLogin)),
              // ⚠️ Sandbox: production opens the eKey app (OIDC) and receives the verified identity.
              _SandboxNote(l.ekeySandboxNote),
            ]),
          ),
          Step(
            title: Text(l.onboardingStepEmployment),
            isActive: _step >= 1,
            state: state(1),
            content: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_identity case final id?)
                Container(
                  key: const Key('ekey-identity'),
                  padding: const EdgeInsets.all(SahelSpace.sm + 4),
                  decoration: BoxDecoration(color: SahelColors.islamicSoft, borderRadius: BorderRadius.circular(SahelRadius.md)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('✓ ${l.ekeyVerified}', style: const TextStyle(color: SahelColors.islamic, fontWeight: FontWeight.w600)),
                    Text('${l.identityName}: ${context.loc(id.name)}'),
                    Text('${l.identityCpr}: ${id.cprMasked}', textDirection: TextDirection.ltr),
                    Text('${l.identityNationality}: ${context.loc(id.nationality)}'),
                  ]),
                ),
              TextField(key: const Key('employer-field'), controller: _employer, decoration: InputDecoration(labelText: l.employerLabel)),
              TextField(
                key: const Key('salary-field'),
                controller: _salary,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(labelText: l.salaryLabel),
              ),
              TextField(
                key: const Key('obligations-field'),
                controller: _obligations,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(labelText: l.obligationsLabel, helperText: l.obligationsHint),
              ),
              error(1),
              const SizedBox(height: SahelSpace.sm),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => _go(0), child: Text(l.back))),
                const SizedBox(width: SahelSpace.sm),
                Expanded(
                  child: FilledButton(key: const Key('employment-continue'), onPressed: _employment, child: Text(l.continueAction)),
                ),
              ]),
            ]),
          ),
          Step(
            title: Text(l.onboardingStepConsent),
            isActive: _step >= 2,
            state: state(2),
            content: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(l.consentIntro),
              if (config == null) const Center(child: CircularProgressIndicator()),
              for (final s in config?.consentScopes ?? const <String>[])
                CheckboxListTile(
                  key: Key('consent-$s'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _consents[s] ?? false,
                  onChanged: (v) => setState(() => _consents[s] = v ?? false),
                  title: Text(s == 'CRB' ? l.consentCrbTitle : l.consentObTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(s == 'CRB' ? l.consentCrbBody : l.consentObBody),
                ),
              if (config != null) Text('⏱ ${l.consentExpiry('${config.consentValidityDays}')}'),
              error(2),
              const SizedBox(height: SahelSpace.sm),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => _go(1), child: Text(l.back))),
                const SizedBox(width: SahelSpace.sm),
                Expanded(
                  child: FilledButton(
                    key: const Key('see-preapproval'),
                    onPressed: _busy ? null : _submitConsent,
                    child: Text(l.seePreApproval, textAlign: TextAlign.center),
                  ),
                ),
              ]),
              // ⚠️ Sandbox: no CRB pull or Open Banking (AISP) call happens.
              _SandboxNote(l.consentSandboxNote),
            ]),
          ),
          Step(
            title: Text(l.onboardingStepResult),
            isActive: _step >= 3,
            state: _result != null ? StepState.complete : StepState.indexed,
            content: _result == null ? const SizedBox.shrink() : _Result(result: _result!, identity: _identity, onRestart: _restart),
          ),
        ],
      ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.result, required this.identity, required this.onRestart});
  final OnboardingResult result;
  final EKeyIdentity? identity;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final pa = result.preApproval;
    String limitLabel(String line) => switch (line) {
          'vehicle' => l.preApprovalVehicle,
          'personal' => l.preApprovalPersonal,
          _ => l.preApprovalHome,
        };
    return Column(key: const Key('onboarding-result'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(SahelSpace.md),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(SahelRadius.lg),
          gradient: const LinearGradient(colors: [SahelColors.brandDark, SahelColors.brand]),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (identity != null) Text(l.greeting(context.loc(identity!.name)), style: const TextStyle(color: Colors.white70)),
          Text(l.preApprovedTitle, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
          Text(l.preApprovedSubtitle(context.date(pa.validUntil)), style: const TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: SahelSpace.sm),
          Text(
            l.maxMonthlyAffordable(context.money(pa.maxMonthlyFils, decimals: 0)),
            key: const Key('max-monthly'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: SahelSpace.sm),
          for (final lim in pa.limits)
            _ResultRow(limitLabel(lim.productLine), l.upTo(context.money(lim.maxFinanceFils, decimals: 0)), key: Key('limit-${lim.productLine}')),
          _ResultRow(l.preApprovalCard, context.money(pa.cardLimitFils, decimals: 0), key: const Key('limit-card')),
        ]),
      ),
      if (pa.maxMonthlyFils == 0)
        Padding(padding: const EdgeInsets.only(top: SahelSpace.sm), child: Text(l.noHeadroom, style: const TextStyle(color: SahelColors.danger))),
      const SizedBox(height: SahelSpace.sm),
      Text(l.consentValidUntil(context.date(result.consent.expiresAt)), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      const SizedBox(height: SahelSpace.sm),
      FilledButton(
        key: const Key('browse-budget'),
        onPressed: () => context.go(pa.maxMonthlyFils > 0 ? '/cars?maxMonthlyFils=${pa.maxMonthlyFils}' : '/cars'),
        child: Text(l.browseCarsBudget),
      ),
      OutlinedButton(onPressed: () => context.go('/cards'), child: Text(l.navCards)),
      TextButton(onPressed: onRestart, child: Text(l.startOver)),
      Text('⚠️ ${l.illustrativeDisclaimer}', textAlign: TextAlign.center, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
    ]);
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ]),
      );
}

/// Visible "Sandbox" marker on simulated steps.
class _SandboxNote extends StatelessWidget {
  const _SandboxNote(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: SahelSpace.sm),
        child: Text('⚠️ $text', textAlign: TextAlign.center, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      );
}
