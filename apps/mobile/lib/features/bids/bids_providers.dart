import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../l10n/gen/app_localizations.dart';
import 'bids_models.dart';

/// The customer's "Bid For Me" requests, newest first.
final myBidRequestsProvider = FutureProvider<List<BidRequest>>((ref) => ref.watch(repositoryProvider).myBidRequests());

/// One of the customer's requests (GET /requests/{id}): the car page reads the accepted bid from it.
final bidRequestProvider = FutureProvider.family<BidRequest, String>((ref, id) => ref.watch(repositoryProvider).bidRequest(id));

// Labels only: the options themselves come from GET /config `bids`.

String bidBodyLabel(AppLocalizations l, String v) => switch (v) {
      'sedan' => l.bidBodySedan,
      'suv' => l.bidBodySuv,
      'hatchback' => l.bidBodyHatchback,
      'pickup' => l.bidBodyPickup,
      'coupe' => l.bidBodyCoupe,
      _ => l.bidAny,
    };

String bidConditionLabel(AppLocalizations l, String v) => switch (v) {
      'new' => l.conditionNew,
      'used' => l.conditionUsed,
      _ => l.bidConditionAny,
    };

String bidFuelLabel(AppLocalizations l, String v) => switch (v) {
      'petrol' => l.bidFuelPetrol,
      'hybrid' => l.bidFuelHybrid,
      'electric' => l.bidFuelElectric,
      _ => l.bidAny,
    };

String bidInsuranceLabel(AppLocalizations l, String v) => switch (v) {
      'takaful' => l.bidInsuranceTakaful,
      'any' => l.bidInsuranceAny,
      _ => l.bidInsuranceNone,
    };

String bidStructureLabel(AppLocalizations l, String v) => v == 'murabaha' ? l.structureMurabaha : l.structureConventional;

String bidExtraLabel(AppLocalizations l, String v) => switch (v) {
      'service-1y' => l.bidExtraService1y,
      'service-2y' => l.bidExtraService2y,
      'service-3y' => l.bidExtraService3y,
      'window-tint' => l.bidExtraWindowTint,
      'extended-warranty' => l.bidExtraExtendedWarranty,
      'free-registration' => l.bidExtraFreeRegistration,
      'floor-mats' => l.bidExtraFloorMats,
      'full-tank' => l.bidExtraFullTank,
      _ => v,
    };

String bidSortLabel(AppLocalizations l, String v) => switch (v) {
      'total' => l.bidSortTotal,
      'extras' => l.bidSortExtras,
      _ => l.bidSortMonthly,
    };

String bidRequestStatusLabel(AppLocalizations l, String v) => switch (v) {
      'OPEN' => l.bidStatusOpen,
      'CLOSED' => l.bidStatusClosed,
      'CANCELLED' => l.bidStatusCancelled,
      _ => l.bidStatusExpired,
    };

String bidStatusLabel(AppLocalizations l, String v) => switch (v) {
      'ACCEPTED' => l.bidStatusAccepted,
      'LOST' => l.bidStatusLost,
      _ => l.bidStatusOpen,
    };

/// Localized message for a POST /requests error (codes from packages/domain/src/bids.ts).
String bidErrorText(AppLocalizations l, Object error) => switch (error) {
      ApiException(code: 'OVER_BUDGET') => l.bidErrorOverBudget,
      ApiException(code: 'REQUEST_ALREADY_OPEN') => l.bidErrorAlreadyOpen,
      ApiException(code: 'NO_TRADE_IN') => l.bidErrorNoTradeIn,
      _ => l.errorGeneric,
    };

/// Home entry: "Bid For Me".
class BidForMeEntryCard extends StatelessWidget {
  const BidForMeEntryCard({super.key});

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Card(
      key: const Key('bid-entry'),
      child: ListTile(
        leading: const CircleAvatar(backgroundColor: SahelColors.brandSoft, child: Text('🏷️', style: TextStyle(fontSize: 20))),
        title: Text(l.bidEntryTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(l.bidEntrySubtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/requests/new'),
      ),
    );
  }
}
