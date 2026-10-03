import { claimView } from '@sahel/domain';
import { ok, problem } from '@/lib/api';
import { claimStore } from '@/lib/claims-store';
import { withCustomer } from '@/lib/session';

// Reads the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/claims/{id}: status, timeline, estimate, garage options and replacement car. Another customer's claim is 404. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const claim = claimStore.get((await ctx.params).id, s.customerId);
    return claim ? ok(claimView(claim)) : problem(404, 'CLAIM_NOT_FOUND', 'claim not found');
  });
}
