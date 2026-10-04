import { ok } from '@/lib/api';
import { handleRewardsError, rewardsState, rewardsStore } from '@/lib/rewards-store';
import { withCustomer } from '@/lib/session';

// `affordable` depends on the session customer's balance, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/rewards/catalogue: what IMTIAZ points can be redeemed for (⚠️ placeholder costs; demo partners are
 * flagged `demoPartner`), each with `affordable` for the session customer's balance.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(rewardsStore.catalogue(s.customerId, rewardsState(s.customer))), handleRewardsError);
}
