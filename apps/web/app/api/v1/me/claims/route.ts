import { claimView } from '@sahel/domain';
import { ok } from '@/lib/api';
import { claimStore } from '@/lib/claims-store';
import { withCustomer } from '@/lib/session';

// Per customer session, reading the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/claims: the session customer's motor claims, newest first. */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = claimStore.list(s.customerId).map(claimView);
    return ok({ items, total: items.length });
  });
}
