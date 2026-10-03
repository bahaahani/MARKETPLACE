import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models/tradein.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../l10n/gen/app_localizations.dart';
import '../../widgets/common.dart';
import 'tradein_providers.dart';

/// Condition grade label (presentation only: the grades themselves come from GET /config `tradeIn.conditions`).
String tradeConditionLabel(AppLocalizations l, String c) => switch (c) {
      'excellent' => l.tradeConditionExcellent,
      'good' => l.tradeConditionGood,
      'fair' => l.tradeConditionFair,
      'poor' => l.tradeConditionPoor,
      _ => c,
    };

/// Instant trade-in valuation (same API as the web /trade-in page). ⚠️ Sandbox: the API's rules model, not AI.
/// Makes, models, years and limits come from GET /config `tradeIn`; the API validates and values the car.
class TradeInScreen extends ConsumerWidget {
  const TradeInScreen({super.key, this.garageVehicleId});

  /// Pre-fill this My Garage car (from the account screen).
  final String? garageVehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(configProvider);
    final rules = config.value?.tradeIn;
    if (rules != null) return _TradeInBody(rules: rules, garageVehicleId: garageVehicleId);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.tradeTitle), actions: const [LanguageButton()]),
      body: AsyncView(value: config, onRetry: () => ref.invalidate(configProvider), data: (_) => const SizedBox.shrink()),
    );
  }
}

class _TradeInBody extends ConsumerStatefulWidget {
  const _TradeInBody({required this.rules, this.garageVehicleId});
  final TradeInRules rules;
  final String? garageVehicleId;

  @override
  ConsumerState<_TradeInBody> createState() => _TradeInBodyState();
}

class _TradeInBodyState extends ConsumerState<_TradeInBody> {
  late final TradeInRules _rules = widget.rules;
  TradeInGarageCar? _garage;
  late String _make;
  late String _model;
  late int _year;
  final _mileage = TextEditingController();
  final _plate = TextEditingController();
  String _condition = 'good';
  bool _accident = false;
  bool _busy = false;
  String? _error;
  TradeInOffer? _offer;
  bool _withdrawn = false;

  @override
  void initState() {
    super.initState();
    final id = widget.garageVehicleId;
    final g = id == null ? null : _rules.garage.where((x) => x.garageVehicleId == id).firstOrNull ?? _rules.garage.firstOrNull;
    _make = _rules.makes.keys.first;
    _model = _rules.makes[_make]!.keys.first;
    _year = _rules.maxYear - 3;
    _mileage.text = '50000';
    if (g != null) _pickGarage(g);
  }

  @override
  void dispose() {
    _mileage.dispose();
    _plate.dispose();
    super.dispose();
  }

  void _pickGarage(TradeInGarageCar? g) {
    _garage = g;
    if (g == null) return;
    _make = g.make;
    _model = g.model;
    _year = g.year;
    _mileage.text = '${g.mileageKm}';
  }

  List<int> get _years {
    final first = _rules.makes[_make]?[_model] ?? _rules.minYear;
    return [for (var y = _rules.maxYear; y >= first; y--) y];
  }

