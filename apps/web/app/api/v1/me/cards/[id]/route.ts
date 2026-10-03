import { cardIssuer, ok, problem } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Reads the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/cards/{id}: one of this customer's virtual cards. Another customer's card is 404. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const card = cardIssuer.get(s.customerId, (await ctx.params).id);
    return card ? ok(card) : problem(404, 'NOT_FOUND', 'card not found');
  });
}
