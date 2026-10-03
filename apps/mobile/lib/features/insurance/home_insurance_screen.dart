import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'insurance_providers.dart';
import 'quote_tile.dart';

/// Home insurance comparison and buying (same API as the web /insurance/home page).
/// With [propertyId] (from a property listing) the API suggests the sums insured; the form shows what was priced.
class HomeInsuranceScreen extends ConsumerStatefulWidget {
  const HomeInsuranceScreen({super.key, this.propertyId});
  final String? propertyId;

  @override
  ConsumerState<HomeInsuranceScreen> createState() => _HomeInsuranceScreenState();
}

class _HomeInsuranceScreenState extends ConsumerState<HomeInsuranceScreen> {
  static const _types = ['villa', 'apartment', 'townhouse', 'office'];
  String _type = 'villa';
  final _building = TextEditingController(text: '150000');
  final _contents = TextEditingController(text: '20000');
  bool _takafulOnly = false;
  bool _invalid = false;
  late HomeQuery _query = widget.propertyId != null
      ? (propertyType: null, buildingSumInsuredFils: null, contentsSumInsuredFils: null, propertyId: widget.propertyId, takafulOnly: false)
      : (propertyType: 'villa', buildingSumInsuredFils: 150000000, contentsSumInsuredFils: 20000000, propertyId: null, takafulOnly: false);

  @override
  void dispose() {
    _building.dispose();
    _contents.dispose();
    super.dispose();
  }

  /// Plain BHD for an input field ("141000", "12500.5").
  static String _bhdField(int fils) {
    final whole = fils ~/ 1000;
    final frac = (fils % 1000).toString().padLeft(3, '0').replaceFirst(RegExp(r'0+$'), '');
    return frac.isEmpty ? '$whole' : '$whole.$frac';
  }

  void _submit() {
    final b = parseBhdInput(_building.text.isEmpty ? '0' : _building.text);
    final c = parseBhdInput(_contents.text.isEmpty ? '0' : _contents.text);
    setState(() {
      _invalid = b == null || c == null;
      if (!_invalid) {
        _query = (propertyType: _type, buildingSumInsuredFils: b, contentsSumInsuredFils: c, propertyId: widget.propertyId, takafulOnly: _takafulOnly);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final query = _query;
    // Show exactly what the API priced (e.g. the sums suggested from a listing).
    ref.listen(homeQuotesProvider(query), (_, next) {
      if (next case AsyncData(:final value)) {
        setState(() => _type = value.input.propertyType);
        _building.text = _bhdField(value.input.buildingSumInsuredFils);
        _contents.text = _bhdField(value.input.contentsSumInsuredFils);
      }
    });
    final result = ref.watch(homeQuotesProvider(query));
    final linked = switch (result) { AsyncData(:final value) => value.input.propertyTitle, _ => null };
    return Scaffold(
      appBar: AppBar(title: Text(l.insHomeTitle), actions: const [LanguageButton()]),
      body: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Text(l.insHomeBody, style: const TextStyle(color: SahelColors.textMuted)),
        if (linked != null) ...[
          const SizedBox(height: SahelSpace.sm),
          Card(
            color: SahelColors.brandSoft,
            child: Padding(
              padding: const EdgeInsets.all(SahelSpace.sm),
              child: Text(l.insLinkedProperty(context.loc(linked)), key: const Key('linked-property')),
            ),
          ),
        ],
        const SizedBox(height: SahelSpace.md),
        Row(children: [
          Expanded(child: Text(l.insPropertyType)),
          DropdownButton<String>(
            key: const Key('property-type'),
            value: _type,
            items: [for (final t in _types) DropdownMenuItem(value: t, child: Text(propertyTypeLabel(l, t)))],
            onChanged: widget.propertyId != null ? null : (v) => setState(() => _type = v ?? _type),
          ),
        ]),
        TextField(
          key: const Key('building-sum'),
          controller: _building,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: l.insBuildingSum),
        ),
        TextField(
          key: const Key('contents-sum'),
          controller: _contents,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: l.insContentsSum),
        ),
        const SizedBox(height: SahelSpace.sm),
        FilledButton(key: const Key('get-quotes'), onPressed: _submit, child: Text(l.insGetQuotes)),
        const SizedBox(height: SahelSpace.sm),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: FilterChip(
            key: const Key('takaful-only'),
            label: Text(l.takafulOnly),
            selected: _takafulOnly,
            onSelected: (v) => setState(() {
              _takafulOnly = v;
              _query = (
                propertyType: query.propertyType,
                buildingSumInsuredFils: query.buildingSumInsuredFils,
                contentsSumInsuredFils: query.contentsSumInsuredFils,
                propertyId: query.propertyId,
                takafulOnly: v,
              );
            }),
          ),
        ),
        const SizedBox(height: SahelSpace.sm),
        Card(
          key: const Key('home-quotes'),
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: _invalid
                ? Text(l.insErrorSumInsured, key: const Key('quote-error'), style: const TextStyle(color: SahelColors.danger))
                : switch (result) {
                    AsyncData(:final value) => Column(children: [
                        for (final h in value.quotes)
                          InsurerQuoteTile(
                            key: Key('home-quote-${h.insurerId}'),
                            insurerId: h.insurerId,
                            insurerName: h.insurerName,
                            takaful: h.takaful,
                            details: [
                              if (h.buildingSumInsuredFils > 0) l.insBuildingCover(context.money(h.buildingSumInsuredFils, decimals: 0)),
                              if (h.contentsSumInsuredFils > 0) l.insContentsCover(context.money(h.contentsSumInsuredFils, decimals: 0)),
                              if (h.accidentalDamage) l.insAccidentalDamage,
                              if (h.temporaryAccommodation) l.insTempAccommodation,
                            ],
                            price: l.perYear(context.money(h.annualPremiumFils)),
                            onBuy: () => buyPolicy(
                              context,
                              ref,
                              line: 'home',
                              insurerId: h.insurerId,
                              input: value.input.toRequest(),
                              label: '${l.insHomeTitle} · ${context.loc(h.insurerName)}',
                            ),
                          ),
                      ]),
                    AsyncError(:final error) =>
                      Text(insuranceErrorText(l, error), key: const Key('quote-error'), style: const TextStyle(color: SahelColors.danger)),
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
