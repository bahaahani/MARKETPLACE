import { buildShowroomOffer, type FinanceStructure } from '@sahel/domain';
import { dealerSession, handleError, jsonBody, ok, preApprovalTokens, problem } from '@/lib/api';

/**
 * POST /api/v1/dealer/offers { sellerId, token, vehicleId, downPaymentFils, tenureMonths, structures? }
 * Prices a car for a customer who shared their pre-approval, side by side per structure, and checks each
 * quote against the shared limit. The token is re-checked, so an expired share cannot be priced.
 * ⚠️ Sandbox: the offer is not yet pushed to the customer's app (J7 step 2).
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<{
      sellerId?: string;
      token?: string;
      vehicleId?: string;
      downPaymentFils?: number;
      tenureMonths?: number;
      structures?: FinanceStructure[];
    }>(req);
    if (!body.sellerId || typeof body.token !== 'string' || !body.vehicleId) {
      return problem(400, 'BAD_REQUEST', 'sellerId, token and vehicleId are required');
    }
    if (typeof body.downPaymentFils !== 'number' || typeof body.tenureMonths !== 'number') {
      return problem(400, 'BAD_REQUEST', 'downPaymentFils and tenureMonths are required numbers');
    }
    if (body.structures !== undefined && (!Array.isArray(body.structures) || !body.structures.every((x) => typeof x === 'string'))) {
      return problem(400, 'BAD_REQUEST', 'structures must be an array of finance structures');
    }
    dealerSession(req, body.sellerId);
    const customer = preApprovalTokens.redeem(body.token);
    return ok(
      buildShowroomOffer(customer, {
        sellerId: body.sellerId,
        vehicleId: body.vehicleId,
        downPaymentFils: body.downPaymentFils,
        tenureMonths: body.tenureMonths,
        structures: body.structures,
      }),
    );
  } catch (e) {
    return handleError(e);
  }
}
