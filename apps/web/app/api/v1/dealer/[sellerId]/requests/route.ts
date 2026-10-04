import { dealerSession, ok } from '@/lib/api';
import { bidStore, handleBidError } from '@/lib/bids-store';

// Requests open and close at any time, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/dealer/{sellerId}/requests: open "Bid For Me" requests this dealer's stock matches (or already bid on),
 * newest first. Data minimization: criteria, first name and pre-approval only, plus the dealer's own bid.
 */
export async function GET(req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  try {
    const { sellerId } = await ctx.params;
    dealerSession(req, sellerId);
    const items = bidStore.openForDealer(sellerId);
    return ok({ items, total: items.length });
  } catch (e) {
    return handleBidError(e);
  }
}
