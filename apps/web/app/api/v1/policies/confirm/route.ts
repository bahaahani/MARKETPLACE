import { jsonBody, ok, payments, problem } from '@/lib/api';
import { handleInsuranceError, policyCustomerId, policyStore } from '@/lib/policy-store';

/**
 * POST /api/v1/policies/confirm: issue the policy for a captured premium payment.
 * 404 unknown payment or quote, 409 not captured / quote already bound, 422 amount or reference mismatch,
 * 410 quote expired before payment. Repeating it with the same payment returns the same policy.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<{ paymentId?: unknown; quoteId?: unknown }>(req);
    if (typeof body.paymentId !== 'string' || !body.paymentId) return problem(400, 'BAD_REQUEST', 'paymentId is required');
    if (body.quoteId !== undefined && typeof body.quoteId !== 'string') return problem(400, 'BAD_REQUEST', 'quoteId must be a string');
    // Sandbox: read our own gateway. Production: retrieve the Tap charge and check the verified webhook state.
    const policy = policyStore.confirm(policyCustomerId(), payments.get(body.paymentId), body.quoteId);
    return ok(policy);
  } catch (e) {
    return handleInsuranceError(e);
  }
}
