import { leadStats } from '@sahel/domain';
import { dealerSession, handleError, leads, ok } from '@/lib/api';

/** GET /api/v1/dealer/{sellerId}/leads: the dealer's leads (newest first) and pipeline counts. */
export async function GET(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  try {
    const { sellerId } = await ctx.params;
    dealerSession(req, sellerId);
    const items = leads.list(sellerId);
    return ok({ items, total: items.length, stats: leadStats(items) });
  } catch (e) {
    return handleError(e);
  }
}
