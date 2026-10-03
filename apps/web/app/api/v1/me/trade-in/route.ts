import { ok, problem } from '@/lib/api';
import { handleTradeInError, tradeInStore, tradeInView } from '@/lib/tradein-store';
import { withCustomer } from '@/lib/session';

// Per customer session, reading the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/trade-in: the session customer's active trade-in offer (null when none or expired). With
 * `?vehicleId=`, also the down payment it gives that car: min(offer, maximum down payment), on the slider step.
 */
export function GET(req: Request) {
  return withCustomer(
    req,
    (s) => {
      const vehicleId = new URL(req.url).searchParams.get('vehicleId');
      const view = tradeInView(tradeInStore.active(s.customerId), vehicleId);
      return view ? ok(view) : problem(404, 'NOT_FOUND', `vehicle ${vehicleId} not found`);
    },
    handleTradeInError,
  );
}

/** DELETE /api/v1/me/trade-in: withdraw the active offer (idempotent; `withdrawn` says whether there was one). */
export function DELETE(req: Request) {
  return withCustomer(req, (s) => ok({ withdrawn: tradeInStore.withdraw(s.customerId) }), handleTradeInError);
}
