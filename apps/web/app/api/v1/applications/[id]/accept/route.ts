import { applicationView } from '@sahel/domain';
import { ok, originations } from '@/lib/api';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/applications/{id}/accept: accept the offer and e-sign (sandbox), then run fulfilment to the
 * end, recording each step (for Murabaha: BCFC buys the asset, takes ownership, then sells it to the customer).
 * Only the customer who applied can accept; anyone else gets 404.
 * ⚠️ Production: a real e-signature provider, and each fulfilment step happens separately, with evidence.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const { id } = await ctx.params;
    return ok(applicationView(originations.accept(id, s.customerId)));
  });
}
