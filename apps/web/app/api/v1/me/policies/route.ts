import { ok } from '@/lib/api';
import { policyCustomerId, policyStore } from '@/lib/policy-store';

// Reads the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/policies: the customer's insurance policies, active first (status derived from the dates). */
export function GET() {
  const items = policyStore.list(policyCustomerId());
  return ok({ items, total: items.length });
}
