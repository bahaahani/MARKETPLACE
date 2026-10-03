import { ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Per customer session (profile and contract settings such as autopay), so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me: the session's customer. The demo customer until onboarding completes; then their own name,
 * salary, obligations and pre-approval. Contract settings (autopay) are this customer's.
 * ⚠️ Sandbox session until eKey login and core lending exist.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(s.customer));
}
