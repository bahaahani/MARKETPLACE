import { buildLifeEventBundle, customerFinancials } from '@sahel/domain';
import { handleBundlesError, ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Priced against the session customer's DBR headroom, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/life-events/{id}/bundle?structure=islamic|conventional (default islamic). ⚠️ Illustrative.
 * Uses the session customer's financials: their own after onboarding, otherwise the demo customer's.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const { id } = await ctx.params;
      const structure = new URL(req.url).searchParams.get('structure') ?? 'islamic';
      return ok(buildLifeEventBundle(id, structure, customerFinancials(s.profile)));
    },
    handleBundlesError,
  );
}
