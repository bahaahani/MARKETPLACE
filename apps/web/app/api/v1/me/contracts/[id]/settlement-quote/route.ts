import { findContract, settlementQuote } from '@sahel/domain';
import { handleBundlesError, ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/contracts/{id}/settlement-quote: early-settlement quote for one of the session customer's
 * contracts (⚠️ placeholder fee / Ibra' rules). Pay it through POST /payments with purpose early_settlement and
 * the quote's payment reference.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => ok(settlementQuote(findContract(s.customer, (await ctx.params).id))), handleBundlesError);
}
