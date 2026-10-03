import { demoCustomer, validateEmployment, type CustomerFinancials } from '@sahel/domain';
import { cardIssuer, handleError, ok } from '@/lib/api';

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
    const text = await req.text();
    const body = (text ? JSON.parse(text) : {}) as Body;
    const me = demoCustomer();
    const financials: CustomerFinancials = {
      monthlySalaryFils: body.monthlySalaryFils ?? me.monthlySalaryFils,
      existingObligationsFils: body.existingObligationsFils ?? me.existingObligationsFils,
    };
    validateEmployment(financials);
    return ok(cardIssuer.apply(id, financials, { requestedLimitFils: body.requestedLimitFils }));
  } catch (e) {
    return handleError(e);
  }
}
