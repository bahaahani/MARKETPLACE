import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models/insurance.dart';
import '../../core/models/insurance_medical_life.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'insurance_providers.dart';
import 'quote_tile.dart';

/// Life insurance comparison and buying (same API as the web /insurance/life page).
/// Indicative quote only. Beneficiaries are not collected here: they are collected when the policy is issued.
class LifeInsuranceScreen extends ConsumerWidget {
  const LifeInsuranceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(configProvider);
    if (config case AsyncData(:final value)) return _LifeBody(rules: value.life);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.insLifeTitle), actions: const [LanguageButton()]),
      body: AsyncView(value: config, onRetry: () => ref.invalidate(configProvider), data: (_) => const SizedBox.shrink()),
    );
  }
}

/// The form, built from the API's life rules (GET /config insurance.life: limits, steps and starting values).
class _LifeBody extends ConsumerStatefulWidget {
  const _LifeBody({required this.rules});
  final LifeRules rules;

  @override
  ConsumerState<_LifeBody> createState() => _LifeBodyState();
}

class _LifeBodyState extends ConsumerState<_LifeBody> {
  late final LifeRules _rules = widget.rules;
  late DateTime _dob = () {
    final now = DateTime.now();
    return DateTime(now.year - _rules.defaultAge, now.month, now.day);
  }();
  bool _smoker = false;
  // The slider shows the live value; the quote is requested when the finger lifts.
  late int _sumLive = _rules.defaultSumAssuredFils;
  late int _sum = _rules.defaultSumAssuredFils;
  late double _termLive = _rules.defaultTermYears.toDouble();
  late int _term = _rules.defaultTermYears;
  bool _rider = false;
  bool _takafulOnly = false;

  LifeQuery get _query => (dob: isoDate(_dob), smoker: _smoker, sumAssuredFils: _sum, termYears: _term, rider: _rider, takafulOnly: _takafulOnly);

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: _dob, firstDate: DateTime(now.year - 100), lastDate: now);
    if (d != null) setState(() => _dob = d);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = _query;
    final quotes = ref.watch(lifeQuotesProvider(q));
    final steps = (_rules.maxSumAssuredFils - _rules.minSumAssuredFils) ~/ _rules.sumAssuredStepFils;
    return Scaffold(
      appBar: AppBar(title: Text(l.insLifeTitle), actions: const [LanguageButton()]),
      body: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Text(l.insLifeBody, style: const TextStyle(color: SahelColors.textMuted)),
        const SizedBox(height: SahelSpace.sm),
        Card(
          color: SahelColors.brandSoft,
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.sm),
            child: Text(l.insLifeIndicative, key: const Key('life-indicative'), style: const TextStyle(fontSize: 12)),
          ),
        ),
        const SizedBox(height: SahelSpace.sm),
        OutlinedButton.icon(
          key: const Key('life-dob'),
          onPressed: _pickDob,
          icon: const Icon(Icons.cake_outlined),
          label: Text('${l.insLifeDob}: ${context.date(_dob)}'),
        ),
        SwitchListTile(
          key: const Key('smoker'),
          contentPadding: EdgeInsets.zero,
          title: Text(l.insLifeSmoker),
          value: _smoker,
          onChanged: (v) => setState(() => _smoker = v),
        ),
        Text('${l.insLifeSum}: ${context.money(_sumLive, decimals: 0)}', key: const Key('sum-label'), style: const TextStyle(fontWeight: FontWeight.w600)),
        Slider(
          key: const Key('sum-assured'),
          min: _rules.minSumAssuredFils.toDouble(),
          max: _rules.maxSumAssuredFils.toDouble(),
          divisions: steps,
          value: _sumLive.toDouble(),
          onChanged: (v) => setState(() => _sumLive = v.round()),
          onChangeEnd: (v) => setState(() => _sum = v.round()),
        ),
        Text('${l.insLifeTerm}: ${l.insLifeTermYears('${_termLive.round()}')}', key: const Key('term-label'), style: const TextStyle(fontWeight: FontWeight.w600)),
        Slider(
          key: const Key('term-years'),
          min: _rules.minTermYears.toDouble(),
          max: _rules.maxTermYears.toDouble(),
          divisions: _rules.maxTermYears - _rules.minTermYears,
          value: _termLive,
          onChanged: (v) => setState(() => _termLive = v),
          onChangeEnd: (v) => setState(() => _term = v.round()),
        ),
        Text(l.insLifeTermHint('${_rules.maxEndAge}'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
        SwitchListTile(
          key: const Key('ci-rider'),
          contentPadding: EdgeInsets.zero,
          title: Text(l.insLifeRider),
          value: _rider,
          onChanged: (v) => setState(() => _rider = v),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: FilterChip(key: const Key('takaful-only'), label: Text(l.takafulOnly), selected: _takafulOnly, onSelected: (v) => setState(() => _takafulOnly = v)),
        ),
        Card(
          key: const Key('life-quotes'),
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: switch (quotes) {
              AsyncData(:final value) => Column(children: [
                  for (final m in value)
                    InsurerQuoteTile(
                      key: Key('life-quote-${m.insurerId}'),
                      insurerId: m.insurerId,
                      insurerName: m.insurerName,
                      takaful: m.takaful,
                      details: [
                        m.productType == 'family-takaful' ? l.insLifeFamilyTakaful : l.insLifeConventional,
                        l.insLifeSumAssured(context.money(m.sumAssuredFils, decimals: 0)),
                        l.insLifeTermYears('${m.termYears}'),
                        if (m.criticalIllnessRider) l.insLifeRiderShort,
                        l.insLifeMonthly(context.money(m.monthlyPremiumFils)),
                        l.insLifeTotal('${m.termYears}', context.money(m.totalPremiumsFils)),
                      ],
                      price: l.insLifeAnnual(context.money(m.annualPremiumFils)),
                      onBuy: () => buyPolicy(
                        context,
                        ref,
                        line: 'life',
                        insurerId: m.insurerId,
                        input: {
                          'dateOfBirth': q.dob,
                          'smoker': q.smoker,
                          'sumAssuredFils': q.sumAssuredFils,
                          'termYears': q.termYears,
                          'criticalIllnessRider': q.rider,
                        },
                        label: '${l.insLifeTitle} · ${context.loc(m.insurerName)}',
                      ),
                    ),
                ]),
              AsyncError(:final error) => Text(insuranceErrorText(l, error), key: const Key('quote-error'), style: const TextStyle(color: SahelColors.danger)),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
        ),
        const SizedBox(height: SahelSpace.sm),
        Text(l.insLifeBeneficiaryNote, key: const Key('beneficiary-note'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
        const SizedBox(height: SahelSpace.xs),
        Text(l.insSandboxNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      ]),
    );
  }
}
