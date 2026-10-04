import { jsonBody, ok } from '@/lib/api';
import { handleRewardsError, rewardsState, rewardsStore } from '@/lib/rewards-store';
import { withCustomer } from '@/lib/session';

// Per customer session, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/rewards/redemptions: the session customer's vouchers, newest first, codes masked (last 4 only). */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = rewardsStore.list(s.customerId);
    return ok({ items, total: items.length });
  });
}

/**
 * POST /api/v1/me/rewards/redemptions: redeem a catalogue item for a voucher code (⚠️ sandbox). Idempotency-Key header
 * (or body field) required: the same key returns the original redemption (200). Not enough points: 422.
 */
export function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<{ itemId?: unknown; idempotencyKey?: unknown }>(req);
      const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotencyKey;
      const result = rewardsStore.redeem(s.customerId, rewardsState(s.customer), { itemId: body.itemId, idempotencyKey });
      return ok(result, { status: result.replayed ? 200 : 201 });
    },
    handleRewardsError,
  );
}
