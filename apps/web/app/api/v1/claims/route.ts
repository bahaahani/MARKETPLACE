import { claimView } from '@sahel/domain';
import { ok } from '@/lib/api';
import { claimBody, claimStore, handleClaimError } from '@/lib/claims-store';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/claims: First Notice of Loss for one of the session customer's ACTIVE motor policies (⚠️ sandbox).
 * Photos (base64, JPEG / PNG / WebP by magic bytes, size-capped) are validated and then discarded: only their type and
 * size are kept. Optional `Idempotency-Key` header: repeating it returns the original claim.
 */
export async function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await claimBody<Record<string, unknown>>(req);
      const key = req.headers.get('Idempotency-Key')?.slice(0, 128) || undefined;
      return ok(claimView(claimStore.file(s.customerId, body, key)), { status: 201 });
    },
    handleClaimError,
  );
}
