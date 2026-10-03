import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../../widgets/listings.dart';

class PropertyScreen extends ConsumerStatefulWidget {
  const PropertyScreen({super.key});

  @override
  ConsumerState<PropertyScreen> createState() => _PropertyScreenState();
}

class _PropertyScreenState extends ConsumerState<PropertyScreen> {
  String? _purpose;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final list = ref.watch(propertiesProvider(_purpose));
    return Scaffold(
      appBar: AppBar(title: Text(l.navProperty), actions: const [LanguageButton()]),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(SahelSpace.sm),
          child: SegmentedButton<String?>(
            segments: [
              ButtonSegment(value: null, label: Text(l.filterAll)),
              ButtonSegment(value: 'sale', label: Text(l.propertyForSale)),
              ButtonSegment(value: 'rent', label: Text(l.propertyForRent)),
            ],
            selected: {_purpose},
            onSelectionChanged: (s) => setState(() => _purpose = s.first),
          ),
        ),
        Expanded(
          child: AsyncView(
            value: list,
            onRetry: () => ref.invalidate(propertiesProvider(_purpose)),
            data: (items) => ListView.separated(
              padding: const EdgeInsets.all(SahelSpace.md),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: SahelSpace.md),
              itemBuilder: (_, i) => PropertyTile(items[i]),
            ),
          ),
        ),
      ]),
    );
  }
}
