import { applicationView } from '@sahel/domain';
import { ok, originations, problem } from '@/lib/api';

/** GET /api/v1/applications/{id}: status, decision and timeline steps. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const app = originations.get((await ctx.params).id);
  return app ? ok(applicationView(app)) : problem(404, 'NOT_FOUND', 'application not found');
}
