import { demoCustomer } from '@sahel/domain';
import { contractSettings, handleBundlesError, jsonBody, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** PATCH /api/v1/me/contracts/{id} {autopay}: turn autopay on or off (⚠️ sandbox, in memory). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await jsonBody<{ autopay?: unknown }>(req);
    return ok(contractSettings.setAutopay(demoCustomer(), id, body.autopay));
  } catch (e) {
    return handleBundlesError(e);
  }
}
