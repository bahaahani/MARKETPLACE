import { ok, payments } from '@/lib/api';
import { withCustomer } from '@/lib/session';

/**
 * Sandbox stand-in for "customer completed the Tap flow and our webhook verified it".
 * Only the session that created the payment can confirm it.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(req, async (s) => {
    const { id } = await ctx.params;
    return ok(await payments.confirm(id, s.customerId));
  });
}
