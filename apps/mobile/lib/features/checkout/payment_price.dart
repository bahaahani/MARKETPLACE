import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/payment_price.dart';
import '../../core/providers.dart';

typedef PaymentPriceQuery = ({String purpose, String reference});

/// The server amount for a payment (GET /payments/price), or null when the server does not price this purpose
/// (premiums and settlements carry their quoted amount). The app never decides a server-priced amount itself.
final paymentPriceProvider = FutureProvider.family<PaymentPrice?, PaymentPriceQuery>((ref, q) async {
  try {
    return await ref.watch(repositoryProvider).paymentPrice(purpose: q.purpose, reference: q.reference);
  } on ApiException catch (e) {
    if (e.code == 'NOT_SERVER_PRICED') return null;
    rethrow;
  }
});
