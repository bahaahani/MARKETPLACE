import type { TradeInRequest } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleTradeInError, tradeInStore } from '@/lib/tradein-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/trade-in/valuations: value the customer's car (⚠️ sandbox rules model, not AI) and make the low end
 * of the range their instant offer, valid 7 days (Bahrain dates). With `garageVehicleId` the car's details default
 * to My Garage. The plate is validated and only ever returned masked. Replaces the session's previous offer.
 */
export async function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<TradeInRequest>(req);
      return ok(tradeInStore.value(s.customerId, body, s.customer.garage), { status: 201 });
    },
    handleTradeInError,
  );
}
