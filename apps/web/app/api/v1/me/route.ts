import { customerOverview } from '@sahel/domain';
import { ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Per customer session, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me: the session's customer. The demo customer until onboarding completes; then their own name,
 * salary, obligations and pre-approval. ⚠️ Sandbox session until eKey login and core lending exist.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(customerOverview(s.profile)));
}
