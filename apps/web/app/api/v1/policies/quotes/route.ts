import type { PolicyQuoteRequest } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleInsuranceError, policyStore } from '@/lib/policy-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/policies/quotes: hold a priced quote from one insurer for the session customer before checkout.
 * The premium is computed here, never taken from the client. Pay it with purpose `insurance_premium`
 * and reference = the returned id, then POST /policies/confirm (same session).
 */
export async function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<PolicyQuoteRequest>(req);
      return ok(policyStore.createQuote(s.customerId, body), { status: 201 });
    },
    handleInsuranceError,
  );
}
