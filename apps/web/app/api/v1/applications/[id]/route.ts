import { ok, originations, problem } from '@/lib/api';
import { customerApplicationView } from '@/lib/home-finance';
import { withCustomer } from '@/lib/session';

// Reads the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/applications/{id}: status, decision and timeline steps. Another customer's application is 404. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const app = originations.get((await ctx.params).id, s.customerId);
    return app ? ok(customerApplicationView(app)) : problem(404, 'NOT_FOUND', 'application not found');
  });
}
