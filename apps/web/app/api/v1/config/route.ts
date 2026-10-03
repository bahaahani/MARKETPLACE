import { clientConfig } from '@sahel/domain';
import { ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// The personal finance range depends on the customer session, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/config: product rules the apps build their screens from (consent period, calculator ranges,
 * steps and defaults, the personal finance range for this customer). The Flutter app hard-codes none of them.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(clientConfig(s.customer.preApproval)));
}
