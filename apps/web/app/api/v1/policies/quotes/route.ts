import type { PolicyQuoteRequest } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleInsuranceError, policyCustomerId, policyStore } from '@/lib/policy-store';

/**
 * POST /api/v1/policies/quotes: hold a priced quote from one insurer before checkout.
 * The premium is computed here, never taken from the client. Pay it with purpose `insurance_premium`
 * and reference = the returned id, then POST /policies/confirm.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<PolicyQuoteRequest>(req);
    return ok(policyStore.createQuote(policyCustomerId(), body), { status: 201 });
  } catch (e) {
    return handleInsuranceError(e);
  }
}
