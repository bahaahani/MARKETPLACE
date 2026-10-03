import { customerFinancials } from '@sahel/domain';
import { cardIssuer, jsonBody, ok, problem } from '@/lib/api';
import { withCustomer } from '@/lib/session';

interface Body {
  monthlySalaryFils?: unknown;
  existingObligationsFils?: unknown;
  requestedLimitFils?: number;
}

/**
 * POST /api/v1/cards/{id}/apply: instant IMTIAZ card decision. APPROVED returns a sandbox virtual card
 * (masked number only, never a full PAN or CVV); DECLINED returns a reason. Both are 200.
 * The decision uses the session customer's own financials (from onboarding, else the demo customer's);
 * a client cannot supply salary or obligations (400).
 * ⚠️ SANDBOX: no card processor is called and wallet provisioning is simulated.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const { id } = await ctx.params;
    const body = await jsonBody<Body>(req, { optional: true });
    if (body.monthlySalaryFils !== undefined || body.existingObligationsFils !== undefined) {
      return problem(400, 'BAD_REQUEST', 'salary and obligations come from the customer profile; complete onboarding to change them');
    }
    const requested = body.requestedLimitFils;
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested <= 0)) {
      return problem(400, 'BAD_REQUEST', 'requestedLimitFils must be a positive integer');
    }
    return ok(cardIssuer.apply(s.customerId, id, customerFinancials(s.profile), { requestedLimitFils: requested }));
  });
}
