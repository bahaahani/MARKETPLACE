import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import 'bids_models.dart';
import 'bids_providers.dart';

/// "Bid For Me": post what you want and how you'll pay (same API as the web /requests/new page). Options and limits come
/// from GET /config `bids`; the API checks the maximum monthly against the DBR headroom and prices every offer.
class NewBidRequestScreen extends ConsumerWidget {
  const NewBidRequestScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final config = ref.watch(configProvider);
    final mine = ref.watch(myBidRequestsProvider);
    final rules = config.value?.bids;
    final open = mine.value?.where((r) => r.open).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(l.bidEntryTitle), actions: const [LanguageButton()]),
      body: rules == null || !mine.hasValue
          ? AsyncView(
              value: config.hasError ? config : mine,
              onRetry: () {
                ref.invalidate(configProvider);
                ref.invalidate(myBidRequestsProvider);
              },
              data: (_) => const SizedBox.shrink(),
            )
          : open != null
              ? ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
                  Card(
                    key: const Key('bid-open-exists'),
                    child: Padding(
                      padding: const EdgeInsets.all(SahelSpace.md),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(l.bidOpenExists),
                        const SizedBox(height: SahelSpace.sm),
                        FilledButton(onPressed: () => context.pushReplacement('/requests/${open.id}'), child: Text(l.bidViewOpen)),
                      ]),
                    ),
                  ),
                ])
              : !rules.canPost
                  ? ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [Text(l.bidNoBudget, key: const Key('bid-no-budget'))])
                  : _BidForm(rules: rules),
    );
  }
}

class _BidForm extends ConsumerStatefulWidget {
  const _BidForm({required this.rules});
  final BidRules rules;

  @override
  ConsumerState<_BidForm> createState() => _BidFormState();
}

