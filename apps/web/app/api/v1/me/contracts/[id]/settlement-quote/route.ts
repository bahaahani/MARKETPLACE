import { findContract, settlementQuote } from '@sahel/domain';
import { currentCustomer, handleBundlesError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/contracts/{id}/settlement-quote: early-settlement quote (⚠️ placeholder fee / Ibra' rules).
 * Pay it through POST /payments with purpose early_settlement and the quote's payment reference.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return ok(settlementQuote(findContract(currentCustomer(), id)));
  } catch (e) {
    return handleBundlesError(e);
  }
}
