import { dealerSession, jsonBody, ok } from '@/lib/api';
import { bidStore, handleBidError } from '@/lib/bids-store';

/**
 * POST /api/v1/dealer/{sellerId}/requests/{id}/bids { vehicleId, discountFils?, extras? }: bid a car from this dealer's
 * stock. The monthly is computed by the server on the customer's terms and the discounted price; a bid above the
 * customer's maximum monthly, for a car that does not match, or for another dealer's car is rejected. A new bid
 * replaces the dealer's previous one. Returns the request as the dealer sees it (with `myBid`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ sellerId: string; id: string }> }) {
  try {
    const { sellerId, id } = await ctx.params;
    dealerSession(req, sellerId);
    const body = await jsonBody<Record<string, unknown>>(req);
    bidStore.bid(sellerId, id, body);
    // The request is open (the bid would have failed otherwise), so it is in the dealer's list.
    const view = bidStore.openForDealer(sellerId).find((r) => r.id === id);
    return ok(view ?? null, { status: 201 });
  } catch (e) {
    return handleBidError(e);
  }
}