class _BidFormState extends ConsumerState<_BidForm> {
  late final BidRules _r = widget.rules;
  String _body = 'any';
  String _condition = 'any';
  String _fuel = 'any';
  int? _minYear;
  int? _maxMileageKm;
  int? _minSeats;
  late String _structure = _r.structures.contains('murabaha') ? 'murabaha' : _r.structures.first;
  late int _tenure = _r.defaultTenureMonths;
  late bool _useTradeIn = _r.tradeIn != null;
  late String _insurance = _r.insurancePreferences.first;
  late final _monthly = TextEditingController(text: '${_r.defaultMonthlyFils ~/ 1000}');
  final _down = TextEditingController(text: '2000');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _monthly.dispose();
    _down.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = context.l10n;
    final monthly = parseBhdInput(_monthly.text);
    final down = parseBhdInput(_down.text.isEmpty ? '0' : _down.text);
    if (monthly == null || down == null) {
      setState(() => _error = l.errorGeneric);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(repositoryProvider).createBidRequest(BidRequestDraft(
            bodyType: _body,
            condition: _condition,
            fuel: _fuel,
            minYear: _minYear,
            maxMileageKm: _maxMileageKm,
            minSeats: _minSeats,
            maxMonthlyFils: monthly,
            structure: _structure,
            tenureMonths: _tenure,
            downPaymentFils: down,
            useTradeIn: _useTradeIn && _r.tradeIn != null,
            insurance: _insurance,
          ));
      ref.invalidate(myBidRequestsProvider);
      if (mounted) context.pushReplacement('/requests/${r.id}');
    } catch (e) {
      if (mounted) setState(() => _error = bidErrorText(l, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _chips(String prefix, List<String> options, String selected, String Function(String) label, void Function(String) onPick) => Wrap(
        spacing: 6,
        runSpacing: 4,
        children: [
          for (final o in options)
            ChoiceChip(key: Key('$prefix-$o'), label: Text(label(o)), selected: selected == o, onSelected: (_) => setState(() => onPick(o))),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    const h = TextStyle(fontWeight: FontWeight.bold);
    return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
      Text(l.bidNewTitle, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
      Text(l.bidNewSubtitle, style: const TextStyle(color: SahelColors.textMuted)),
      SectionHeader(l.bidSectionCar),
      Text(l.bidBodyType, style: h),
      _chips('bid-body', ['any', ..._r.bodyTypes], _body, (v) => bidBodyLabel(l, v), (v) => _body = v),
      const SizedBox(height: SahelSpace.sm),
      Text(l.bidCondition, style: h),
      _chips('bid-condition', _r.conditions, _condition, (v) => bidConditionLabel(l, v), (v) => _condition = v),
      const SizedBox(height: SahelSpace.sm),
      Text(l.bidFuel, style: h),
      _chips('bid-fuel', ['any', ..._r.fuels], _fuel, (v) => bidFuelLabel(l, v), (v) => _fuel = v),
      const SizedBox(height: SahelSpace.sm),
      DropdownButtonFormField<int?>(
        key: const Key('bid-min-year'),
        initialValue: _minYear,
        decoration: InputDecoration(labelText: l.bidMinYear),
        items: [
          DropdownMenuItem(value: null, child: Text(l.bidAny)),
          for (var y = _r.maxYear; y >= _r.minYear; y--) DropdownMenuItem(value: y, child: Text('$y')),
        ],
        onChanged: (v) => setState(() => _minYear = v),
      ),
      DropdownButtonFormField<int?>(
        key: const Key('bid-max-mileage'),
        initialValue: _maxMileageKm,
        decoration: InputDecoration(labelText: l.bidMaxMileage),
        items: [
          DropdownMenuItem(value: null, child: Text(l.bidAny)),
          for (final km in _r.mileageOptionsKm) DropdownMenuItem(value: km, child: Text(l.km(context.number(km)))),
        ],
        onChanged: (v) => setState(() => _maxMileageKm = v),
      ),
      DropdownButtonFormField<int?>(
        key: const Key('bid-seats'),
        initialValue: _minSeats,
        decoration: InputDecoration(labelText: l.bidSeats),
        items: [
          DropdownMenuItem(value: null, child: Text(l.bidAny)),
          for (final s in _r.seatOptions) DropdownMenuItem(value: s, child: Text(l.bidSeatsAtLeast('$s'))),
        ],
        onChanged: (v) => setState(() => _minSeats = v),
      ),
      SectionHeader(l.bidSectionFinance),
      TextField(
        key: const Key('bid-max-monthly'),
        controller: _monthly,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: '${l.bidMaxMonthly} (BHD)', helperText: l.bidMaxMonthlyHint(context.money(_r.maxMonthlyFils, decimals: 0))),
      ),
      const SizedBox(height: SahelSpace.sm),
      Text(l.bidStructure, style: h),
      _chips('bid-structure', _r.structures, _structure, (v) => bidStructureLabel(l, v), (v) => _structure = v),
      DropdownButtonFormField<int>(
        key: const Key('bid-tenure'),
        initialValue: _tenure,
        decoration: InputDecoration(labelText: l.tenure),
        items: [
          for (var m = _r.minTenureMonths; m <= _r.maxTenureMonths; m += _r.tenureStepMonths) DropdownMenuItem(value: m, child: Text(l.months('$m'))),
        ],
        onChanged: (v) => setState(() => _tenure = v ?? _tenure),
      ),
      TextField(
        key: const Key('bid-down-payment'),
        controller: _down,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: '${l.bidDownPayment} (BHD)'),
      ),
      if (_r.tradeIn != null)
        SwitchListTile(
          key: const Key('bid-use-trade-in'),
          contentPadding: EdgeInsets.zero,
          value: _useTradeIn,
          title: Text(l.bidUseTradeIn(context.money(_r.tradeIn!.offerFils, decimals: 0))),
          onChanged: (v) => setState(() => _useTradeIn = v),
        ),
      const SizedBox(height: SahelSpace.sm),
      Text(l.bidInsurance, style: h),
      _chips('bid-insurance', _r.insurancePreferences, _insurance, (v) => bidInsuranceLabel(l, v), (v) => _insurance = v),
      const SizedBox(height: SahelSpace.md),
      if (_error != null) Text(_error!, key: const Key('bid-error'), style: const TextStyle(color: SahelColors.danger)),
      FilledButton(key: const Key('bid-post'), onPressed: _busy ? null : _submit, child: Text(l.bidPost)),
      const SizedBox(height: SahelSpace.xs),
      Text(l.bidValidity('${_r.validityHours}'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      const SizedBox(height: SahelSpace.sm),
      Text('⚠️ ${l.bidSandboxNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
    ]);
  }
}
