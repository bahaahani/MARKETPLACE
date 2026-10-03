import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/tradein.dart';
import '../../core/providers.dart';

/// The session's active trade-in offer (GET /me/trade-in); with a vehicle id, also the down payment it gives that car.
final tradeInProvider =
    FutureProvider.family<TradeInStatus, String?>((ref, vehicleId) => ref.watch(repositoryProvider).myTradeIn(vehicleId: vehicleId));
