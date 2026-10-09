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

/// Medical insurance comparison and buying (same API as the web /insurance/medical page).
/// Indicative quote only: ages, limits and prices are validated and computed by the API.
class MedicalInsuranceScreen extends ConsumerWidget {
  const MedicalInsuranceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(configProvider);
    if (config case AsyncData(:final value)) return _MedicalBody(rules: value.medical);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.insMedTitle), actions: const [LanguageButton()]),
      body: AsyncView(value: config, onRetry: () => ref.invalidate(configProvider), data: (_) => const SizedBox.shrink()),
    );
  }
}

/// The form, built from the API's medical rules (GET /config insurance.medical).
class _MedicalBody extends ConsumerStatefulWidget {
  const _MedicalBody({required this.rules});
  final MedicalRules rules;

  @override
  ConsumerState<_MedicalBody> createState() => _MedicalBodyState();
}

DateTime _yearsAgo(int years) {
  final now = DateTime.now();
  return DateTime(now.year - years, now.month, now.day);
}

class _MedicalBodyState extends ConsumerState<_MedicalBody> {
  late final MedicalRules _rules = widget.rules;
  // The API's starting ages: the primary member, a spouse two years younger and a 5-year-old child.
  late DateTime _primary = _yearsAgo(_rules.defaultPrimaryAge);
  DateTime? _spouse;
  final List<DateTime> _children = [];
  late String _tier = _rules.tiers.first;
  late String _nationality = _rules.nationalities.first;
  bool _preExisting = false;
  bool _takafulOnly = false;

  MedicalQuery get _query => (
        primaryDob: isoDate(_primary),
        spouseDob: _spouse == null ? null : isoDate(_spouse!),
        childrenDobs: _children.map(isoDate).join(','),
        tier: _tier,
        nationality: _nationality,
        preExisting: _preExisting,
        takafulOnly: _takafulOnly,
      );

  Future<DateTime?> _pickDob(DateTime initial) {
    final now = DateTime.now();
    return showDatePicker(context: context, initialDate: initial, firstDate: DateTime(now.year - 100), lastDate: now);
  }

