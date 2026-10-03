import { handleError, ok, payments } from '@/lib/api';

/** Sandbox stand-in for "customer completed the Tap flow and our webhook verified it". */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return ok(await payments.confirm(id));
  } catch (e) {
    return handleError(e);
  }
}
