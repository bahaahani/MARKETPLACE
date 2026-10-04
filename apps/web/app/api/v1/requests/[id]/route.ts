import { bidRequestView } from '@sahel/domain';
import { ok, problem } from '@/lib/api';
import { bidSortParam, bidStore } from '@/lib/bids-store';
import { withCustomer } from '@/lib/session';

// Bids arrive at any time (the apps poll this), so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/requests/{id}?sort=monthly|total|extras: the request, instant matches and ranked bids. Another customer's request is 404. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const r = bidStore.get((await ctx.params).id, s.customerId);
    return r ? ok(bidRequestView(r, bidSortParam(req))) : problem(404, 'REQUEST_NOT_FOUND', 'request not found');
  });
}
