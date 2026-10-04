import { ok } from '@/lib/api';
import { handleRewardsError, rewardsState, rewardsStore } from '@/lib/rewards-store';
import { withCustomer } from '@/lib/session';

// Per customer session, derived from in-memory sandbox stores, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/rewards: the session customer's IMTIAZ points (⚠️ sandbox, placeholder rates): balance, tier and
 * progress (points earned in the last 12 months), the earned / burned history with its source, and the earn rules.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(rewardsStore.summary(s.customerId, rewardsState(s.customer))), handleRewardsError);
}