  String _errorText(Object e) {
    final l = context.l10n;
    if (e is ApiException) {
      if ((e.code == 'UNKNOWN_MAKE' || e.code == 'UNKNOWN_MODEL') && e.suggestions.isNotEmpty) return l.tradeDidYouMean(e.suggestions.join(', '));
      if (e.code == 'YEAR_OUT_OF_RANGE') return l.tradeErrorYear('${_rules.minYear}', '${_rules.maxYear}');
      if (e.code == 'MILEAGE_OUT_OF_RANGE') return l.tradeErrorMileage(context.number(_rules.maxMileageKm));
      if (e.code == 'INVALID_PLATE') return l.tradeErrorPlate;
    }
    return l.tradeErrorGeneric;
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
      _withdrawn = false;
    });
    // Sent as typed; the API rejects a missing or out-of-range mileage (MILEAGE_OUT_OF_RANGE).
    final mileage = int.tryParse(_mileage.text.replaceAll(RegExp(r'[,\s]'), ''));
    final g = _garage;
    final Json body = g != null
        ? {'garageVehicleId': g.garageVehicleId, 'mileageKm': mileage, 'condition': _condition, 'accidentHistory': _accident}
        : {
            'make': _make,
            'model': _model,
            'year': _year,
            'mileageKm': mileage,
            'condition': _condition,
            'accidentHistory': _accident,
            if (_plate.text.trim().isNotEmpty) 'plate': _plate.text.trim(),
          };
    try {
      final offer = await ref.read(repositoryProvider).valueTradeIn(body);
      ref.invalidate(tradeInProvider);
      if (mounted) setState(() => _offer = offer);
    } catch (e) {
      if (mounted) setState(() => _error = _errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw() async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).withdrawTradeIn();
      ref.invalidate(tradeInProvider);
      if (mounted) {
        setState(() {
          _offer = null;
          _withdrawn = true;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = context.l10n.errorGeneric);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    // The offer valued here, or else the session's active one.
    final offer = _withdrawn ? null : (_offer ?? ref.watch(tradeInProvider(null)).value?.offer);
    final g = _garage;
    return Scaffold(
      appBar: AppBar(title: Text(l.tradeTitle), actions: const [LanguageButton()]),
      body: ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
        Text(l.tradeIntro),
        const SizedBox(height: SahelSpace.xs),
        Text('⚠️ ${l.tradeSandboxNote}', key: const Key('tradein-sandbox'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
        const SizedBox(height: SahelSpace.md),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_rules.garage.isNotEmpty) ...[
                DropdownButtonFormField<String?>(
                  key: const Key('tradein-garage'),
                  initialValue: g?.garageVehicleId,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.tradeFromGarage),
                  items: [
                    for (final c in _rules.garage)
                      DropdownMenuItem(value: c.garageVehicleId, child: Text(l.tradeGarageOption(c.title, c.plateMasked), overflow: TextOverflow.ellipsis)),
                    DropdownMenuItem(value: null, child: Text(l.tradeOtherCar)),
                  ],
                  onChanged: (id) => setState(() => _pickGarage(_rules.garage.where((c) => c.garageVehicleId == id).firstOrNull)),
                ),
                const SizedBox(height: SahelSpace.sm),
              ],
              DropdownButtonFormField<String>(
                key: ValueKey('tradein-make-$_make-${g?.garageVehicleId}'),
                initialValue: _make,
                isExpanded: true,
                decoration: InputDecoration(labelText: l.tradeMake),
                items: [for (final m in _rules.makes.keys) DropdownMenuItem(value: m, child: Text(m))],
                onChanged: g != null
                    ? null
                    : (m) => setState(() {
                          _make = m!;
                          _model = _rules.makes[m]!.keys.first;
                          if (!_years.contains(_year)) _year = _years.first;
                        }),
              ),
              const SizedBox(height: SahelSpace.sm),
              Row(children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('tradein-model-$_make-$_model-${g?.garageVehicleId}'),
                    initialValue: _model,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l.tradeModel),
                    items: [for (final m in _rules.makes[_make]!.keys) DropdownMenuItem(value: m, child: Text(m))],
                    onChanged: g != null
                        ? null
                        : (m) => setState(() {
                              _model = m!;
                              if (!_years.contains(_year)) _year = _years.first;
                            }),
                  ),
                ),
                const SizedBox(width: SahelSpace.sm),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    key: ValueKey('tradein-year-$_make-$_model-$_year-${g?.garageVehicleId}'),
                    initialValue: _year,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l.tradeYear),
                    items: [for (final y in _years) DropdownMenuItem(value: y, child: Text('$y'))],
                    onChanged: g != null ? null : (y) => setState(() => _year = y!),
                  ),
                ),
              ]),
              const SizedBox(height: SahelSpace.sm),
              TextField(
                key: const Key('tradein-mileage'),
                controller: _mileage,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: l.tradeMileage),
              ),
              const SizedBox(height: SahelSpace.sm),
              if (g != null)
                InputDecorator(
                  decoration: InputDecoration(labelText: l.tradePlate, helperText: l.tradePlateHint),
                  child: Text(g.plateMasked, key: const Key('tradein-plate-masked'), textDirection: TextDirection.ltr),
                )
              else
                TextField(
                  key: const Key('tradein-plate'),
                  controller: _plate,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: l.tradePlate, helperText: l.tradePlateHint),
                ),
              const SizedBox(height: SahelSpace.md),
              Text(l.tradeCondition, style: const TextStyle(fontWeight: FontWeight.w600)),
              Wrap(spacing: SahelSpace.sm, children: [
                for (final c in _rules.conditions)
                  ChoiceChip(
                    key: Key('tradein-condition-$c'),
                    label: Text(tradeConditionLabel(l, c)),
                    selected: _condition == c,
                    onSelected: (_) => setState(() => _condition = c),
                  ),
              ]),
              CheckboxListTile(
                key: const Key('tradein-accident'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _accident,
                title: Text(l.tradeAccident),
                onChanged: (v) => setState(() => _accident = v ?? false),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: SahelSpace.sm),
                  child: Text(_error!, key: const Key('tradein-error'), style: const TextStyle(color: SahelColors.danger)),
                ),
              FilledButton(
                key: const Key('tradein-submit'),
                onPressed: _busy ? null : _submit,
                child: Text(_busy ? l.tradeValuing : l.tradeSubmit),
              ),
            ]),
          ),
        ),
        const SizedBox(height: SahelSpace.md),
        if (_withdrawn) Text(l.tradeWithdrawn, key: const Key('tradein-withdrawn')),
        if (offer != null) _OfferCard(offer: offer, busy: _busy, onWithdraw: _withdraw),
      ]),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.busy, required this.onWithdraw});
  final TradeInOffer offer;
  final bool busy;
  final VoidCallback onWithdraw;

  String _step(AppLocalizations l, BuildContext context, TradeInStep s) => switch (s.code) {
        'reference' => l.tradeStepReference('${offer.year}'),
        'age' => l.tradeStepAge('${offer.ageYears}'),
        'mileage' => l.tradeStepMileage(context.number(offer.mileageKm)),
        'condition' => '${l.tradeStepCondition}: ${tradeConditionLabel(l, offer.condition)}',
        'accident' => l.tradeStepAccident,
        'dealerMargin' => l.tradeStepDealerMargin,
        _ => s.code,
      };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final plate = offer.plateMasked;
    return Card(
      key: const Key('tradein-result'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            '${l.tradeVehicleLine('${offer.year}', offer.make, offer.model, context.number(offer.mileageKm))}${plate == null ? '' : ' · #$plate'}',
            style: const TextStyle(color: SahelColors.textMuted),
          ),
          const SizedBox(height: SahelSpace.sm),
          Text(l.tradeOffer, style: const TextStyle(fontWeight: FontWeight.w600)),
          Text(context.money(offer.offerFils, decimals: 0),
              key: const Key('tradein-offer'), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: SahelColors.brand)),
          Text(l.tradeOfferValid(context.date(offer.validUntil)), key: const Key('tradein-valid'), style: const TextStyle(color: SahelColors.textMuted)),
          const SizedBox(height: SahelSpace.sm),
          KeyValueRow(
            l.tradeRange,
            l.tradeRangeValue(context.money(offer.rangeLowFils, decimals: 0), context.money(offer.rangeHighFils, decimals: 0)),
          ),
          const Divider(),
          Text(l.tradeBreakdown, style: const TextStyle(fontWeight: FontWeight.w600)),
          for (final s in offer.breakdown)
            KeyValueRow(
              _step(l, context, s),
              s.code == 'reference'
                  ? context.money(s.amountFils, decimals: 0)
                  : '${s.amountFils < 0 ? '−' : '+'}${context.money(s.amountFils.abs(), decimals: 0)}',
            ),
          const SizedBox(height: SahelSpace.md),
          Wrap(spacing: SahelSpace.sm, runSpacing: SahelSpace.sm, children: [
            FilledButton(key: const Key('tradein-choose-car'), onPressed: () => context.go('/cars'), child: Text(l.tradeUseOnCar)),
            OutlinedButton(key: const Key('tradein-withdraw'), onPressed: busy ? null : onWithdraw, child: Text(l.tradeWithdraw)),
          ]),
          const SizedBox(height: SahelSpace.sm),
          Text(l.tradeCreditNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
        ]),
      ),
    );
  }
}

