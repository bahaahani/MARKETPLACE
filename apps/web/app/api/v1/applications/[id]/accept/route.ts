import { ok, originations } from '@/lib/api';
import { customerApplicationView, homeFulfilmentEvidence } from '@/lib/home-finance';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/applications/{id}/accept: accept the offer and e-sign (sandbox), then run fulfilment in order as far
 * as it can go, recording each step (for Murabaha: BCFC buys the asset, takes ownership, then sells it to the customer;
 * for Ijara: BCFC buys the home, then leases it; ownership passes after the final rental). Conventional home finance
 * stops before VALUATION_CONFIRMED until this customer has a captured TRESCO valuation fee for the property; calling
 * accept again then continues. Only the customer who applied can accept; anyone else gets 404.
 * ⚠️ Production: a real e-signature provider, and each fulfilment step happens separately, with evidence.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const { id } = await ctx.params;
    const app = originations.get(id, s.customerId);
    const evidence = app?.productLine === 'home' ? homeFulfilmentEvidence(s.customerId, app.reference) : {};
    return ok(customerApplicationView(originations.accept(id, s.customerId, evidence)));
  });
}
