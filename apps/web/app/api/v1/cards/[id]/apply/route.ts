import { demoCustomer, validateEmployment, type CustomerFinancials } from '@sahel/domain';
import { cardIssuer, handleError, jsonBody, ok, problem } from '@/lib/api';

interface Body {
  monthlySalaryFils?: number;
  existingObligationsFils?: number;
  requestedLimitFils?: number;
}

/**
 * POST /api/v1/cards/{id}/apply: instant IMTIAZ card decision. APPROVED returns a sandbox virtual card
 * (masked number only, never a full PAN or CVV); DECLINED returns a reason. Both are 200.
 * Financials default to the signed-in (demo) customer's: the eligibility check comes from pre-approval.
 * ⚠️ SANDBOX: no card processor is called and wallet provisioning is simulated.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await jsonBody<Body>(req, { optional: true });
    const requested = body.requestedLimitFils;
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested <= 0)) {
      return problem(400, 'BAD_REQUEST', 'requestedLimitFils must be a positive integer');
    }
    const me = demoCustomer();
    const financials: CustomerFinancials = {
      monthlySalaryFils: body.monthlySalaryFils ?? me.monthlySalaryFils,
      existingObligationsFils: body.existingObligationsFils ?? me.existingObligationsFils,
    };
    validateEmployment(financials);
    return ok(cardIssuer.apply(id, financials, { requestedLimitFils: requested }));
  } catch (e) {
    return handleError(e);
  }
}