/// On a car page: "Use my trade-in (BHD X)" when the session has an active offer. [onUse] gets the down payment the API
/// computed for this car (min(offer, maximum down payment)); the calculator restarts from it.
class TradeInUseCard extends ConsumerStatefulWidget {
  const TradeInUseCard({super.key, required this.vehicleId, required this.onUse});
  final String vehicleId;
  final ValueChanged<int> onUse;

  @override
  ConsumerState<TradeInUseCard> createState() => _TradeInUseCardState();
}

class _TradeInUseCardState extends ConsumerState<TradeInUseCard> {
  bool _applied = false;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final status = ref.watch(tradeInProvider(widget.vehicleId));
    final use = status.value?.forVehicle;
    // Nothing without an active offer (the cars screen and My Garage link to /trade-in).
    if (use == null) return const SizedBox.shrink();
    return Card(
      key: const Key('tradein-use'),
      child: Padding(
        padding: const EdgeInsets.all(SahelSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_applied)
            Text(l.tradeApplied(context.money(use.downPaymentFils, decimals: 0)),
                key: const Key('tradein-applied'), style: const TextStyle(color: SahelColors.success, fontWeight: FontWeight.w600))
          else
            FilledButton(
              key: const Key('tradein-use-button'),
              onPressed: () {
                setState(() => _applied = true);
                widget.onUse(use.downPaymentFils);
              },
              child: Text(l.tradeUseMine(context.money(use.offerFils, decimals: 0))),
            ),
          if (_applied && use.capped) Text(l.tradeCapped(context.money(use.creditedFils, decimals: 0)), style: const TextStyle(fontSize: 12)),
          if (_applied && use.cashTopUpFils > 0) Text(l.tradeTopUp(context.money(use.cashTopUpFils, decimals: 0)), style: const TextStyle(fontSize: 12)),
          const SizedBox(height: SahelSpace.xs),
          Text(l.tradeCreditNote, style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
        ]),
      ),
    );
  }
}
