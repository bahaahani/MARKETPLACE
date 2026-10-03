import { dealerInventory } from '@sahel/domain';
import { dealerSession, handleError, ok } from '@/lib/api';

/** GET /api/v1/dealer/{sellerId}/inventory: the dealer's vehicles with monthly prices, plus stock stats. */
export async function GET(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  try {
    const { sellerId } = await ctx.params;
    dealerSession(req, sellerId);
    return ok(dealerInventory(sellerId));
  } catch (e) {
    return handleError(e);
  }
}
