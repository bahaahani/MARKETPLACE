import { findVehicle, vehicleFromMonthly } from '@sahel/domain';
import { ok, problem } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const v = findVehicle(id);
  if (!v) return problem(404, 'NOT_FOUND', `vehicle ${id} not found`);
  return ok({ ...v, fromMonthlyFils: vehicleFromMonthly(v) });
}
