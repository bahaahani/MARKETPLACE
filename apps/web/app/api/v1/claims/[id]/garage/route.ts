import { claimView } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { claimStore, handleClaimError } from '@/lib/claims-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/claims/{id}/garage: book one of the claim's garage options (APPROVED → REPAIR_BOOKED). Agency garages
 * only with agency repair. Another customer's claim is 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const { garageId } = await jsonBody<{ garageId?: unknown }>(req);
      return ok(claimView(claimStore.bookGarage((await ctx.params).id, s.customerId, garageId)));
    },
    handleClaimError,
  );
}
