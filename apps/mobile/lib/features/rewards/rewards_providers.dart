import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'rewards_models.dart';

/// IMTIAZ points (GET /me/rewards). The API derives them from the customer's payments, cards and contracts, so they
/// reload whenever those do (checkout and settlement reload /me; a card application reloads My cards).
final myRewardsProvider = FutureProvider<RewardsSummary>((ref) async {
  await (ref.watch(meProvider.future), ref.watch(myCardsProvider.future)).wait;
  return ref.watch(repositoryProvider).myRewards();
});

/// The catalogue with `affordable` for this customer: reloads with the balance.
final rewardsCatalogueProvider = FutureProvider<RewardsCatalogue>((ref) async {
  await ref.watch(myRewardsProvider.future);
  return ref.watch(repositoryProvider).rewardsCatalogue();
});

final myRedemptionsProvider = FutureProvider<List<RewardRedemption>>((ref) => ref.watch(repositoryProvider).myRedemptions());

/// After a redemption: balance, history, catalogue and vouchers.
void refreshRewards(WidgetRef ref) {
  ref.invalidate(myRewardsProvider);
  ref.invalidate(myRedemptionsProvider);
}
