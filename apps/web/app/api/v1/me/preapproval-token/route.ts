import { customerOverview } from '@sahel/domain';
import { ok, preApprovalTokens } from '@/lib/api';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/me/preapproval-token: a short-lived token (and QR) the customer shows in a showroom.
 * The dealer redeems it for first name, vehicle limit, max monthly and validity only, taken from THIS session's
 * customer (their own pre-approval after onboarding). ⚠️ Sandbox session until eKey login exists.
 */
export function POST(req: Request) {
  return withCustomer(req, (s) => ok(preApprovalTokens.issue(customerOverview(s.profile)), { status: 201 }));
}
