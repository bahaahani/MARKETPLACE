import { bidRequestView } from '@sahel/domain';
import { ok } from '@/lib/api';
import { bidStore } from '@/lib/bids-store';
import { withCustomer } from '@/lib/session';

// Per customer session, reading the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/requests: the session customer's "Bid For Me" requests, newest first (bids ranked by monthly). */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = bidStore.list(s.customerId).map((r) => bidRequestView(r));
    return ok({ items, total: items.length, open: items.find((r) => r.status === 'OPEN')?.id ?? null });
  });
}
