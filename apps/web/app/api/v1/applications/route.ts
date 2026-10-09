import {
  customerFinancials,
  findVehicle,
  homeApplicationRequest,
  ORIGINATION_PRODUCT_LINES,
  ORIGINATION_STRUCTURES,
  resolveVehicleCarry,
  type ApplicationRequest,
  type OriginationProductLine,
  type OriginationStructure,
} from '@sahel/domain';
import { jsonBody, ok, originations, problem } from '@/lib/api';
import { carryContext, handleCarryError } from '@/lib/carry';
import { customerApplicationView } from '@/lib/home-finance';
import { withCustomer } from '@/lib/session';

// Per customer session, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/applications: this customer's finance applications, newest first. */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = originations.list(s.customerId).map((a) => customerApplicationView(a));
    return ok({ items, total: items.length });
  });
}

/**
 * POST /api/v1/applications: apply for finance (sandbox). Creates, submits and decides immediately
 * against the session customer's financials (their own after onboarding, else the demo customer's).
 * Idempotency-Key header (or body field) required; keys are scoped to the customer.
 * - vehicle:  { productLine, structure, vehicleId, downPaymentFils, tenureMonths } (price comes from the catalog).
 *   Optional `requestId` + `bidId` price it from the customer's accepted "Bid For Me" bid (re-validated here: the
 *   discount comes from the bid, never from the client, and the extras are recorded) and `useTradeIn: true` counts the
 *   customer's active trade-in offer in the down payment (credited at delivery). The response's `pricing` shows how
 *   the financed amount is made up.
 * - personal: { productLine, structure, amountFils, tenureMonths }
 * - home:     { productLine, structure, propertyId, downPaymentFils, tenureMonths } (conventional or Ijara; price from the catalog)
 */
export function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<{
        productLine?: OriginationProductLine;
        structure?: OriginationStructure;
        vehicleId?: string;
        propertyId?: string;
        amountFils?: number;
        downPaymentFils?: number;
        requestId?: unknown;
        bidId?: unknown;
        useTradeIn?: unknown;
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
      // A bid or a trade-in only goes with a car.
      const carries = body.requestId !== undefined || body.bidId !== undefined || (body.useTradeIn !== undefined && body.useTradeIn !== false);
      if (carries && body.productLine !== 'vehicle') return problem(422, 'INVALID_REQUEST', 'a bid or trade-in can only go with vehicle finance');

      let request: ApplicationRequest;
      if (body.productLine === 'home') {
        request = homeApplicationRequest({ ...body, structure: body.structure, tenureMonths: body.tenureMonths, idempotencyKey });
      } else if (body.productLine === 'vehicle') {
        if (typeof body.vehicleId !== 'string' || !body.vehicleId) return problem(400, 'BAD_REQUEST', 'vehicleId is required for vehicle finance');
        const v = findVehicle(body.vehicleId);
        if (!v) return problem(404, 'NOT_FOUND', 'vehicleId must be a vehicle in the catalog');
        // Price, discount, extras and trade-in credit are decided here from the customer's own bid and offer.
        const carry = resolveVehicleCarry(
          { vehicleId: v.id, downPaymentFils: body.downPaymentFils ?? 0, requestId: body.requestId, bidId: body.bidId, useTradeIn: body.useTradeIn },
          carryContext(s.customerId),
        );
        request = {
          productLine: 'vehicle',
          structure: body.structure,
          assetPriceFils: carry.assetPriceFils,
          downPaymentFils: carry.downPaymentFils,
          tenureMonths: body.tenureMonths,
          reference: v.id,
          idempotencyKey,
          ...(carry.source ? { source: carry.source, listPriceFils: carry.listPriceFils, extras: carry.extras } : {}),
          ...(carry.tradeIn ? { tradeIn: carry.tradeIn } : {}),
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
      return ok(customerApplicationView(app), { status: 201 });
    },
    handleCarryError,
  );
}
