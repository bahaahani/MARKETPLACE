import { contractSettings, handleBundlesError, jsonBody, ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** PATCH /api/v1/me/contracts/{id} {autopay}: turn autopay on or off for the session customer (⚠️ sandbox, in memory). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const { id } = await ctx.params;
      const body = await jsonBody<{ autopay?: unknown }>(req);
      return ok(contractSettings.setAutopay(s.customer, id, body.autopay));
    },
    handleBundlesError,
  );
}
