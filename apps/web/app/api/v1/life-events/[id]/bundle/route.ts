import { buildLifeEventBundle } from '@sahel/domain';
import { currentCustomer, handleBundlesError, ok } from '@/lib/api';

// Priced against the customer's DBR headroom, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/life-events/{id}/bundle?structure=islamic|conventional (default islamic). ⚠️ Illustrative. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const structure = new URL(req.url).searchParams.get('structure') ?? 'islamic';
    const me = currentCustomer();
    return ok(buildLifeEventBundle(id, structure, { monthlySalaryFils: me.monthlySalaryFils, existingObligationsFils: me.existingObligationsFils }));
  } catch (e) {
    return handleBundlesError(e);
  }
}
