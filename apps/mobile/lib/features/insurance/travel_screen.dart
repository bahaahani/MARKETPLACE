import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models/insurance.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'insurance_providers.dart';
import 'quote_tile.dart';

/// Travel insurance comparison and buying (same API as the web /insurance/travel page).
/// Dates, traveller limits and prices are validated and computed by the API.
class TravelInsuranceScreen extends ConsumerStatefulWidget {
  const TravelInsuranceScreen({super.key});

  @override
  ConsumerState<TravelInsuranceScreen> createState() => _TravelInsuranceScreenState();
}

class _TravelInsuranceScreenState extends ConsumerState<TravelInsuranceScreen> {
  static const _regions = ['gcc', 'worldwide-excl-us-ca', 'worldwide'];
  String _region = 'gcc';
  String _tier = 'basic';
  // A week-long trip starting a week from today, as a starting point.
  late DateTimeRange _dates = () {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day + 7);
    return DateTimeRange(start: start, end: DateTime(start.year, start.month, start.day + 6));
  }();
  int _adults = 1;
  int _children = 0;
  bool _takafulOnly = false;

  TravelQuery get _query => (
        region: _region,
        tier: _tier,
        startDate: isoDate(_dates.start),
        endDate: isoDate(_dates.end),
        adults: _adults,
        children: _children,
        takafulOnly: _takafulOnly,
      );

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2, now.month, now.day),
      initialDateRange: _dates,
    );
    if (picked != null) setState(() => _dates = picked);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = _query;
    final quotes = ref.watch(travelQuotesProvider(q));
    return Scaffold(
      appBar: AppBar(title: Text(l.insTravelTitle), actions: const [LanguageButton()]),
      body: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Text(l.insTravelBody, style: const TextStyle(color: SahelColors.textMuted)),
        const SizedBox(height: SahelSpace.md),
        Text(l.insDestination, style: const TextStyle(fontWeight: FontWeight.w600)),
        Wrap(spacing: 8, children: [
          for (final r in _regions)
            ChoiceChip(key: Key('region-$r'), label: Text(regionLabel(l, r)), selected: _region == r, onSelected: (_) => setState(() => _region = r)),
        ]),
        const SizedBox(height: SahelSpace.sm),
        OutlinedButton.icon(
          key: const Key('trip-dates'),
          onPressed: _pickDates,
          icon: const Icon(Icons.date_range),
          label: Text('${l.insTripStart}: ${context.date(_dates.start)} · ${l.insTripEnd}: ${context.date(_dates.end)}'),
        ),
        _Counter(key: const Key('adults'), label: l.insAdults, value: _adults, onChanged: (v) => setState(() => _adults = v)),
        _Counter(key: const Key('children'), label: l.insChildren, value: _children, onChanged: (v) => setState(() => _children = v)),
        Text(l.insTier, style: const TextStyle(fontWeight: FontWeight.w600)),
        Wrap(spacing: 8, children: [
          for (final t in ['basic', 'plus'])
            ChoiceChip(key: Key('tier-$t'), label: Text(tierLabel(l, t)), selected: _tier == t, onSelected: (_) => setState(() => _tier = t)),
          FilterChip(key: const Key('takaful-only'), label: Text(l.takafulOnly), selected: _takafulOnly, onSelected: (v) => setState(() => _takafulOnly = v)),
        ]),
        const SizedBox(height: SahelSpace.sm),
        Card(
          key: const Key('travel-quotes'),
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: switch (quotes) {
              AsyncData(:final value) => Column(children: [
                  for (final t in value)
                    InsurerQuoteTile(
                      key: Key('travel-quote-${t.insurerId}'),
                      insurerId: t.insurerId,
                      insurerName: t.insurerName,
                      takaful: t.takaful,
                      details: [
                        l.insTripDays('${t.days}'),
                        l.insTravellersCount('${t.adults + t.children}'),
                        l.insMedicalCover(context.money(t.medicalCoverFils, decimals: 0)),
                        if (t.schengenCompliant) l.insSchengen,
                      ],
                      price: l.insTotalPremium(context.money(t.premiumFils)),
                      onBuy: () => buyPolicy(
                        context,
                        ref,
                        line: 'travel',
                        insurerId: t.insurerId,
                        input: {
                          'region': q.region,
                          'tier': q.tier,
                          'startDate': q.startDate,
                          'endDate': q.endDate,
                          'adults': q.adults,
                          'children': q.children,
                        },
                        label: '${l.insTravelTitle} · ${context.loc(t.insurerName)}',
                      ),
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

/// Plus / minus counter. Limits are enforced by the API; the counter only stops at zero.
class _Counter extends StatelessWidget {
  const _Counter({super.key, required this.label, required this.value, required this.onChanged});
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(child: Text(label)),
        IconButton(key: const Key('minus'), onPressed: value > 0 ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove_circle_outline)),
        Text('$value', style: const TextStyle(fontWeight: FontWeight.bold)),
        IconButton(key: const Key('plus'), onPressed: () => onChanged(value + 1), icon: const Icon(Icons.add_circle_outline)),
      ]);
}
