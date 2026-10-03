import { ok } from '@/lib/api';
import { policyStore } from '@/lib/policy-store';
import { withCustomer } from '@/lib/session';

// Per customer session, reading the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/policies: the session customer's insurance policies, active first (status derived from the dates). */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = policyStore.list(s.customerId);
    return ok({ items, total: items.length });
  });
}
