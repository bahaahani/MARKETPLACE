import { bidRequestView } from '@sahel/domain';
import { ok } from '@/lib/api';
import { bidStore, handleBidError } from '@/lib/bids-store';
import { withCustomer } from '@/lib/session';

/** POST /api/v1/requests/{id}/cancel: cancel an open request (its bids are LOST). Another customer's request is 404. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => ok(bidRequestView(bidStore.cancel((await ctx.params).id, s.customerId))),
    handleBidError,
  );
}
