import { bidRequestView } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { bidStore, handleBidError } from '@/lib/bids-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/requests/{id}/accept { bidId }: accept a live bid. The request closes, the other bids are LOST and the
 * dealer gets a lead (with the list and bid price). The response's `accepted.applyHref` links to the car page with the
 * accepted bid (requestId, bidId): applying there is priced from the bid, re-validated by POST /applications.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const { bidId } = await jsonBody<{ bidId?: unknown }>(req);
      const { request } = bidStore.accept((await ctx.params).id, s.customerId, bidId);
      return ok(bidRequestView(request));
    },
    handleBidError,
  );
}
