import { demoCustomer } from '@sahel/domain';
import { handleError, ok, preApprovalTokens } from '@/lib/api';

/**
 * POST /api/v1/me/preapproval-token: a short-lived token (and QR) the customer shows in a showroom.
 * The dealer redeems it for first name, vehicle limit, max monthly and validity only.
 * Demo customer until eKey login exists.
 */
export function POST() {
  try {
    return ok(preApprovalTokens.issue(demoCustomer()), { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
