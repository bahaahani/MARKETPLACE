import { applicationView } from '@sahel/domain';
import { handleError, ok, originations } from '@/lib/api';

/**
 * POST /api/v1/applications/{id}/accept: accept the offer and e-sign (sandbox), then run fulfilment to the
 * end, recording each step (for Murabaha: BCFC buys the asset, takes ownership, then sells it to the customer).
 * ⚠️ Production: a real e-signature provider, and each fulfilment step happens separately, with evidence.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return ok(applicationView(originations.accept(id)));
  } catch (e) {
    return handleError(e);
  }
}
