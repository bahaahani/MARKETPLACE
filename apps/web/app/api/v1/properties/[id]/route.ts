import { findProperty, propertyFromMonthly } from '@sahel/domain';
import { ok, problem } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = findProperty(id);
  if (!p) return problem(404, 'NOT_FOUND', `property ${id} not found`);
  return ok({ ...p, fromMonthlyFils: propertyFromMonthly(p) });
}
