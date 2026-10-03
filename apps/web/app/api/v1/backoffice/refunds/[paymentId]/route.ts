import { refundOrphanPremium } from '@sahel/domain';
import { jsonBody, ok, payments } from '@/lib/api';
import { auditLog, isPolicyBound, withStaff } from '@/lib/backoffice-api';

/**
 * POST /api/v1/backoffice/refunds/{paymentId} { note? }: Operations refunds a captured premium that has no policy
 * (CAPTURED → REFUNDED, ⚠️ sandbox: no money moves). Idempotent: repeating it returns the original refund.
 */
export function POST(req: Request, ctx: { params: Promise<{ paymentId: string }> }) {
  return withStaff(req, 'refunds.execute', async (staff) => {
    const { paymentId } = await ctx.params;
    const body = await jsonBody<{ note?: unknown }>(req, { optional: true });
    const r = await refundOrphanPremium(staff, payments, auditLog, paymentId, isPolicyBound, { note: body.note });
    return ok(r);
  });
}
