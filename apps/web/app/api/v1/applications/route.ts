import {
  applicationView,
  demoCustomer,
  findVehicle,
  ORIGINATION_PRODUCT_LINES,
  ORIGINATION_STRUCTURES,
  type ApplicationRequest,
  type OriginationProductLine,
  type OriginationStructure,
} from '@sahel/domain';
import { handleError, jsonBody, ok, originations, problem } from '@/lib/api';

/** GET /api/v1/applications: the demo customer's finance applications, newest first. */
export function GET() {
  const items = originations.list(demoCustomer().customerId).map(applicationView);
  return ok({ items, total: items.length });
}

/**
 * POST /api/v1/applications: apply for finance (sandbox). Creates, submits and decides immediately
 * against the demo customer's financials. Idempotency-Key header (or body field) required.
 * - vehicle:  { productLine, structure, vehicleId, downPaymentFils, tenureMonths } (price comes from the catalog)
 * - personal: { productLine, structure, amountFils, tenureMonths }
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<{
      productLine?: OriginationProductLine;
      structure?: OriginationStructure;
      vehicleId?: string;
      amountFils?: number;
      downPaymentFils?: number;
      tenureMonths?: number;
      idempotencyKey?: string;
    }>(req);
    const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotencyKey;
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return problem(400, 'BAD_REQUEST', 'Idempotency-Key is required');
    if (!body.productLine || !ORIGINATION_PRODUCT_LINES.includes(body.productLine)) {
      return problem(400, 'BAD_REQUEST', 'productLine must be vehicle or personal');
    }
    if (!body.structure || !ORIGINATION_STRUCTURES.includes(body.structure)) {
      return problem(400, 'BAD_REQUEST', 'structure must be conventional or murabaha');
    }
    if (typeof body.tenureMonths !== 'number') return problem(400, 'BAD_REQUEST', 'tenureMonths is required');

    let request: ApplicationRequest;
    if (body.productLine === 'vehicle') {
      if (typeof body.vehicleId !== 'string' || !body.vehicleId) return problem(400, 'BAD_REQUEST', 'vehicleId is required for vehicle finance');
      const v = findVehicle(body.vehicleId);
      if (!v) return problem(404, 'NOT_FOUND', 'vehicleId must be a vehicle in the catalog');
      request = {
        productLine: 'vehicle',
        structure: body.structure,
        assetPriceFils: v.priceFils,
        downPaymentFils: body.downPaymentFils ?? 0,
        tenureMonths: body.tenureMonths,
        reference: v.id,
        idempotencyKey,
      };
    } else {
      if (typeof body.amountFils !== 'number') return problem(400, 'BAD_REQUEST', 'amountFils is required for personal finance');
      request = {
        productLine: 'personal',
        structure: body.structure,
        assetPriceFils: body.amountFils,
        downPaymentFils: 0,
        tenureMonths: body.tenureMonths,
        reference: 'personal',
        idempotencyKey,
      };
    }

    const me = demoCustomer();
    const app = originations.apply(
      request,
      { monthlySalaryFils: me.monthlySalaryFils, existingObligationsFils: me.existingObligationsFils },
      me.customerId,
    );
    return ok(applicationView(app), { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
