import { bidCustomerFrom, bidRequestView } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { activeTradeIn, bidStore, handleBidError } from '@/lib/bids-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/requests: "Bid For Me" (⚠️ sandbox). The session customer posts what they want and how they want to pay;
 * dealers bid for 72 hours. The maximum monthly must fit the customer's DBR headroom (else 422 OVER_BUDGET). One open
 * request per customer. Returns the request with system instant matches from the whole catalogue.
 */
export async function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<Record<string, unknown>>(req);
      const request = bidStore.post(bidCustomerFrom(s.customer), body, activeTradeIn(s.customerId));
      return ok(bidRequestView(request), { status: 201 });
    },
    handleBidError,
  );
}
