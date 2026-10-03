import { jsonBody, ok, payments, problem } from '@/lib/api';
import { handleInsuranceError, policyStore } from '@/lib/policy-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/policies/confirm: issue the policy for a captured premium payment of the session customer.
 * 404 unknown payment or quote (including another session's), 409 not captured / quote already bound,
 * 422 amount or reference mismatch, 410 quote expired before payment. Repeating it with the same payment
 * returns the same policy.
 */
export async function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<{ paymentId?: unknown; quoteId?: unknown }>(req);
      if (typeof body.paymentId !== 'string' || !body.paymentId) return problem(400, 'BAD_REQUEST', 'paymentId is required');
      if (body.quoteId !== undefined && typeof body.quoteId !== 'string') return problem(400, 'BAD_REQUEST', 'quoteId must be a string');
      // Sandbox: read our own gateway, scoped to the session. Production: retrieve the Tap charge and check the verified webhook state.
      return ok(policyStore.confirm(s.customerId, payments.get(body.paymentId, s.customerId), body.quoteId));
    },
    handleInsuranceError,
  );
}
