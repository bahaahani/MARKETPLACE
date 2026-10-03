import { customerCardOffers } from '@sahel/domain';
import { ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Eligibility is per customer session, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cards: card products, each with the current customer's eligibility (`eligible`,
 * `ineligibleReason`) and the limit it would be issued with (`offeredLimitFils`). Same rules as card apply.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = customerCardOffers(s.profile);
    return ok({ items, total: items.length });
  });
}
