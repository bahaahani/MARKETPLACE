import type { PaymentRequest } from '@sahel/domain';
import { jsonBody, ok, payments, problem } from '@/lib/api';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/payments: create a charge (sandbox). Idempotency-Key header or body field required;
 * keys are scoped to the customer session.
 */
export function POST(req: Request) {
  return withCustomer(req, async (s) => {
    const body = await jsonBody<Partial<PaymentRequest>>(req);
    const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotencyKey;
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return problem(400, 'BAD_REQUEST', 'Idempotency-Key is required');
    const payment = await payments.createCharge({ ...(body as PaymentRequest), idempotencyKey }, s.customerId);
    return ok(payment, { status: 201 });
  });
}
