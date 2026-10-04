import { bidRequestView } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { bidStore, handleBidError } from '@/lib/bids-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/requests/{id}/accept { bidId }: accept a live bid. The request closes, the other bids are LOST and the
 * dealer gets a lead. The response's `accepted.applyHref` links to the car page to apply for finance (⚠️ sandbox: the
 * discount and extras are not carried into the application).
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