  Widget _dobButton(Key key, String label, DateTime value, ValueChanged<DateTime> onPicked) => OutlinedButton.icon(
        key: key,
        onPressed: () async {
          final d = await _pickDob(value);
          if (d != null) onPicked(d);
        },
        icon: const Icon(Icons.cake_outlined),
        label: Text('$label: ${context.date(value)}'),
      );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = _query;
    final quotes = ref.watch(medicalQuotesProvider(q));
    return Scaffold(
      appBar: AppBar(title: Text(l.insMedTitle), actions: const [LanguageButton()]),
      body: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Text(l.insMedBody, style: const TextStyle(color: SahelColors.textMuted)),
        const SizedBox(height: SahelSpace.sm),
        Card(
          color: SahelColors.brandSoft,
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.sm),
            child: Text(l.insMedIndicative, key: const Key('medical-indicative'), style: const TextStyle(fontSize: 12)),
          ),
        ),
        const SizedBox(height: SahelSpace.sm),
        Text(l.insMedMembers, style: const TextStyle(fontWeight: FontWeight.w600)),
        _dobButton(const Key('primary-dob'), l.insMedPrimaryDob, _primary, (d) => setState(() => _primary = d)),
        SwitchListTile(
          key: const Key('add-spouse'),
          contentPadding: EdgeInsets.zero,
          title: Text(l.insMedAddSpouse),
          value: _spouse != null,
          onChanged: (v) => setState(() => _spouse = v ? _yearsAgo(_rules.defaultPrimaryAge - 2) : null),
        ),
        if (_spouse != null) _dobButton(const Key('spouse-dob'), l.insMedSpouseDob, _spouse!, (d) => setState(() => _spouse = d)),
        Text(l.insMedChildren),
        for (var i = 0; i < _children.length; i++)
          Row(key: Key('child-row-$i'), children: [
            Expanded(child: _dobButton(Key('child-dob-$i'), l.insMedChildDob('${i + 1}'), _children[i], (d) => setState(() => _children[i] = d))),
            TextButton(key: Key('remove-child-$i'), onPressed: () => setState(() => _children.removeAt(i)), child: Text(l.insMedRemove)),
          ]),
        // The API enforces the limit (INVALID_MEMBERS); the rules only stop the button once more rows are pointless.
        TextButton.icon(
          key: const Key('add-child'),
          onPressed: _children.length < _rules.maxChildren ? () => setState(() => _children.add(_yearsAgo(5))) : null,
          icon: const Icon(Icons.add),
          label: Text(l.insMedAddChild),
        ),
        const SizedBox(height: SahelSpace.sm),
        Text(l.insMedNationality, style: const TextStyle(fontWeight: FontWeight.w600)),
        Wrap(spacing: 8, children: [
          for (final n in _rules.nationalities)
            ChoiceChip(key: Key('nationality-$n'), label: Text(nationalityLabel(l, n)), selected: _nationality == n, onSelected: (_) => setState(() => _nationality = n)),
        ]),
        Text(l.insMedPlan, style: const TextStyle(fontWeight: FontWeight.w600)),
        Wrap(spacing: 8, children: [
          for (final t in _rules.tiers)
            ChoiceChip(key: Key('tier-$t'), label: Text(medicalTierLabel(l, t)), selected: _tier == t, onSelected: (_) => setState(() => _tier = t)),
          FilterChip(key: const Key('takaful-only'), label: Text(l.takafulOnly), selected: _takafulOnly, onSelected: (v) => setState(() => _takafulOnly = v)),
        ]),
        SwitchListTile(
          key: const Key('pre-existing'),
          contentPadding: EdgeInsets.zero,
          title: Text(l.insMedPreExisting),
          subtitle: Text(l.insMedPreExistingHint, style: const TextStyle(fontSize: 12)),
          value: _preExisting,
          onChanged: (v) => setState(() => _preExisting = v),
        ),
        Card(
          key: const Key('medical-quotes'),
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: switch (quotes) {
              AsyncData(:final value) => Column(children: [
                  for (final m in value)
                    InsurerQuoteTile(
                      key: Key('medical-quote-${m.insurerId}'),
                      insurerId: m.insurerId,
                      insurerName: m.insurerName,
                      takaful: m.takaful,
                      buyable: m.buyable,
                      details: [
                        l.insMedAnnualLimit(context.money(m.annualLimitFils, decimals: 0)),
                        m.coPayPct > 0 ? l.insMedCoPay('${m.coPayPct}') : l.insMedNoCoPay,
                        if (m.inpatient) l.insMedInpatient,
                        if (m.outpatient) l.insMedOutpatient,
                        m.maternityWaitingMonths == null ? l.insMedNoMaternity : l.insMedMaternity('${m.maternityWaitingMonths}'),
                        if (m.dental) l.insMedDental,
                        if (m.optical) l.insMedOptical,
                        l.insMedMembersCount('${m.adults + m.children}'),
                        if (m.preExistingStatus == 'surcharge') l.insMedSurcharge(context.money(m.preExistingSurchargeFils)),
                        if (m.preExistingStatus == 'referred') l.insMedReferred,
                      ],
                      price: l.insMedPerYear(context.money(m.annualPremiumFils)),
                      onBuy: m.buyable
                          ? () => buyPolicy(
                                context,
                                ref,
                                line: 'medical',
                                insurerId: m.insurerId,
                                input: {
                                  'primaryDateOfBirth': q.primaryDob,
                                  'spouseDateOfBirth': ?q.spouseDob,
                                  'childrenDatesOfBirth': q.childrenDobs.isEmpty ? <String>[] : q.childrenDobs.split(','),
                                  'tier': q.tier,
                                  'nationality': q.nationality,
                                  'preExistingConditions': q.preExisting,
                                },
                                label: '${l.insMedTitle} · ${context.loc(m.insurerName)}',
                              )
                          : null,
                    ),
                ]),
              AsyncError(:final error) => Text(insuranceErrorText(l, error), key: const Key('quote-error'), style: const TextStyle(color: SahelColors.danger)),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
        ),
        const SizedBox(height: SahelSpace.sm),
        Text(l.insSandboxNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      ]),
    );
  }
}
