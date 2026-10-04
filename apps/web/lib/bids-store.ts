import { appendLead, BID_ERROR_STATUS, BidError, bidRules, isBidSort, SandboxBidStore, type BidSort, type BidTradeIn } from '@sahel/domain';
import { handleError, leads, problem } from '@/lib/api';
import { tradeInStore } from '@/lib/tradein-store';

const g = globalThis as unknown as { __sahelBids?: SandboxBidStore };

/**
 * ⚠️ Sandbox "Bid For Me" requests and bids (in memory, lost on restart). Requests belong to the session customer
 * (lib/session.ts); dealers reach them through dealerSession (lib/api.ts). An accepted bid becomes a lead in the dealer
 * leads store.
 */
export const bidStore = (g.__sahelBids ??= new SandboxBidStore({ onAccepted: (lead) => appendLead(leads, lead) }));

/** The customer's active trade-in offer, in the shape a request uses for its down payment. */
export function activeTradeIn(customerId: string): BidTradeIn | null {
  const o = tradeInStore.active(customerId);
  return o ? { offerId: o.id, offerFils: o.offerFils, validUntil: o.validUntil } : null;
}

/** GET /config `bids` for this customer (their headroom caps the maximum monthly). */
export function customerBidRules(customerId: string, headroomFils: number) {
  return bidRules(headroomFils, activeTradeIn(customerId));
}

/** `?sort=` of the bids board (monthly by default; anything else is ignored). */
export function bidSortParam(req: Request): BidSort {
  const s = new URL(req.url).searchParams.get('sort');
  return isBidSort(s) ? s : 'monthly';
}

/** handleError plus BidError (matched by name too: the store may come from another route's bundle). */
export function handleBidError(e: unknown) {
  if (e instanceof BidError || (e instanceof Error && e.name === 'BidError')) {
    const code = (e as BidError).code;
    return problem(BID_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  return handleError(e);
}
