import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';

class CarsScreen extends ConsumerStatefulWidget {
  const CarsScreen({super.key, this.initialMaxMonthlyFils});
  final int? initialMaxMonthlyFils;

  @override
  ConsumerState<CarsScreen> createState() => _CarsScreenState();
}

class _CarsScreenState extends ConsumerState<CarsScreen> {
  String _query = '';
  String? _condition;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = (query: _query.isEmpty ? null : _query, condition: _condition, maxMonthlyFils: widget.initialMaxMonthlyFils);
    final cars = ref.watch(vehiclesProvider(q));
    return Scaffold(
      appBar: AppBar(title: Text(l.navCars), actions: const [LanguageButton()]),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(SahelSpace.md, SahelSpace.sm, SahelSpace.md, 0),
          child: TextField(
            key: const Key('car-search'),
            decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.searchCars, filled: true, fillColor: SahelColors.surface, border: const OutlineInputBorder()),
            textInputAction: TextInputAction.search,
            onSubmitted: (v) => setState(() => _query = v.trim()),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(SahelSpace.sm),
          child: SegmentedButton<String?>(
            segments: [
              ButtonSegment(value: null, label: Text(l.filterAll)),
              ButtonSegment(value: 'new', label: Text(l.filterNew)),
              ButtonSegment(value: 'used', label: Text(l.filterUsed)),
            ],
            selected: {_condition},
            onSelectionChanged: (s) => setState(() => _condition = s.first),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            key: const Key('tradein-entry'),
            icon: const Icon(Icons.swap_horiz),
            onPressed: () => context.push('/trade-in'),
            label: Text(l.tradeEntryCars),
          ),
        ),
        if (widget.initialMaxMonthlyFils != null)
          Text('${l.filterMaxMonthly}: ≤ ${context.money(widget.initialMaxMonthlyFils!, decimals: 0)}', style: const TextStyle(color: SahelColors.textMuted)),
        Expanded(
          child: AsyncView(
            value: cars,
            onRetry: () => ref.invalidate(vehiclesProvider(q)),
            data: (list) => list.isEmpty
                ? Center(child: Text(l.noResults))
                : ListView.separated(
                    padding: const EdgeInsets.all(SahelSpace.md),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: SahelSpace.md),
                    itemBuilder: (_, i) => VehicleTile(list[i]),
                  ),
          ),
        ),
      ]),
    );
  }
}
