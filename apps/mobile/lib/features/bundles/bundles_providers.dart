import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/bundles.dart';
import '../../core/providers.dart';

final lifeEventsProvider = FutureProvider<List<LifeEvent>>((ref) => ref.watch(repositoryProvider).lifeEvents());

typedef BundleQuery = ({String id, BundleStructure structure});

final lifeEventBundleProvider = FutureProvider.family<LifeEventBundle, BundleQuery>(
  (ref, q) => ref.watch(repositoryProvider).lifeEventBundle(q.id, q.structure),
);

final settlementQuoteProvider =
    FutureProvider.family<SettlementQuote, String>((ref, contractId) => ref.watch(repositoryProvider).settlementQuote(contractId));
