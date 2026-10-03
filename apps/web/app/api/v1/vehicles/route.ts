import { searchVehicles, VEHICLES, type BodyType, type FinanceStructure, type FuelType, type VehicleCondition, type VehicleSort } from '@sahel/domain';
import { handleError, intParam, ok } from '@/lib/api';

export function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const items = searchVehicles(VEHICLES, {
      q: p.get('q') ?? undefined,
      condition: (p.get('condition') as VehicleCondition) || undefined,
      bodyType: (p.get('bodyType') as BodyType) || undefined,
      fuel: (p.get('fuel') as FuelType) || undefined,
      make: p.get('make') ?? undefined,
      maxPriceFils: intParam(p.get('maxPriceFils')),
      maxMonthlyFils: intParam(p.get('maxMonthlyFils')),
      structure: (p.get('structure') as FinanceStructure) || undefined,
      sort: (p.get('sort') as VehicleSort) || undefined,
    });
    return ok({ items, total: items.length });
  } catch (e) {
    return handleError(e);
  }
}
