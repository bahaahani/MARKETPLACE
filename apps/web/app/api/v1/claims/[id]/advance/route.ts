import { claimView } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { claimStore, handleClaimError } from '@/lib/claims-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/claims/{id}/advance: ⚠️ SANDBOX ONLY, to demo assessment. Stands in for the insurer's claims handler:
 * moves the session customer's claim to `to` (or the next happy-path status), following the enforced status machine.
 * Production has no such endpoint; the insurer's decision arrives from its claims API.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const { to } = await jsonBody<{ to?: unknown }>(req, { optional: true });
      return ok(claimView(claimStore.advance((await ctx.params).id, s.customerId, to)));
    },
    handleClaimError,
  );
}
