import {
  applicationView,
  customerFinancials,
  findVehicle,
  homeApplicationRequest,
  ORIGINATION_PRODUCT_LINES,
  ORIGINATION_STRUCTURES,
  type ApplicationRequest,
  type OriginationProductLine,
  type OriginationStructure,
} from '@sahel/domain';
import { jsonBody, ok, originations, problem } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Per customer session, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/applications: this customer's finance applications, newest first. */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = originations.list(s.customerId).map(applicationView);
    return ok({ items, total: items.length });
  });
}

/**
 * POST /api/v1/applications: apply for finance (sandbox). Creates, submits and decides immediately
 * against the session customer's financials (their own after onboarding, else the demo customer's).
 * Idempotency-Key header (or body field) required; keys are scoped to the customer.
 * - vehicle:  { productLine, structure, vehicleId, downPaymentFils, tenureMonths } (price comes from the catalog)
 * - personal: { productLine, structure, amountFils, tenureMonths }
 * - home:     { productLine, structure, propertyId, downPaymentFils, tenureMonths } (conventional or Ijara; price from the catalog)
 */
export function POST(req: Request) {
  return withCustomer(req, async (s) => {
    const body = await jsonBody<{
      productLine?: OriginationProductLine;
      structure?: OriginationStructure;
      vehicleId?: string;
      propertyId?: string;
      amountFils?: number;
      downPaymentFils?: number;
      tenureMonths?: number;
      idempotencyKey?: string;
    }>(req);
    const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotencyKey;
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return problem(400, 'BAD_REQUEST', 'Idempotency-Key is required');
    if (!body.productLine || !ORIGINATION_PRODUCT_LINES.includes(body.productLine)) {
      return problem(400, 'BAD_REQUEST', 'productLine must be vehicle, personal or home');
    }
    if (!body.structure || !ORIGINATION_STRUCTURES.includes(body.structure)) {
      return problem(400, 'BAD_REQUEST', 'structure must be conventional, murabaha or ijara');
    }
    if (typeof body.tenureMonths !== 'number') return problem(400, 'BAD_REQUEST', 'tenureMonths is required');

    let request: ApplicationRequest;
    if (body.productLine === 'home') {
      request = homeApplicationRequest({ ...body, structure: body.structure, tenureMonths: body.tenureMonths, idempotencyKey });
    } else if (body.productLine === 'vehicle') {
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

    const app = originations.apply(request, customerFinancials(s.profile), s.customerId);
    return ok(applicationView(app), { status: 201 });
  });
}
